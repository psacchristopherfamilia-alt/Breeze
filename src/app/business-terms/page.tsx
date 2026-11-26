import { canonical } from "@/lib/seo";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Business Terms", alternates: canonical("/business-terms") };

export default function Page() {
  return <LegalPage doc="business-terms" />;
}
