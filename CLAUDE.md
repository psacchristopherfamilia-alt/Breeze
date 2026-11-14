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
- **Solo correo por ahora**: el formulario de invitado pide correo («recomendado», con aviso de que sin él no hay recordatorios) y oculta la casilla de WhatsApp salvo que `NEXT_PUBLIC_WHATSAPP_REMINDERS=on` (`src/lib/notifications/channels.ts`). Un mensaje sin canal posible (`no_channel_available`) queda `skipped` sin reintentos. Remitente `EMAIL_FROM="Breeze <citas@saasifytci.com>"`, dirección pública `NEXT_PUBLIC_APP_URL=https://www.saasifytci.com`.
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
- **Forma de pago por profesional**: columnas `professionals.accepts_cash/accepts_card/accepts_transfer/payment_note` (al menos un método; la transferencia exige datos). Se editan en el diálogo del profesional del panel (`saveProfessional`) y `anon` las lee (GRANT por columnas). El cliente las ve en `components/booking/PaymentInfo.tsx` (paso final de la reserva y pantalla de confirmación). Breeze no cobra: solo informa. Breeze Live **no** las muestra (`get_live_board` elige sus columnas; hay test).
- **Administrador**: `isPlatformAdmin()` / `homeFor()` en `src/lib/auth/server.ts`. El administrador sin negocio entra directo a `/admin`; con negocio, ve el enlace "Administración" en el panel (`LiveShell`, prop `isAdmin`). Nadie más lo ve; `/admin` da 404 a los demás. La marca solo se pone/quita por SQL. Debe haber una sola cuenta administradora.
- **Pulido de experiencia**: páginas de error con la marca (`components/ErrorPage.tsx`; `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx` y `app/s/[slug]/not-found.tsx` = "salón no disponible por el momento", que cubre sin publicar, suspendido o inexistente). Confirmación de reserva con calendario (.ics / Google), "Cómo llegar" (enlace de Google Maps) y "Llamar" (`lib/booking/calendar.ts`, `ConfirmActions`).
- **Asistente de arranque** (sugerido, se puede saltar): `/dashboard/setup` (`SetupWizard`, acción `completeSetup`). 4 pasos: servicios sugeridos → primer profesional (con su forma de cobro) → horario (por defecto lun–sáb 9–6, el mismo para todos; cada profesional lo cambia después) → publicar o guardar. Solo crea lo que falta, así que repetirlo no duplica. Se ofrece en la lista de pendientes mientras no haya servicios ni profesionales.
- **Accesibilidad**: `tests/e2e/a11y.spec.ts` (axe, WCAG 2.1 A/AA, falla con "serious"/"critical"). El texto secundario usa `text-ink/70` como mínimo (menos opacidad no llega a contraste 4.5:1); no uses `text-ink/60` o menos para texto legible.
- **Ficha del cliente** (`/dashboard/clients`, `/dashboard/clients/[id]`): lista con búsqueda (RPC `staff_customers`, SECURITY INVOKER: la RLS decide qué ve cada persona; dueño/admin todos los de la organización, el profesional solo los que atiende) y ficha con contacto/permisos de mensajes (los edita solo dueño/admin, `saveCustomer`), notas privadas (tabla `customer_notes`: las ven dueño/admin y el profesional que atiende al cliente, nunca el cliente; el autor y su nombre los pone un trigger; no se editan; solo su autor las borra) e historial. Desde la cita de la agenda hay un enlace a la ficha.
- **Avisos al equipo** (campana del panel + push en el teléfono): tabla `staff_alerts` (un aviso por persona; solo datos públicos: "Juan P.", servicio, profesional, hora). Un trigger DIFERIDO en `appointments` (`private.alert_on_appointment`, al terminar la transacción para que la reserva ya tenga todos sus servicios) crea avisos de `booked` / `rescheduled` / `cancelled` para dueño y administradores de la sucursal y el profesional de esa cita, nunca para quien hizo el cambio; una reserva con varios servicios = un aviso. Cada aviso se emite por Realtime al canal privado `alerts:<user_id>` (la política de `realtime.messages` solo deja leerlo a su dueño) y, si esa persona tiene teléfonos en `push_subscriptions`, `private.alert_dispatch_push` llama por `pg_net` a `/api/push/send` (mismos secretos de Vault que el worker: `breeze_app_url`, `breeze_cron_secret`); si falla, nunca bloquea una reserva. El servidor envía con `web-push` (VAPID: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) y borra las suscripciones que devuelven 404/410. UI: `AlertsBell` (contador, lista, sonido apagable en `localStorage`, respaldo por sondeo cada 60 s) y `PushSetup` (en iPhone exige añadir Breeze a la pantalla de inicio). Service worker: `public/sw.js`. En los tests de BD los avisos se generan con `set constraints all immediate` (la transacción de test nunca confirma).

