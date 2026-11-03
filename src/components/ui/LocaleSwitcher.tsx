"use client";
import { useAppLocale } from "../Providers";

export function LocaleSwitcher({ invert = false }: { invert?: boolean }) {
  const { locale, setLocale } = useAppLocale();
  return (
    <div
      role="group"
      aria-label="Language / Idioma"
      className={`inline-flex rounded-full p-0.5 text-xs font-bold ${invert ? "bg-white/15" : "bg-breeze-50 ring-1 ring-breeze-100"}`}
    >
      {(["en", "es"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`rounded-full px-2.5 py-1 uppercase transition ${
            locale === l
              ? invert
                ? "bg-white text-lagoon"
                : "bg-white text-lagoon shadow-sm"
              : invert
                ? "text-white/80 hover:text-white"
                : "text-ink/50 hover:text-ink"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
