import {localRuntimeErrors} from "./config/local-runtime-errors";
import {prepareLocalWorkers} from "./config/local-stack";
import {statSync} from "node:fs";
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { cdnAdapter } from "@vinext/cloudflare/cache/cdn-adapter";

export default defineConfig(({command}) => {
  const local=command==="serve"&&process.env.NEWWED_LOCAL_STACK==="1"?prepareLocalWorkers():null;
  return {
  define: {
    __NEWWED_HOME_VIDEO_SIZE__: statSync(new URL("./public/assets/videos/new-wed-home.mp4", import.meta.url)).size,
  },
  plugins: [
    vinext({
      cache: { cdn: cdnAdapter() },
    }),
    cloudflare({
      ...(local?{remoteBindings:false,config:{queues:local.queues,services:local.services},auxiliaryWorkers:local.workers}:{}),
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
    ...(local?[localRuntimeErrors()]:[]),
  ],
};
});
