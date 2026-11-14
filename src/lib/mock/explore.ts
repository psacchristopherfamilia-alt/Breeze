import type { ExploreSalon } from "@/components/explore/ExploreView";
import { colorOf } from "@/lib/colors";
import { SALONS, prosOf, servicesOf } from "@/lib/mock/data";

/** Salones de ejemplo para /explore en el prototipo y en la demo pública. */
export function mockSalons(): ExploreSalon[] {
  return SALONS.map((s) => {
    const services = servicesOf(s.id);
    return {
      id: s.id,
      slug: s.slug,
      name: s.name,
      businessTypes: s.businessTypes,
      zone: s.zone,
      rating: s.rating,
      reviews: s.reviews,
      cover: s.cover,
      pros: prosOf(s.id).map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, colorHex: colorOf(p.color).hex })),
      fromCents: services.length ? Math.min(...services.map((v) => v.priceCents)) : null,
      searchText: [s.name, ...services.flatMap((v) => [v.nameEn, v.nameEs])].join(" "),
    };
  });
}
