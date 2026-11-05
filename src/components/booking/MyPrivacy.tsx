"use client";
import { Download, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteAccount } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/client";

/** Derechos de datos del cliente con cuenta: descargar lo que Breeze guarda de él y borrar la cuenta. */
export function MyPrivacy() {
  const t = useTranslations();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const download = () =>
    start(async () => {
      setError(null);
      const { data, error: e } = await createClient().rpc("export_my_data");
      if (e || !data) return setError("generic");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "breeze-my-data.json";
      a.click();
      URL.revokeObjectURL(url);
    });

  const remove = () =>
    start(async () => {
      setError(null);
      const r = await deleteAccount();
      if (r?.error) setError(r.error);
    });

  return (
    <section className="mt-10 rounded-3xl bg-white p-5 ring-1 ring-breeze-100">
      <h2 className="font-bold">{t("me.privacyTitle")}</h2>
      <p className="mt-1 text-sm text-ink/70">{t("me.privacyHint")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={download} disabled={pending} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold ring-1 ring-breeze-200 hover:bg-breeze-50 disabled:opacity-50">
          <Download className="size-4" /> {t("me.downloadData")}
        </button>
        {!confirming && (
          <button onClick={() => setConfirming(true)} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-red-600 ring-1 ring-red-200 hover:bg-red-50">
            <Trash2 className="size-4" /> {t("me.deleteAccount")}
          </button>
        )}
      </div>
      {confirming && (
        <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm ring-1 ring-red-200">
          <p className="font-semibold text-red-800">{t("me.deleteWarning")}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={remove} disabled={pending} className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white disabled:opacity-50">
              {t("me.deleteConfirm")}
            </button>
            <button onClick={() => setConfirming(false)} disabled={pending} className="rounded-xl bg-white px-4 py-2 font-bold ring-1 ring-breeze-200">
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm font-semibold text-red-600">{t(`auth.errors.${error}`)}</p>}
    </section>
  );
}
