import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.FORREST_NODE_PROOF === '1' ? {
    distDir: '.next-node-proof',
    typescript: { tsconfigPath: 'tsconfig.node-proof.json' },
  } : {}),
};

export default nextConfig;
