"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/auth/ui";
import { signIn } from "../actions";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useTranslations("auth");
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const [state, action] = useActionState(signIn, undefined);
  const v = (k: string) => (typeof state?.values?.[k] === "string" ? (state.values[k] as string) : undefined);
  const linkError = params.get("error") === "link" ? "linkInvalid" : undefined;

  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-breeze-100 animate-fade-up">
      <h1 className="text-2xl font-extrabold">{t("login.title")}</h1>
      <p className="mt-1 text-sm text-ink/60">{t("login.subtitle")}</p>
      <form action={action} className="mt-5 space-y-3" noValidate>
        <input type="hidden" name="next" value={next} />
        <FormError error={state?.error ?? linkError} />
        <Field name="email" defaultValue={v("email")} type="email" label={t("fields.email")} autoComplete="email" error={state?.fields?.email} />
        <Field name="password" type="password" label={t("fields.password")} autoComplete="current-password" error={state?.fields?.password} />
        <SubmitButton>{t("login.submit")}</SubmitButton>
      </form>
      <div className="mt-5 space-y-1 border-t border-breeze-100 pt-4 text-center text-sm">
        <p>
          {t("login.noAccount")}{" "}
          <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-bold text-lagoon">
            {t("login.createAccount")}
          </Link>
        </p>
        <p>
          {t("login.isSalon")}{" "}
          <Link href="/signup/salon" className="font-bold text-lagoon">{t("login.registerSalon")}</Link>
        </p>
      </div>
    </section>
  );
}
