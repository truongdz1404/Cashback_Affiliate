import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Toast } from "@heroui/react";
import { Be_Vietnam_Pro } from "next/font/google";
import FirebaseAnalytics from "@/components/FirebaseAnalytics";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

// favicon.ico, icon.png and apple-icon.png next to this file are picked up
// by the App Router file conventions and linked in <head> automatically.
export const metadata: Metadata = {
  title: "Rewally - Hoàn tiền mua sắm",
  description: "Mua sắm qua Rewally để nhận hoàn tiền cho mọi đơn hàng Shopee.",
  applicationName: "Rewally",
  appleWebApp: { title: "Rewally", capable: true, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#4DBA7A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={beVietnamPro.variable}>
      <body>
        {children}
        <Toast.Provider />
        <FirebaseAnalytics />
      </body>
    </html>
  );
}
