"use client";
import Link from "next/link";
import { useAppLocale } from "@/components/Providers";
import { Logo } from "@/components/ui/Logo";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { DRAFT_NOTICE, LEGAL_DOCS, LEGAL_LABELS, fill } from "@/lib/legal/content";
import { LEGAL, LEGAL_PATH, type LegalDocId } from "@/lib/legal/config";

/** Documento legal (política de privacidad, términos de uso, términos para negocios) en el idioma elegido. */
export function LegalPage({ doc }: { doc: LegalDocId }) {
  const { locale } = useAppLocale();
  const d = LEGAL_DOCS[doc][locale];
  const labels = LEGAL_LABELS[locale];
  const f = (s: string) => fill(s, { company: LEGAL.company, email: LEGAL.contactEmail, law: LEGAL.governingLaw });
  return (
    <div className="min-h-dvh bg-foam/40">
      <header className="border-b border-breeze-100 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Logo href="/explore" />
          <LocaleSwitcher />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {!LEGAL.reviewed && (
          <p role="note" className="mb-6 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">{DRAFT_NOTICE[locale]}</p>
        )}
        <h1 className="text-3xl font-extrabold">{d.title}</h1>
        <p className="mt-1 text-sm text-ink/70">{labels.updated}: {LEGAL.updated}</p>
        <p className="mt-4 text-ink/80">{f(d.intro)}</p>

        <nav aria-label={labels.contents} className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-breeze-100">
          <p className="text-xs font-bold uppercase tracking-wide text-ink/70">{labels.contents}</p>
          <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {d.sections.map((s) => (
              <li key={s.id}><a href={`#${s.id}`} className="text-lagoon hover:underline">{s.heading}</a></li>
            ))}
          </ol>
        </nav>

        <div className="mt-8 space-y-8">
          {d.sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-6">
              <h2 id={`${s.id}-h`} className="text-xl font-extrabold">{s.heading}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="mt-2 leading-relaxed text-ink/80">{f(p)}</p>
              ))}
            </section>
          ))}
        </div>

        <footer className="mt-12 border-t border-breeze-100 pt-4 text-sm">
          <p className="font-bold text-ink/70">{labels.others}</p>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            {(Object.keys(LEGAL_PATH) as LegalDocId[]).filter((k) => k !== doc).map((k) => (
              <li key={k}><Link href={LEGAL_PATH[k]} className="font-bold text-lagoon hover:underline">{labels.docs[k]}</Link></li>
            ))}
          </ul>
        </footer>
      </main>
    </div>
  );
}
