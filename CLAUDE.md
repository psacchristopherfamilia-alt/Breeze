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
- `pnpm dev` · `pnpm typecheck` · `pnpm test` (unitarios) · `pnpm test:db` (Postgres real) · `pnpm test:e2e` (navegador, Playwright)
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
- Invitados: token de 64 hex en el enlace `/b/[token]`; en BD solo su sha256. Máx. 2 reservas futuras por teléfono no verificado. `claim_guest_bookings` (authenticated) traspasa citas de invitado a una cuenta: 'claimed' | 'already' | 'not_found' | 'failed'.

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

## Facturación manual (módulo 7)
- Ciclo: prueba 14 días → el administrador genera la factura (`platform_create_invoice`) → el dueño paga por transferencia/efectivo → `platform_register_payment` deja el plan `active` hasta el fin del periodo (anual = 10 meses). Una sola factura abierta por negocio. Las sucursales extra salen de `subscriptions.extra_branches`.
- Sin pago: `private.billing_sweep()` (pg_cron diario, 04:15 TCI) pone `past_due` a los 7 días del vencimiento y `suspended` a los 14. Suspendido = se apagan la reserva en línea (`book_appointment`) y Breeze Live (`get_live_board`); **nunca se borra nada** y la agenda del panel sigue. `private.org_can_book(org)` es la regla única (y corta a los 14 días aunque el barrido no haya corrido).
- Administrador de plataforma: `profiles.is_platform_admin` (solo se pone por SQL, nunca desde la app). RPC `platform_overview`, `platform_create_invoice`, `platform_register_payment`, `platform_void_invoice`, `platform_extend` (cortesía/reactivar), `platform_set_status` (suspender/cancelar), `platform_save_settings`. Todas comprueban `private.is_platform_admin()` y dejan rastro en `audit_log`. UI en `/admin` (404 si no eres administrador).
- Dueño: `my_billing(org)` (solo rol owner) → `/dashboard/billing` ("Plan y pagos": factura, datos para transferir, historial) y `BillingBanner` (aviso en todo el panel según `billingNotice()` en `src/lib/billing.ts`).
- `platform_settings` (una fila: datos bancarios) no se lee ni escribe directamente; solo vía RPC. `invoices`/`payments` son de solo lectura para el dueño.
- Estados que cuentan para el MRR: `active` y `past_due` (`monthlyRecurringCents`).

## Auth (Supabase)
- Sin variables de Supabase → modo prototipo (datos falsos). `isSupabaseConfigured()` en `src/lib/supabase/env.ts`.
- Clientes: `src/lib/supabase/server.ts` (server), `client.ts` (navegador), `session.ts` + `src/proxy.ts` (refresco de sesión y rutas protegidas; en Next 16 el middleware se llama `proxy`).
- Server actions en `src/app/(auth)/actions.ts` devuelven CLAVES de traducción (`auth.errors.*`), nunca texto.
- Validación con zod en `src/lib/validation/` (compartida cliente/servidor). Teléfonos con `normalizePhone` (= `private.normalize_phone` en SQL).
- Redirecciones solo internas con `safeNext`.
- Sesiones anónimas ACTIVADAS solo para pantallas Breeze Live. Triggers `private.block_anonymous` en `organizations`, `memberships` (salvo rol `display`) y `customers` impiden que una sesión anónima cree negocios, acepte invitaciones o reserve.

## Dos puertas (cliente / negocios)
- Una sola app, dos entradas. **Cliente**: `/` → `/explore` (con Supabase; sin él, el hub del prototipo). **Breeze Negocios**: `/negocios` (dueños, administradores y equipo), con `/login?for=negocios`, `/signup/salon` y `/negocios/equipo` (pegar el enlace de invitación → `/invite/<token>`).
- Misma cuenta para todo: ser dueño es tener una membresía, no otro tipo de usuario. `homeFor()` lleva a cada uno a su sitio (panel o `/me`). El cliente no ve nada de negocios salvo un enlace discreto "Breeze Negocios".
- `/me` es pública. Sin cuenta lista las reservas de invitado de ESTE navegador; con cuenta, `my_bookings`.
- Invitado: tras reservar, el token del enlace `/b/[token]` se guarda en `localStorage` (`breeze-guest-bookings`, `src/lib/booking/device.ts`, máx. 20). **Nunca se reconoce a nadie por IP** (hoteles y wifi compartida). Si luego inicia sesión, `ClaimDeviceBookings` llama a la RPC `claim_guest_bookings(tokens)` y las citas pasan a su cuenta (la sesión anónima de las TV no puede).
- `signOut` recibe `to` (cliente → `/explore`, negocio → `/negocios`). La cabecera del cliente (`ClientHeader`) muestra "Mis citas" solo con cuenta o con citas guardadas en el dispositivo.

