"use client";
import { ErrorPage } from "@/components/ErrorPage";

/** Error inesperado dentro de la app: se puede reintentar sin perder la sesión. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPage kind="error" onRetry={reset} />;
}
