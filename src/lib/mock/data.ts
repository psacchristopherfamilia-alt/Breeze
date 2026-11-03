/**
 * DATOS FALSOS para el prototipo (Fase 3). Ningún nombre, teléfono ni salón es real.
 * En la Fase 4 todo esto se sustituye por Supabase.
 */
import type { ProColorKey } from "../colors";
import { addDaysKey, addMinutes, atLocal, localDateKey, weekdayOf } from "../time";

export type BusinessType = "barbershop" | "salon" | "spa";

export type Zone =
  | "grace_bay"
  | "downtown_provo"
  | "leeward"
  | "long_bay"
  | "turtle_cove"
  | "the_bight"
  | "chalk_sound"
  | "five_cays"
  | "blue_hills"
  | "grand_turk"
  | "north_caicos"
  | "south_caicos";

export const ZONES: Zone[] = [
  "grace_bay",
  "downtown_provo",
  "leeward",
  "long_bay",
  "turtle_cove",
  "the_bight",
  "chalk_sound",
  "five_cays",
  "blue_hills",
  "grand_turk",
  "north_caicos",
  "south_caicos",
];

export const BUSINESS_TYPES: BusinessType[] = ["barbershop", "salon", "spa"];

/** Catálogo fijo de categorías por tipo de negocio (sección 6.2.1 del plan). */
export const CATEGORIES = {
  cuts: "barbershop",
  beard: "barbershop",
  designs: "barbershop",
  hair_treatments: "barbershop",
  hair: "salon",
  color: "salon",
  braids: "salon",
  nails: "salon",
  makeup: "salon",
  brows_lashes: "salon",
  massage: "spa",
  facials: "spa",
  waxing: "spa",
  body: "spa",
  packages: "spa",
} as const satisfies Record<string, BusinessType>;

export type CategoryCode = keyof typeof CATEGORIES;

export type ProTitle =
  | "barber"
  | "stylist"
  | "nail_tech"
  | "makeup_artist"
  | "esthetician"
  | "massage_therapist";

export interface Salon {
  id: string;
  slug: string;
  name: string;
  organization: string;
  businessTypes: BusinessType[];
  zone: Zone;
  address: string;
  phone: string;
  rating: number;
  reviews: number;
  cancellationWindowHours: number;
  slotStepMin: number;
  minLeadMin: number;
  /** Degradado de portada (placeholder hasta tener fotos). */
  cover: [string, string];
}

/** Horario semanal en hora local: índice 0 = domingo. */
export type WeeklyHours = Partial<Record<number, [string, string][]>>;

export interface Professional {
  id: string;
  salonId: string;
  firstName: string;
  lastName: string;
  title: ProTitle;
  color: ProColorKey;
  serviceIds: string[];
  hours: WeeklyHours;
}

export interface Service {
  id: string;
  salonId: string;
  category: CategoryCode;
  nameEn: string;
  nameEs: string;
  durationMin: number;
  bufferMin: number;
  priceCents: number;
}

export type AppointmentStatus = "booked" | "completed" | "cancelled" | "no_show";
export type BookingSource = "online" | "phone" | "walk_in";

export interface Appointment {
  id: string;
  groupId: string;
  salonId: string;
  professionalId: string;
  serviceId: string;
  customerFirst: string;
  customerLast: string;
  customerPhone: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  blockedUntil: string; // ISO UTC = fin + buffer
  status: AppointmentStatus;
  source: BookingSource;
  createdAt: string;
  /** Marcado si la reserva la hizo "yo" en el prototipo (para /me). */
  mine?: boolean;
}

// ───────────────────────── Horarios tipo ─────────────────────────

const MON_SAT = (ranges: [string, string][]): WeeklyHours => ({
  1: ranges,
  2: ranges,
  3: ranges,
  4: ranges,
  5: ranges,
  6: ranges,
});
const SPLIT: [string, string][] = [
  ["09:00", "13:00"],
  ["14:00", "18:00"],
];
const BARBER_LONG: [string, string][] = [["10:00", "19:00"]];
const SPA_DAY: [string, string][] = [["09:00", "17:00"]];

// ───────────────────────── Salones ─────────────────────────

