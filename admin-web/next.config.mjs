import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
  images: {
    // Shopee serves every product/shop image off *.susercontent.com; banners
    // uploaded through the admin dashboard are served from our own origin.
    remotePatterns: [
      { protocol: 'https', hostname: '**.susercontent.com' },
      { protocol: 'https', hostname: 'cf.shopee.vn' },
      { protocol: 'https', hostname: 'refundmoney.tro247.online' },
    ],
  },
};

export default nextConfig;
