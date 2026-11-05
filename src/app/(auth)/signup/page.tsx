"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useActionState } from "react";
import { useAppLocale } from "@/components/Providers";
import { Field, FormError, SubmitButton } from "@/components/auth/ui";
import { LegalConsent } from "@/components/legal/LegalConsent";
import { signUp } from "../actions";

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}

function SignUpForm() {
  const t = useTranslations("auth");
  const { locale } = useAppLocale();
  const next = useSearchParams().get("next") ?? "";
  const [state, action] = useActionState(signUp, undefined);
  const v = (k: string) => (typeof state?.values?.[k] === "string" ? (state.values[k] as string) : undefined);
  const f = state?.fields ?? {};

  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-breeze-100 animate-fade-up">
      <h1 className="text-2xl font-extrabold">{t("signup.title")}</h1>
      <p className="mt-1 text-sm text-ink/70">{t("signup.subtitle")}</p>
      <form action={action} className="mt-5 space-y-3" noValidate>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="locale" value={locale} />
        <FormError error={state?.error} />
        <Field name="fullName" defaultValue={v("fullName")} label={t("fields.fullName")} autoComplete="name" error={f.fullName} />
        <Field name="email" defaultValue={v("email")} type="email" label={t("fields.email")} autoComplete="email" error={f.email} />
        <Field name="phone" defaultValue={v("phone")} type="tel" label={t("fields.phone")} autoComplete="tel" placeholder="+1 649 …" hint={t("fields.phoneHint")} error={f.phone} />
        <Field name="password" type="password" label={t("fields.password")} autoComplete="new-password" hint={t("fields.passwordHint")} error={f.password} />
        <SubmitButton>{t("signup.submit")}</SubmitButton>
        <p className="text-xs text-ink/70"><LegalConsent kind="signup" /></p>
        <p className="text-xs text-ink/70">{t("signup.guestNote")}</p>
      </form>
      <p className="mt-5 border-t border-breeze-100 pt-4 text-center text-sm">
        {t("signup.haveAccount")}{" "}
        <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-bold text-lagoon">{t("signup.login")}</Link>
      </p>
      <p className="mt-2 text-center text-sm">
        {t("login.isSalon")}{" "}
        <Link href="/negocios" className="font-bold text-lagoon">{t("login.businessLink")}</Link>
      </p>
    </section>
  );
}
