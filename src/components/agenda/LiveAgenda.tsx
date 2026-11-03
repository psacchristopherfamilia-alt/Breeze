"use client";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { cancelGroup, markAppointment, staffCreate } from "@/app/dashboard/actions";
import { useNow } from "@/lib/mock/store";
import { AgendaView, type AgendaAppt, type AgendaPro, type AgendaService } from "./AgendaView";

/** Agenda con datos reales: cada acción llama a una RPC y refresca la página. */
export function LiveAgenda(props: {
  salon: { id: string; name: string; slug: string; slotStepMin: number };
  pros: AgendaPro[];
  services: AgendaService[];
  appointments: AgendaAppt[];
  blocked: { professionalId: string; start: string; end: string }[];
  dateKey: string;
  onlyProfessionalId: string | null;
}) {
  const router = useRouter();
  const now = useNow();
  const blocked = useMemo(() => props.blocked.map((b) => ({ ...b, start: new Date(b.start), end: new Date(b.end) })), [props.blocked]);
  const after = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const r = await p;
    if (r.ok) router.refresh();
    return r.ok ? ({ ok: true } as const) : ({ ok: false, error: r.error ?? "generic" } as const);
  };

  return (
    <AgendaView
      salon={props.salon}
      pros={props.pros}
      services={props.services}
      appointments={props.appointments}
      blocked={blocked}
      dateKey={props.dateKey}
      now={now}
      onlyProfessionalId={props.onlyProfessionalId}
      onDateChange={(d) => router.push(`/dashboard?date=${d}`)}
      actions={{
        create: (input) => after(staffCreate(props.salon.id, input)),
        mark: (id, status) => after(markAppointment(id, status)),
        cancel: (groupId) => after(cancelGroup(groupId)),
      }}
    />
  );
}
