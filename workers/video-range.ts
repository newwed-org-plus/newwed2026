export async function serveVideo(request: Request, assets: Pick<Fetcher, "fetch">, ctx: ExecutionContext, size: number) {
  const range = request.method === "GET" && /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("Range") ?? "");
  if (!range || (!range[1] && !range[2])) return assets.fetch(request);

  // Workers Static Assets serves the whole file, even when Range is present.
  const assetRequest = new Request(request.url, {headers: {"Accept-Encoding": "identity"}});
  const asset = await assets.fetch(assetRequest);
  if (asset.status !== 200 || !asset.body) return asset;

  const validator = request.headers.get("If-Range");
  if (validator && (validator.startsWith("W/") ||
      (validator !== asset.headers.get("ETag") && validator !== asset.headers.get("Last-Modified")))) return asset;

  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  const headers = new Headers(asset.headers);
  headers.set("Accept-Ranges", "bytes");
  if (start >= size || end < start) {
    await asset.body.cancel();
    headers.set("Content-Range", `bytes */${size}`);
    headers.delete("Content-Length");
    return new Response(null, {status: 416, headers});
  }

  const length = end - start + 1;
  const reader = asset.body.getReader();
  let skip = start;
  let remaining = length;
  const slice = new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (remaining > 0) {
        const {done, value} = await reader.read();
        if (done) throw new Error("Video asset ended before the requested range");
        if (skip >= value.byteLength) {
          skip -= value.byteLength;
          continue;
        }
        const chunk = value.subarray(skip, skip + remaining);
        skip = 0;
        remaining -= chunk.byteLength;
        controller.enqueue(chunk);
        if (remaining === 0) {
          controller.close();
          await reader.cancel();
        }
        return;
      }
    },
    cancel: reason => reader.cancel(reason),
  });
  const fixed = new FixedLengthStream(length);
  // The client may cancel an open range before requesting a different offset.
  // Stream failures already reach the response body through the pipe.
  ctx.waitUntil(slice.pipeTo(fixed.writable).catch(() => {}));
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(length));
  return new Response(fixed.readable, {status: 206, headers});
}
