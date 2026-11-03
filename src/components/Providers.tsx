"use client";
import { NextIntlClientProvider } from "next-intl";
import { createContext, useContext, useEffect, useState } from "react";
import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";
import { TZ, type AppLocale } from "@/lib/time";

const LocaleCtx = createContext<{ locale: AppLocale; setLocale: (l: AppLocale) => void }>({
  locale: "en",
  setLocale: () => {},
});

/**
 * Idioma: preferencia guardada → idioma del teléfono/navegador → inglés.
 * (Prototipo en cliente; en la Fase 4 se resuelve en el servidor con cookie + Accept-Language.)
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>("en");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("breeze-locale");
    } catch {}
    const l: AppLocale =
      saved === "en" || saved === "es" ? saved : navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
    setLocaleState(l);
    document.documentElement.lang = l;
  }, []);

  const setLocale = (l: AppLocale) => {
    setLocaleState(l);
    document.documentElement.lang = l;
    try {
      localStorage.setItem("breeze-locale", l);
    } catch {}
  };

  return (
    <LocaleCtx.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en} timeZone={TZ}>
        {children}
      </NextIntlClientProvider>
    </LocaleCtx.Provider>
  );
}

export const useAppLocale = () => useContext(LocaleCtx);
