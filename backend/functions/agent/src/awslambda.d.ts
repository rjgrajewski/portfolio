/**
 * Minimal ambient declaration for the `awslambda` global that the AWS Lambda
 * Node.js runtime injects when response streaming is enabled
 * (`InvokeMode: RESPONSE_STREAM` on the Function URL — see
 * backend/infra/lib/api-stack.ts). It is a runtime global, not an importable
 * module, so it is declared here rather than pulled from a package.
 *
 * Only the surface this handler actually uses is typed.
 */

import type { Writable } from "node:stream";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace awslambda {
    interface ResponseStream extends Writable {
      setContentType(contentType: string): void;
    }

    type StreamifyHandler<TEvent> = (
      event: TEvent,
      responseStream: ResponseStream,
      context: unknown,
    ) => Promise<unknown>;

    function streamifyResponse<TEvent = unknown>(
      handler: StreamifyHandler<TEvent>,
    ): (event: TEvent, context: unknown) => Promise<unknown>;

    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace HttpResponseStream {
      function from(
        underlyingStream: ResponseStream,
        prelude: {
          statusCode?: number;
          headers?: Record<string, string>;
          cookies?: string[];
        },
      ): ResponseStream;
    }
  }
}

export {};
