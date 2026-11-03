import { MockLive } from "@/components/live/MockLive";
import { RealLive } from "@/components/live/RealLive";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** Breeze Live: /live/[slug-del-salón]. Kiosco a pantalla completa para la TV o tablet del salón. */
export default async function LivePage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId: slug } = await params;
  return isSupabaseConfigured() ? <RealLive slug={slug} /> : <MockLive slug={slug} />;
}
