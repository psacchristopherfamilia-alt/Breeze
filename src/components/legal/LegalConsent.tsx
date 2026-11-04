"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LEGAL_PATH } from "@/lib/legal/config";

const link = (href: string) => (c: React.ReactNode) => (
  <Link href={href} target="_blank" className="font-bold text-lagoon underline underline-offset-2">{c}</Link>
);

/** "Al reservar aceptas los Términos y la Política de privacidad" (kind: booking | signup | business). */
export function LegalConsent({ kind, className }: { kind: "booking" | "signup" | "business"; className?: string }) {
  const t = useTranslations("legal");
  return (
    <span className={className}>
      {t.rich(`consent.${kind}`, {
        terms: link(LEGAL_PATH.terms),
        privacy: link(LEGAL_PATH.privacy),
        business: link(LEGAL_PATH["business-terms"]),
      })}
    </span>
  );
}

/** Enlaces cortos a los documentos legales (pies de página). */
export function LegalLinks({ className = "", invert = false }: { className?: string; invert?: boolean }) {
  const t = useTranslations("legal");
  const cls = invert ? "text-white/60 hover:text-white" : "text-ink/50 hover:text-ink";
  return (
    <nav aria-label={t("label")} className={`flex flex-wrap gap-x-4 gap-y-1 text-xs ${className}`}>
      <Link href={LEGAL_PATH.privacy} className={cls}>{t("privacy")}</Link>
      <Link href={LEGAL_PATH.terms} className={cls}>{t("terms")}</Link>
      <Link href={LEGAL_PATH["business-terms"]} className={cls}>{t("businessTerms")}</Link>
    </nav>
  );
}
