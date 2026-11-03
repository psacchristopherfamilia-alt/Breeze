/**
 * Configuración pública de Supabase (.env.local). Si falta, la app funciona en "modo prototipo"
 * con datos falsos y las pantallas de acceso avisan de que falta conectar Supabase.
 * La clave service_role NUNCA se usa aquí: solo en servidor/Edge Functions.
 */
export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export const isSupabaseConfigured = () => supabaseEnv() !== null;
