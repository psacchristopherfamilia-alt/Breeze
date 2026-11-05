import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Solo se indexa lo público (catálogo, salones y textos legales). Panel, cuentas y enlaces privados quedan fuera. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/explore", "/s/", "/privacy", "/terms", "/business-terms", "/negocios"],
        disallow: ["/dashboard", "/admin", "/b/", "/me", "/live", "/api/", "/auth/", "/login", "/signup", "/invite/", "/pro", "/onboarding"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
