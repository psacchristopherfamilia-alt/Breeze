import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { InviteCard } from "./InviteCard";

/** Enlace de invitación: /invite/[token]. Hay que entrar (o crear cuenta) con el correo/teléfono invitado. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let email: string | null = null;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    email = data.user?.email ?? data.user?.phone ?? null;
  }
  return <InviteCard token={token} signedInAs={email} />;
}
