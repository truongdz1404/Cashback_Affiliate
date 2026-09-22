"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Chip, toast } from "@heroui/react";
import { appClient, AppRequestError } from "@/lib/appClient";
import { formatPct, formatVnd } from "@/lib/format";
import type { ShoppingProduct, ShoppingProductOpenResult } from "@/lib/appTypes";
import { BoltIcon, FireIcon, ImageIcon } from "@/components/icons";

export default function ProductCard({
  product,
  isAuthenticated,
  className = "",
}: {
  product: ShoppingProduct;
  isAuthenticated: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const pct = product.userCommissionRateValue;
  const amount = product.userCommissionValue;

  async function open() {
    if (loading) return;

    if (!isAuthenticated) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      router.push(`/login?next=${next}`);
      return;
    }

    const tab = window.open("", "_blank", "noopener,noreferrer");
    setLoading(true);
    try {
      const result = await appClient.post<ShoppingProductOpenResult>(`/shopping-products/${product.id}/open`);
      if (tab) tab.location.href = result.affiliateUrl;
      else window.location.href = result.affiliateUrl;
    } catch (err) {
      if (tab) tab.close();
      const message = err instanceof AppRequestError ? err.message : "Không mở được liên kết hoàn tiền.";
      if (!(err instanceof AppRequestError) || err.status !== 401) toast.danger(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className={`group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-none transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-[0_18px_38px_-28px_rgba(20,49,34,0.55)] ${className}`}>
      <button
        type="button"
        onClick={open}
        disabled={loading}
        aria-label={`Mua ${product.name} và nhận hoàn tiền`}
        className="relative block aspect-square w-full overflow-hidden bg-[var(--surface-secondary)]"
      >
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
            className="object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[var(--muted)]">
            <ImageIcon className="h-8 w-8" />
          </span>
        )}

        {pct != null && pct > 0 && (
          <Chip size="sm" color="success" variant="primary" className="absolute left-2 top-2 h-6 px-2 text-[10px] font-extrabold text-white">
            Hoàn {formatPct(pct)}%
          </Chip>
        )}

        <span className="absolute right-2 top-2 flex flex-col items-end gap-1">
          {product.isBestSeller && (
            <Chip size="sm" color="danger" variant="primary" className="h-6 px-2 text-[10px] font-bold text-white">
              <FireIcon className="h-3 w-3" /> Bán chạy
            </Chip>
          )}
          {product.isXtraCommission && (
            <Chip size="sm" color="warning" variant="primary" className="h-6 px-2 text-[10px] font-bold text-white">
              <BoltIcon className="h-3 w-3" /> Xtra
            </Chip>
          )}
        </span>

        {loading && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/42 text-xs font-bold text-white">
            Đang tạo link...
          </span>
        )}
      </button>

      <Card.Content className="flex flex-1 flex-col gap-1.5 p-3">
        <button type="button" onClick={open} className="text-left">
          <h3 className="line-clamp-2 min-h-[2.35rem] text-[13px] font-semibold leading-[1.35rem] text-[var(--foreground)] transition group-hover:text-[var(--accent)]">
            {product.name}
          </h3>
        </button>

        {product.shopName && <p className="truncate text-[11px] font-medium text-[var(--muted)]">{product.shopName}</p>}

        <div className="mt-auto pt-1">
          <p className="text-sm font-extrabold text-[var(--danger)]">
            {product.priceValue != null ? formatVnd(product.priceValue) : product.priceText || "Xem giá"}
          </p>
          {amount != null && amount > 0 && <p className="mt-0.5 text-xs font-extrabold text-[var(--accent)]">Hoàn {formatVnd(amount)}</p>}
        </div>

        <Button type="button" onPress={open} isDisabled={loading} isPending={loading} size="sm" variant="tertiary" className="mt-2 h-9 rounded-full bg-[var(--accent-soft)] text-xs font-extrabold text-[var(--accent)]">
          {isAuthenticated ? "Mua & nhận hoàn tiền" : "Đăng nhập để hoàn tiền"}
        </Button>
      </Card.Content>
    </Card>
  );
}
