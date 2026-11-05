"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { Logo } from "@/components/ui/Logo";

export type ErrorKind = "notfound" | "unavailable" | "error";

/** Página de error con la marca: siempre ofrece un camino (ver salones, volver al inicio o reintentar). */
export function ErrorPage({ kind, onRetry }: { kind: ErrorKind; onRetry?: () => void }) {
  const t = useTranslations("errors");
  const code = kind === "notfound" ? "404" : kind === "unavailable" ? "…" : "Oops";

  return (
    <main className="bg-breeze-sky min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
        <header className="flex items-center justify-between">
          <Logo />
          <LocaleSwitcher />
        </header>
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <svg width="120" height="64" viewBox="0 0 120 64" fill="none" stroke="#2bb3b1" strokeWidth="4" strokeLinecap="round" aria-hidden>
            <path d="M6 20c14-12 22 12 36 0s22 12 36 0 22 12 36 0" opacity=".45" />
            <path d="M6 36c14-12 22 12 36 0s22 12 36 0 22 12 36 0" />
            <path d="M6 52c14-12 22 12 36 0s22 12 36 0 22 12 36 0" opacity=".45" />
          </svg>
          <p className="mt-4 text-7xl font-extrabold leading-none tracking-tight text-breeze-500" aria-hidden>{code}</p>
          <h1 className="mt-3 text-balance text-2xl font-extrabold">{t(`${kind}.title`)}</h1>
          <p className="mt-2 text-ink/70">{t(`${kind}.body`)}</p>
          <div className="mt-7 flex w-full flex-col gap-2">
            {kind === "error" && onRetry ? (
              <button onClick={onRetry} className="rounded-2xl bg-lagoon px-5 py-3 font-bold text-white hover:bg-breeze-800">
                {t("retry")}
              </button>
            ) : (
              <Link href="/explore" className="rounded-2xl bg-lagoon px-5 py-3 font-bold text-white hover:bg-breeze-800">
                {t("seeSalons")}
              </Link>
            )}
            <Link href="/" className="rounded-2xl bg-white px-5 py-3 font-bold text-lagoon ring-1 ring-breeze-200 hover:bg-breeze-50">
              {t("home")}
            </Link>
          </div>
        </div>
        <p className="pb-2 text-center text-xs italic text-ink/70">— Breeze</p>
      </div>
    </main>
  );
}
