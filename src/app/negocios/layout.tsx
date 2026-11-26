import type { Metadata } from "next";
import { canonical } from "@/lib/seo";

export const metadata: Metadata = { title: { absolute: "Breeze Negocios" }, alternates: canonical("/negocios") };

export default function NegociosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
