export async function onRequestGet() {
  const url = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm";
  const upstream = await fetch(url);
  const headers = new Headers(upstream.headers);
  headers.set("Cache-Control", "public, max-age=31536000, stale-while-revalidate=86400");
  headers.set("Content-Type", "application/wasm");
  return new Response(upstream.body, {
    status: upstream.status,
    headers
  });
}

export async function onRequestHead() {
  const url = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm";
  const upstream = await fetch(url, { method: "HEAD" });
  const headers = new Headers(upstream.headers);
  headers.set("Cache-Control", "public, max-age=31536000, stale-while-revalidate=86400");
  headers.set("Content-Type", "application/wasm");
  return new Response(null, {
    status: upstream.status,
    headers
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Allow": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS"
    }
  });
}
