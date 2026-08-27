import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
