import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { supabaseEnv } from "./env";

/**
 * Refresca la sesión de Supabase en cada petición (cookies) y devuelve el usuario.
 * Se usa desde src/proxy.ts.
 */
export async function updateSession(request: NextRequest) {
  const env = supabaseEnv();
  let response = NextResponse.next({ request });
  if (!env) return { response, user: null, configured: false as const };

  const supabase = createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getUser() valida el token con Supabase (no confiar solo en la cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { response, user, configured: true as const };
}
