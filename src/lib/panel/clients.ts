/** Utilidades de la lista y la ficha de clientes. */

export type Age = { unit: "today" | "yesterday" | "days" | "weeks" | "months" | "years"; n: number };

/** Hace cuánto fue algo, en la unidad que mejor se lee ("hoy", "ayer", "5 días", "3 semanas", "2 meses", "1 año"). */
export function relativeAge(date: Date, now: Date = new Date()): Age {
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) return { unit: "today", n: 0 };
  if (days === 1) return { unit: "yesterday", n: 1 };
  if (days < 14) return { unit: "days", n: days };
  if (days < 60) return { unit: "weeks", n: Math.floor(days / 7) };
  if (days < 365) return { unit: "months", n: Math.floor(days / 30) };
  return { unit: "years", n: Math.floor(days / 365) };
}

/** "+16492314455" → "+1 649 231 4455". Otros formatos se dejan tal cual. */
export function prettyPhone(phone: string | null | undefined): string {
  const p = phone?.trim() ?? "";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p);
  return m ? `+1 ${m[1]} ${m[2]} ${m[3]}` : p;
}

export function initialsOf(first: string, last: string): string {
  const a = first.trim().charAt(0);
  const b = last.trim().charAt(0);
  return (a + b).toUpperCase() || "?";
}
