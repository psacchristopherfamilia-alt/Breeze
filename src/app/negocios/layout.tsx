import type { Metadata } from "next";

export const metadata: Metadata = { title: { absolute: "Breeze Negocios" } };

export default function NegociosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
