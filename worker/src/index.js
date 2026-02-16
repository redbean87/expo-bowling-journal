import sqlWasmModule from 'sql.js/dist/sql-wasm.wasm';

import { buildImportingSnapshotJsonCallbackPayload } from './callback_payload.js';
import {
  SqliteParseError,
  parseBackupDatabaseToSnapshot,
} from './sqlite_parser.js';

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

async function sha256Hex(message) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(message));

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqualHex(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;

  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

function isSafeUserId(userId) {
  return typeof userId === 'string' && /^[a-zA-Z0-9_-]{3,128}$/.test(userId);
}

function isSafeBatchId(batchId) {
  return typeof batchId === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(batchId);
}

function normalizeTimezoneOffsetMinutes(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const minutes = Math.trunc(value);

  if (minutes < -840 || minutes > 840) {
    return null;
  }

  return minutes;
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

async function verifySignedRequest({
  request,
  secret,
  path,
  rawBody,
  skewSeconds,
}) {
  const timestampHeader = request.headers.get('x-import-ts');
  const nonce = request.headers.get('x-import-nonce');
  const signature = request.headers.get('x-import-signature');

  if (!timestampHeader || !nonce || !signature) {
    return { ok: false, error: 'Missing signature headers' };
  }

  const timestampSeconds = Number(timestampHeader);

  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, error: 'Invalid signature timestamp' };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (Math.abs(nowSeconds - timestampSeconds) > skewSeconds) {
    return { ok: false, error: 'Signature timestamp outside allowed skew' };
  }

  if (nonce.length < 16 || nonce.length > 128) {
    return { ok: false, error: 'Invalid signature nonce' };
  }

  const bodyHash = await sha256Hex(rawBody);
  const signingPayload = `POST\n${path}\n${timestampHeader}\n${nonce}\n${bodyHash}`;
  const expectedSignature = await hmacHex(secret, signingPayload);

  if (!timingSafeEqualHex(expectedSignature, signature)) {
    return { ok: false, error: 'Invalid signature' };
  }

  return {
    ok: true,
    timestampSeconds,
    nonce,
    signature,
  };
}

function getCallbackUrl(env) {
  const baseUrl = env.CONVEX_URL?.trim();
  const path = (
    env.CONVEX_IMPORT_CALLBACK_PATH || '/api/import-callback'
  ).trim();

  if (!baseUrl) {
    return null;
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
}

async function postConvexCallback(env, payload) {
  const callbackUrl = getCallbackUrl(env);

  if (!callbackUrl) {
    throw new Error('CONVEX_URL is not configured for callback delivery');
  }

  const rawBody = JSON.stringify(payload);
  const callbackPath = new URL(callbackUrl).pathname;
  console.log('convex callback start', {
    batchId: payload.batchId,
    stage: payload.stage,
    callbackUrl,
    callbackPath,
  });
  const timestampSeconds = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const bodyHash = await sha256Hex(rawBody);
  const signingPayload = `POST\n${callbackPath}\n${String(timestampSeconds)}\n${nonce}\n${bodyHash}`;
  const signature = await hmacHex(
    env.IMPORT_CALLBACK_HMAC_SECRET,
    signingPayload
  );
  const response = await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-import-ts': String(timestampSeconds),
      'x-import-nonce': nonce,
      'x-import-signature': signature,
    },
    body: rawBody,
  });

  if (!response.ok) {
    const bodyText = (await response.text()).slice(0, 300);
    console.log('convex callback failed', {
      batchId: payload.batchId,
      stage: payload.stage,
      status: response.status,
      bodyText,
    });
    throw new Error(
      `Convex callback failed (${String(response.status)}): ${bodyText}`
    );
  }

  console.log('convex callback ok', {
    batchId: payload.batchId,
    stage: payload.stage,
    status: response.status,
  });
}

