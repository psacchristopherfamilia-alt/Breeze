import { LegalLinks } from "@/components/legal/LegalConsent";
import { Logo } from "@/components/ui/Logo";
import { LocaleSwitcher } from "@/components/ui/LocaleSwitcher";
import { NotConfiguredBanner } from "@/components/auth/ui";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-breeze-sky min-h-dvh">
      <div className="mx-auto flex max-w-md flex-col px-4 py-6 sm:py-10">
        <header className="flex items-center justify-between">
          <Logo href="/explore" />
          <LocaleSwitcher />
        </header>
        <div className="mt-8 space-y-4">
          {!isSupabaseConfigured() && <NotConfiguredBanner />}
          {children}
          <LegalLinks className="justify-center" />
        </div>
      </div>
    </main>
  );
}
