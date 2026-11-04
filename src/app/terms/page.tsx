import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Terms of Use" };

export default function Page() {
  return <LegalPage doc="terms" />;
}
