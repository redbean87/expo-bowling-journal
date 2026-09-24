import { httpRouter, makeFunctionReference } from 'convex/server';

import { httpAction } from './_generated/server';
import { auth } from './auth';
import {
  buildLivenessResponse,
  buildReadinessResponse,
  readinessHttpStatus,
  runDependencyChecks,
} from './lib/health';
import {
  authenticateImportCallbackRequest,
  CALLBACK_PATH,
} from './lib/import_callback_auth';
import { parseAndValidateCallbackPayload } from './lib/import_callback_payload';
import { processImportCallbackPayload } from './lib/import_callback_processing';

export const HEALTH_LIVE_PATH = '/health';
export const HEALTH_READY_PATH = '/health/ready';

const pingDatabaseQueryRef = makeFunctionReference<'query', {}, null>(
  'health:pingDatabase'
);

const http = httpRouter();

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

auth.addHttpRoutes(http);

http.route({
  path: HEALTH_LIVE_PATH,
  method: 'GET',
  handler: httpAction(async () => {
    return jsonResponse(200, buildLivenessResponse(Date.now()));
  }),
});

http.route({
  path: HEALTH_READY_PATH,
  method: 'GET',
  handler: httpAction(async (ctx) => {
    const checks = await runDependencyChecks([
      {
        name: 'database',
        probe: async () => {
          try {
            await ctx.runQuery(pingDatabaseQueryRef, {});
          } catch {
            throw new Error('Database query failed');
          }
        },
      },
    ]);

    const response = buildReadinessResponse(Date.now(), checks);

    return jsonResponse(readinessHttpStatus(response), response);
  }),
});

http.route({
  path: CALLBACK_PATH,
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const authResult = await authenticateImportCallbackRequest(
      ctx,
      request,
      process.env.IMPORT_CALLBACK_HMAC_SECRET
    );

    if (!authResult.ok) {
      return jsonResponse(authResult.status, {
        error: authResult.error,
      });
    }

    const payloadResult = parseAndValidateCallbackPayload(authResult.rawBody);

    if (!payloadResult.ok) {
      return jsonResponse(payloadResult.status, {
        error: payloadResult.error,
      });
    }

    const processResult = await processImportCallbackPayload(
      ctx,
      payloadResult.payload,
      payloadResult.snapshotValidation
    );

    return jsonResponse(processResult.status, processResult.body);
  }),
});

export default http;
