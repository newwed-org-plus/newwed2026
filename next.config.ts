import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{
      source: "/famtour",
      destination: "/destinos",
      permanent: true,
    }, {
      source: "/famtour/:path*",
      destination: "/destinos/:path*",
      permanent: true,
    }];
  },
};

export default nextConfig;
