# Breeze

Plataforma de reservas multi-salón para salones, spas, peluquerías y barberías en **Turks and Caicos**.
Zona horaria `America/Grand_Turk` · USD · Inglés y español.

## Partes
1. **App del cliente** (mobile-first): buscar salones por nombre, tipo y zona; elegir servicios y profesional; reservar en huecos reales; cancelar o reprogramar. Admite invitados (turistas) sin cuenta.
2. **Panel del salón**: profesionales con color único, servicios, duraciones, buffers, precios, horarios, días libres, citas por teléfono, agenda filtrada por profesional/color. Multi-sucursal.
3. **Breeze Live** (`/live/[salonId]`): pantalla de kiosco en tiempo real con la agenda del día y alertas de citas nuevas con el color del profesional.

## Stack
Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Auth, Postgres, Realtime, Edge Functions, pg_cron).

## Estado
Fase 2 — plan en [`docs/PLAN.md`](docs/PLAN.md). Aún no hay código de aplicación.

## Comandos (se activan en la Fase 3/4)
```bash
pnpm install          # instalar dependencias
pnpm dev              # servidor de desarrollo (http://localhost:3000)
pnpm test             # tests unitarios (Vitest)
pnpm test:db          # tests de base de datos (Supabase local)
pnpm test:e2e         # tests end-to-end (Playwright)
supabase start        # Supabase local
supabase db reset     # aplicar migraciones + seed
```

## Configuración
Copia `.env.example` a `.env.local` y rellena los valores. **Nunca** subas secretos al repositorio.

## Reglas no negociables
- Sin doble reserva: exclusion constraint con rangos de tiempo en Postgres.
- Disponibilidad = duración del servicio + horario del profesional + citas existentes. UTC en BD, `America/Grand_Turk` en pantalla.
- Pantallas públicas: solo nombre + inicial del apellido. Nunca teléfono ni correo.
- El color de un profesional siempre va con su nombre o iniciales.
- Aislamiento entre salones con Row Level Security.
- Recordatorios automáticos firmados como Breeze (correo; SMS/WhatsApp preparados).
