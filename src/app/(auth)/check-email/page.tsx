"use client";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function CheckEmailPage() {
  const t = useTranslations("auth.checkEmail");
  return (
    <section className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-breeze-100 animate-fade-up">
      <MailCheck className="mx-auto size-14 text-breeze-500" />
      <h1 className="mt-4 text-2xl font-extrabold">{t("title")}</h1>
      <p className="mt-2 text-ink/70">{t("body")}</p>
      <p className="mt-4 text-xs text-ink/70">{t("spam")}</p>
      <Link href="/login" className="mt-6 inline-block text-sm font-bold text-lagoon">{t("back")}</Link>
    </section>
  );
}
