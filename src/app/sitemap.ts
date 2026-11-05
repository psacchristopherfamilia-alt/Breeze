import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const fixed: MetadataRoute.Sitemap = ["/explore", "/negocios", "/privacy", "/terms", "/business-terms"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "monthly",
    priority: p === "/explore" ? 0.9 : 0.4,
  }));
  if (!isSupabaseConfigured()) return fixed;
  try {
    // RLS: solo salones publicados y con plan al día.
    const supabase = await createClient();
    const { data } = await supabase.from("salons").select("slug, updated_at").eq("is_published", true).order("name");
    return [
      ...fixed,
      ...(data ?? []).map((s) => ({ url: `${base}/s/${s.slug}`, lastModified: s.updated_at, changeFrequency: "weekly" as const, priority: 0.8 })),
    ];
  } catch {
    return fixed;
  }
}
