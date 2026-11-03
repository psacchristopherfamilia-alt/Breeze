# Breeze

Plataforma de reservas multi-salón (multi-tenant) para salones, spas, peluquerías y barberías en Turks and Caicos.
Plan completo: `docs/PLAN.md` (fuente de verdad para esquema, roles, flujos y carpetas).

## Contexto fijo
- Marca visible siempre "Breeze". Paquete npm, carpeta, repo y proyecto Supabase: `breeze`.
- Zona horaria `America/Grand_Turk` (tiene horario de verano), moneda USD, idiomas `en` (por defecto) y `es` según el dispositivo.
- Estilo visual: fresco, limpio, tropical (blancos, turquesas suaves). Colores de profesionales saturados que destaquen.
- Facturación a salones manual (transferencia/efectivo). Sin pagos en línea en el MVP.

## Stack
Next.js App Router + TypeScript + Tailwind CSS + Supabase (Auth, Postgres, Realtime, Edge Functions, pg_cron). next-intl, @date-fns/tz, zod, Vitest, pgTAP, Playwright.

## Comandos
- `pnpm dev` · `pnpm typecheck` · `pnpm test` (unitarios) · `pnpm test:db` (Postgres real)
- `pnpm exec supabase start` · `pnpm exec supabase db reset` · `pnpm db:types`
- `pnpm test:db` crea una BD desechable en `TEST_DATABASE_URL` (por defecto `postgres://postgres:postgres@localhost:54322/postgres`, el Postgres de `supabase start`), aplica `tests/db/support/supabase-shim.sql` + `supabase/migrations/*` + `fixtures.sql`, y la borra al terminar.

## Base de datos (supabase/migrations)
- Una migración nueva por cambio; nunca editar una migración ya aplicada en producción.
- La migración de RLS hace `revoke all` a anon/authenticated: **toda tabla nueva necesita sus GRANT explícitos, `enable row level security`, políticas y un test de aislamiento** en `tests/db/rls.test.ts`.
- Helpers de RLS en el esquema `private` (`has_org_role`, `has_salon_role`, `my_professional_ids`, `my_customer_ids`), `security definer` + `search_path = ''`.
- Dentro de una transacción de test, usar `attempt(c, () => …)` para esperar errores (savepoint).

## Reglas técnicas no negociables
1. **Prohibido el doble booking**: exclusion constraint `gist` (`professional_id =`, `tstzrange(starts_at, blocked_until, '[)') &&`) sobre citas no canceladas. No basta la validación en frontend.
2. Escritura de citas **solo vía RPC** (`book_appointment`, `reschedule_appointment`, `cancel_appointment`, `staff_create_appointment`).
3. Disponibilidad = duración + buffer del servicio + horario del profesional − días libres/cierres − citas existentes. Guardar en UTC, mostrar en `America/Grand_Turk`.
4. Pantallas públicas (Breeze Live, catálogo): solo nombre + inicial del apellido. Nunca teléfono ni correo; el saneado se hace en la BD.
5. El color de un profesional nunca va solo: siempre con nombre o iniciales.
6. RLS en todas las tablas; un salón jamás ve datos de otro. Toda tabla nueva necesita políticas y test de aislamiento.
7. Recordatorios firmados como "Breeze", con proveedores intercambiables (console/Resend/Twilio SMS/Twilio WhatsApp).

## Reglas de trabajo
- Trabajar por fases y esperar aprobación al final de cada una.
- Un commit por módulo, mensaje claro.
- Tests obligatorios para cálculo de disponibilidad y bloqueo de doble reserva (incluidos cambios de hora DST).
- Nunca secretos en el código: `.env.local` (ignorado) + `.env.example`. `service_role` solo en servidor/Edge Functions.
- Avisar al usuario antes de instalar dependencias, borrar archivos o crear repositorios remotos.
- Explicar todo en español, sencillo y directo.
