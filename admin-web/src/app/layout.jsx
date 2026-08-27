import "./globals.css";

export const metadata = {
  title: "Shopee Affiliate Admin",
  description: "Quản lý hoa hồng, đơn hàng và khách hàng của bot Shopee affiliate.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
