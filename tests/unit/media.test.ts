import { afterEach, describe, expect, it, vi } from "vitest";
import { fitWithin, isPathInSalon, mediaUrl, newMediaPath } from "@/lib/media";

const SALON = "00000000-0000-4000-8000-000000000301";

describe("fitWithin", () => {
  it("reduce conservando las proporciones", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it("nunca amplía una imagen pequeña", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
  it("una imagen cuadrada y una muy alargada no llegan a 0 píxeles", () => {
    expect(fitWithin(1000, 1000, 600)).toEqual({ width: 600, height: 600 });
    expect(fitWithin(10000, 2, 100)).toEqual({ width: 100, height: 1 });
  });
  it("medidas inválidas dan 0", () => {
    expect(fitWithin(0, 100, 600)).toEqual({ width: 0, height: 0 });
  });
});

describe("rutas", () => {
  it("newMediaPath cuelga de la carpeta del salón", () => {
    const p = newMediaPath(SALON, "gallery", "abc");
    expect(p).toBe(`${SALON}/gallery/abc.webp`);
    expect(isPathInSalon(p, SALON)).toBe(true);
  });
  it("rechaza rutas de otro salón o que intentan salirse", () => {
    expect(isPathInSalon(`${SALON}/gallery/a.webp`, "00000000-0000-4000-8000-000000000999")).toBe(false);
    expect(isPathInSalon(`${SALON}/../otro/a.webp`, SALON)).toBe(false);
    expect(isPathInSalon(`${SALON}/gallery/a.svg`, SALON)).toBe(false);
    expect(isPathInSalon(`${SALON}/a.webp`, SALON)).toBe(false);
  });
});

describe("mediaUrl", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("arma la URL pública del bucket", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co/");
    expect(mediaUrl(`${SALON}/logo/a b.webp`)).toBe(`https://x.supabase.co/storage/v1/object/public/salon-media/${SALON}/logo/a%20b.webp`);
  });
  it("sin ruta o sin Supabase devuelve null", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    expect(mediaUrl(null)).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(mediaUrl(`${SALON}/logo/a.webp`)).toBeNull();
  });
});
