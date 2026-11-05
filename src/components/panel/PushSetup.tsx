"use client";
import { BellRing, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/dashboard/actions";

type Status = "loading" | "off" | "unsupported" | "needsInstall" | "denied" | "ready" | "on";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

/** Activa o desactiva los avisos de reservas en ESTE teléfono (cada persona, en cada dispositivo). */
export function PushSetup() {
  const t = useTranslations("alerts.push");
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!VAPID) return setStatus("off");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setStatus(isIos() && !isStandalone() ? "needsInstall" : "unsupported");
      }
      if (Notification.permission === "denied") return setStatus("denied");
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        setStatus(sub && Notification.permission === "granted" ? "on" : "ready");
      } catch {
        setStatus("ready");
      }
    })();
  }, []);

  const enable = () =>
    start(async () => {
      setError(null);
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return setStatus(perm === "denied" ? "denied" : "ready");
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
        const json = sub.toJSON();
        const r = await savePushSubscription({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "", userAgent: navigator.userAgent });
        if (!r.ok) return setError("generic");
        setStatus("on");
      } catch {
        setError("generic");
      }
    });

  const disable = () =>
    start(async () => {
      setError(null);
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await removePushSubscription(sub.endpoint);
          await sub.unsubscribe();
        }
        setStatus("ready");
      } catch {
        setError("generic");
      }
    });

  if (status === "loading" || status === "off") return null;
  return (
    <section aria-labelledby="push-title" className="border-t border-breeze-100 px-4 py-3 text-sm">
      <h3 id="push-title" className="flex items-center gap-2 font-bold"><Smartphone className="size-4 text-lagoon" /> {t("title")}</h3>
      {status === "on" && (
        <>
          <p className="mt-1 text-ink/70">{t("on")}</p>
          <button onClick={disable} disabled={pending} className="mt-2 text-xs font-bold text-lagoon hover:underline disabled:opacity-50">{t("disable")}</button>
        </>
      )}
      {status === "ready" && (
        <>
          <p className="mt-1 text-ink/70">{t("hint")}</p>
          <button onClick={enable} disabled={pending} className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-lagoon px-4 py-2 text-sm font-bold text-white hover:bg-breeze-800 disabled:opacity-50"><BellRing className="size-4" /> {t("enable")}</button>
        </>
      )}
      {status === "needsInstall" && <p className="mt-1 text-ink/70">{t("needsInstall")}</p>}
      {status === "denied" && <p className="mt-1 text-ink/70">{t("denied")}</p>}
      {status === "unsupported" && <p className="mt-1 text-ink/70">{t("unsupported")}</p>}
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{t("error")}</p>}
    </section>
  );
}
