import { makeFunctionReference } from 'convex/server';

import {
  hmacSha256Hex,
  sha256Hex,
  timingSafeEqualHex,
} from './import_callback_hmac';

import type { Id } from '../_generated/dataModel';

export const CALLBACK_PATH = '/api/import-callback';

const SKEW_MS = 5 * 60 * 1000;
const NONCE_TTL_MS = 15 * 60 * 1000;

const getNonceByValueForCallbackQuery = makeFunctionReference<
  'query',
  { nonce: string },
  { _id: Id<'importCallbackNonces'> } | null
>('imports:getNonceByValueForCallback');

const insertNonceForCallbackMutation = makeFunctionReference<
  'mutation',
  { nonce: string; createdAt: number; expiresAt: number },
  Id<'importCallbackNonces'>
>('imports:insertNonceForCallback');

type CallbackActionCtx = {
  runQuery: unknown;
  runMutation: unknown;
};

type CallbackAuthResult =
  | {
      ok: true;
      rawBody: string;
      now: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function authenticateImportCallbackRequest(
  ctx: CallbackActionCtx,
  request: Request,
  secret: string | undefined
): Promise<CallbackAuthResult> {
  if (!secret) {
    return {
      ok: false,
      status: 500,
      error: 'Server callback secret is not configured',
    };
  }

  const timestampHeader = request.headers.get('x-import-ts');
  const nonce = request.headers.get('x-import-nonce');
  const signature = request.headers.get('x-import-signature');

  if (!timestampHeader || !nonce || !signature) {
    return {
      ok: false,
      status: 401,
      error: 'Missing callback signature headers',
    };
  }

  const timestampSeconds = Number(timestampHeader);

  if (!Number.isFinite(timestampSeconds)) {
    return {
      ok: false,
      status: 401,
      error: 'Invalid callback timestamp header',
    };
  }

  const now = Date.now();

  if (Math.abs(now - timestampSeconds * 1000) > SKEW_MS) {
    return {
      ok: false,
      status: 401,
      error: 'Callback timestamp outside allowed skew',
    };
  }

  if (nonce.length < 16 || nonce.length > 128) {
    return {
      ok: false,
      status: 401,
      error: 'Invalid callback nonce',
    };
  }

  const runQuery = ctx.runQuery as (
    queryRef: unknown,
    args: unknown
  ) => Promise<unknown>;
  const runMutation = ctx.runMutation as (
    mutationRef: unknown,
    args: unknown
  ) => Promise<unknown>;
  const existingNonce = (await runQuery(getNonceByValueForCallbackQuery, {
    nonce,
  })) as { _id: Id<'importCallbackNonces'> } | null;

  if (existingNonce) {
    return {
      ok: false,
      status: 401,
      error: 'Replay detected for callback nonce',
    };
  }

  const rawBody = await request.text();
  const bodyHash = await sha256Hex(rawBody);
  const signingPayload = `POST\n${CALLBACK_PATH}\n${timestampHeader}\n${nonce}\n${bodyHash}`;
  const expectedSignature = await hmacSha256Hex(secret, signingPayload);

  if (!timingSafeEqualHex(expectedSignature, signature)) {
    return {
      ok: false,
      status: 401,
      error: 'Invalid callback signature',
    };
  }

  await runMutation(insertNonceForCallbackMutation, {
    nonce,
    createdAt: now,
    expiresAt: now + NONCE_TTL_MS,
  });

  return {
    ok: true,
    rawBody,
    now,
  };
}
