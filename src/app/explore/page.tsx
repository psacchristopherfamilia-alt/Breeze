import { ExploreView, type ExploreSalon } from "@/components/explore/ExploreView";
import { coverFor } from "@/lib/booking/types";
import { colorOf } from "@/lib/colors";
import { mediaUrl } from "@/lib/media";
import { showRating } from "@/lib/reviews";
import { SALONS, prosOf, servicesOf, type BusinessType, type Zone } from "@/lib/mock/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Búsqueda de salones por nombre, servicio, tipo y zona. */
export default async function ExplorePage() {
  return <ExploreView salons={isSupabaseConfigured() ? await liveSalons() : mockSalons()} />;
}

function mockSalons(): ExploreSalon[] {
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

async function liveSalons(): Promise<ExploreSalon[]> {
  const supabase = await createClient();
  // RLS: solo salones publicados y columnas públicas.
  const [{ data: salons }, { data: pros }, { data: services }] = await Promise.all([
    supabase.from("salons").select("id, slug, name, business_types, zone, cover_path, rating_avg, rating_count").eq("is_published", true).order("name"),
    supabase.from("professionals").select("id, salon_id, public_name, color_hex, sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("services").select("salon_id, name_en, name_es, price_cents").eq("is_active", true),
  ]);
  return (salons ?? []).map((s) => {
    const svc = (services ?? []).filter((v) => v.salon_id === s.id);
    return {
      id: s.id,
      slug: s.slug,
      name: s.name,
      businessTypes: s.business_types as BusinessType[],
      zone: s.zone as Zone,
      cover: coverFor(s.id),
      ...(showRating(s.rating_count) ? { rating: Number(s.rating_avg), reviews: s.rating_count } : {}),
      coverUrl: mediaUrl(s.cover_path),
      pros: (pros ?? [])
        .filter((p) => p.salon_id === s.id)
        .map((p) => {
          const [first, ...rest] = (p.public_name ?? "").split(" ");
          return { id: p.id, firstName: first, lastName: rest.join(" "), colorHex: p.color_hex };
        }),
      fromCents: svc.length ? Math.min(...svc.map((v) => v.price_cents)) : null,
      searchText: [s.name, ...svc.flatMap((v) => [v.name_en, v.name_es])].join(" "),
    };
  });
}
