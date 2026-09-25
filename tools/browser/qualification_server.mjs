import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

export function createQualificationServer(outputRoot) {
  if (typeof outputRoot !== "string" || !path.isAbsolute(outputRoot)) {
    throw new Error("qualification output root must be absolute");
  }
  const root = path.resolve(outputRoot);
  const server = createServer(async (req, res) => {
    if (req.method !== "GET") {
      res.writeHead(405).end("method not allowed");
      return;
    }
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const target = path.resolve(root, relative);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      res.writeHead(404).end("not found");
      return;
    }
    try {
      if (!(await stat(target)).isFile()) throw new Error("not a file");
      const body = await readFile(target);
      res.writeHead(200, {
        "Content-Type": TYPES.get(path.extname(target)) ?? "application/octet-stream",
        "Cache-Control": "no-store",
      }).end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return {
    async start() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("missing address");
      return `http://127.0.0.1:${address.port}`;
    },
    async close() {
      if (server.listening) await new Promise((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
