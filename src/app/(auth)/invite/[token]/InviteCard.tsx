"use client";
import { Handshake } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/auth/ui";
import { acceptInvitation } from "../../actions";

export function InviteCard({ token, signedInAs }: { token: string; signedInAs: string | null }) {
  const t = useTranslations("auth.invite");
  const [state, action] = useActionState(acceptInvitation, undefined);
  const next = encodeURIComponent(`/invite/${token}`);

  return (
    <section className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-breeze-100 animate-fade-up">
      <Handshake className="mx-auto size-14 text-breeze-500" />
      <h1 className="mt-4 text-2xl font-extrabold">{t("title")}</h1>
      <p className="mt-2 text-ink/60">{t("body")}</p>
      {signedInAs ? (
        <form action={action} className="mt-6 space-y-3 text-left">
          <input type="hidden" name="token" value={token} />
          <FormError error={state?.error} />
          <p className="text-center text-sm text-ink/60">{t("signedInAs", { who: signedInAs })}</p>
          <SubmitButton>{t("accept")}</SubmitButton>
        </form>
      ) : (
        <div className="mt-6 space-y-2">
          <FormError error={state?.error} />
          <Link href={`/login?next=${next}`} className="block rounded-2xl bg-lagoon px-5 py-3 font-bold text-white">{t("login")}</Link>
          <Link href={`/signup?next=${next}`} className="block rounded-2xl px-5 py-3 text-sm font-bold text-lagoon ring-1 ring-breeze-100">{t("signup")}</Link>
          <p className="pt-2 text-xs text-ink/50">{t("sameEmail")}</p>
        </div>
      )}
    </section>
  );
}