export const SALONS: Salon[] = [
  {
    id: "s1",
    slug: "island-fade",
    name: "Island Fade Barbershop",
    organization: "Island Fade Ltd.",
    businessTypes: ["barbershop"],
    zone: "downtown_provo",
    address: "Leeward Hwy, Downtown Providenciales",
    phone: "+1 649 000 0101",
    rating: 4.9,
    reviews: 212,
    cancellationWindowHours: 24,
    slotStepMin: 15,
    minLeadMin: 60,
    cover: ["#0E7C86", "#2563EB"],
  },
  {
    id: "s2",
    slug: "coral-salon",
    name: "Coral Salon & Nails",
    organization: "Coral Group",
    businessTypes: ["salon"],
    zone: "grace_bay",
    address: "Grace Bay Rd, Providenciales",
    phone: "+1 649 000 0202",
    rating: 4.8,
    reviews: 158,
    cancellationWindowHours: 24,
    slotStepMin: 15,
    minLeadMin: 60,
    cover: ["#F59E8B", "#BE185D"],
  },
  {
    id: "s3",
    slug: "seabreeze-spa",
    name: "Seabreeze Spa & Esthetics",
    organization: "Coral Group",
    businessTypes: ["spa"],
    zone: "leeward",
    address: "Leeward Marina, Providenciales",
    phone: "+1 649 000 0303",
    rating: 5.0,
    reviews: 97,
    cancellationWindowHours: 48,
    slotStepMin: 15,
    minLeadMin: 120,
    cover: ["#7DD7D4", "#047857"],
  },
  {
    id: "s4",
    slug: "tradewinds",
    name: "Tradewinds Barber & Beauty",
    organization: "Tradewinds TCI",
    businessTypes: ["barbershop", "salon"],
    zone: "five_cays",
    address: "Five Cays Rd, Providenciales",
    phone: "+1 649 000 0404",
    rating: 4.7,
    reviews: 64,
    cancellationWindowHours: 12,
    slotStepMin: 15,
    minLeadMin: 30,
    cover: ["#FBBF24", "#C2410C"],
  },
  {
    id: "s5",
    slug: "front-street-cuts",
    name: "Front Street Cuts",
    organization: "Front Street Cuts",
    businessTypes: ["barbershop"],
    zone: "grand_turk",
    address: "Front St, Cockburn Town, Grand Turk",
    phone: "+1 649 000 0505",
    rating: 4.6,
    reviews: 41,
    cancellationWindowHours: 24,
    slotStepMin: 15,
    minLeadMin: 60,
    cover: ["#4F46E5", "#0E7490"],
  },
];

// ───────────────────────── Servicios ─────────────────────────

const svc = (
  id: string,
  salonId: string,
  category: CategoryCode,
  nameEn: string,
  nameEs: string,
  durationMin: number,
  bufferMin: number,
  price: number,
): Service => ({ id, salonId, category, nameEn, nameEs, durationMin, bufferMin, priceCents: price * 100 });

export const SERVICES: Service[] = [
  // Island Fade
  svc("v101", "s1", "cuts", "Classic cut", "Corte clásico", 30, 10, 25),
  svc("v102", "s1", "cuts", "Skin fade", "Degradado (fade)", 45, 10, 35),
  svc("v103", "s1", "beard", "Beard trim & line-up", "Arreglo de barba", 20, 5, 15),
  svc("v104", "s1", "beard", "Hot towel shave", "Afeitado con toalla caliente", 30, 10, 30),
  svc("v105", "s1", "designs", "Hair design", "Diseño en el cabello", 20, 5, 15),
  svc("v106", "s1", "hair_treatments", "Scalp treatment", "Tratamiento de cuero cabelludo", 30, 10, 40),
  // Coral Salon
  svc("v201", "s2", "hair", "Cut & blow-dry", "Corte y secado", 60, 10, 65),
  svc("v202", "s2", "color", "Full color", "Tinte completo", 120, 15, 140),
  svc("v203", "s2", "color", "Highlights", "Mechas", 150, 15, 180),
  svc("v204", "s2", "braids", "Box braids", "Trenzas (box braids)", 180, 15, 180),
  svc("v205", "s2", "nails", "Manicure", "Manicura", 45, 10, 35),
  svc("v206", "s2", "nails", "Pedicure", "Pedicura", 60, 10, 50),
  svc("v207", "s2", "nails", "Gel nails", "Uñas de gel", 60, 10, 55),
  svc("v208", "s2", "makeup", "Event makeup", "Maquillaje de evento", 60, 10, 90),
  svc("v209", "s2", "brows_lashes", "Lash lift", "Lifting de pestañas", 45, 10, 70),
  // Seabreeze Spa
  svc("v301", "s3", "massage", "Relaxing massage (60 min)", "Masaje relajante (60 min)", 60, 15, 120),
  svc("v302", "s3", "massage", "Deep tissue (90 min)", "Masaje descontracturante (90 min)", 90, 15, 160),
  svc("v303", "s3", "massage", "Hot stone massage", "Masaje con piedras calientes", 75, 15, 150),
  svc("v304", "s3", "facials", "Deep cleansing facial", "Facial de limpieza profunda", 60, 10, 110),
  svc("v305", "s3", "waxing", "Full leg wax", "Depilación de piernas", 45, 10, 65),
  svc("v306", "s3", "waxing", "Brazilian wax", "Depilación brasileña", 30, 10, 60),
  svc("v307", "s3", "body", "Sea salt body scrub", "Exfoliación corporal con sal marina", 45, 10, 90),
  svc("v308", "s3", "packages", "Couples retreat (2 h)", "Paquete en pareja (2 h)", 120, 15, 300),
  // Tradewinds
  svc("v401", "s4", "cuts", "Men's cut", "Corte de caballero", 30, 10, 25),
  svc("v402", "s4", "beard", "Beard sculpt", "Perfilado de barba", 20, 5, 15),
  svc("v403", "s4", "hair", "Wash & set", "Lavado y peinado", 45, 10, 45),
  svc("v404", "s4", "nails", "Express manicure", "Manicura exprés", 30, 5, 25),
  svc("v405", "s4", "braids", "Cornrows", "Trenzas pegadas", 90, 10, 80),
  // Front Street Cuts
  svc("v501", "s5", "cuts", "Haircut", "Corte de pelo", 30, 10, 22),
  svc("v502", "s5", "cuts", "Kids cut", "Corte de niño", 25, 5, 15),
  svc("v503", "s5", "beard", "Beard trim", "Arreglo de barba", 20, 5, 12),
];

