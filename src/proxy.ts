import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

/** Rutas que exigen sesión (cuando Supabase está configurado). */
// /me es pública: sin cuenta muestra las citas de invitado de este navegador.
const PROTECTED = ["/dashboard", "/admin", "/pro", "/onboarding"];

export async function proxy(request: NextRequest) {
  const { response, user, configured } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  // Sin Supabase configurado: modo prototipo (datos falsos), no se exige sesión.
  if (!configured) return response;

  if (!user && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // El panel es de la puerta de negocios: su entrada lleva el aviso de negocio, no el de cliente.
    const forBusiness = ["/dashboard", "/admin"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
    url.search = `?${forBusiness ? "for=negocios&" : ""}next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Todo excepto estáticos e imágenes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
