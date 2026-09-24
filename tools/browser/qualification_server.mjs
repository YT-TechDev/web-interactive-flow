import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const ROOT = new URL("../../", import.meta.url);

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>WIF real-browser qualification</title>
    <script>
      window.__WIF_QUALIFICATION__ = {
        state: "pending",
        details: null,
      };

      function recordBootstrapFailure(kind, value) {
        if (window.__WIF_QUALIFICATION__.state === "pass") {
          return;
        }

        const message =
          value instanceof Error
            ? value.message
            : String(value ?? kind);

        window.__WIF_QUALIFICATION__ = {
          state: "fail",
          details: { kind, message },
        };
      }

      window.addEventListener("error", (event) => {
        recordBootstrapFailure("window-error", event.error ?? event.message);
      });

      window.addEventListener("unhandledrejection", (event) => {
        recordBootstrapFailure("unhandled-rejection", event.reason);
      });
    </script>
    <script type="module" src="/qualification.mjs"></script>
  </head>
  <body>WIF qualification</body>
</html>
`;

const ROUTES = new Map([
  [
    "/",
    {
      contentType: "text/html; charset=utf-8",
      body: async () => Buffer.from(PAGE),
    },
  ],
  [
    "/qualification.mjs",
    {
      contentType: "text/javascript; charset=utf-8",
      body: async () =>
        readFile(new URL("../../tests/browser/qualification_fixture.mjs", import.meta.url)),
    },
  ],
  [
    "/bridge/module_compiler.mjs",
    {
      contentType: "text/javascript; charset=utf-8",
      body: async () => readFile(new URL("../../bridge/module_compiler.mjs", import.meta.url)),
    },
  ],
  [
    "/bridge/internal.mjs",
    {
      contentType: "text/javascript; charset=utf-8",
      body: async () => readFile(new URL("../../bridge/internal.mjs", import.meta.url)),
    },
  ],
  [
    "/bridge/runtime.mjs",
    {
      contentType: "text/javascript; charset=utf-8",
      body: async () => readFile(new URL("../../bridge/runtime.mjs", import.meta.url)),
    },
  ],
  [
    "/bridge/clock.mjs",
    {
      contentType: "text/javascript; charset=utf-8",
      body: async () => readFile(new URL("../../bridge/clock.mjs", import.meta.url)),
    },
  ],
  [
    "/bridge/frame_scheduler.mjs",
    {
      contentType: "text/javascript; charset=utf-8",
      body: async () => readFile(new URL("../../bridge/frame_scheduler.mjs", import.meta.url)),
    },
  ],
  [
    "/core.wasm",
    {
      contentType: "application/octet-stream",
      body: async () =>
        readFile(new URL("../../_build/wasm/debug/build/core/core.wasm", import.meta.url)),
    },
  ],
]);

function send(res, statusCode, contentType, body) {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

export function createQualificationServer() {
  const server = createServer(async (req, res) => {
    if (req.method !== "GET") {
      send(res, 405, "text/plain; charset=utf-8", "method not allowed");
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const route = ROUTES.get(url.pathname);

    if (route === undefined) {
      send(res, 404, "text/plain; charset=utf-8", "not found");
      return;
    }

    try {
      const body = await route.body();
      send(res, 200, route.contentType, body);
    } catch (error) {
      send(
        res,
        500,
        "text/plain; charset=utf-8",
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  return {
    async start() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });

      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("qualification server did not expose a TCP address");
      }

      return `http://127.0.0.1:${address.port}`;
    },

    async close() {
      if (!server.listening) {
        return;
      }

      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
}
