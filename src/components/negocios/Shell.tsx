"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/ui/Logo";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";

/** Marco de la puerta de Breeze Negocios (oscuro, aparte de la app del cliente). */
export function NegociosShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("negocios");
  return (
    <main className="min-h-dvh bg-marine text-white">
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 py-6 sm:py-10">
        <header className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-3">
            <Logo href="/negocios" invert />
            <span className="rounded-full border border-glow/50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest text-glow">{t("tag")}</span>
          </span>
          <LocaleSwitcher invert />
        </header>
        <div className="mt-10 flex-1">{children}</div>
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-4 text-sm text-white/60">
          <span>{t("toClients")}</span>
          <Link href="/explore" className="font-bold text-glow underline-offset-2 hover:underline">
            {t("toClientsLink")}
          </Link>
        </footer>
      </div>
    </main>
  );
}
