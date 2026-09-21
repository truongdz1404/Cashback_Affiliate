import type { ReactNode } from "react";
import { Toast } from "@heroui/react";
import "./globals.css";

export const metadata = {
  title: "Shopee Affiliate Admin",
  description: "Quản lý hoa hồng, đơn hàng và khách hàng của bot Shopee affiliate.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        {children}
        <Toast.Provider />
      </body>
    </html>
  );
}