async function processQueueMessage(env, body) {
  const { batchId, r2Key } = body;
  const timezoneOffsetMinutes = normalizeTimezoneOffsetMinutes(
    body.timezoneOffsetMinutes
  );

  try {
    await postConvexCallback(env, {
      batchId,
      stage: 'parsing',
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);

    if (
      message.includes('Invalid status transition from failed to parsing') ||
      message.includes('Invalid status transition from completed to parsing')
    ) {
      console.log('queue skip parsing callback retry', {
        batchId,
        r2Key,
        error: message,
      });
      return;
    }

    throw caught;
  }

  const file = await env.R2_IMPORTS.get(r2Key);

  if (!file) {
    await postConvexCallback(env, {
      batchId,
      stage: 'failed',
      errorMessage: 'R2 object missing for queued import',
    });
    return;
  }

  const bytes = await file.arrayBuffer();
  const sourceFileName =
    typeof r2Key === 'string' ? (r2Key.split('/').pop() ?? null) : null;

  let parsedSnapshot;

  try {
    parsedSnapshot = await parseBackupDatabaseToSnapshot(bytes, {
      sourceFileName,
      sourceHash: null,
      wasmModule: sqlWasmModule,
    });
  } catch (caught) {
    const errorMessage =
      caught instanceof SqliteParseError
        ? formatSqliteParseErrorForUser(caught)
        : 'Unable to parse SQLite backup file';

    console.log('queue parse failed', {
      batchId,
      r2Key,
      error:
        caught instanceof Error ? `${caught.name}: ${caught.message}` : caught,
    });

    await postConvexCallback(env, {
      batchId,
      stage: 'failed',
      errorMessage,
    });

    return;
  }

  console.log('queue parsed snapshot', {
    batchId,
    r2Key,
    bytes: bytes.byteLength,
    parserVersion: parsedSnapshot.parserVersion,
    counts: {
      houses: parsedSnapshot.snapshot.houses.length,
      patterns: parsedSnapshot.snapshot.patterns.length,
      balls: parsedSnapshot.snapshot.balls.length,
      leagues: parsedSnapshot.snapshot.leagues.length,
      weeks: parsedSnapshot.snapshot.weeks.length,
      games: parsedSnapshot.snapshot.games.length,
      frames: parsedSnapshot.snapshot.frames.length,
    },
  });

  await postConvexCallback(
    env,
    buildImportingSnapshotJsonCallbackPayload(
      batchId,
      parsedSnapshot,
      timezoneOffsetMinutes
    )
  );
}

function formatSqliteParseErrorForUser(error) {
  if (error.code === 'INVALID_SCHEMA') {
    return `Backup format is not supported: ${error.message}`;
  }

  if (error.code === 'INVALID_SQLITE') {
    return 'Uploaded file is not a readable SQLite backup';
  }

  if (error.code === 'INVALID_ROW') {
    return `Backup contains invalid data: ${error.message}`;
  }

  if (error.code === 'INVALID_INPUT') {
    return 'Uploaded backup file is empty or invalid';
  }

  if (error.code === 'PARSER_INIT_FAILED') {
    return 'Import parser is temporarily unavailable';
  }

  return `SQLite parse failed: ${error.message}`;
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
      const queueHmacSecret =
        env.IMPORT_QUEUE_HMAC_SECRET || env.IMPORT_CALLBACK_HMAC_SECRET;
      const rawBody = await request.text();

      const verification = await verifySignedRequest({
        request,
        env,
        secret: queueHmacSecret,
        path: url.pathname,
        rawBody,
        skewSeconds: 5 * 60,
      });

      if (!verification.ok) {
        console.log('queue request rejected', {
          path: url.pathname,
          reason: verification.error,
        });
        return unauthorized(
          request,
          env,
          `Unauthorized queue request: ${verification.error}`
        );
      }

      let body;

      try {
        body = JSON.parse(rawBody);
      } catch {
        return badRequest(request, env, 'Invalid JSON body');
      }

      if (!body) {
        return badRequest(request, env, 'Invalid JSON body');
      }

      const batchId = body.batchId;
      const userId = body.userId;
      const r2Key = body.r2Key;
      const timezoneOffsetMinutes = normalizeTimezoneOffsetMinutes(
        body.timezoneOffsetMinutes
      );

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

      if (url.pathname === '/imports/process') {
        try {
          await processQueueMessage(env, {
            batchId,
            userId,
            r2Key,
            timezoneOffsetMinutes,
          });

          return json(
            request,
            env,
            {
              accepted: true,
              queued: false,
              processed: true,
              batchId,
              r2Key,
            },
            202
          );
        } catch (caught) {
          const message =
            caught instanceof Error
              ? caught.message
              : 'Unknown inline processing error';

          console.log('inline import processing failed', {
            path: url.pathname,
            batchId,
            r2Key,
            error: message,
          });

          return internalError(
            request,
            env,
            `Inline import processing failed: ${message.slice(0, 300)}`
          );
        }
      }

      await env.IMPORT_QUEUE.send({
        batchId,
        userId,
        r2Key,
        timezoneOffsetMinutes,
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

  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await processQueueMessage(env, message.body);
        message.ack();
      } catch (caught) {
        console.log('queue message retry', {
          batchId: message.body.batchId,
          r2Key: message.body.r2Key,
          error: caught instanceof Error ? caught.message : 'Unknown error',
        });
        message.retry();
      }
    }
  },
};
