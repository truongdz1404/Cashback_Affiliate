export function formatAmount(n: number | string | null | undefined): string {
  const value = Number(n) || 0;
  return value.toLocaleString("vi-VN") + " ₫";
}

export function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("vi-VN");
}

export const DISPLAY_STATUS_LABELS: Record<number, string> = {
  1: "Đang chờ",
  2: "Hoàn thành",
  3: "Đã huỷ",
  4: "Chưa thanh toán (Shopee)",
};

export function displayStatusLabel(status: number | string | null | undefined): string {
  if (status === null || status === undefined) return "Không rõ";
  return DISPLAY_STATUS_LABELS[Number(status)] || `Trạng thái ${status}`;
}
