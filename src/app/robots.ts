import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * robots.txt bloquea SOLO lo que Google no debe ni abrir: panel, admin, API, enlaces privados con token
 * (/b/, /r/) y Breeze Live (/live: al abrirse pide un código de emparejamiento).
 * Las páginas públicas que no deben salir en Google (entrar, crear cuenta, /me, equipo) NO se bloquean aquí:
 * llevan `noindex` (lib/seo.ts). Si se bloquearan, Google no podría leer ese noindex y las marcaría
 * como «Bloqueada por robots.txt» o incluso las indexaría sin contenido.
 */
const PRIVATE_PATHS = ["/dashboard", "/admin", "/api/", "/auth/", "/b/", "/r/", "/live"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
