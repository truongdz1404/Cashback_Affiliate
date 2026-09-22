import Link from "next/link";
import { Card } from "@heroui/react";
import { BagIcon, ClockIcon, ReceiptIcon, WalletIcon } from "@/components/icons";

const STEPS = [
  {
    icon: BagIcon,
    title: "Bấm vào sản phẩm",
    description: "Rewally chuyển bạn sang Shopee. Hãy đặt hàng ngay trong phiên vừa mở để đơn được ghi nhận hoàn tiền.",
  },
  {
    icon: ClockIcon,
    title: "Sau khoảng 6 giờ",
    description: "Đơn hàng được cập nhật vào mục Đơn hàng, kèm số tiền hoàn dự kiến.",
  },
  {
    icon: ReceiptIcon,
    title: "Khi đơn giao thành công",
    description: "Đơn chuyển sang trạng thái chờ đối soát với Shopee.",
  },
  {
    icon: WalletIcon,
    title: "7 ngày sau đó",
    description: "Tiền hoàn được cộng vào ví của bạn và có thể rút về tài khoản ngân hàng.",
  },
];

export default function HowItWorks() {
  return (
    <section className="mt-8 rounded-[28px] bg-[var(--surface-secondary)] px-5 py-9 sm:px-10">
      <div className="text-center">
        <h2 className="text-2xl font-extrabold text-[var(--foreground)]">Mua sắm hoàn tiền thế nào?</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--muted)]">
          Bốn bước gọn, không cần mã giảm giá, không cần nhập thêm thông tin ở Shopee.
        </p>
      </div>

      <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, description }, index) => (
          <li key={title}>
            <Card className="h-full rounded-2xl border border-[var(--border)] shadow-none">
              <Card.Content className="p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-extrabold uppercase text-[var(--muted)]">Bước {index + 1}</span>
                </div>
                <h3 className="mt-3 text-sm font-extrabold text-[var(--foreground)]">{title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">{description}</p>
              </Card.Content>
            </Card>
          </li>
        ))}
      </ol>

      <div className="mt-7 text-center">
        <Link href="/guide" className="text-sm font-extrabold text-[var(--accent)] hover:underline">
          Xem hướng dẫn chi tiết và câu hỏi thường gặp
        </Link>
      </div>
    </section>
  );
}
