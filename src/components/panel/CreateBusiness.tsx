"use client";
import { Loader2, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { createBusiness } from "@/app/dashboard/actions";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/ui/Logo";
import { TypeIcon } from "@/components/ui/TypeIcon";
import { ZONES } from "@/lib/validation/auth";

/** Usuario con sesión que aún no pertenece a ningún salón (p. ej. un cliente que quiere registrar su negocio). */
export function CreateBusiness() {
  const t = useTranslations();
  const [form, setForm] = useState({ orgName: "", salonName: "", zone: "", businessTypes: [] as ("barbershop" | "salon" | "spa")[] });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <main className="bg-breeze-sky min-h-dvh">
      <div className="mx-auto max-w-md px-4 py-10">
        <Logo />
        <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-breeze-100">
          <Store className="size-10 text-breeze-500" />
          <h1 className="mt-3 text-2xl font-extrabold">{t("panel.empty.title")}</h1>
          <p className="mt-1 text-sm text-ink/60">{t("panel.empty.body")}</p>
          <div className="mt-5 space-y-3">
            {(["orgName", "salonName"] as const).map((k) => (
              <label key={k} className="block">
                <span className="text-xs font-bold text-ink/60">{t(`auth.fields.${k}`)}</span>
                <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="mt-1 w-full rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100 outline-none focus:ring-2 focus:ring-breeze-400" />
              </label>
            ))}
            <div className="grid grid-cols-3 gap-2">
              {(["barbershop", "salon", "spa"] as const).map((ty) => {
                const on = form.businessTypes.includes(ty);
                return (
                  <button key={ty} type="button" aria-pressed={on}
                    onClick={() => setForm({ ...form, businessTypes: on ? form.businessTypes.filter((x) => x !== ty) : [...form.businessTypes, ty] })}
                    className={`flex flex-col items-center gap-1 rounded-xl p-3 text-xs font-bold ring-1 ${on ? "bg-breeze-50 ring-2 ring-breeze-500" : "bg-foam ring-breeze-100"}`}>
                    <TypeIcon type={ty} className="size-5 text-lagoon" /> {t(`types.${ty}`)}
                  </button>
                );
              })}
            </div>
            <select value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} aria-label={t("auth.fields.zone")} className="w-full rounded-xl bg-foam px-3 py-2.5 ring-1 ring-breeze-100">
              <option value="" disabled>{t("auth.fields.zonePlaceholder")}</option>
              {ZONES.map((z) => <option key={z} value={z}>{t(`zones.${z}`)}</option>)}
            </select>
            {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{t(`panel.errors.${error}`)}</p>}
            <button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await createBusiness(form as Parameters<typeof createBusiness>[0]);
                  if (!r.ok) setError(r.error);
                })
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-lagoon py-3 font-bold text-white disabled:opacity-50"
            >
              {pending && <Loader2 className="size-4 animate-spin" />} {t("auth.salon.submit")}
            </button>
          </div>
        </section>
        <form action={signOut} className="mt-4 text-center">
          <button className="text-sm font-semibold text-ink/50 underline">{t("panel.signOut")}</button>
        </form>
      </div>
    </main>
  );
}
