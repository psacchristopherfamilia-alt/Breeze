"use client";
import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function PrototypeBanner() {
  const t = useTranslations("common");
  return (
    <div className="bg-ink text-white/90 text-xs">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-1.5">
        <span className="inline-flex items-center gap-1.5">
          <FlaskConical className="size-3.5" /> <span className="hidden sm:inline">{t("prototype")}</span>
        </span>
        <nav className="flex gap-3 whitespace-nowrap font-semibold">
          <Link href="/explore" className="hover:text-breeze-300">{t("navClient")}</Link>
          <Link href="/dashboard" className="hover:text-breeze-300">{t("navPanel")}</Link>
          <Link href="/live/coral-salon" className="hover:text-breeze-300">Live</Link>
        </nav>
      </div>
    </div>
  );
}
