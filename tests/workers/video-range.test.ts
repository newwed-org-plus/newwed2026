import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { expect, test } from "vitest";
import { serveVideo } from "../../workers/video-range";

const videoUrl = "https://newwed.test/assets/videos/new-wed-home.mp4";
const assets = {
  async fetch() {
    return new Response("0123456789", {
      headers: {"Content-Type": "video/mp4", ETag: '"version-1"'},
    });
  },
};

test.each([
  ["bytes=0-1", "bytes 0-1/10", "01"],
  ["bytes=5-", "bytes 5-9/10", "56789"],
  ["bytes=-2", "bytes 8-9/10", "89"],
  ["bytes=8-12", "bytes 8-9/10", "89"],
])("serves the requested video range %s", async (range, contentRange, body) => {
  const ctx = createExecutionContext();
  const response = await serveVideo(new Request(videoUrl, {headers: {Range: range}}), assets, ctx, 10);
  expect(response.status).toBe(206);
  expect(response.headers.get("Content-Range")).toBe(contentRange);
  expect(response.headers.get("Content-Length")).toBe(String(body.length));
  expect(new TextDecoder().decode(await response.arrayBuffer())).toBe(body);
  await waitOnExecutionContext(ctx);
});

test("rejects unsatisfiable video ranges and serves the full asset for a stale validator", async () => {
  const ctx = createExecutionContext();
  const outOfBounds = await serveVideo(new Request(videoUrl, {headers: {Range: "bytes=10-"}}), assets, ctx, 10);
  expect(outOfBounds.status).toBe(416);
  expect(outOfBounds.headers.get("Content-Range")).toBe("bytes */10");
  const stale = await serveVideo(new Request(videoUrl, {
    headers: {Range: "bytes=0-1", "If-Range": '"older-version"'},
  }), assets, ctx, 10);
  expect(stale.status).toBe(200);
  expect(new TextDecoder().decode(await stale.arrayBuffer())).toBe("0123456789");
  await waitOnExecutionContext(ctx);
});
