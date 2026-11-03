"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/** Cliente de Supabase en el navegador (clave pública anon; la RLS protege los datos). */
export function createClient() {
  return createBrowserClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
