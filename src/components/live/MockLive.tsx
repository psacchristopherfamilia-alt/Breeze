"use client";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAvailableSlots } from "@/lib/availability";
import { colorOf } from "@/lib/colors";
import { FAKE_CUSTOMERS, hoursFor, prosOf, salonBySlug, serviceById, type Appointment } from "@/lib/mock/data";
import { addBookings, useAppointments, useNow, type StoreEvent } from "@/lib/mock/store";
import { initials, shortName } from "@/lib/privacy";
import { addDaysKey, addMinutes, localDateKey } from "@/lib/time";
import { LiveBoardView, useLiveAlerts, type LiveItem } from "./LiveBoardView";

/** Recorte de privacidad del prototipo (en producción lo hace la BD: get_live_board + Broadcast). */
const toLiveItem = (a: Appointment): LiveItem => {
  const s = serviceById(a.serviceId);
  return {
    id: a.id,
    groupId: a.groupId,
    professionalId: a.professionalId,
    customer: shortName(a.customerFirst, a.customerLast),
    serviceNameEn: s?.nameEn ?? "",
    serviceNameEs: s?.nameEs ?? "",
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    status: a.status,
  };
};

export function MockLive({ slug }: { slug: string }) {
  const t = useTranslations("live");
  const salon = salonBySlug(slug);
  const clock = useNow(1000);
  const { alerts, push, sound, toggleSound } = useLiveAlerts();
  const [auto, setAuto] = useState(false);

  const onEvent = useCallback(
    (e: StoreEvent) => {
      if (e.type !== "booked" || !salon) return;
      const first = e.appointments.find((a) => a.salonId === salon.id);
      if (first) push(toLiveItem(first));
    },
    [salon, push],
  );
  const { appointments, ready } = useAppointments(onEvent);

  const simulate = useCallback(() => {
    if (!salon) return;
    const now = new Date();
    const pros = prosOf(salon.id);
    for (let attempt = 0; attempt < 20; attempt++) {
      const pro = pros[Math.floor(Math.random() * pros.length)];
      const svc = serviceById(pro.serviceIds[Math.floor(Math.random() * pro.serviceIds.length)])!;
      const key = addDaysKey(localDateKey(now), Math.floor(Math.random() * 6));
      const slots = getAvailableSlots({
        dateKey: key,
        workingHours: hoursFor(pro, key),
        busy: appointments
          .filter((a) => a.professionalId === pro.id && a.status !== "cancelled")
          .map((a) => ({ start: new Date(a.startsAt), end: new Date(a.blockedUntil) })),
        totalMin: svc.durationMin + svc.bufferMin,
        stepMin: 15,
        now,
        minLeadMin: salon.minLeadMin,
      });
      if (!slots.length) continue;
      const start = slots[Math.floor(Math.random() * Math.min(slots.length, 8))];
      const end = addMinutes(start, svc.durationMin);
      const [first, last] = FAKE_CUSTOMERS[Math.floor(Math.random() * FAKE_CUSTOMERS.length)];
      const id = `sim-${Date.now()}`;
      const res = addBookings(
        [{
          id, groupId: id, salonId: salon.id, professionalId: pro.id, serviceId: svc.id,
          customerFirst: first, customerLast: last, customerPhone: "+1 649 000 0000",
          startsAt: start.toISOString(), endsAt: end.toISOString(),
          blockedUntil: addMinutes(end, svc.bufferMin).toISOString(),
          status: "booked", source: "online", createdAt: now.toISOString(),
        }],
        appointments,
      );
      if (res === "ok") return;
    }
  }, [salon, appointments]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(simulate, 9000);
    return () => clearInterval(id);
  }, [auto, simulate]);

  const pros = useMemo(
    () => (salon ? prosOf(salon.id).map((p) => ({ id: p.id, publicName: shortName(p.firstName, p.lastName), initials: initials(p.firstName, p.lastName), colorHex: colorOf(p.color).hex })) : []),
    [salon],
  );
  if (!salon) return <p className="p-10 text-center">{t("notFound")}</p>;

  const today = clock ? localDateKey(clock) : null;
  const items = ready && today
    ? appointments.filter((a) => a.salonId === salon.id && a.status !== "cancelled" && localDateKey(new Date(a.startsAt)) === today).map(toLiveItem)
    : [];

  return (
    <LiveBoardView
      salonName={salon.name}
      pros={pros}
      items={items}
      clock={clock}
      alerts={alerts}
      sound={sound}
      onToggleSound={toggleSound}
      demo={{ auto, onToggleAuto: () => setAuto(!auto), onSimulate: simulate }}
    />
  );
}
