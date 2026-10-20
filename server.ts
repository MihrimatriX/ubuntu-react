// Production static server for dist/ in the Docker image. TLS, domains and HTTP/2 belong to the reverse proxy in
// front of it (e.g. Nginx Proxy Manager). Serves the build-time .gz files when the client accepts gzip, caches
// content-hashed assets for a year and revalidates everything else (index.html) so a deploy shows up at once.
const ROOT = `${import.meta.dir}/dist`;
const HASHED = /-[a-z0-9]{8,}\.(js|css|svg|woff2)$/;
const SECURITY = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" };

Bun.serve({
  port: Number(process.env.PORT ?? 8080),
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (path.includes("..")) return new Response("Bad Request", { status: 400 }); // %2f-encoded traversal
    const file = Bun.file(ROOT + (path === "/" ? "/index.html" : path));
    if (!(await file.exists())) return new Response("Not Found", { status: 404 });
    const headers = {
      ...SECURITY,
      "Content-Type": file.type,
      "Cache-Control": HASHED.test(path) ? "public, max-age=31536000, immutable" : "no-cache",
      Vary: "Accept-Encoding",
    };
    const gzip = Bun.file(`${file.name}.gz`);
    if (request.headers.get("accept-encoding")?.includes("gzip") && (await gzip.exists())) {
      return new Response(gzip, { headers: { ...headers, "Content-Encoding": "gzip" } });
    }
    return new Response(file, { headers });
  },
});
