import handler from "vinext/server/fetch-handler";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === "/media/new-wed-home.mp4" &&
        (request.method === "GET" || request.method === "HEAD")) {
      const assetUrl = new URL("/assets/videos/new-wed-home.mp4", request.url);
      const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
      const headers = new Headers(asset.headers);
      // Workers Cache serves byte ranges from the complete cached video.
      if (asset.ok || asset.status === 304) headers.set("Cache-Control", "public, max-age=3600");
      return new Response(asset.body, {status: asset.status, headers});
    }
    return handler.fetch(request, env, ctx);
  },
};

export { AdminPasswordVerifier } from "../src/server/auth/password-verifier";
export { AdminIpLimiter } from "../src/server/auth/ip-limiter";
