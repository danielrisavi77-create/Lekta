-- 0091_consent_server_time.sql
--
-- Vrijeme privole postaje SERVERSKO (audit A26-08 / LEG-06).
--
-- Do sada je `consented_at` dolazio od klijenta: create-checkout je uzimao `consent.timestamp`
-- iz tijela zahtjeva i, ako se dao parsirati, spremao ga kao vrijeme privole. Izmijenjen klijent
-- mogao je poslati datum u proslosti ili buducnosti, pa zapis nije bio dokaz VREMENA radnje.
--
-- Od sada `consented_at` upisuje server, a klijentova tvrdnja se cuva odvojeno u
-- `client_claimed_at`. Razlika izmedju ta dva stupca je korisna dijagnostika (razilazenje sata,
-- pokusaj krivotvorenja), ali samo serverski stupac ima dokaznu vrijednost.
--
-- Postojeci redci: `client_claimed_at` ostaje null. NE prepisujemo ih kopiranjem iz
-- `consented_at`, jer za njih doista ne znamo je li vrijeme doslo od klijenta ili servera, a
-- lazna preciznost u pravnom zapisu gora je od priznatog neznanja.

alter table public.checkout_consents
  add column if not exists client_claimed_at timestamptz;

comment on column public.checkout_consents.client_claimed_at is
  'Vrijeme privole KAKO GA JE PRIJAVIO KLIJENT. Nije dokaz; dokaz je consented_at, koji upisuje server. Null za zapise otprije 2026-08-17.';

comment on column public.checkout_consents.consented_at is
  'Serverski utvrdjeno vrijeme privole (od 2026-08-17). Za zapise prije toga vrijednost je mogla doci od klijenta.';

comment on column public.checkout_consents.consent_text is
  'Kanonski tekst privole za terms_version, upisan sa servera iz src/legal/consent-text.ts. Od 2026-08-17 se NE preuzima od klijenta.';
