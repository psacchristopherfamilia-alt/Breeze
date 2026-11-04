"use client";
import { useMemo } from "react";
import { confirmBooking, rescheduleBooking } from "@/app/booking-actions";
import { saveDeviceToken } from "@/lib/booking/device";
import type { BookingData } from "@/lib/booking/types";
import { useNow } from "@/lib/mock/store";
import { BookingFlow, type Account } from "./BookingFlow";

export interface SerializedBusy {
  professionalId: string;
  start: string;
  end: string;
}

/** Datos reales (Supabase): catálogo y agenda vienen del servidor; confirmar llama a las RPC. */
export function LiveBooking({
  data,
  busy,
  account,
  reschedule,
}: {
  data: BookingData;
  busy: SerializedBusy[];
  account: Account | null;
  reschedule: { serviceIds: string[]; professionalId: string; groupId?: string; token?: string } | null;
}) {
  const now = useNow();
  const ranges = useMemo(() => busy.map((b) => ({ professionalId: b.professionalId, start: new Date(b.start), end: new Date(b.end) })), [busy]);
  const next = encodeURIComponent(`/s/${data.salon.slug}`);

  return (
    <BookingFlow
      data={data}
      busy={ranges}
      now={now}
      account={account}
      loginHref={`/login?next=${next}`}
      reschedule={reschedule}
      onConfirm={async (req) => {
        const r = reschedule
          ? await rescheduleBooking({ groupId: reschedule.groupId, token: reschedule.token }, req.startsAt)
          : await confirmBooking(data.salon.id, req);
        // Reserva de invitado: este navegador recuerda su enlace privado para mostrar "Mis citas".
        if (r.ok && r.guestToken) saveDeviceToken(r.guestToken);
        return r;
      }}
      accountPrompt={{ href: "/signup?next=/me" }}
      manageHref={(r) => (r.guestToken ? `/b/${r.guestToken}` : "/me")}
    />
  );
}
