"use client";
import { usePathname } from "next/navigation";
import { useCallback } from "react";
import { demoHref, isDemoPath } from "./paths";

/** ¿Estamos en la demo pública (/demo/…)? */
export function useIsDemo(): boolean {
  return isDemoPath(usePathname());
}

/** Convierte enlaces internos para que la demo no salga de /demo. Fuera de la demo no cambia nada. */
export function useAppHref(): (href: string) => string {
  const inDemo = useIsDemo();
  return useCallback((href: string) => demoHref(href, inDemo), [inDemo]);
}
