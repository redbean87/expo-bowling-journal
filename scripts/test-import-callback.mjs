import crypto from 'node:crypto';

function parseArgs(argv) {
  const args = {
    stage: 'parsing',
    callbackPath: '/api/import-callback',
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (!value.startsWith('--')) {
      continue;
    }

    const [key, inline] = value.split('=', 2);

    if (inline !== undefined) {
      args[key.slice(2)] = inline;
      continue;
    }

    const next = argv[index + 1];

    if (next && !next.startsWith('--')) {
      args[key.slice(2)] = next;
      index += 1;
      continue;
    }

    args[key.slice(2)] = 'true';
  }

  return args;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/test-import-callback.mjs --batchId <id> --stage <parsing|importing|completed|failed> [--errorMessage "..."]',
    '',
    'Required env vars:',
    '  CONVEX_URL=https://different-lynx-597.convex.cloud',
    '  IMPORT_CALLBACK_HMAC_SECRET=<same secret configured in Convex>',
    '',
    'Optional env var:',
    '  CONVEX_IMPORT_CALLBACK_PATH=/api/import-callback',
  ].join('\n');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmacSha256Hex(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

async function main() {
  const args = parseArgs(process.argv);
  const batchId = args.batchId;
  const stage = args.stage;
  const errorMessage = args.errorMessage ?? null;

  if (!batchId || typeof batchId !== 'string') {
    throw new Error(`Missing required --batchId\n\n${usage()}`);
  }

  const validStages = new Set(['parsing', 'importing', 'completed', 'failed']);

  if (!validStages.has(stage)) {
    throw new Error(`Invalid --stage: ${String(stage)}\n\n${usage()}`);
  }

  const convexUrl = process.env.CONVEX_URL;
  const secret = process.env.IMPORT_CALLBACK_HMAC_SECRET;
  const callbackPath =
    process.env.CONVEX_IMPORT_CALLBACK_PATH ?? args.callbackPath;

  if (!convexUrl) {
    throw new Error(`Missing CONVEX_URL env var\n\n${usage()}`);
  }

  if (!secret) {
    throw new Error(
      `Missing IMPORT_CALLBACK_HMAC_SECRET env var\n\n${usage()}`
    );
  }

  const payload = {
    batchId,
    stage,
    parserVersion: 'manual-test-script',
    errorMessage,
  };

  const rawBody = JSON.stringify(payload);
  const timestampSeconds = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const bodyHash = sha256Hex(rawBody);
  const signingPayload = `POST\n${callbackPath}\n${timestampSeconds}\n${nonce}\n${bodyHash}`;
  const signature = hmacSha256Hex(secret, signingPayload);
  const callbackUrl = new URL(callbackPath, convexUrl).toString();

  const response = await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-import-ts': timestampSeconds,
      'x-import-nonce': nonce,
      'x-import-signature': signature,
    },
    body: rawBody,
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Callback failed: ${response.status} ${response.statusText}\n${responseText}`
    );
  }

  console.log('Callback request succeeded.');
  console.log(responseText);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
