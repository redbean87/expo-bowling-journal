import { hmacSha256Hex, sha256Hex } from './import_callback_hmac';
import { normalizeTimezoneOffsetMinutes } from './import_dates';

import type { Id } from '../_generated/dataModel';

type ImportBatchForDispatch = {
  userId: Id<'users'>;
  status: string;
  r2Key: string | null;
};

type DispatchImportQueueArgs = {
  batchId: Id<'importBatches'>;
  userId: Id<'users'>;
  r2Key: string;
  timezoneOffsetMinutes?: number | null;
};

type DispatchImportQueueDeps = {
  getBatchById: (
    batchId: Id<'importBatches'>
  ) => Promise<ImportBatchForDispatch | null>;
  markBatchFailed: (
    batchId: Id<'importBatches'>,
    errorMessage: string,
    completedAt: number
  ) => Promise<void>;
};

export async function dispatchImportQueueToWorker(
  args: DispatchImportQueueArgs,
  deps: DispatchImportQueueDeps
) {
  const batch = await deps.getBatchById(args.batchId);

  if (!batch || batch.userId !== args.userId || batch.status !== 'queued') {
    return;
  }

  if (batch.r2Key !== args.r2Key) {
    await deps.markBatchFailed(
      args.batchId,
      'Import queue dispatch blocked: batch key mismatch',
      Date.now()
    );
    return;
  }

  const workerBaseUrl = process.env.IMPORT_WORKER_URL?.trim();
  const queueHmacSecret =
    process.env.IMPORT_QUEUE_HMAC_SECRET?.trim() ??
    process.env.IMPORT_CALLBACK_HMAC_SECRET?.trim();

  if (!workerBaseUrl || !queueHmacSecret) {
    await deps.markBatchFailed(
      args.batchId,
      'Import queue dispatch is not configured (IMPORT_WORKER_URL/IMPORT_QUEUE_HMAC_SECRET)',
      Date.now()
    );
    return;
  }

  const configuredQueuePath =
    process.env.IMPORT_WORKER_QUEUE_PATH?.trim() || '/imports/queue';
  const queuePath = configuredQueuePath.startsWith('/')
    ? configuredQueuePath
    : `/${configuredQueuePath}`;

  if (queuePath !== '/imports/queue' && queuePath !== '/imports/process') {
    await deps.markBatchFailed(
      args.batchId,
      'Import queue dispatch is misconfigured (IMPORT_WORKER_QUEUE_PATH must be /imports/queue or /imports/process)',
      Date.now()
    );
    return;
  }

  const normalizedWorkerUrl = workerBaseUrl.replace(/\/+$/, '');
  const endpoint = `${normalizedWorkerUrl}${queuePath}`;
  const requestBody = JSON.stringify({
    batchId: args.batchId,
    userId: args.userId,
    r2Key: args.r2Key,
    timezoneOffsetMinutes: normalizeTimezoneOffsetMinutes(
      args.timezoneOffsetMinutes
    ),
  });
  const timestampSeconds = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const bodyHash = await sha256Hex(requestBody);
  const signingPayload = `POST\n${queuePath}\n${String(timestampSeconds)}\n${nonce}\n${bodyHash}`;
  const signature = await hmacSha256Hex(queueHmacSecret, signingPayload);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-import-ts': String(timestampSeconds),
        'x-import-nonce': nonce,
        'x-import-signature': signature,
      },
      body: requestBody,
    });

    if (response.ok) {
      return;
    }

    const responseBody = (await response.text()).slice(0, 350);
    await deps.markBatchFailed(
      args.batchId,
      `Queue dispatch failed (${String(response.status)}): ${responseBody}`,
      Date.now()
    );
  } catch (caught) {
    const message =
      caught instanceof Error
        ? caught.message.slice(0, 350)
        : 'Unknown queue dispatch error';

    await deps.markBatchFailed(
      args.batchId,
      `Queue dispatch failed: ${message}`,
      Date.now()
    );
  }
}
