import type { ReactNode } from "react";
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

export const metadata = {
  title: "Rewally - Hoàn tiền mua sắm",
  description: "Mua sắm qua Rewally để nhận hoàn tiền cho mọi đơn hàng Shopee.",
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
