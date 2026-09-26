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
      // Shop avatars come back off the Singapore CDN host, not the .vn one.
      { protocol: 'https', hostname: 'cf.shopee.sg' },
      { protocol: 'https', hostname: 'refundmoney.tro247.online' },
    ],
    // 31 days instead of the 4-hour default. A Shopee image URL is content
    // addressed - the file behind it never changes - so re-encoding it every
    // four hours buys nothing and costs a second and a half of CPU on a box
    // that only has two cores. The cache itself is a named volume now
    // (docker-compose.yml), so a deploy no longer starts it from empty.
    minimumCacheTTL: 2678400,
  },
};

export default nextConfig;
