import { httpRouter } from 'convex/server';

import { httpAction } from './_generated/server';
import { auth } from './auth';
import {
  authenticateImportCallbackRequest,
  CALLBACK_PATH,
} from './lib/import_callback_auth';
import { parseAndValidateCallbackPayload } from './lib/import_callback_payload';
import { processImportCallbackPayload } from './lib/import_callback_processing';

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
