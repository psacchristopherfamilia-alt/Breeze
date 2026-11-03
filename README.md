# Breeze

Plataforma de reservas multi-salón para **barberías, salones y estética/spa** en **Turks and Caicos**.
Zona horaria `America/Grand_Turk` · USD · Inglés y español.

## Partes
1. **App del cliente** (mobile-first): buscar salones por nombre, tipo y zona; elegir servicios y profesional; reservar en huecos reales; cancelar o reprogramar. Admite invitados (turistas) sin cuenta.
2. **Panel del salón**: profesionales con color único, servicios, duraciones, buffers, precios, horarios, días libres, citas por teléfono, agenda filtrada por profesional/color. Multi-sucursal.
3. **Breeze Live** (`/live/[salonId]`): pantalla de kiosco en tiempo real con la agenda del día y alertas de citas nuevas con el color del profesional.

## Stack
Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Auth, Postgres, Realtime, Edge Functions, pg_cron).

## Estado
**Fase 3 — prototipo con datos falsos** (sin Supabase todavía). Plan en [`docs/PLAN.md`](docs/PLAN.md).

### Ver el prototipo
```bash
pnpm install
pnpm dev            # abre http://localhost:3000
```

| Ruta | Qué es |
|---|---|
| `/` | Índice del prototipo |
| `/explore` | App del cliente: búsqueda por nombre, tipo y zona |
| `/s/coral-salon` | Reserva: servicios → profesional → día y hora → datos → confirmación |
| `/me` | Mis citas: cancelar / reprogramar (respeta la ventana de cancelación) |
| `/dashboard` | Panel del salón: agenda por columnas y colores, filtro, citas por teléfono |
| `/dashboard/professionals` | Profesionales con color único |
| `/live/coral-salon` | Breeze Live (kiosco) |

Demo en tiempo real: abre `/live/coral-salon` en una pestaña y reserva en Coral Salon desde otra; la alerta aparece al instante.
Los datos son falsos y se guardan en el navegador (`localStorage` + `BroadcastChannel`).

## Comandos
```bash
pnpm install          # instalar dependencias
pnpm dev              # servidor de desarrollo (http://localhost:3000)
pnpm typecheck        # comprobación de tipos
pnpm test             # tests unitarios (Vitest)
pnpm test:db          # doble reserva + RLS + integridad contra Postgres real (necesita supabase start)
pnpm exec supabase start     # Supabase local (Docker)
pnpm exec supabase db reset  # aplicar migraciones
pnpm db:types                # regenerar src/types/database.ts (sin Docker)
```

## Configuración
Copia `.env.example` a `.env.local` y rellena los valores. **Nunca** subas secretos al repositorio.

- **Sin** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` → **modo prototipo**: datos falsos y sin login.
- **Con** ellas → login real; `/dashboard`, `/me`, `/pro` y `/onboarding` exigen sesión (`src/proxy.ts`).

### Acceso (módulo 2)
| Ruta | Qué es |
|---|---|
| `/login` | Entrar (correo + contraseña) |
| `/signup` | Cuenta de cliente (nombre, correo, móvil, contraseña) |
| `/signup/salon` | Alta de negocio: dueño + organización + 1.ª sucursal + 14 días de prueba |
| `/check-email` | Aviso de confirmación de correo |
| `/auth/callback` | Enlace del correo; termina el alta del salón si quedó pendiente |
| `/invite/[token]` | Aceptar invitación de profesional/admin |

## Reglas no negociables
- Sin doble reserva: exclusion constraint con rangos de tiempo en Postgres.
- Disponibilidad = duración del servicio + horario del profesional + citas existentes. UTC en BD, `America/Grand_Turk` en pantalla.
- Pantallas públicas: solo nombre + inicial del apellido. Nunca teléfono ni correo.
- El color de un profesional siempre va con su nombre o iniciales.
- Aislamiento entre salones con Row Level Security.
- Recordatorios automáticos firmados como Breeze (correo; SMS/WhatsApp preparados).
