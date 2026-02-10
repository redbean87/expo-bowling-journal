function getAllowedOrigins(env) {
  const raw = env.CORS_ALLOWED_ORIGINS?.trim();

  if (!raw) {
    return ['http://localhost:8081'];
  }

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function resolveAllowedOrigin(request, env) {
  const origin = request.headers.get('origin');
  const allowedOrigins = getAllowedOrigins(env);

  if (!origin) {
    return allowedOrigins[0] ?? '*';
  }

  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    return origin;
  }

  return allowedOrigins[0] ?? '*';
}

function corsHeaders(request, env) {
  return {
    'access-control-allow-origin': resolveAllowedOrigin(request, env),
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function json(request, env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(request, env),
    },
  });
}

function badRequest(request, env, message) {
  return json(request, env, { error: message }, 400);
}

function unauthorized(request, env, message = 'Unauthorized') {
  return json(request, env, { error: message }, 401);
}

function methodNotAllowed(request, env) {
  return json(request, env, { error: 'Method not allowed' }, 405);
}

function internalError(request, env, message) {
  return json(request, env, { error: message }, 500);
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));

  return [...new Uint8Array(sig)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function isSafeUserId(userId) {
  return typeof userId === 'string' && /^[a-zA-Z0-9_-]{3,128}$/.test(userId);
}

function isSafeBatchId(batchId) {
  return typeof batchId === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(batchId);
}

function isSafeR2Key(r2Key, userId) {
  return (
    typeof r2Key === 'string' &&
    r2Key.startsWith(`imports/${userId}/`) &&
    r2Key.endsWith('.db')
  );
}

async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(request, env),
        },
      });
    }

    if (!env.IMPORT_CALLBACK_HMAC_SECRET) {
      return internalError(
        request,
        env,
        'IMPORT_CALLBACK_HMAC_SECRET is not configured'
      );
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json(request, env, { ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/imports/upload-url') {
      const body = await parseJsonBody(request);

      if (!body) {
        return badRequest(request, env, 'Invalid JSON body');
      }

      const userId = body.userId;
      const fileName = body.fileName;
      const fileSize = body.fileSize;

      if (!isSafeUserId(userId)) {
        return badRequest(request, env, 'Invalid userId');
      }

      if (typeof fileName !== 'string' || fileName.trim().length < 1) {
        return badRequest(request, env, 'Invalid fileName');
      }

      if (
        typeof fileSize !== 'number' ||
        !Number.isFinite(fileSize) ||
        fileSize <= 0
      ) {
        return badRequest(request, env, 'Invalid fileSize');
      }

      const now = Date.now();
      const expiresAt = now + 10 * 60 * 1000;
      const r2Key = `imports/${userId}/${now}-${crypto.randomUUID()}.db`;
      const payload = `${r2Key}\n${String(expiresAt)}`;
      const sig = await hmacHex(env.IMPORT_CALLBACK_HMAC_SECRET, payload);
      const uploadUrl = `${url.origin}/imports/upload?key=${encodeURIComponent(r2Key)}&exp=${String(
        expiresAt
      )}&sig=${sig}`;

      return json(request, env, {
        r2Key,
        uploadUrl,
        expiresAt,
      });
    }

    if (request.method === 'PUT' && url.pathname === '/imports/upload') {
      const key = url.searchParams.get('key');
      const exp = url.searchParams.get('exp');
      const sig = url.searchParams.get('sig');

      if (!key || !exp || !sig) {
        return badRequest(request, env, 'Missing key/exp/sig');
      }

      const expNum = Number(exp);

      if (!Number.isFinite(expNum)) {
        return badRequest(request, env, 'Invalid exp');
      }

      if (Date.now() > expNum) {
        return unauthorized(request, env, 'Upload URL expired');
      }

      const payload = `${key}\n${String(expNum)}`;
      const expectedSig = await hmacHex(
        env.IMPORT_CALLBACK_HMAC_SECRET,
        payload
      );

      if (sig !== expectedSig) {
        return unauthorized(request, env, 'Invalid signature');
      }

      const bytes = await request.arrayBuffer();

      if (bytes.byteLength === 0) {
        return badRequest(request, env, 'Empty upload body');
      }

      await env.R2_IMPORTS.put(key, bytes, {
        httpMetadata: {
          contentType:
            request.headers.get('content-type') ?? 'application/octet-stream',
        },
      });

      return json(request, env, {
        ok: true,
        r2Key: key,
        bytes: bytes.byteLength,
      });
    }

    if (
      request.method === 'POST' &&
      (url.pathname === '/imports/queue' || url.pathname === '/imports/process')
    ) {
      const body = await parseJsonBody(request);

      if (!body) {
        return badRequest(request, env, 'Invalid JSON body');
      }

      const batchId = body.batchId;
      const userId = body.userId;
      const r2Key = body.r2Key;

      if (!isSafeBatchId(batchId)) {
        return badRequest(request, env, 'Invalid batchId');
      }

      if (!isSafeUserId(userId)) {
        return badRequest(request, env, 'Invalid userId');
      }

      if (!isSafeR2Key(r2Key, userId)) {
        return badRequest(request, env, 'Invalid r2Key for user');
      }

      const obj = await env.R2_IMPORTS.head(r2Key);

      if (!obj) {
        return badRequest(request, env, 'R2 object not found');
      }

      await env.IMPORT_QUEUE.send({
        batchId,
        userId,
        r2Key,
      });

      return json(
        request,
        env,
        {
          accepted: true,
          queued: true,
          batchId,
          r2Key,
        },
        202
      );
    }

    return methodNotAllowed(request, env);
  },

  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      const { batchId, r2Key } = message.body;

      ctx.waitUntil(
        (async () => {
          const file = await env.R2_IMPORTS.get(r2Key);

          if (!file) {
            console.log('queue message skipped: R2 object missing', {
              batchId,
              r2Key,
            });
            return;
          }

          const bytes = await file.arrayBuffer();
          console.log('queue placeholder processing', {
            batchId,
            r2Key,
            bytes: bytes.byteLength,
          });
        })()
      );

      message.ack();
    }
  },
};