// ───────────────────────── Profesionales ─────────────────────────

export const PROFESSIONALS: Professional[] = [
  // Island Fade
  { id: "p11", salonId: "s1", firstName: "Carlos", lastName: "Martínez", title: "barber", color: "blue", serviceIds: ["v101", "v102", "v103", "v104", "v105"], hours: MON_SAT(BARBER_LONG) },
  { id: "p12", salonId: "s1", firstName: "Andre", lastName: "Williams", title: "barber", color: "red", serviceIds: ["v101", "v102", "v103", "v105", "v106"], hours: MON_SAT(BARBER_LONG) },
  { id: "p13", salonId: "s1", firstName: "Luis", lastName: "Gómez", title: "barber", color: "green", serviceIds: ["v101", "v103", "v104", "v106"], hours: { ...MON_SAT(SPLIT), 0: [["10:00", "14:00"]] } },
  // Coral Salon
  { id: "p21", salonId: "s2", firstName: "María", lastName: "Rodríguez", title: "stylist", color: "pink", serviceIds: ["v201", "v202", "v203", "v204"], hours: MON_SAT(SPLIT) },
  { id: "p22", salonId: "s2", firstName: "Keisha", lastName: "Forbes", title: "nail_tech", color: "violet", serviceIds: ["v205", "v206", "v207"], hours: MON_SAT(SPLIT) },
  { id: "p23", salonId: "s2", firstName: "Daniela", lastName: "Pérez", title: "makeup_artist", color: "amber", serviceIds: ["v201", "v208", "v209"], hours: MON_SAT([["10:00", "18:00"]]) },
  { id: "p24", salonId: "s2", firstName: "Tamika", lastName: "Hall", title: "nail_tech", color: "blue", serviceIds: ["v205", "v206", "v207"], hours: { 2: SPLIT, 3: SPLIT, 4: SPLIT, 5: SPLIT, 6: SPLIT } },
  // Seabreeze Spa
  { id: "p31", salonId: "s3", firstName: "Ana", lastName: "Silva", title: "massage_therapist", color: "emerald", serviceIds: ["v301", "v302", "v303", "v308"], hours: MON_SAT(SPA_DAY) },
  { id: "p32", salonId: "s3", firstName: "Natalie", lastName: "Gardiner", title: "esthetician", color: "indigo", serviceIds: ["v304", "v305", "v306", "v307"], hours: MON_SAT(SPA_DAY) },
  { id: "p33", salonId: "s3", firstName: "Rosa", lastName: "Jiménez", title: "massage_therapist", color: "orange", serviceIds: ["v301", "v303", "v307", "v308"], hours: { 0: SPA_DAY, 3: SPA_DAY, 4: SPA_DAY, 5: SPA_DAY, 6: SPA_DAY } },
  // Tradewinds
  { id: "p41", salonId: "s4", firstName: "Jean", lastName: "Baptiste", title: "barber", color: "cyan", serviceIds: ["v401", "v402"], hours: MON_SAT(BARBER_LONG) },
  { id: "p42", salonId: "s4", firstName: "Shanice", lastName: "Missick", title: "stylist", color: "pink", serviceIds: ["v403", "v404", "v405"], hours: MON_SAT(SPLIT) },
  // Front Street Cuts
  { id: "p51", salonId: "s5", firstName: "Marcus", lastName: "Robinson", title: "barber", color: "indigo", serviceIds: ["v501", "v502", "v503"], hours: MON_SAT(BARBER_LONG) },
  { id: "p52", salonId: "s5", firstName: "Pedro", lastName: "Alvarado", title: "barber", color: "brown", serviceIds: ["v501", "v502", "v503"], hours: MON_SAT(SPLIT) },
];

