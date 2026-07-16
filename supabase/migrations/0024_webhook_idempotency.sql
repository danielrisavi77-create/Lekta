-- 0024_webhook_idempotency.sql
-- AUD-28: webhook-mor post-entitlement bonusi (kupon + referral atribucija) nisu potpuno
-- retry-safe. Entitlement je vec idempotentan preko unique(provider, order_id) (0001), ali
-- kupon (coupon_grants) i referral kredit (referrals) nemaju jedinstveni kljuc, pa retry
-- webhooka (LS ponovno salje isti order) moze duplirati kupon ili stvoriti drugi referral
-- kredit / drugu internu nagradu za isti order.
--
-- Ovdje se dodaju UNIQUE kljucevi po kojima Edge moze raditi ON CONFLICT DO NOTHING (odnosno
-- supabase-js .upsert(..., { onConflict, ignoreDuplicates: true })), pa ponovljeni webhook
-- za isti order nista ne duplicira. Odabir kljuceva (re-verificirano protiv SVIH insert sitea
-- u supabase/functions/**):
--
--   coupon_grants: (source_order_id, reason). Webhook radi najvise jedan pass_bonus i najvise
--     jedan referral_welcome kupon po orderu (oba sa source_order_id = ev.orderId). Kljuc
--     (source_order_id, reason) dopusta oba (razliciti reason) a blokira duplikat istog. NE
--     koristi se 'code' jer je referral_welcome kod WELCOME-{referralCode} izveden iz
--     preporuciteljeva koda, pa bi dva RAZLICITA ordera istog preporucitelja lazno kolidirala.
--
--   referrals: (converted_order_id). attributeReferral (jedini upisivac s postavljenim
--     converted_order_id) stvara najvise jedan referral kredit po orderu. Puni (ne parcijalni)
--     unique: NULL su distinct pa 0005 'pending' redovi (converted_order_id null) ostaju
--     nedirnuti; puni indeks (ne partial) je nuzan da PostgREST ON CONFLICT inferencija po
--     stupcu radi (partial index bi trazio podudaran WHERE koji upsert ne salje).
--
-- Set migracija je NEDEPLOYAN i tablice su prazne na from-scratch deployu, pa dodavanje
-- constraintova ne moze udariti u postojece duplikate. Idempotentno preko pg_constraint guarda
-- (ADD CONSTRAINT nema IF NOT EXISTS). Imenovani constraint (ne goli unique index) daje i
-- ON CONFLICT (stupci) i ON CONFLICT ON CONSTRAINT <ime> put za Edge.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'coupon_grants_order_reason_key'
  ) then
    alter table coupon_grants
      add constraint coupon_grants_order_reason_key unique (source_order_id, reason);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'referrals_converted_order_key'
  ) then
    alter table referrals
      add constraint referrals_converted_order_key unique (converted_order_id);
  end if;
end $$;

comment on constraint coupon_grants_order_reason_key on coupon_grants is
  'Idempotencija webhook-mor kupona (AUD-28): jedan kupon po (source_order_id, reason). Edge: ON CONFLICT (source_order_id, reason) DO NOTHING.';
comment on constraint referrals_converted_order_key on referrals is
  'Idempotencija webhook-mor referral kredita (AUD-28): jedan referral po converted_order_id. Edge: ON CONFLICT (converted_order_id) DO NOTHING. NULL (0005 pending) ostaje distinct.';
