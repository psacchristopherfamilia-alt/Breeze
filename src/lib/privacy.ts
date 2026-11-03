/**
 * Formato público de nombres: "Juan Pérez" → "Juan P.".
 * Es lo único que puede aparecer en pantallas públicas (Breeze Live). Nunca teléfono ni correo.
 */
export function shortName(firstName: string, lastName: string): string {
  const first = firstName.trim().split(/\s+/)[0] ?? "";
  const initial = lastName.trim().charAt(0).toUpperCase();
  return initial ? `${first} ${initial}.` : first;
}

export function initials(firstName: string, lastName: string): string {
  return (firstName.trim().charAt(0) + lastName.trim().charAt(0)).toUpperCase();
}
