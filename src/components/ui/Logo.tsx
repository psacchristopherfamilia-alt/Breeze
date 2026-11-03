import { Wind } from "lucide-react";
import Link from "next/link";

export function Logo({ href = "/", size = "md", invert = false }: { href?: string; size?: "md" | "lg"; invert?: boolean }) {
  const big = size === "lg";
  return (
    <Link href={href} className="inline-flex items-center gap-2 group" aria-label="Breeze">
      <span
        className={`grid place-items-center rounded-2xl ${invert ? "bg-white/15 text-white" : "bg-breeze-500 text-white"} ${big ? "size-11" : "size-9"} shadow-sm transition-transform group-hover:-rotate-6`}
      >
        <Wind className={big ? "size-6" : "size-5"} strokeWidth={2.4} />
      </span>
      <span className={`font-extrabold tracking-tight ${invert ? "text-white" : "text-ink"} ${big ? "text-3xl" : "text-xl"}`} translate="no">
        Breeze
      </span>
    </Link>
  );
}
