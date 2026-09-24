import Link from "next/link";
import type { ReactNode } from "react";

type PillButtonProps = {
  href: string;
  children: ReactNode;
  variant?: "solid" | "outline";
  external?: boolean;
  className?: string;
};

export default function PillButton({ href, children, variant = "solid", external, className = "" }: PillButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-bold transition active:scale-[0.98]";
  const styles =
    variant === "solid"
      ? "bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[0_10px_30px_-10px_var(--accent)] hover:brightness-105"
      : "border-2 border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-soft)]";

  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={`${base} ${styles} ${className}`}
    >
      {children}
    </Link>
  );
}
