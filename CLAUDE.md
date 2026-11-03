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
- Dentro de una transacción de test, usar `attempt(c, () => …)` para esperar errores (savepoint); `switchTo(c, user(id))` / `asSuperuser(c)` para cambiar de rol.
- Tras cambiar el esquema: `pnpm db:types` (aplica migraciones en una BD temporal y regenera `src/types/database.ts`).
- Funciones RPC nuevas: `security definer` + `set search_path = ''`, `revoke execute … from public, anon` y `grant` explícito.

## Reservas (módulo 3)
- RPC: `get_public_schedule` (anon), `book_appointment` (cliente o invitado), `staff_create_appointment`, `cancel_booking` / `cancel_by_guest_token`, `reschedule_booking` / `reschedule_by_guest_token`, `mark_appointment`, `get_guest_booking`, `my_bookings`.
- Los errores de las RPC son mensajes-clave (`too_soon`, `outside_working_hours`, …) o el código `23P01`; `bookingErrorKey()` los traduce a `booking.errors.*`.
- Las exclusion constraints son `DEFERRABLE INITIALLY IMMEDIATE`: solo `private.reschedule_group` las difiere y las vuelve a comprobar (`set constraints … immediate`) antes de salir.
- Regla de secuencia (varios servicios): cada uno empieza en fin + buffer del anterior. Idéntica en `planSequence()` (TS) y `private.plan_items()` (SQL).
- La pantalla de reserva es una sola (`components/booking/BookingFlow.tsx`) con dos fuentes: `MockBooking` (prototipo) y `LiveBooking` (Supabase).
- Invitados: token de 64 hex en el enlace `/b/[token]`; en BD solo su sha256. Máx. 2 reservas futuras por teléfono no verificado.

## Panel (módulo 4)
- RPC atómicas: `set_working_hours`, `set_professional_services`, `set_salon_published` (exige ≥1 profesional activo con horario y servicio). `is_published` NO se puede cambiar con UPDATE directo (GRANT por columnas).
- El resto (servicios, profesionales, ajustes, días libres, cierres) se escribe directamente con RLS desde `src/app/dashboard/actions.ts`, que devuelve `{ ok } | { ok: false, error: <panel.errors.*> }`.
- Contexto: `getPanelContext()` (`src/lib/panel/server.ts`) a partir de `my_context`; sucursal activa en la cookie `breeze-salon`.
- La agenda es un solo componente (`components/agenda/AgendaView.tsx`) con dos adaptadores: `MockAgenda` y `LiveAgenda`.

## Breeze Live (módulo 5)
- Flujo: TV con sesión anónima → `request_live_pairing(slug)` (código de 6 dígitos, en BD solo hash, caduca a los 15 min, máx. 5 pendientes por sucursal) → el salón escribe el código en Ajustes → `pair_live_device` crea la membresía `display` → `revoke_live_device` la quita.
- Datos: `get_live_board(salon)` devuelve la agenda del día ya saneada (`private.live_appointment_json`: "Juan P.", servicio, horas). Nunca teléfono, correo ni apellido.
- Tiempo real: trigger `appointments_broadcast_live` → `realtime.send(payload, 'appointment', 'live:<salon_id>', private)`; la política de `realtime.messages` solo deja leer ese tema a personal/pantallas de esa sucursal. En tests, `realtime.send` es un sustituto que guarda en `realtime.test_sent`.
- UI: `components/live/LiveBoardView.tsx` (visual) + `MockLive` (prototipo, con simulador) / `RealLive` (Supabase, emparejamiento + Realtime).

## Recordatorios (módulo 6)
- El trigger `appointments_enqueue_notifications` crea los trabajos en `notification_jobs` (uno por reserva): confirmación, recordatorios según `salons.reminder_offsets_min`, reprogramación y cancelación.
- Worker en `src/app/api/cron/notifications/route.ts` (Next, no Edge Function: reutiliza plantillas y hora de TCI, y se prueba con Vitest). Usa `createAdminClient()` (service_role) → `claim_notification_jobs` / `complete_notification_job` (solo service_role).
- Plantillas en `src/lib/notifications/templates.ts` (EN/ES, siempre "— Breeze"); proveedores en `providers.ts` (console, Resend, Twilio SMS/WhatsApp vía fetch, sin SDK); orden de canales y reintentos en `worker.ts`.
- El enlace privado del invitado se adjunta con `attach_guest_link(token)` y se borra al enviar; la columna `link_token` no es legible por el panel.

## Auth (Supabase)
- Sin variables de Supabase → modo prototipo (datos falsos). `isSupabaseConfigured()` en `src/lib/supabase/env.ts`.
- Clientes: `src/lib/supabase/server.ts` (server), `client.ts` (navegador), `session.ts` + `src/proxy.ts` (refresco de sesión y rutas protegidas; en Next 16 el middleware se llama `proxy`).
- Server actions en `src/app/(auth)/actions.ts` devuelven CLAVES de traducción (`auth.errors.*`), nunca texto.
- Validación con zod en `src/lib/validation/` (compartida cliente/servidor). Teléfonos con `normalizePhone` (= `private.normalize_phone` en SQL).
- Redirecciones solo internas con `safeNext`.
- Sesiones anónimas ACTIVADAS solo para pantallas Breeze Live. Triggers `private.block_anonymous` en `organizations`, `memberships` (salvo rol `display`) y `customers` impiden que una sesión anónima cree negocios, acepte invitaciones o reserve.

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
