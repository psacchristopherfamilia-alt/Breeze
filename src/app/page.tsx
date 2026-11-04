import { redirect } from "next/navigation";
import { Hub } from "@/components/Hub";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Con Supabase conectado, la portada es la app del cliente (/explore); Breeze Negocios vive aparte en /negocios.
 * Sin Supabase (prototipo) se muestra el hub con las tres partes y datos falsos.
 */
export const dynamic = "force-dynamic";

export default function Home() {
  if (isSupabaseConfigured()) redirect("/explore");
  return <Hub />;
}
