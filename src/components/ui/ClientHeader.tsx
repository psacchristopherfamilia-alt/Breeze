"use client";
import { CalendarCheck, LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { signOut } from "@/app/(auth)/actions";
import { useDeviceTokens } from "@/lib/booking/device";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useSignedIn } from "@/lib/supabase/useSignedIn";
import { Logo } from "./Logo";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { PrototypeBanner } from "./PrototypeBanner";

const btn = "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-lagoon hover:bg-breeze-50";

/**
 * Cabecera de la app del cliente.
 *  · "Mis citas": con cuenta, o si ESTE navegador ya reservó como invitado.
 *  · "Entrar": solo si no hay cuenta con sesión. Con sesión, "Salir".
 * En modo prototipo (sin Supabase) se muestran los dos, como siempre.
 */
export function ClientHeader() {
  const t = useTranslations("client");
  const configured = isSupabaseConfigured();
  const signedIn = useSignedIn();
  const tokens = useDeviceTokens();
  const ready = !configured || (signedIn !== undefined && tokens !== undefined);
  const showBookings = !configured || signedIn === true || (tokens?.length ?? 0) > 0;
  const showSignIn = !configured || signedIn === false;

  return (
    <>
      <PrototypeBanner />
      <header className="sticky top-0 z-30 border-b border-breeze-100/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Logo href="/explore" />
          <div className="flex items-center gap-2">
            {ready && showBookings && (
              <Link href="/me" className={btn} aria-label={t("myBookings")}>
                <CalendarCheck className="size-4" />
                <span className="hidden sm:inline">{t("myBookings")}</span>
              </Link>
            )}
            {ready && showSignIn && (
              <Link href="/login" className={btn} aria-label={t("signIn")}>
                <LogIn className="size-4" />
                <span className="hidden sm:inline">{t("signIn")}</span>
              </Link>
            )}
            {ready && configured && signedIn && (
              <form action={signOut}>
                <input type="hidden" name="to" value="/explore" />
                <button className={btn} aria-label={t("signOut")}>
                  <LogOut className="size-4" />
                  <span className="hidden sm:inline">{t("signOut")}</span>
                </button>
              </form>
            )}
            <LocaleSwitcher />
          </div>
        </div>
      </header>
    </>
  );
}
