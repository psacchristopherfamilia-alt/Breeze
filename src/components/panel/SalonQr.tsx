"use client";
import { Check, Copy, Download } from "lucide-react";
import QRCode from "qrcode";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/** QR + enlace de reserva del salón, para el espejo, el mostrador o redes sociales. Se genera en el navegador. */
export function SalonQr({ slug, name }: { slug: string; name: string }) {
  const t = useTranslations();
  const [url, setUrl] = useState("");
  const [png, setPng] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const link = `${window.location.origin}/s/${slug}`;
    setUrl(link);
    // Margen blanco y corrección alta: se lee bien impreso, aunque se ensucie un poco.
    QRCode.toDataURL(link, { width: 1024, margin: 2, errorCorrectionLevel: "H", color: { dark: "#0b3b43", light: "#ffffff" } })
      .then(setPng)
      .catch(() => setPng(""));
  }, [slug]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* sin permiso del portapapeles: el enlace sigue visible para copiarlo a mano */
    }
  };

  return (
    <section className="mt-5 rounded-3xl bg-white p-5 ring-1 ring-breeze-100">
      <h2 className="font-bold">{t("settings.qrTitle")}</h2>
      <p className="mt-1 text-sm text-ink/70">{t("settings.qrHint")}</p>
      <div className="mt-4 flex flex-wrap items-center gap-5">
        <div className="grid size-40 place-items-center rounded-2xl bg-white p-2 ring-1 ring-breeze-100">
          {png ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={png} alt={t("settings.qrAlt", { name })} className="size-full" />
          ) : (
            <span className="text-xs text-ink/70">…</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="break-all rounded-xl bg-foam px-3 py-2.5 text-sm font-semibold ring-1 ring-breeze-100">{url || `/s/${slug}`}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={copy} disabled={!url} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold ring-1 ring-breeze-200 hover:bg-breeze-50 disabled:opacity-50">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {t(copied ? "settings.qrCopied" : "settings.qrCopy")}
            </button>
            {png && (
              <a href={png} download={`breeze-${slug}-qr.png`} className="inline-flex items-center gap-1.5 rounded-xl bg-lagoon px-4 py-2 text-sm font-bold text-white shadow hover:bg-breeze-800">
                <Download className="size-4" /> {t("settings.qrDownload")}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
