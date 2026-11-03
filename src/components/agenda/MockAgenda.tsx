"use client";
import { useEffect, useMemo, useState } from "react";
import { useSalon } from "@/components/agenda/DashboardShell";
import { planSequence } from "@/lib/availability";
import { colorOf } from "@/lib/colors";
import { prosOf, servicesOf, type Appointment } from "@/lib/mock/data";
import { addBookings, setStatus, useAppointments } from "@/lib/mock/store";
import { localDateKey } from "@/lib/time";
import { AgendaView, type AgendaActions } from "./AgendaView";

/** Agenda del prototipo (datos falsos en el navegador). */
export function MockAgenda() {
  const { salon } = useSalon();
  const { now, appointments } = useAppointments();
  const [dateKey, setDateKey] = useState<string | null>(null);
  useEffect(() => {
    if (now && !dateKey) setDateKey(localDateKey(now));
  }, [now, dateKey]);

  const services = useMemo(() => servicesOf(salon.id), [salon.id]);
  const pros = useMemo(
    () =>
      prosOf(salon.id).map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        colorHex: colorOf(p.color).hex,
        title: p.title,
        serviceIds: p.serviceIds,
        hours: p.hours,
      })),
    [salon.id],
  );
  const day = useMemo(
    () =>
      dateKey
        ? appointments
            .filter((a) => a.salonId === salon.id && a.status !== "cancelled" && localDateKey(new Date(a.startsAt)) === dateKey)
            .map((a) => {
              const svc = services.find((s) => s.id === a.serviceId)!;
              return {
                id: a.id,
                groupId: a.groupId,
                professionalId: a.professionalId,
                serviceNameEn: svc?.nameEn ?? "",
                serviceNameEs: svc?.nameEs ?? "",
                priceCents: svc?.priceCents ?? 0,
                startsAt: a.startsAt,
                endsAt: a.endsAt,
                blockedUntil: a.blockedUntil,
                status: a.status,
                source: a.source,
                customerName: `${a.customerFirst} ${a.customerLast}`.trim(),
                customerPhone: a.customerPhone,
              };
            })
        : [],
    [appointments, dateKey, salon.id, services],
  );

  const actions: AgendaActions = {
    async create(input) {
      const svc = services.find((s) => s.id === input.serviceId)!;
      const [plan] = planSequence(new Date(input.startsAt), [svc]);
      const id = `staff-${Date.now()}`;
      const appt: Appointment = {
        id,
        groupId: id,
        salonId: salon.id,
        professionalId: input.professionalId,
        serviceId: svc.id,
        customerFirst: input.customer.firstName,
        customerLast: input.customer.lastName,
        customerPhone: input.customer.phone,
        startsAt: plan.start.toISOString(),
        endsAt: plan.end.toISOString(),
        blockedUntil: plan.blockedUntil.toISOString(),
        status: "booked",
        source: input.source,
        createdAt: new Date().toISOString(),
      };
      return addBookings([appt], appointments) === "ok" ? { ok: true } : { ok: false, error: "slot_taken" };
    },
    async mark(id, status) {
      setStatus([id], status);
      return { ok: true };
    },
    async cancel(groupId) {
      setStatus(appointments.filter((a) => a.groupId === groupId).map((a) => a.id), "cancelled");
      return { ok: true };
    },
  };

  if (!dateKey) return <div className="m-6 h-96 animate-pulse rounded-3xl bg-white" />;
  return (
    <AgendaView
      salon={{ name: salon.name, slug: salon.slug, slotStepMin: salon.slotStepMin }}
      pros={pros}
      services={services}
      appointments={day}
      blocked={[]}
      dateKey={dateKey}
      now={now}
      onDateChange={setDateKey}
      actions={actions}
    />
  );
}