// ───────────────────────── Clientes ficticios ─────────────────────────

export const FAKE_CUSTOMERS: [string, string][] = [
  ["Juan", "Pérez"],
  ["Ashley", "Taylor"],
  ["Kevin", "Smith"],
  ["Lucía", "Fernández"],
  ["Brandon", "Ewing"],
  ["Sofía", "Morales"],
  ["Tyrone", "Gardiner"],
  ["Emily", "Clarke"],
  ["Miguel", "Santos"],
  ["Chantal", "Pierre"],
  ["Jasmine", "Forbes"],
  ["Diego", "Ramírez"],
  ["Olivia", "Brown"],
  ["Wilner", "Joseph"],
  ["Carmen", "Ortiz"],
  ["Ryan", "Harvey"],
];

// ───────────────────────── Helpers ─────────────────────────

export const salonBySlug = (slug: string) => SALONS.find((s) => s.slug === slug);
export const salonById = (id: string) => SALONS.find((s) => s.id === id);
export const serviceById = (id: string) => SERVICES.find((s) => s.id === id);
export const proById = (id: string) => PROFESSIONALS.find((p) => p.id === id);
export const servicesOf = (salonId: string) => SERVICES.filter((s) => s.salonId === salonId);
export const prosOf = (salonId: string) => PROFESSIONALS.filter((p) => p.salonId === salonId);

export const hoursFor = (pro: Professional, dateKey: string) => pro.hours[weekdayOf(dateKey)] ?? [];

export const serviceName = (s: Service, locale: "en" | "es") => (locale === "es" ? s.nameEs : s.nameEn);

export const formatPrice = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

// ───────────────────────── Generador de citas de ejemplo ─────────────────────────

/** Patrones de horas para rellenar agendas de forma creíble y determinista. */
const PATTERNS = [
  ["09:00", "10:30", "13:15", "15:00", "16:30"],
  ["10:00", "11:15", "14:00", "16:00"],
  ["09:30", "11:00", "12:00", "14:30", "17:00"],
  ["10:15", "12:15", "15:15", "17:30"],
  ["09:00", "11:45", "14:15", "15:45"],
];

/**
 * Citas de ejemplo desde ayer hasta dentro de 6 días, relativas a `now`.
 * Respeta horario laboral y nunca solapa citas del mismo profesional (simula la restricción de la BD).
 */
export function seedAppointments(now: Date): Appointment[] {
  const today = localDateKey(now);
  const out: Appointment[] = [];
  let n = 0;

  PROFESSIONALS.forEach((pro, pi) => {
    const services = pro.serviceIds.map((id) => serviceById(id)!).filter(Boolean);
    for (let day = -1; day < 7; day++) {
      const key = addDaysKey(today, day);
      const hours = hoursFor(pro, key);
      if (!hours.length) continue;
      const pattern = PATTERNS[(pi + day + 14) % PATTERNS.length];
      let lastBlocked = 0;
      // Días futuros más vacíos que hoy, para que haya huecos que reservar.
      const take = day <= 0 ? pattern.length : Math.max(1, pattern.length - 1 - (day % 3));
      for (const hhmm of pattern.slice(0, take)) {
        const service = services[(n + pi) % services.length];
        n++;
        const start = atLocal(key, hhmm);
        const end = addMinutes(start, service.durationMin);
        const blocked = addMinutes(end, service.bufferMin);
        const inHours = hours.some(([a, b]) => start >= atLocal(key, a) && blocked <= atLocal(key, b));
        if (!inHours || start.getTime() < lastBlocked) continue;
        lastBlocked = blocked.getTime();
        const [first, last] = FAKE_CUSTOMERS[(n * 7 + pi) % FAKE_CUSTOMERS.length];
        const past = end <= now;
        out.push({
          id: `a-${pro.id}-${key}-${hhmm}`,
          groupId: `g-${pro.id}-${key}-${hhmm}`,
          salonId: pro.salonId,
          professionalId: pro.id,
          serviceId: service.id,
          customerFirst: first,
          customerLast: last,
          customerPhone: `+1 649 ${String(200 + ((n * 13) % 700)).padStart(3, "0")} ${String(1000 + ((n * 389) % 8999))}`,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          blockedUntil: blocked.toISOString(),
          status: past ? (n % 11 === 0 ? "no_show" : "completed") : "booked",
          source: n % 4 === 0 ? "phone" : n % 9 === 0 ? "walk_in" : "online",
          createdAt: addMinutes(start, -60 * 24 * ((n % 5) + 1)).toISOString(),
        });
      }
    }
  });
  return out;
}
