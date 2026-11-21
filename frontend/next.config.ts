import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // small self-contained server for the Docker image (Vercel ignores this)
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // pdf.js has an optional Node-only dependency on `canvas`; it's never used in the browser.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
