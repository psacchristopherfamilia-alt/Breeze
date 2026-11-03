import { colorOf } from "@/lib/colors";
import type { Professional } from "@/lib/mock/data";
import { initials, shortName } from "@/lib/privacy";

const SIZES = {
  xs: "size-5 text-[9px]",
  sm: "size-7 text-[11px]",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
};

/**
 * Identidad visual de un profesional. Regla de Breeze: el color NUNCA va solo,
 * siempre lleva las iniciales dentro (y el nombre al lado cuando hay espacio).
 */
export function ProBadge({
  pro,
  size = "md",
  showName = false,
  className = "",
}: {
  pro: Pick<Professional, "firstName" | "lastName" | "color">;
  size?: keyof typeof SIZES;
  showName?: boolean;
  className?: string;
}) {
  const c = colorOf(pro.color);
  const name = shortName(pro.firstName, pro.lastName);
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className={`grid shrink-0 place-items-center rounded-full font-extrabold text-white ring-2 ring-white ${SIZES[size]}`}
        style={{ backgroundColor: c.hex }}
        title={showName ? undefined : name}
        aria-label={showName ? undefined : name}
      >
        {initials(pro.firstName, pro.lastName)}
      </span>
      {showName && <span className="font-semibold">{name}</span>}
    </span>
  );
}
