import { colorOf } from "../colors";
import { prosOf, salonBySlug, servicesOf } from "../mock/data";
import type { BookingData } from "./types";

/** Adaptador: datos falsos del prototipo → BookingData. */
export function mockBookingData(slug: string): BookingData | null {
  const s = salonBySlug(slug);
  if (!s) return null;
  return {
    salon: {
      id: s.id,
      slug: s.slug,
      name: s.name,
      businessTypes: s.businessTypes,
      zone: s.zone,
      address: s.address,
      phone: s.phone,
      rating: s.rating,
      reviews: s.reviews,
      cover: s.cover,
      cancellationWindowHours: s.cancellationWindowHours,
      slotStepMin: s.slotStepMin,
      minLeadMin: s.minLeadMin,
      maxAdvanceDays: 60,
    },
    services: servicesOf(s.id).map((v) => ({
      id: v.id,
      category: v.category,
      nameEn: v.nameEn,
      nameEs: v.nameEs,
      durationMin: v.durationMin,
      bufferMin: v.bufferMin,
      priceCents: v.priceCents,
    })),
    pros: prosOf(s.id).map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      colorHex: colorOf(p.color).hex,
      title: p.title,
      serviceIds: p.serviceIds,
      hours: p.hours,
      payment: p.payment ?? { cash: true, card: false, transfer: false, note: null },
    })),
  };
}
