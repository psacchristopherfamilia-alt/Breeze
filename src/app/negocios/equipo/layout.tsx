import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";

/** Entrada del equipo con enlace de invitación: útil, pero no para Google. */
export const metadata: Metadata = { title: { absolute: "Breeze Negocios" }, robots: NOINDEX };

export default function EquipoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
