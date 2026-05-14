import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep heavy native/WASM packages as external Node modules so they aren't
  // bundled into route chunks (which breaks WASM loading and PDF parsing).
  serverExternalPackages: ["tiktoken", "pdf-parse", "mammoth"],
};

export default nextConfig;
