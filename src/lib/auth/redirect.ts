/** Solo rutas internas: evita redirecciones abiertas a otros dominios (//evil.com, /\evil.com, https://…). */
export function safeNext(next: FormDataEntryValue | string | null | undefined): string | null {
  const v = typeof next === "string" ? next.trim() : null;
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : null;
}
