import Image from "next/image";
import type { ComponentType } from "react";
import { ImageIcon } from "@/components/icons";

// Reserves the space a real photo/illustration will occupy once the design
// assets exist. Deliberately LOOKS unfinished (dashed outline + "Ảnh minh
// hoạ") so nobody mistakes it for shipped artwork, and so swapping it out is
// a one-line change: replace <PlaceholderImage …/> with <Image …/>.
//
// `src` is the escape hatch: pass a real file from /public and the component
// renders that instead, which lets a section be written once and upgraded
// asset by asset.
export default function PlaceholderImage({
  label,
  icon: Icon = ImageIcon,
  className = "",
  src,
  alt,
  tone = "soft",
}: {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
  src?: string;
  alt?: string;
  tone?: "soft" | "surface" | "onAccent";
}) {
  if (src) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <Image src={src} alt={alt ?? label} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-contain" />
      </div>
    );
  }

  const palette =
    tone === "onAccent"
      ? "border-white/45 bg-white/10 text-white/85"
      : tone === "surface"
        ? "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
        : "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]";

  return (
    <div
      // Decorative by definition: there is no information here a screen
      // reader should announce, only a slot waiting for artwork.
      aria-hidden
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center ${palette} ${className}`}
    >
      <Icon className="h-7 w-7 opacity-70" />
      <span className="text-xs font-bold leading-snug">{label}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Ảnh minh hoạ</span>
    </div>
  );
}
