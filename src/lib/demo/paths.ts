/**
 * Demo pública de Breeze: /demo/… usa los mismos componentes del prototipo (datos falsos en el navegador)
 * aunque Supabase esté conectado. Nada de la demo toca la base de datos.
 */
export const DEMO_PREFIX = "/demo";

/** Rutas del prototipo que existen dentro de /demo. El resto (login, reseñas, fichas…) se queda igual. */
const DEMO_ROUTES = [/^\/explore(\/|\?|$)/, /^\/s\//, /^\/me(\/|\?|$)/, /^\/dashboard(\/professionals)?(\?|$)/, /^\/live\//];

export function isDemoPath(pathname: string | null | undefined): boolean {
  return !!pathname && (pathname === DEMO_PREFIX || pathname.startsWith(`${DEMO_PREFIX}/`));
}

/** Dentro de la demo, lleva un enlace interno a su copia en /demo; fuera de la demo lo deja igual. */
export function demoHref(href: string, inDemo: boolean): string {
  if (!inDemo || !href.startsWith("/") || isDemoPath(href)) return href;
  return DEMO_ROUTES.some((r) => r.test(href)) ? `${DEMO_PREFIX}${href}` : href;
}
