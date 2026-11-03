import type { MetadataRoute } from "next";

/** Permite instalar Breeze en el móvil o en la TV del salón como una app (pantalla completa, icono propio). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Breeze",
    short_name: "Breeze",
    description: "Book barbershops, salons and spas in Turks and Caicos.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#eefbfa",
    theme_color: "#2bb3b1",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