## Reseñas (módulo 10)
- Tabla `reviews` (una por reserva, `unique(booking_group_id)`) **sin ningún permiso directo**: todo va por RPC. Cliente: `get_review_request(ref)`, `submit_review(ref, rating, comment)` (anon o authenticated), `my_review_states()`. Público: `get_salon_reviews(salon, limit, offset)` (solo visibles y reportadas, "Juan P."; vacío si la cuenta se borró). Panel: `staff_reviews` (dueño/admin ven todas; el profesional solo las de sus citas), `reply_review`, `report_review` (solo dueño/admin). Plataforma: `platform_reported_reviews`, `platform_moderate_review('hide'|'keep')`.
- `ref` = el token del invitado de `/b/[token]` (64 hex, el mismo) o, con sesión, el id de la reserva propia. Página `/r/[ref]` (no se indexa). La cita cuenta si está «completada» o si estaba reservada y terminó hace más de 1 hora (no todos los salones marcan sus citas); ventana de 14 días (`private.review_window`). Volver a enviar edita la reseña (no repite el aviso); una oculta ya no se puede editar. 1 o 2 estrellas exigen comentario (máx. 500).
- Estados: `visible` → `reported` (el salón reporta con un motivo; sigue visible) → `hidden` (solo el administrador; sale de la página y del promedio pero no se borra). `audit_log` registra `review.reported`, `review.hide`, `review.keep`. El salón nunca oculta sus propias reseñas.
- Promedio: `salons.rating_avg/rating_count` (trigger, cuentan visible+reportada; `anon` los lee). **Solo se muestra desde 3 reseñas** (`MIN_REVIEWS_TO_SHOW` en `src/lib/reviews.ts`); antes sale «Nuevo». Lo mismo por profesional (`get_salon_reviews.pros`).
- Aviso al equipo: `staff_alerts.kind = 'review'` (+ `rating`), a dueño/admins de la sucursal y al profesional de la cita; abre `/dashboard/reviews` (`alertText().href`).
- UI: `ReviewForm` (`/r/[ref]`), `ReviewsList` (página del salón, al final de «servicios»), botón en `BookingCard` (`/b/[token]` y `/me`), `ReviewsPanel` (`/dashboard/reviews`), `ReportedReviews` (cola en `/admin`). Breeze Live no muestra reseñas. Pendiente: mandar el enlace de reseña por mensaje cuando haya proveedores reales (hoy solo aparece en la cita).

## Agenda: semana, equipo y mover citas (módulo 11)
- Vistas de `components/agenda/AgendaView.tsx` (un solo componente con dos adaptadores, `MockAgenda` y `LiveAgenda`): **día** (una columna por profesional), **semana** (los 7 días de UN profesional; las semanas empiezan en lunes) y **equipo** (tabla profesional × día con citas, % ocupado y horas libres). URL: `/dashboard?date=YYYY-MM-DD&view=day|week|team&pro=<id>`; la semana y el equipo cargan 7 días con `loadAgendaRange`.
- **Mover** una cita (hora, día, profesional y duración): arrastrar (ratón; en el teléfono, mantener pulsado 0,4 s), estirar el borde de abajo, o «Mover…» en la ficha de la cita (hoja `MoveSheet`). Sin librerías: eventos del navegador. Siempre hay confirmación, casilla «Avisar al cliente» (marcada) y «Deshacer» 10 s (repite el movimiento inverso con el mismo aviso).
- RPC `staff_move_appointment(cita, profesional, inicio, duración, avisar)`: solo citas reservadas que no empezaron y hacia el futuro; dueño/admin todo, el profesional solo hora/día/duración de SUS citas (`forbidden` si cambia de profesional). El profesional nuevo debe ofrecer el servicio y la cita debe caber en su horario sin días libres ni cierres; los choques (profesional o cliente) los frena la exclusion constraint (`23P01` → `slot_taken`). Reserva con varios servicios: si no cambian ni profesional ni duración se mueve ENTERA con `private.reschedule_group` (conserva la cadena); si cambia alguno, solo esa cita. Alargar/acortar no cambia precio ni el tiempo entre servicios.
- Aviso al cliente: el trigger `appointments_enqueue_notifications` ahora también salta al cambiar de profesional; `breeze.skip_move_notice='on'` (lo pone la RPC con `avisar=false`, solo dentro de la transacción) omite el mensaje de cambio. Los recordatorios SÍ se recalculan siempre.
- `src/lib/agenda/move.ts` (`checkMove`, mismas reglas que la RPC para pintar verde/rojo al arrastrar; la BD siempre manda) y `occupancy.ts` (`weekDays`, `occupancyOfDay`, `occupancyStep`) con pruebas unitarias. En el prototipo, `moveAppointment` del almacén simulado.
- Accesibilidad: el texto de las citas va siempre en tinta (el color solo en el borde y el avatar), la región con scroll es enfocable y el diálogo tiene `role="dialog"`. `tests/e2e/agenda.spec.ts` cubre vistas, «Mover…», deshacer, estirar con el ratón y axe en las tres vistas.

