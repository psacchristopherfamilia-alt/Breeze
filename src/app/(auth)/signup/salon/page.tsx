"use client";
import { MapPin, Store, UserRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useAppLocale } from "@/components/Providers";
import { Field, FormError, SubmitButton } from "@/components/auth/ui";
import { LegalConsent } from "@/components/legal/LegalConsent";
import { TypeIcon } from "@/components/ui/TypeIcon";
import { ZONES } from "@/lib/validation/auth";
import { signUpSalon } from "../../actions";

const TYPES = ["barbershop", "salon", "spa"] as const;

export default function SalonSignUpPage() {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const [state, action] = useActionState(signUpSalon, undefined);
  const v = (k: string) => (typeof state?.values?.[k] === "string" ? (state.values[k] as string) : undefined);
  const picked = (state?.values?.businessTypes as string[] | undefined) ?? [];
  const f = state?.fields ?? {};

  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-breeze-100 animate-fade-up">
      <Link href="/negocios" className="text-xs font-bold text-lagoon hover:underline">← {t("auth.salon.eyebrow")}</Link>
      <h1 className="mt-1 text-2xl font-extrabold">{t("auth.salon.title")}</h1>
      <p className="mt-1 text-sm text-ink/60">{t("auth.salon.subtitle")}</p>

      <form action={action} className="mt-5 space-y-5" noValidate>
        <input type="hidden" name="locale" value={locale} />
        <FormError error={state?.error} />

        <fieldset className="space-y-3">
          <legend className="mb-2 flex items-center gap-1.5 text-sm font-bold"><UserRound className="size-4 text-lagoon" /> {t("auth.salon.you")}</legend>
          <Field name="fullName" defaultValue={v("fullName")} label={t("auth.fields.fullName")} autoComplete="name" error={f.fullName} />
          <Field name="email" defaultValue={v("email")} type="email" label={t("auth.fields.email")} autoComplete="email" error={f.email} />
          <Field name="phone" defaultValue={v("phone")} type="tel" label={t("auth.fields.phone")} autoComplete="tel" placeholder="+1 649 …" error={f.phone} />
          <Field name="password" type="password" label={t("auth.fields.password")} autoComplete="new-password" hint={t("auth.fields.passwordHint")} error={f.password} />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 flex items-center gap-1.5 text-sm font-bold"><Store className="size-4 text-lagoon" /> {t("auth.salon.business")}</legend>
          <Field name="orgName" defaultValue={v("orgName")} label={t("auth.fields.orgName")} hint={t("auth.fields.orgNameHint")} error={f.orgName} />
          <Field name="salonName" defaultValue={v("salonName")} label={t("auth.fields.salonName")} hint={t("auth.fields.salonNameHint")} error={f.salonName} />
          <div>
            <span className="text-xs font-bold text-ink/60">{t("auth.fields.businessTypes")}</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {TYPES.map((ty) => (
                <label key={ty} className="flex cursor-pointer flex-col items-center gap-1 rounded-xl bg-foam p-3 text-center text-xs font-bold ring-1 ring-breeze-100 has-[:checked]:bg-breeze-50 has-[:checked]:ring-2 has-[:checked]:ring-breeze-500">
                  <input type="checkbox" name="businessTypes" value={ty} defaultChecked={picked.includes(ty)} className="sr-only" />
                  <TypeIcon type={ty} className="size-5 text-lagoon" />
                  {t(`types.${ty}`)}
                </label>
              ))}
            </div>
            {f.businessTypes && <span className="mt-1 block text-xs font-semibold text-red-600">{t(`auth.errors.${f.businessTypes}`)}</span>}
          </div>
          <label className="block">
            <span className="flex items-center gap-1 text-xs font-bold text-ink/60"><MapPin className="size-3.5" /> {t("auth.fields.zone")}</span>
            <select key={v("zone") ?? ""} name="zone" defaultValue={v("zone") ?? ""} className="mt-1 w-full rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100 outline-none focus:ring-2 focus:ring-breeze-400">
              <option value="" disabled>{t("auth.fields.zonePlaceholder")}</option>
              {ZONES.map((z) => (
                <option key={z} value={z}>{t(`zones.${z}`)}</option>
              ))}
            </select>
            {f.zone && <span className="mt-1 block text-xs font-semibold text-red-600">{t(`auth.errors.${f.zone}`)}</span>}
          </label>
          <Field name="salonPhone" defaultValue={v("salonPhone")} type="tel" label={t("auth.fields.salonPhone")} required={false} error={f.salonPhone} />
          <Field name="address" defaultValue={v("address")} label={t("auth.fields.address")} required={false} error={f.address} />
        </fieldset>

        <div className="rounded-2xl bg-sand p-4 text-xs text-ink/70">
          <p className="font-bold text-ink">{t("auth.salon.trialTitle")}</p>
          <p className="mt-1">{t("auth.salon.trialBody")}</p>
        </div>
        <div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="acceptTerms" defaultChecked={v("acceptTerms") === "on"} aria-invalid={!!f.acceptTerms} aria-describedby={f.acceptTerms ? "terms-err" : undefined} className="mt-0.5 size-4 shrink-0 accent-[#0e7c86]" />
            <LegalConsent kind="business" />
          </label>
          {f.acceptTerms && <span id="terms-err" role="alert" className="mt-1 block text-xs font-semibold text-red-600">{t(`auth.errors.${f.acceptTerms}`)}</span>}
        </div>
        <SubmitButton>{t("auth.salon.submit")}</SubmitButton>
      </form>
      <p className="mt-5 border-t border-breeze-100 pt-4 text-center text-sm">
        {t("auth.signup.haveAccount")} <Link href="/login" className="font-bold text-lagoon">{t("auth.signup.login")}</Link>
      </p>
    </section>
  );
}
