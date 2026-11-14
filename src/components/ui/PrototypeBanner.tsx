"use client";
import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAppHref, useIsDemo } from "@/lib/demo/useDemo";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** En modo prototipo (sin Supabase) y en la demo pública (/demo). Con datos reales no se muestra. */
export function PrototypeBanner() {
  const t = useTranslations("common");
  const inDemo = useIsDemo();
  const appHref = useAppHref();
  if (isSupabaseConfigured() && !inDemo) return null;
  return (
    <div className="bg-ink text-white/90 text-xs">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-1.5">
        <span className="inline-flex items-center gap-1.5">
          <FlaskConical className="size-3.5" /> <span className="hidden sm:inline">{t(inDemo ? "demo" : "prototype")}</span>
        </span>
        <nav className="flex gap-3 whitespace-nowrap font-semibold">
          <Link href={appHref("/explore")} className="hover:text-breeze-300">{t("navClient")}</Link>
          <Link href={appHref("/dashboard")} className="hover:text-breeze-300">{t("navPanel")}</Link>
          <Link href={appHref("/live/coral-salon")} className="hover:text-breeze-300">Live</Link>
          {inDemo && (
            <Link href="/signup/salon" className="text-breeze-300 hover:text-white">{t("demoStart")}</Link>
          )}
        </nav>
      </div>
    </div>
  );
}
