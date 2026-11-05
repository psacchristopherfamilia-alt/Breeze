import { ImageResponse } from "next/og";

export const alt = "Breeze: book barbershops, salons and spas in Turks and Caicos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Imagen al compartir el enlace de Breeze por WhatsApp, Instagram o Facebook. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg, #eefbfa 0%, #bfeceb 100%)", color: "#0b3b43" }}>
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -3 }}>Breeze</div>
        <div style={{ marginTop: 16, fontSize: 48, fontWeight: 600 }}>Book barbershops, salons and spas</div>
        <div style={{ marginTop: 8, fontSize: 40, color: "#2bb3b1", fontWeight: 700 }}>Turks and Caicos</div>
      </div>
    ),
    size,
  );
}
