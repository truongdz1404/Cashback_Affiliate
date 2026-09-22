import Image from "next/image";
import type { ComponentType } from "react";
import { ImageIcon } from "@/components/icons";

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
        ? "border-[var(--border)] bg-white text-[var(--muted)]"
        : "border-[var(--accent)]/28 bg-[var(--accent-soft)] text-[var(--accent)]";

  return (
    <div
      aria-hidden
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-6 text-center ${palette} ${className}`}
    >
      <Icon className="h-7 w-7 opacity-70" />
      <span className="text-xs font-bold leading-snug">{label}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Ảnh minh họa</span>
    </div>
  );
}
