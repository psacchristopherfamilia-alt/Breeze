import { Star } from "lucide-react";

/** Estrellas de solo lectura. El texto accesible dice la nota; las estrellas dibujadas se ocultan a los lectores de pantalla. */
export function Stars({ rating, label, className = "size-4" }: { rating: number; label: string; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden="true" className={`${className} ${n <= Math.round(rating) ? "fill-amber-400 text-amber-500" : "fill-transparent text-ink/30"}`} />
      ))}
    </span>
  );
}
