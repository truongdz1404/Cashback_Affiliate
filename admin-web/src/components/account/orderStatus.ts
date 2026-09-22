import type { PillTone } from "@/components/account/ui";
import type { DisplayOrderStatus } from "@/lib/appTypes";

// display_order_status: 1=Chờ xác nhận, 2=Hoàn thành, 3=Đã huỷ, 4=Chưa
// thanh toán (Shopee hasn't settled the order yet).
const TONES: Record<number, PillTone> = {
  1: "warning",
  2: "success",
  3: "danger",
  4: "neutral",
};

export function orderStatusTone(status: DisplayOrderStatus | number | null | undefined): PillTone {
  if (status === null || status === undefined) return "neutral";
  return TONES[Number(status)] ?? "neutral";
}
