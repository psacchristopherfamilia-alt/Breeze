"use client";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";

export function Field({
  name,
  label,
  type = "text",
  error,
  autoComplete,
  placeholder,
  hint,
  required = true,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  error?: string;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  const t = useTranslations("auth.errors");
  const id = `f-${name}`;
  return (
    <label htmlFor={id} className="block">
      <span className="text-xs font-bold text-ink/60">{label}</span>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        defaultValue={defaultValue}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        className={`mt-1 w-full rounded-xl bg-foam px-3 py-2.5 outline-none ring-1 focus:ring-2 ${
          error ? "ring-red-300 focus:ring-red-400" : "ring-breeze-100 focus:ring-breeze-400"
        }`}
      />
      {error ? (
        <span id={`${id}-err`} className="mt-1 block text-xs font-semibold text-red-600">{t(error)}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink/40">{hint}</span>
      ) : null}
    </label>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-lagoon px-5 py-3 font-bold text-white shadow transition hover:bg-breeze-800 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function FormError({ error }: { error?: string }) {
  const t = useTranslations("auth.errors");
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
      {t(error)}
    </p>
  );
}

export function NotConfiguredBanner() {
  const t = useTranslations("auth");
  return (
    <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800 ring-1 ring-amber-100">{t("notConfiguredBanner")}</p>
  );
}
