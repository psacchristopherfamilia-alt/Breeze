"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
    __turnstileLoading?: Promise<void>;
  }
}

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  window.__turnstileLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      window.__turnstileLoading = undefined;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return window.__turnstileLoading;
}

/**
 * Casilla "no soy un robot" de Cloudflare. `onToken(null)` cuando caduca o falla.
 * Cambia `resetKey` para pedir un token nuevo (cada token sirve una sola vez).
 */
export function Turnstile({ siteKey, onToken, resetKey = 0, lang }: { siteKey: string; onToken: (t: string | null) => void; resetKey?: number; lang: "en" | "es" }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    let widget: string | undefined;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widget = window.turnstile.render(box.current, {
          sitekey: siteKey,
          language: lang,
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      cancelled = true;
      if (widget && window.turnstile) window.turnstile.remove(widget);
      cb.current(null);
    };
  }, [siteKey, resetKey, lang]);

  return <div ref={box} className="min-h-[65px]" />;
}
