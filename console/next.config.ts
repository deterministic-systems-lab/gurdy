import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/ingest": ["./bin/gurdy-verify-linux-amd64"],
    "/api/policy": ["./bin/gurdy-proxy-linux-amd64"],
  },
};

export default nextConfig;
