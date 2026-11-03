import { Flower2, Scissors, Sparkles } from "lucide-react";
import type { BusinessType } from "@/lib/mock/data";

export function TypeIcon({ type, className = "size-4" }: { type: BusinessType; className?: string }) {
  if (type === "barbershop") return <Scissors className={className} />;
  if (type === "salon") return <Sparkles className={className} />;
  return <Flower2 className={className} />;
}
