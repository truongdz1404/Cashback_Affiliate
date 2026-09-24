"use client";

import { useState } from "react";
import { toast } from "@heroui/react";
import { appClient, AppRequestError } from "@/lib/appClient";
import { openAuthDialog } from "@/lib/authDialog";
import { openPendingTab } from "@/lib/pendingTab";
import type { ShopOpenResult } from "@/lib/appTypes";

// Every jump from our pages out to a shop's Shopee storefront goes through
// here. Linking shopee.vn/shop/<id> directly would be simpler and instant, but
// that URL carries no affiliate id at all - an order placed after such a tap
// pays nobody, neither the buyer nor us. The round trip buys the affiliate id
// and, for a signed-in visitor, a sub id so the cashback can be matched back.
//
// A guest is still sent through: the backend answers with the operator's
// affiliate link and `tracked: false`, so the commission survives even though
// the cashback cannot be attributed. The sign-in dialog opens on this tab to
// say so - without blocking the jump, which already happened.
export function useOpenShopOnShopee() {
  const [loading, setLoading] = useState(false);

  async function openShop(shopId: string, isAuthenticated: boolean) {
    if (loading) return;

    const tab = openPendingTab("Đang mở cửa hàng…", "Giữ tab này mở, Shopee sẽ hiện ra ngay sau đây.");
    setLoading(true);
    try {
      const result = await appClient.post<ShopOpenResult>(`/shops/${shopId}/open`);
      if (tab) tab.location.href = result.affiliateUrl;
      else window.location.href = result.affiliateUrl;

      if (!isAuthenticated) {
        openAuthDialog({
          title: "Đăng nhập để đơn mua ở shop này được hoàn tiền",
          description:
            "Cửa hàng đã mở ở tab mới. Đơn mua lúc chưa đăng nhập sẽ không được hoàn tiền - đăng nhập rồi bấm lại để mua qua link hoàn tiền của bạn.",
        });
      }
    } catch (err) {
      if (tab) tab.close();
      const message = err instanceof AppRequestError ? err.message : "Không mở được cửa hàng.";
      if (!(err instanceof AppRequestError) || err.status !== 401) toast.danger(message);
    } finally {
      setLoading(false);
    }
  }

  return { openShop, loading };
}
