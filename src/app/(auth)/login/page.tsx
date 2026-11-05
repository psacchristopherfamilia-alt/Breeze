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
  // /login = clientes. /login?for=negocios = puerta de negocios (dueños, administradores y equipo).
  const forBusiness = params.get("for") === "negocios";
  const next = params.get("next") ?? (forBusiness ? "/dashboard" : "");
  const [state, action] = useActionState(signIn, undefined);
  const v = (k: string) => (typeof state?.values?.[k] === "string" ? (state.values[k] as string) : undefined);
  const linkError = params.get("error") === "link" ? "linkInvalid" : undefined;

  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-breeze-100 animate-fade-up">
      {forBusiness && <p className="text-xs font-bold uppercase tracking-widest text-breeze-600">{t("login.bizEyebrow")}</p>}
      <h1 className="text-2xl font-extrabold">{t(forBusiness ? "login.bizTitle" : "login.title")}</h1>
      <p className="mt-1 text-sm text-ink/70">{t(forBusiness ? "login.bizSubtitle" : "login.subtitle")}</p>
      <form action={action} className="mt-5 space-y-3" noValidate>
        <input type="hidden" name="next" value={next} />
        <FormError error={state?.error ?? linkError} />
        <Field name="email" defaultValue={v("email")} type="email" label={t("fields.email")} autoComplete="email" error={state?.fields?.email} />
        <Field name="password" type="password" label={t("fields.password")} autoComplete="current-password" error={state?.fields?.password} />
        <SubmitButton>{t("login.submit")}</SubmitButton>
      </form>
      <div className="mt-5 space-y-1 border-t border-breeze-100 pt-4 text-center text-sm">
        {forBusiness ? (
          <>
            <p>
              {t("login.noBusiness")}{" "}
              <Link href="/signup/salon" className="font-bold text-lagoon">{t("login.registerSalon")}</Link>
            </p>
            <p>
              {t("login.team")}{" "}
              <Link href="/negocios/equipo" className="font-bold text-lagoon">{t("login.teamLink")}</Link>
            </p>
            <p>
              <Link href="/explore" className="font-bold text-lagoon">{t("login.toClients")}</Link>
            </p>
          </>
        ) : (
          <>
            <p>
              {t("login.noAccount")}{" "}
              <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-bold text-lagoon">
                {t("login.createAccount")}
              </Link>
            </p>
            <p>
              {t("login.isSalon")}{" "}
              <Link href="/negocios" className="font-bold text-lagoon">{t("login.businessLink")}</Link>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
