import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  async rewrites() {
    return [
      { source: "/api/youtube", destination: "https://hidescore.com/api/youtube" },
    ];
  },
};

export default nextConfig;
