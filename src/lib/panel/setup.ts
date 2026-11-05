export interface SetupStatus {
  hasService: boolean;
  hasProfessional: boolean;
  hasAssignment: boolean;
  hasHours: boolean;
  isPublished: boolean;
}

export interface SetupInput {
  isPublished: boolean;
  activeServiceIds: string[];
  activeProfessionalIds: string[];
  /** Pares profesional–servicio (cualquiera, activos o no). */
  links: { professional_id: string; service_id: string }[];
  /** Profesionales activos que tienen al menos un tramo de horario. */
  professionalIdsWithHours: string[];
}

/**
 * Pasos para poder publicar una sucursal. Misma regla que `set_salon_published` (SQL): hace falta
 * UN profesional activo que tenga a la vez un servicio activo asignado y horario.
 * "hasHours" es true cuando existe horario donde importa: en un profesional con servicio asignado
 * (o, si aún no hay asignaciones, en cualquiera, para no bloquear el orden de los pasos).
 */
export function computeSetupStatus(i: SetupInput): SetupStatus {
  const services = new Set(i.activeServiceIds);
  const pros = new Set(i.activeProfessionalIds);
  const withHours = new Set(i.professionalIdsWithHours.filter((id) => pros.has(id)));
  const assigned = new Set(i.links.filter((l) => pros.has(l.professional_id) && services.has(l.service_id)).map((l) => l.professional_id));
  return {
    hasService: services.size > 0,
    hasProfessional: pros.size > 0,
    hasAssignment: assigned.size > 0,
    hasHours: assigned.size > 0 ? [...assigned].some((id) => withHours.has(id)) : withHours.size > 0,
    isPublished: i.isPublished,
  };
}

export type HoursEntry = {
  weekday: number;
  start: string;
  end: string;
};

/** Mismo tramo (p. ej. 09:00–18:00) para cada día elegido, sin repetidos y en orden lunes → domingo. */
export function buildHours(days: number[], start: string, end: string): HoursEntry[] {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const set = new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  return order.filter((d) => set.has(d)).map((weekday) => ({ weekday, start, end }));
}

/** El tramo es válido si abre antes de cerrar (formato HH:MM). */
export function validRange(start: string, end: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(end) && start < end;
}
