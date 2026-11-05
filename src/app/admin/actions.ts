"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { atLocal } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";

/** Administración de la plataforma: cada acción llama a una RPC `platform_*` (la BD comprueba que seas administrador). */
export type AdminResult = { ok: true } | { ok: false; error: string };

const uuid = z.string().uuid();
const KNOWN = [
  "forbidden", "not_found", "invoice_already_open", "invalid_plan", "invalid_amount", "invoice_not_open",
  "amount_too_low", "invalid_date", "invalid_days", "invalid_status", "too_long", "invalid_action",
];
const fail = (e: { code?: string; message?: string }): AdminResult => ({
  ok: false,
  error: e.code === "42501" ? "forbidden" : KNOWN.includes(e.message ?? "") ? (e.message as string) : "generic",
});
const done = (): AdminResult => {
  revalidatePath("/admin");
  return { ok: true };
};

/** "59" o "59.50" → centavos. Vacío → undefined (usa el importe del plan). Inválido → null. */
function cents(v: string): number | undefined | null {
  const t = v.trim().replace(",", ".");
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n * 100) : null;
}

export async function createInvoice(
  orgId: string,
  i: { cycle: "monthly" | "annual"; extraBranches: number; planCode: string; amount: string; note: string },
): Promise<AdminResult> {
  const amount = cents(i.amount);
  if (amount === null) return { ok: false, error: "invalid_amount" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_create_invoice", {
    p_org: uuid.parse(orgId),
    p_cycle: i.cycle,
    p_extra_branches: Math.max(0, Math.min(50, Math.floor(i.extraBranches) || 0)),
    p_plan_code: i.planCode,
    p_amount_cents: amount,
    p_note: i.note.trim().slice(0, 300) || undefined,
  });
  return error ? fail(error) : done();
}

export async function registerPayment(
  invoiceId: string,
  p: { method: "bank_transfer" | "cash" | "other"; reference: string; receivedOn: string; amount: string },
): Promise<AdminResult> {
  const amount = cents(p.amount);
  if (amount === null) return { ok: false, error: "invalid_amount" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_register_payment", {
    p_invoice: uuid.parse(invoiceId),
    p_method: p.method,
    p_reference: p.reference.trim().slice(0, 120) || undefined,
    p_received_at: /^\d{4}-\d{2}-\d{2}$/.test(p.receivedOn) ? atLocal(p.receivedOn, "12:00").toISOString() : undefined,
    p_amount_cents: amount,
  });
  return error ? fail(error) : done();
}

export async function voidInvoice(invoiceId: string, reason: string): Promise<AdminResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_void_invoice", { p_invoice: uuid.parse(invoiceId), p_reason: reason.trim().slice(0, 300) || undefined });
  return error ? fail(error) : done();
}

export async function extendOrg(orgId: string, days: number, reason: string): Promise<AdminResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_extend", { p_org: uuid.parse(orgId), p_days: Math.floor(days), p_reason: reason.trim().slice(0, 300) || undefined });
  return error ? fail(error) : done();
}

export async function stopOrg(orgId: string, status: "suspended" | "cancelled", reason: string): Promise<AdminResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_set_status", { p_org: uuid.parse(orgId), p_status: status, p_reason: reason.trim().slice(0, 300) || undefined });
  return error ? fail(error) : done();
}

export async function saveSettings(s: {
  payeeName: string; bankName: string; accountNumber: string; instructionsEn: string; instructionsEs: string;
}): Promise<AdminResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_save_settings", {
    p_payee_name: s.payeeName, p_bank_name: s.bankName, p_account_number: s.accountNumber,
    p_instructions_en: s.instructionsEn, p_instructions_es: s.instructionsEs,
  });
  return error ? fail(error) : done();
}

/** Reseñas reportadas por los salones: 'hide' la oculta (no se borra) y 'keep' la deja visible. */
export async function moderateReview(reviewId: string, action: "hide" | "keep"): Promise<AdminResult> {
  if (action !== "hide" && action !== "keep") return { ok: false, error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_moderate_review", { p_review_id: uuid.parse(reviewId), p_action: action });
  return error ? fail(error) : done();
}
