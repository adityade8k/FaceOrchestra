import { sampleIndex } from "./sampleIndex.mjs";
import { SharedAssetStore } from "./assets.mjs";
import https from "node:https";
import http from "node:http";
import {
  readFile,
  stat,
  mkdir,
  realpath,
  readdir,
  copyFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { resolve, join, extname, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomInt, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { networkInterfaces, hostname } from "node:os";
import { WebSocketServer } from "ws";
import { TakeStore, safeId, atomicJSON } from "./storage.mjs";
import { exportTake, importTake, exportFrames } from "./archive.mjs";
import { createExport, saveFrame, finishExport, hasFFmpeg } from "./export.mjs";
import { LIMITS } from "../../src/capture/format.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const mime = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".html": "text/html",
  ".css": "text/css",
  ".json": "application/json",
  ".ndjson": "application/x-ndjson",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".txt": "text/plain",
};
async function body(req, limit = LIMITS.message) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit) throw new Error("Request body too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function json(res, value, code = 200) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
async function sendFile(req, res, path) {
  const info = await stat(path);
  if (!info.isFile()) throw new Error("Not a file.");
  const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
  const start = range ? Number(range[1]) : 0,
    end = range?.[2]
      ? Math.min(Number(range[2]), info.size - 1)
      : info.size - 1;
  if (range && (start > end || start >= info.size)) {
    res.writeHead(416);
    res.end();
    return;
  }
  res.writeHead(range ? 206 : 200, {
    "Content-Type":
      mime[extname(path).toLowerCase()] || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Content-Length": info.size ? end - start + 1 : 0,
    ...(range ? { "Content-Range": `bytes ${start}-${end}/${info.size}` } : {}),
    "Cache-Control": "no-store",
  });
  if (req.method === "HEAD" || !info.size) {
    res.end();
    return;
  }
  const stream = createReadStream(path, { start, end });
  stream.on("error", () => res.destroy());
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}
export async function startServer({
  port = Number(process.env.CAPTURE_PORT || 8443),
  host = process.env.CAPTURE_HOST || "0.0.0.0",
  root = ROOT,
  dataRoot = process.env.CAPTURE_DIR || join(ROOT, "captures"),
  plain = process.env.CAPTURE_TEST_HTTP === "1",
  pairCode = process.env.CAPTURE_PAIR_CODE || String(randomInt(100000, 999999)),
} = {}) {
  if (plain && host !== "127.0.0.1")
    throw new Error(
      "HTTP test mode binds only to 127.0.0.1. Use trusted HTTPS on the LAN.",
    );
  const sharedAssets = new SharedAssetStore(join(dataRoot, ".assets"));
  const store = new TakeStore(dataRoot),
    jobs = new Map(),
    sessions = new Set(),
    attempts = new Map(),
    active = new Map();
  await mkdir(dataRoot, { recursive: true });
  let commit = "unknown";
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch {}
  async function walk(directory) {
    const entries = await readdir(join(root, directory), {
      withFileTypes: true,
    });
    const files = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) files.push(...(await walk(path)));
      else files.push(path);
    }
    return files.sort();
  }
  const paths = (await walk("model")).filter((p) =>
    /\.(glb|png|jpe?g)$/i.test(p),
  );
  const assets = {};
  for (const path of paths) {
    try {
      assets[`/${path}`] = createHash("sha256")
        .update(await readFile(join(root, path)))
        .digest("hex");
    } catch {}
  }
  const sourceHash = createHash("sha256");
  for (const path of await walk("src"))
    sourceHash.update(path).update(await readFile(join(root, path)));
  const build = {
    commit,
    sourceHash: sourceHash.digest("hex"),
    captureVersion: 1,
    three: "0.164.1",
    assets,
  };
  const allowedHosts = new Set([
    "localhost",
    "127.0.0.1",
    hostname(),
    ...Object.values(networkInterfaces())
      .flat()
      .filter(Boolean)
      .map((i) => i.address),
    ...(process.env.CAPTURE_HOSTNAMES || "").split(",").filter(Boolean),
  ]);
  function sameOrigin(req) {
    let requested;
    try {
      requested = new URL(`${plain ? "http" : "https"}://${req.headers.host}`);
    } catch {
      return false;
    }
    return (
      allowedHosts.has(requested.hostname) &&
      (!req.headers.origin || req.headers.origin === requested.origin)
    );
  }
  const authorized = (req) =>
    sessions.has(
      /(?:^|;\s*)capture=([a-f0-9]+)/.exec(req.headers.cookie || "")?.[1],
    );
  const server = plain
    ? http.createServer()
    : https.createServer({
        cert: await readFile(
          process.env.CAPTURE_CERT || join(root, "certs/localhost.pem"),
        ),
        key: await readFile(
          process.env.CAPTURE_KEY || join(root, "certs/localhost-key.pem"),
        ),
      });
  server.on("request", async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    try {
      if (!sameOrigin(req)) {
        json(res, { error: "Unrecognized host or Origin." }, 403);
        return;
      }
      const path = decodeURIComponent(
        new URL(req.url, `${plain ? "http" : "https"}://${req.headers.host}`)
          .pathname,
      );
      if (path === "/api/status") {
        json(res, {
          ready: true,
          paired: authorized(req),
          build,
          ffmpeg: hasFFmpeg(),
        });
        return;
      }
      if (path === "/api/pair" && req.method === "POST") {
        const addr = req.socket.remoteAddress,
          now = Date.now(),
          recent = (attempts.get(addr) || []).filter((t) => now - t < 60000);
        attempts.set(addr, [...recent, now]);
        if (recent.length >= 10) {
          json(res, { error: "Wait one minute before pairing again." }, 429);
          return;
        }
        const data = JSON.parse(await body(req, 256));
        if (String(data.code) !== pairCode) {
          json(res, { error: "Incorrect pairing code." }, 403);
          return;
        }
        const token = randomBytes(32).toString("hex");
        sessions.add(token);
        res.setHeader(
          "Set-Cookie",
          `capture=${token}; HttpOnly; SameSite=Strict; Path=/${plain ? "" : "; Secure"}`,
        );
        json(res, { paired: true });
        return;
      }
      if (path.startsWith("/api/")) {
        if (!authorized(req)) {
          json(
            res,
            { error: "Pair with the six-digit code shown by capture:serve." },
            401,
          );
          return;
        }
        if (path === "/api/takes" && req.method === "GET") {
          json(res, await store.list());
          return;
        }
        if (path === "/api/import" && req.method === "POST") {
          const id = await importTake(dataRoot, req);
          await store.read(id);
          json(res, { id });
          return;
        }
        const takeMatch = /^\/api\/takes\/([\w-]+)(?:\/(.*))?$/.exec(path);
        if (takeMatch) {
          const [, id, operation] = takeMatch,
            take = await store.read(id);
          if (!operation) {
            json(res, take.metadata);
            return;
          }
          if (operation === "sample-index") {
            json(res, await sampleIndex(join(take.dir, "samples.ndjson")));
            return;
          }
          if (operation === "archive") {
            if (active.has(id))
              throw new Error(
                "Stop recording before downloading a portable take.",
              );
            res.writeHead(200, {
              "Content-Type": "application/octet-stream",
              "Content-Disposition": `attachment; filename="${id}.honk"`,
            });
            await exportTake(take.dir, res);
            return;
          }
          if (operation === "recover" && req.method === "POST") {
            if (active.has(id)) throw new Error("Take is still connected.");
            json(
              res,
              await store.finalize(id, {
                reason: "recovered",
                expected: (await store.load(id)).last,
              }),
            );
            return;
          }
          if (
            [
              "samples.ndjson",
              "events.ndjson",
              "audio.ndjson",
              "audio.wav",
            ].includes(operation)
          ) {
            await sendFile(req, res, join(take.dir, operation));
            return;
          }
          if (
            operation.startsWith("assets/model/") &&
            take.metadata.build?.assets?.[`/${operation.slice(7)}`] &&
            !operation.includes("..")
          ) {
            await sendFile(req, res, join(take.dir, operation));
            return;
          }
        }
        if (path === "/api/exports" && req.method === "POST") {
          const project = JSON.parse(await body(req, 2 * 1024 * 1024));
          await store.read(project.takeId);
          const job = await createExport(join(dataRoot, "exports"), project);
          jobs.set(job.id, job);
          json(res, { id: job.id, frames: job.frames, ffmpeg: job.ffmpeg });
          return;
        }
        const jobMatch = /^\/api\/exports\/([\w-]+)\/(.+)$/.exec(path);
        if (jobMatch) {
          const [, id, operation] = jobMatch;
          if (!safeId(id)) throw new Error("Invalid export ID.");
          const job = jobs.get(id);
          if (operation === "archive.tar") {
            await stat(join(dataRoot, "exports", id, "audio.wav"));
            res.writeHead(200, {
              "Content-Type": "application/x-tar",
              "Content-Disposition": `attachment; filename="${id}-frames.tar"`,
            });
            await exportFrames(join(dataRoot, "exports", id), res);
            return;
          }
          if (operation.startsWith("frame/") && req.method === "PUT" && job) {
            await saveFrame(
              job,
              Number(operation.slice(6)),
              await body(req, 16 * 1024 * 1024),
            );
            json(res, { next: job.next });
            return;
          }
          if (operation === "finish" && req.method === "POST" && job) {
            json(
              res,
              await finishExport(await store.read(job.project.takeId), job),
            );
            return;
          }
          if (operation === "files") {
            const { readdir } = await import("node:fs/promises");
            json(res, await readdir(join(dataRoot, "exports", id)));
            return;
          }
          if (
            /^(frame-\d{6}\.png|audio\.wav|composite\.mp4|project\.json|README\.txt)$/.test(
              operation,
            )
          ) {
            await sendFile(req, res, join(dataRoot, "exports", id, operation));
            return;
          }
        }
        json(res, { error: "Unknown local endpoint." }, 404);
        return;
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        json(res, { error: "Method not allowed." }, 405);
        return;
      }
      const staticPath =
        path === "/"
          ? "/index.html"
          : path === "/capture/" || path === "/capture"
            ? "/capture/index.html"
            : path;
      if (
        !/^\/(index\.html|style\.css|scripts\/(?:validate-[\w-]+|looper-playback-fixture)\.mjs|(?:src|model|vendor\/three|capture)\/[^\0]+)$/.test(
          staticPath,
        ) ||
        staticPath.split("/").some((p) => p.startsWith("."))
      ) {
        json(res, { error: "Not served." }, 404);
        return;
      }
      const target = await realpath(resolve(root, `.${staticPath}`));
      if (
        !target.startsWith(resolve(root) + sep) ||
        /\.(pem|key|pfx|p12)$/i.test(target)
      ) {
        json(res, { error: "Not served." }, 404);
        return;
      }
      await sendFile(req, res, target);
    } catch (error) {
      if (!res.headersSent)
        json(
          res,
          {
            error: error.code === "ENOENT" ? "File not found." : error.message,
          },
          error.code === "ENOENT" ? 404 : 400,
        );
      else res.destroy();
    }
  });
  const closingConnections = new Set();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: LIMITS.message,
    perMessageDeflate: false,
  });
  server.on("upgrade", (req, socket, head) => {
    if (
      req.url !== "/api/stream" ||
      !sameOrigin(req) ||
      !req.headers.origin ||
      !authorized(req)
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });
  wss.on("connection", (ws) => {
    let id = null,
      pending = Promise.resolve(),
      queuedBytes = 0;
    const send = (value) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(value));
    };
    const timer = setTimeout(() => {
      if (!id) ws.close(1008, "Hello required");
    }, 10000);
    ws.on("message", (raw) => {
      queuedBytes += raw.length;
      if (queuedBytes > LIMITS.queue) {
        ws.close(1009, "Receiver backpressure; reconnect");
        return;
      }
      pending = pending
        .then(async () => {
          const message = JSON.parse(raw);
          if (message.type === "hello") {
            if (id) throw new Error("Already initialized.");
            const take = message.create
              ? await store.create({
                  ...message.metadata,
                  build,
                  assetsBundled: true,
                })
              : await store.load(message.id);
            if (message.create) {
              // Immutable hash assets share storage; readiness still waits for a complete manifest.
              for (const path of Object.keys(build.assets)) {
                const destination = join(take.dir, "assets", path.slice(1));
                await mkdir(dirname(destination), { recursive: true });
                await sharedAssets.snapshot(
                  join(root, path.slice(1)),
                  destination,
                  build.assets[path],
                );
              }
            }
            if (active.has(take.metadata.id))
              throw new Error("Take already has a writer.");
            id = take.metadata.id;
            active.set(id, ws);
            clearTimeout(timer);
            if (!take.metadata.complete) {
              take.metadata.status = "recording";
              await atomicJSON(join(take.dir, "take.json"), take.metadata);
            }
            send({ type: "ready", id, last: take.last });
          } else if (message.type === "packet" && id) {
            const seq = await store.append(id, message.packet);
            send({ type: "ack", stream: message.packet.stream, seq });
          } else if (message.type === "finish" && id) {
            const metadata = await store.finalize(id, message);
            send({ type: "finalized", metadata });
          } else throw new Error("Unknown capture message.");
        })
        .catch((error) => {
          send({ type: "error", message: error.message });
          ws.close(1011, "Capture error");
        })
        .finally(() => {
          queuedBytes -= raw.length;
        });
    });
    ws.on("close", () => {
      clearTimeout(timer);
      const closing = pending
        .finally(async () => {
          if (id && active.get(id) === ws) {
            active.delete(id);
            const take = await store.read(id);
            if (take.metadata.status === "recording") {
              const writer = await store.load(id);
              await store.finalize(id, {
                reason: "disconnected",
                expected: writer.last,
              });
            }
          }
        })
        .catch(console.error);
      closingConnections.add(closing);
      closing.finally(() => closingConnections.delete(closing));
    });
    ws.on("error", () => {});
  });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(port, host, accept);
  });
  return {
    server,
    store,
    pairCode,
    port: server.address().port,
    disconnectTake: (id) => active.get(id)?.terminate(),
    close: async () => {
      for (const ws of wss.clients) ws.terminate();
      await new Promise((r) => server.close(r));
      await Promise.allSettled([...closingConnections]);
      await store.close();
    },
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const service = await startServer();
  console.log(
    `Mixed Reality Capture — HTTPS port ${service.port}\nPairing code: ${service.pairCode}\nApp: https://YOUR_LAN_IP:${service.port}/\nEditor: https://localhost:${service.port}/capture/\nKeep this terminal open. Takes are saved in ${process.env.CAPTURE_DIR || join(ROOT, "captures")}.`,
  );
}
