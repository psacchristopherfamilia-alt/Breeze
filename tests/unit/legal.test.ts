import { describe, expect, it } from "vitest";
import { LEGAL, LEGAL_PATH, type LegalDocId } from "@/lib/legal/config";
import { LEGAL_DOCS, fill } from "@/lib/legal/content";

const ids = Object.keys(LEGAL_PATH) as LegalDocId[];
const vars = { company: "Acme Ltd", email: "hola@acme.tc", law: "TCI" };

describe("textos legales", () => {
  it("cada documento existe en inglés y español con las mismas secciones, en el mismo orden", () => {
    for (const id of ids) {
      const { en, es } = LEGAL_DOCS[id];
      expect(es.sections.map((s) => s.id), id).toEqual(en.sections.map((s) => s.id));
      expect(es.sections.map((s) => s.body.length), id).toEqual(en.sections.map((s) => s.body.length));
    }
  });

  it("no hay secciones ni párrafos vacíos, ni ids repetidos", () => {
    for (const id of ids) for (const l of ["en", "es"] as const) {
      const d = LEGAL_DOCS[id][l];
      expect(d.title && d.intro, `${id} ${l}`).toBeTruthy();
      expect(new Set(d.sections.map((s) => s.id)).size).toBe(d.sections.length);
      for (const s of d.sections) {
        expect(s.heading.trim(), `${id}.${s.id}`).not.toBe("");
        for (const p of s.body) expect(p.trim().length, `${id}.${s.id}`).toBeGreaterThan(20);
      }
    }
  });

  it("al rellenar los datos no queda ninguna {variable} sin sustituir", () => {
    for (const id of ids) for (const l of ["en", "es"] as const) {
      const d = LEGAL_DOCS[id][l];
      const all = [d.intro, ...d.sections.flatMap((s) => s.body)].map((t) => fill(t, vars)).join("\n");
      expect(all, `${id} ${l}`).not.toMatch(/\{(company|email|law)\}/);
      expect(all).not.toMatch(/\{[a-z]+\}/);
    }
  });

  it("la política de privacidad cubre lo que Breeze hace de verdad (Live sin teléfono, proveedores, derechos)", () => {
    const text = (l: "en" | "es") => LEGAL_DOCS.privacy[l].sections.flatMap((s) => s.body).join(" ");
    for (const l of ["en", "es"] as const) {
      for (const proveedor of ["Supabase", "Vercel", "Twilio", "Resend", "Turnstile"]) expect(text(l)).toContain(proveedor);
      expect(text(l)).toMatch(/Breeze Live/);
    }
  });

  it("antes de marcarlos como revisados, no pueden quedar datos [entre corchetes]", () => {
    if (!LEGAL.reviewed) return; // mientras sea borrador, los marcadores son lo esperado
    for (const v of [LEGAL.company, LEGAL.contactEmail, LEGAL.governingLaw]) expect(v).not.toMatch(/[[\]]/);
  });

  it("el borrador lleva versión y fecha", () => {
    expect(LEGAL.version).toBeTruthy();
    expect(LEGAL.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
