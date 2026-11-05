import { ErrorPage } from "@/components/ErrorPage";

/** Salón sin publicar, suspendido o que no existe: el cliente no necesita saber cuál de los casos es. */
export default function SalonUnavailable() {
  return <ErrorPage kind="unavailable" />;
}
