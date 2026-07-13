#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 5174;
const MAX_PORT_ATTEMPTS = 25;
const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const editorRoute = "/tools/collider-editor/";
const requestedPort = Number.parseInt(process.env.PORT || process.argv[2] || `${DEFAULT_PORT}`, 10);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

startServer(Number.isFinite(requestedPort) ? requestedPort : DEFAULT_PORT, 0);

function startServer(port, attempt) {
  const server = createServer(handleRequest);
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && attempt < MAX_PORT_ATTEMPTS) {
      startServer(port + 1, attempt + 1);
      return;
    }
    console.error(error);
    process.exitCode = 1;
  });

  server.listen(port, HOST, () => {
    console.log(`Collider editor: http://${HOST}:${port}${editorRoute}`);
  });
}

function handleRequest(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method Not Allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${HOST}`).pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad Request");
    return;
  }

  if (pathname === "/" || pathname === "/collider-editor") {
    response.writeHead(302, { Location: editorRoute });
    response.end();
    return;
  }

  if (pathname === editorRoute) {
    pathname = `${editorRoute}index.html`;
  }

  const filePath = resolve(repositoryRoot, normalize(pathname).replace(/^[/\\]+/, ""));
  if (!isInsideRepository(filePath) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end("Not Found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

function isInsideRepository(filePath) {
  const relativePath = relative(repositoryRoot, filePath);
  return (
    relativePath === "" ||
    (!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`))
  );
}
