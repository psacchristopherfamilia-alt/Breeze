-- Cómo cobra cada profesional: efectivo, tarjeta (en el local) y/o transferencia, con sus instrucciones.
-- Breeze no procesa pagos: esto solo se muestra al cliente al reservar para que sepa cómo pagará.
alter table public.professionals
  add column accepts_cash boolean not null default true,
  add column accepts_card boolean not null default false,
  add column accepts_transfer boolean not null default false,
  add column payment_note text check (payment_note is null or char_length(payment_note) <= 400);

alter table public.professionals
  add constraint professionals_payment_method_check check (accepts_cash or accepts_card or accepts_transfer),
  add constraint professionals_transfer_details_check check (not accepts_transfer or char_length(btrim(coalesce(payment_note, ''))) > 0);

-- El público ve cómo cobra el profesional (los datos para transferir los pone él para sus clientes).
-- Las TV de Breeze Live NO los muestran: get_live_board elige sus columnas.
grant select (accepts_cash, accepts_card, accepts_transfer, payment_note) on public.professionals to anon;
