"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { captureReferralCodeFromUrl } from "@/lib/referralCode";

// Mounted once in the root layout so an invite link works no matter where it
// points - /register, the home page, a shop page, a shared product. Reads
// window.location.search rather than useSearchParams so the whole tree above it
// doesn't need a Suspense boundary; the pathname dependency re-runs it on
// client-side navigations too.
export default function ReferralCapture() {
  const pathname = usePathname();

  useEffect(() => {
    captureReferralCodeFromUrl(window.location.search);
  }, [pathname]);

  return null;
}
