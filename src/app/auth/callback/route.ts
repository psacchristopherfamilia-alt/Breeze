import { NextResponse, type NextRequest } from "next/server";
import { finishPendingSalon, homeFor, safeNext } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

/** Enlace de confirmación de correo (y magic links): crea la sesión y termina el alta del salón si quedó pendiente. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/login?error=link`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=link`);

  await finishPendingSalon(supabase, data.user);
  const next = safeNext(searchParams.get("next")) ?? (await homeFor(supabase));
  return NextResponse.redirect(`${origin}${next}`);
}
