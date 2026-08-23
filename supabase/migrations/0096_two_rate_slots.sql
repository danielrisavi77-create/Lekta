-- 0096: atomsko trosenje DVA rate-limit slota odjednom (audit P1-05).
--
-- KVAR KOJI ZATVARA. source-check trosi dvije kvote: jednu po korisniku, jednu po IP-u. Dosad su
-- se uzimale dvama odvojenim pozivima `claim_ip_rate_slot`, korisnicka PRVA:
--
--     userOk = claim_ip_rate_slot('source_check_user', user.id, 40)   -- potrosen
--     if (!userOk) return 429
--     ipOk   = claim_ip_rate_slot('source_check_ip', ipHash, 120)     -- odbijen
--     if (!ipOk) return 429                                           -- korisnikov slot OSTAJE potrosen
--
-- Posljedica: korisnik iza zasicenog dijeljenog izlaza (studentski dom, knjiznica, fakultetski
-- NAT) gubi svoju dnevnu kvotu na provjeru koja NIJE izvrsena. Sto je IP zasiceniji, to brze mu
-- nestaje vlastita kvota, iako on osobno nije potrosio nista. Kvota mora mjeriti obavljen posao.
--
-- RJESENJE. Jedna funkcija, jedna transakcija: ili se uzmu oba slota ili nijedan. Kad drugi slot
-- padne, prvi se KOMPENZIRA (vrati za 1). Kompenzacija je sigurna jer je redak prvog slota od
-- trenutka naseg inserta/updatea pod row lockom do commita, pa nijedna paralelna transakcija ne
-- moze vidjeti medjustanje (+1) ni odluciti na temelju njega.
--
-- Vraca tekst, ne boolean, da pozivatelj zadrzi RAZLOG odbijanja i time tocnu poruku korisniku:
--   'ok'        oba slota rezervirana
--   'denied_a'  prvi cap dosegnut (nista nije potroseno)
--   'denied_b'  drugi cap dosegnut (prvi je vracen)
--
-- Idempotentno: `create or replace`, bez DDL-a nad tablicom (ip_rate_limits postoji od 0022).

drop function if exists claim_two_rate_slots(text, text, integer, text, text, integer);

create or replace function claim_two_rate_slots(
  p_scope_a text,
  p_hash_a text,
  p_cap_a integer,
  p_scope_b text,
  p_hash_b text,
  p_cap_b integer
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
  v_a_consumed boolean := false;
  v_day date := (now() at time zone 'utc')::date;
begin
  -- Degenerativan cap nikad ne dopusta; provjeravamo prije ikakvog trosenja.
  if p_cap_a <= 0 then return 'denied_a'; end if;
  if p_cap_b <= 0 then return 'denied_b'; end if;

  -- ---- slot A ----
  -- Bez identiteta nema per-identitet kvote, pa se ne blokira i NISTA se ne trosi (isti ugovor
  -- kao claim_ip_rate_slot). Time i kompenzacija ostaje tocna: nema sto vratiti.
  if p_hash_a is not null and p_hash_a <> '' then
    insert into ip_rate_limits (scope, ip_hash, day, count, updated_at)
    values (p_scope_a, p_hash_a, v_day, 1, now())
    on conflict (scope, ip_hash, day) do update
       set count = ip_rate_limits.count + 1,
           updated_at = now()
     where ip_rate_limits.count < p_cap_a
    returning true into v_ok;

    if not coalesce(v_ok, false) then
      return 'denied_a';
    end if;
    v_a_consumed := true;
  end if;

  -- ---- slot B ----
  v_ok := null;
  if p_hash_b is not null and p_hash_b <> '' then
    insert into ip_rate_limits (scope, ip_hash, day, count, updated_at)
    values (p_scope_b, p_hash_b, v_day, 1, now())
    on conflict (scope, ip_hash, day) do update
       set count = ip_rate_limits.count + 1,
           updated_at = now()
     where ip_rate_limits.count < p_cap_b
    returning true into v_ok;

    if not coalesce(v_ok, false) then
      -- KOMPENZACIJA: posao se nece izvrsiti, pa slot A ne smije ostati potrosen.
      if v_a_consumed then
        update ip_rate_limits
           set count = greatest(count - 1, 0),
               updated_at = now()
         where scope = p_scope_a and ip_hash = p_hash_a and day = v_day;
      end if;
      return 'denied_b';
    end if;
  end if;

  return 'ok';
end;
$$;

-- Isti obrazac kao claim_ip_rate_slot u 0022: funkcija je dostupna samo service_roleu iz Edgea
-- (revoke dira samo public/anon/authenticated).
revoke all on function claim_two_rate_slots(text, text, integer, text, text, integer) from public, anon, authenticated;

comment on function claim_two_rate_slots(text, text, integer, text, text, integer) is
  'Atomski uzima dva rate-limit slota ili nijedan (audit P1-05). Vraca ok | denied_a | denied_b.';
