"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { NegociosShell } from "@/components/negocios/Shell";

/** El token de invitación son 64 caracteres hexadecimales; se acepta el enlace completo o solo el código. */
const TOKEN = /[0-9a-f]{64}/i;

/** Equipo (profesionales y administradores invitados): entra con el enlace de invitación. */
export default function EquipoPage() {
  const t = useTranslations("negocios.teamPage");
  const router = useRouter();
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const m = value.match(TOKEN);
    if (!m) return setBad(true);
    router.push(`/invite/${m[0].toLowerCase()}`);
  };

  return (
    <NegociosShell>
      <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-balance">{t("title")}</h1>
      <p className="mt-3 text-white/70">{t("body")}</p>

      <form onSubmit={go} className="mt-6 rounded-2xl bg-marine-2 p-4 ring-1 ring-white/15" noValidate>
        <label htmlFor="invite-link" className="text-sm font-bold">{t("label")}</label>
        <input
          id="invite-link"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setBad(false);
          }}
          placeholder={t("placeholder")}
          autoComplete="off"
          aria-invalid={bad}
          aria-describedby={bad ? "invite-err" : undefined}
          className="mt-2 w-full rounded-xl bg-white px-3 py-2.5 text-ink outline-none ring-2 ring-transparent focus:ring-glow"
        />
        {bad && <p id="invite-err" role="alert" className="mt-2 text-sm font-semibold text-red-300">{t("invalid")}</p>}
        <button className="mt-3 w-full rounded-xl bg-glow px-4 py-3 font-bold text-marine hover:brightness-105">{t("go")}</button>
      </form>

      <p className="mt-6 text-sm text-white/70">
        {t("haveAccount")}{" "}
        <Link href="/login?for=negocios&next=/dashboard" className="font-bold text-glow underline-offset-2 hover:underline">{t("signIn")}</Link>
      </p>
      <p className="mt-2 text-sm">
        <Link href="/negocios" className="font-bold text-glow underline-offset-2 hover:underline">← {t("back")}</Link>
      </p>
    </NegociosShell>
  );
}
