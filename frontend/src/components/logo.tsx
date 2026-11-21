import Link from "next/link";

import { cn } from "@/lib/utils";

/** A page with a folded corner and one highlighted line: the product in one glyph. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} aria-hidden>
      <path d="M7 3h13l6 6v20H7z" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M20 3v6h6" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
      <rect x="10" y="14.5" width="13" height="4" rx="1" fill="var(--highlight)" />
      <path d="M11 16.5h11M11 23h8" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 text-ink", className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight">Pagewise</span>
    </Link>
  );
}
