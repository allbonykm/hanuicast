import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/*.mp3',
          '**/*.wav',
          '**/*.aac',
          '**/public/audio/**' // Assuming potential output dir
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
