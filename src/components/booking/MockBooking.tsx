"use client";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ClientHeader } from "@/components/ui/ClientHeader";
import { planSequence } from "@/lib/availability";
import { mockBookingData } from "@/lib/booking/mock";
import type { ConfirmRequest, ConfirmResult } from "@/lib/booking/types";
import type { Appointment } from "@/lib/mock/data";
import { addBookings, setStatus, useAppointments } from "@/lib/mock/store";
import { BookingFlow } from "./BookingFlow";

const DEMO = { name: "Juan Pérez", email: "juan@example.com", phone: "+1 649 231 4455" };

/** Modo prototipo: datos falsos en el navegador (localStorage + BroadcastChannel). */
export function MockBooking({ slug, rescheduleGroup }: { slug: string; rescheduleGroup?: string }) {
  const t = useTranslations();
  const data = useMemo(() => mockBookingData(slug), [slug]);
  const { now, appointments } = useAppointments();

  const oldGroup = useMemo(
    () => (rescheduleGroup ? appointments.filter((a) => a.groupId === rescheduleGroup && a.status === "booked") : []),
    [appointments, rescheduleGroup],
  );
  // Se fija la primera vez: al confirmar, la reserva original pasa a "cancelada" y no debe reiniciar el flujo.
  const [frozen, setFrozen] = useState<{ serviceIds: string[]; professionalId: string } | null>(null);
  if (!frozen && oldGroup.length) setFrozen({ serviceIds: oldGroup.map((a) => a.serviceId), professionalId: oldGroup[0].professionalId });

  const busy = useMemo(
    () =>
      appointments
        .filter((a) => data && a.salonId === data.salon.id && a.status !== "cancelled" && a.groupId !== rescheduleGroup)
        .map((a) => ({ professionalId: a.professionalId, start: new Date(a.startsAt), end: new Date(a.blockedUntil) })),
    [appointments, data, rescheduleGroup],
  );

  if (!data) {
    return (
      <div className="min-h-dvh">
        <ClientHeader />
        <p className="p-10 text-center">{t("booking.notFound")}</p>
      </div>
    );
  }
  if (rescheduleGroup && !frozen && appointments.length === 0) return null; // esperando datos

  async function onConfirm(req: ConfirmRequest, proId: string): Promise<ConfirmResult> {
    const salon = data!.salon;
    const svcs = req.items.map((i) => data!.services.find((s) => s.id === i.serviceId)!);
    const plan = planSequence(new Date(req.startsAt), svcs);
    const groupId = `g-${Date.now()}`;
    const g = req.guest ?? { firstName: oldGroup[0]?.customerFirst ?? "Juan", lastName: oldGroup[0]?.customerLast ?? "Pérez", phone: oldGroup[0]?.customerPhone ?? DEMO.phone };
    const apps: Appointment[] = svcs.map((v, i) => ({
      id: `${groupId}-${i}`,
      groupId,
      salonId: salon.id,
      professionalId: proId,
      serviceId: v.id,
      customerFirst: g.firstName.trim(),
      customerLast: g.lastName.trim(),
      customerPhone: g.phone.trim(),
      startsAt: plan[i].start.toISOString(),
      endsAt: plan[i].end.toISOString(),
      blockedUntil: plan[i].blockedUntil.toISOString(),
      status: "booked",
      source: "online",
      createdAt: new Date().toISOString(),
      mine: true,
    }));
    const current = appointments.filter((a) => a.groupId !== rescheduleGroup);
    if (addBookings(apps, current) === "conflict") return { ok: false, error: "slot_taken" };
    if (oldGroup.length) setStatus(oldGroup.map((a) => a.id), "cancelled");
    return { ok: true, bookingGroupId: groupId };
  }

  return (
    <BookingFlow
      key={frozen ? `r-${rescheduleGroup}` : "new"}
      data={data}
      busy={busy}
      now={now}
      account={null}
      demoAccount={DEMO}
      reschedule={frozen}
      onConfirm={onConfirm}
      manageHref={() => "/me"}
    />
  );
}