## Antiabuso y legal
- Captcha Turnstile solo para reservas de INVITADO: `src/lib/captcha.ts` (servidor, falla cerrado) + `components/booking/Turnstile.tsx`. Se activa con `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`; sin ellas no hace nada. `confirmBooking` lo verifica antes de llamar a `book_appointment` (error `captcha_failed`).
- Legal (BORRADOR): `/privacy`, `/terms`, `/business-terms` (`src/lib/legal/`). `config.ts` tiene los datos de la empresa y `reviewed: false` (muestra el aviso de borrador). **Antes de lanzar**: rellenar los [corchetes], revisión de un abogado de TCI y poner `reviewed: true`. Si cambia el producto (analítica, proveedores, datos), actualizar `content.ts` y subir `version`.
- Registro de negocio exige la casilla `acceptTerms`; se guardan `terms_accepted_at` y `terms_version` en el `user_metadata`. Reservar y crear cuenta de cliente muestran el aviso de aceptación (`LegalConsent`).

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

## Salida a venta (módulo 8)
- **Catálogo público**: `anon` solo lee columnas públicas de `salons` (GRANT por columnas; sin `organization_id`, `no_show_*` ni `reminder_offsets_min`). Un negocio que no puede reservar (`private.org_can_book`, o sea suspendido) desaparece del catálogo, de `/explore` y de su página: `private.is_published_salon` y la política de `salons` lo exigen. Los tests de catálogo público dan plan activo a los negocios (`withActivePlans`).
- **Servicios sugeridos**: `src/lib/panel/service-templates.ts` (30 servicios por tipo de negocio, precios orientativos en USD) + acción `addServiceTemplates` + bloque en `LiveServices`.
- **QR del salón**: `components/panel/SalonQr.tsx` (librería `qrcode`, se genera en el navegador) en Ajustes.
- **SEO**: `src/lib/site.ts` (`siteUrl()`), `robots.ts`, `sitemap.ts` (salones publicados), `opengraph-image.tsx`, `generateMetadata` + JSON-LD en `/s/[slug]`. `/b/[token]` no se indexa.
- **Precios**: `/negocios/precios` (planes de la tabla `plans`, respaldo en `src/lib/plans.ts`).
- **Factura/recibo**: `/dashboard/billing/[number]` (solo dueño, imprimible → «Guardar como PDF»).
- **Derechos de datos** (cliente con cuenta): RPC `export_my_data()` y `delete_my_account()` (cancela citas futuras, anonimiza ficha y citas pasadas, borra el usuario; un dueño de negocio no puede borrarse: `owner_cannot_delete`). UI en `/me` (`MyPrivacy`).
- **CI**: `.github/workflows/ci.yml` (tipos, pruebas unitarias, pruebas de BD con Postgres 16 en el puerto 54322, build).
- **Pruebas de navegador** (`tests/e2e/`, Playwright 1.63 fijada): corren sobre la app construida en modo prototipo (sin Supabase), en escritorio y móvil. Cubren páginas públicas sin desbordes, precios, `robots`/`sitemap`/imagen al compartir y la reserva de un invitado de principio a fin (la hora reservada deja de ofrecerse). Localmente, con Chromium ya instalado: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e`. En CI se instala con `playwright install --with-deps chromium`. Lo que depende de Supabase real (RLS, doble reserva, derechos de datos) lo cubre `pnpm test:db`.
