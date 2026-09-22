import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest and linked from <head> automatically.
// Lets Android/Chrome "Add to home screen" use the Rewally logo and brand
// colours instead of a generic letter tile.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rewally - Hoàn tiền mua sắm",
    short_name: "Rewally",
    description: "Mua sắm qua Rewally để nhận hoàn tiền cho mọi đơn hàng Shopee.",
    start_url: "/",
    display: "standalone",
    lang: "vi",
    background_color: "#F4F6F4",
    theme_color: "#4DBA7A",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
