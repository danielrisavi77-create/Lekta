-- Lekta monetizacija: atomska promjena cijene (MONETIZATION_PLAN.md sekcije 11, 14 kriterij 12).
-- Svaka promjena cijene mora upisati products I pricing_changelog u ISTOJ transakciji, inace
-- nema atribucije cjenovnih testova. Rucni UPDATE products bez changeloga je prekrsaj procesa.
-- Admin poziva: select set_product_price('slot_diplomski', 8.99, 'test -1 EUR, kohorta 2026-07');

create or replace function set_product_price(
  p_id text,
  p_new_price numeric,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old numeric;
begin
  select price_eur into v_old from products where id = p_id for update;
  if not found then raise exception 'product_not_found'; end if;

  update products set price_eur = p_new_price where id = p_id;

  insert into pricing_changelog (product_id, change_type, old_value, new_value, note)
  values (p_id, 'price', v_old::text, p_new_price::text, p_note);
end;
$$;

revoke all on function set_product_price(text, numeric, text) from public, anon, authenticated;
