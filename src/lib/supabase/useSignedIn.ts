"use client";
import { useEffect, useState } from "react";
import { createClient } from "./client";
import { isSupabaseConfigured } from "./env";

/**
 * ¿Hay una cuenta con sesión en este navegador? `undefined` hasta saberlo.
 * Solo para decidir qué botones mostrar: los datos siempre los protege la RLS en la base.
 * Una sesión anónima (la TV de Breeze Live) no cuenta como cuenta de cliente.
 */
export function useSignedIn(): boolean | undefined {
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setSignedIn(false);
      return;
    }
    const supabase = createClient();
    const real = (u: { is_anonymous?: boolean } | null | undefined) => !!u && !u.is_anonymous;
    supabase.auth.getSession().then(({ data }) => setSignedIn(real(data.session?.user)));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(real(session?.user)));
    return () => data.subscription.unsubscribe();
  }, []);
  return signedIn;
}
