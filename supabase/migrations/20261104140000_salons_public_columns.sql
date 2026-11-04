-- Visitantes sin cuenta: solo columnas públicas de `salons`.
-- Se quitan los ajustes internos (organization_id, política de no-show, recordatorios).
-- Las filas siguen limitadas por la política «salón: publicados son públicos».
revoke select on public.salons from anon;
grant select (
  id, name, slug, business_types, zone, address, phone, timezone, currency,
  slot_step_min, min_lead_time_min, max_advance_days, cancellation_window_hours,
  is_published, search, created_at, updated_at
) on public.salons to anon;