## Informes del dueño (módulo 12)
- Página `/dashboard/reports?days=7|30` (`ReportsView`, vista de servidor en `app/dashboard/reports/page.tsx`; en el prototipo sale «solo con Supabase»). Una sola RPC `staff_report(salon, desde, hasta)` devuelve todo (periodo actual y el anterior de igual duración, por profesional, por servicio, horas pico, clientes). Dueño/admin de la sucursal ven todo; el profesional solo sus cifras y `lapsed = null` (sin lista de clientes); otro negocio, pantalla, extraño o visitante → `forbidden`. Rango máx. 400 días (`invalid_range`).
- Definiciones (idénticas a las del texto que ve el dueño en la pantalla): **atendida** = completada, o reservada y terminada hace más de 1 hora (no cuentan canceladas ni «no vino»); **ingresos** = precio de lista de la cita al reservar (Breeze no cobra: son estimados); **ocupación** = minutos con cita no cancelada ÷ minutos de horario (menos días libres y cierres, con aritmética de multirangos de Postgres, sin contar dos veces lo que se solapa); **cliente nuevo** = su primera visita atendida en ese salón cae en el periodo; **vuelve** = ya había venido antes; **llevan tiempo sin volver** = última visita hace más de 42 días y sin cita futura (solo nombre corto + id, nunca teléfono ni correo; se excluyen cuentas borradas). Días y horas se agrupan en la hora del salón (`salons.timezone`).
- `src/lib/panel/reports.ts`: tipos de la respuesta, `periodKeys` (últimos N días, hoy incluido), `delta` (porcentaje o puntos; sin periodo anterior no se inventa un porcentaje), `heatGrid`/`heatStep` (lunes primero, siempre ≥ 9:00–17:59, rampa de 5 escalones), `formatMoney`. Con pruebas unitarias.
- Gráficos según la guía de visualización: barras ≤ 24 px, nombre siempre junto al color del profesional (color del propio profesional; texto en tinta), una sola rampa turquesa para magnitud, leyenda, tooltip al pasar/enfocar, y «Ver datos como tabla».

## Demo pública (/demo)
- `/demo` muestra el prototipo (datos falsos en `localStorage`, `src/lib/mock/`) **aunque Supabase esté conectado**: no lee ni escribe en la base. Rutas: `/demo`, `/demo/explore`, `/demo/s/[slug]`, `/demo/me`, `/demo/dashboard`, `/demo/dashboard/professionals`, `/demo/live/[slug]`. No se indexa (`robots: noindex`).
- Los componentes compartidos usan `useAppHref()` (`src/lib/demo/useDemo.ts`): dentro de /demo llevan los enlaces del prototipo a su copia en /demo (`demoHref()`, `src/lib/demo/paths.ts`); fuera no cambian nada. Un enlace nuevo a /explore, /s, /me, /dashboard o /live en un componente del prototipo debe pasar por `appHref()`.
- `PrototypeBanner` y `ClientHeader` se comportan como en el prototipo dentro de /demo (franja «Demo», sin «Entrar»). Entrada: puerta «Probar la demo» en `/negocios`. Pruebas: `tests/e2e/demo.spec.ts`, `tests/unit/demo-paths.test.ts`.
