import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".png", "image/png"],
  [".ico", "image/x-icon"]
]);

const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; manifest-src 'self'; script-src 'self'; style-src 'self'",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
});

export function securityHeaders() {
  return SECURITY_HEADERS;
}

export async function serveStatic(request, response, directory, pathname) {
  if (!directory || !["GET", "HEAD"].includes(request.method)) return false;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return false;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const root = resolve(directory);
  const candidate = resolve(root, relativePath);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return false;

  try {
    if (!(await stat(candidate)).isFile()) return false;
    const content = await readFile(candidate);
    const extension = extname(candidate);
    const cacheControl = extension === ".html" || relativePath === "sw.js" || relativePath === "refresh.js"
      ? "no-store"
      : "public, max-age=3600";
    response.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": CONTENT_TYPES.get(extension) || "application/octet-stream",
      "Content-Length": content.length,
      "Cache-Control": cacheControl
    });
    if (request.method === "HEAD") return response.end();
    response.end(content);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EISDIR") return false;
    throw error;
  }
}
