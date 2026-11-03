"use client";
import { CalendarCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Logo } from "./Logo";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { PrototypeBanner } from "./PrototypeBanner";

export function ClientHeader() {
  const t = useTranslations("client");
  return (
    <>
      <PrototypeBanner />
      <header className="sticky top-0 z-30 border-b border-breeze-100/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Logo href="/explore" />
          <div className="flex items-center gap-2">
            <Link
              href="/me"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-lagoon hover:bg-breeze-50"
            >
              <CalendarCheck className="size-4" />
              <span className="hidden sm:inline">{t("myBookings")}</span>
            </Link>
            <LocaleSwitcher />
          </div>
        </div>
      </header>
    </>
  );
}
