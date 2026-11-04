"use client";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { forgetDeviceTokens, useDeviceTokens } from "@/lib/booking/device";
import { createClient } from "@/lib/supabase/client";

/**
 * Con sesión iniciada: las citas que este navegador hizo como invitado pasan a la cuenta
 * ("Mis citas" las muestra en cualquier dispositivo). Se hace una sola vez por token.
 */
export function ClaimDeviceBookings() {
  const t = useTranslations("me");
  const router = useRouter();
  const tokens = useDeviceTokens();
  const tried = useRef(new Set<string>());
  const [added, setAdded] = useState(0);

  useEffect(() => {
    const pending = (tokens ?? []).filter((tk) => !tried.current.has(tk));
    if (pending.length === 0) return;
    pending.forEach((tk) => tried.current.add(tk));
    (async () => {
      const { data, error } = await createClient().rpc("claim_guest_bookings", { p_tokens: pending });
      if (error || !data) return; // sin conexión o sin sesión válida: se reintenta en la próxima visita
      // Los que fallaron se quedan en el dispositivo (siguen visibles con su enlace); el resto ya no hacen falta.
      forgetDeviceTokens(pending.filter((_, i) => data[i] !== "failed"));
      const claimed = data.filter((s) => s === "claimed").length;
      if (claimed > 0) {
        setAdded((n) => n + claimed);
        router.refresh();
      }
    })();
  }, [tokens, router]);

  if (added === 0) return null;
  return (
    <p role="status" className="mt-4 flex items-center gap-2 rounded-2xl bg-breeze-50 px-4 py-3 text-sm font-semibold text-lagoon ring-1 ring-breeze-100">
      <CheckCircle2 className="size-5 shrink-0" /> {t("claimed", { count: added })}
    </p>
  );
}
