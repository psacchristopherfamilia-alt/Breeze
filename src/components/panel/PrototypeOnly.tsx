"use client";
import { FlaskConical } from "lucide-react";
import { useTranslations } from "next-intl";

export function PrototypeOnly() {
  const t = useTranslations("panel");
  return (
    <div className="p-8">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-8 text-center ring-1 ring-breeze-100">
        <FlaskConical className="mx-auto size-10 text-breeze-500" />
        <p className="mt-3 text-ink/70">{t("needsSupabase")}</p>
      </div>
    </div>
  );
}
