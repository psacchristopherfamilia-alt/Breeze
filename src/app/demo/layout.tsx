import type { Metadata } from "next";

/**
 * Demo pública de Breeze (/demo). Usa los componentes del prototipo con datos de ejemplo que viven en el
 * navegador (localStorage), aunque Supabase esté conectado: no lee ni escribe nada en la base de datos.
 */
export const metadata: Metadata = {
  title: "Demo",
  robots: { index: false, follow: false },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
