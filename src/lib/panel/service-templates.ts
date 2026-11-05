import type { BusinessType } from "../mock/data";

/** Servicio sugerido para empezar rápido. Los precios son orientativos en USD y el dueño los ajusta. */
export interface ServiceTemplate {
  key: string;
  category: string;
  type: BusinessType;
  nameEn: string;
  nameEs: string;
  durationMin: number;
  bufferMin: number;
  priceCents: number;
}

const t = (
  category: string,
  type: BusinessType,
  key: string,
  nameEn: string,
  nameEs: string,
  durationMin: number,
  bufferMin: number,
  price: number,
): ServiceTemplate => ({ key: `${category}.${key}`, category, type, nameEn, nameEs, durationMin, bufferMin, priceCents: price * 100 });

export const SERVICE_TEMPLATES: ServiceTemplate[] = [
  // Barbería
  t("cuts", "barbershop", "haircut", "Haircut", "Corte de cabello", 30, 10, 30),
  t("cuts", "barbershop", "fade", "Fade haircut", "Corte fade", 40, 10, 35),
  t("cuts", "barbershop", "kids", "Kids haircut", "Corte para niños", 25, 5, 20),
  t("beard", "barbershop", "beard", "Beard trim", "Arreglo de barba", 20, 5, 15),
  t("beard", "barbershop", "shave", "Hot towel shave", "Afeitado con toalla caliente", 30, 5, 25),
  t("beard", "barbershop", "combo", "Haircut + beard", "Corte + barba", 50, 10, 45),
  t("designs", "barbershop", "lineup", "Line-up", "Perfilado", 15, 5, 12),
  t("designs", "barbershop", "design", "Hair design", "Diseño en el cabello", 25, 5, 20),
  t("hair_treatments", "barbershop", "wash", "Wash & style", "Lavado y peinado", 20, 5, 15),
  // Salón
  t("hair", "salon", "cut", "Women's cut & style", "Corte y peinado de mujer", 60, 10, 55),
  t("hair", "salon", "blowdry", "Blow-dry", "Secado y peinado", 45, 10, 40),
  t("hair", "salon", "treatment", "Deep conditioning treatment", "Tratamiento hidratante", 45, 10, 45),
  t("color", "salon", "root", "Root color", "Color de raíz", 90, 10, 85),
  t("color", "salon", "highlights", "Highlights", "Mechas", 150, 15, 160),
  t("braids", "salon", "braids", "Box braids", "Trenzas box braids", 240, 15, 180),
  t("braids", "salon", "cornrows", "Cornrows", "Trenzas pegadas", 90, 10, 70),
  t("nails", "salon", "manicure", "Manicure", "Manicura", 45, 10, 35),
  t("nails", "salon", "pedicure", "Pedicure", "Pedicura", 60, 10, 45),
  t("nails", "salon", "gel", "Gel manicure", "Manicura en gel", 60, 10, 50),
  t("makeup", "salon", "event", "Event makeup", "Maquillaje de evento", 60, 10, 75),
  t("brows_lashes", "salon", "brows", "Brow shaping", "Diseño de cejas", 25, 5, 25),
  t("brows_lashes", "salon", "lashes", "Lash extensions", "Extensiones de pestañas", 120, 10, 120),
  // Spa
  t("massage", "spa", "swedish60", "Swedish massage (60 min)", "Masaje sueco (60 min)", 60, 15, 120),
  t("massage", "spa", "deep60", "Deep tissue massage (60 min)", "Masaje de tejido profundo (60 min)", 60, 15, 140),
  t("massage", "spa", "couples", "Couples massage (60 min)", "Masaje para parejas (60 min)", 60, 20, 260),
  t("facials", "spa", "classic", "Classic facial", "Facial clásico", 60, 10, 95),
  t("waxing", "spa", "brow", "Eyebrow wax", "Depilación de cejas", 15, 5, 20),
  t("waxing", "spa", "legs", "Full leg wax", "Depilación de piernas completas", 45, 10, 70),
  t("body", "spa", "scrub", "Body scrub", "Exfoliación corporal", 45, 10, 95),
  t("packages", "spa", "half", "Half-day spa package", "Paquete spa de medio día", 180, 20, 320),
];

/** Plantillas del tipo de negocio, sin las que el salón ya tiene (mismo nombre en inglés o español). */
export function templatesFor(types: BusinessType[], existing: { nameEn: string; nameEs: string }[] = []): ServiceTemplate[] {
  const taken = new Set(existing.flatMap((s) => [s.nameEn.trim().toLowerCase(), s.nameEs.trim().toLowerCase()]));
  return SERVICE_TEMPLATES.filter(
    (x) => types.includes(x.type) && !taken.has(x.nameEn.toLowerCase()) && !taken.has(x.nameEs.toLowerCase()),
  );
}
