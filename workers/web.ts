import handler from "vinext/server/fetch-handler";
import { serveVideo } from "./video-range";

declare const __NEWWED_HOME_VIDEO_SIZE__: number;

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === "/assets/videos/new-wed-home.mp4" &&
        (request.method === "GET" || request.method === "HEAD")) {
      return serveVideo(request, env.ASSETS, ctx, __NEWWED_HOME_VIDEO_SIZE__);
    }
    return handler.fetch(request, env, ctx);
  },
};

export { AdminPasswordVerifier } from "../src/server/auth/password-verifier";
export { AdminIpLimiter } from "../src/server/auth/ip-limiter";
