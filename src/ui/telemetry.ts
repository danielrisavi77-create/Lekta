/**
 * TELEMETRIJA, izdvojena iz `app.ts` (T16, korak B5).
 *
 * ZASTO BAS OVA, a ne najveci blok. Izbor je vodjen rizikom sudara, ne velicinom: `trackEvent` ima
 * 49 pozivnih mjesta, a tvornica uz destrukturiranje POD ISTIM IMENOM ostavlja svih 49 bajt
 * identicnima. Diff u `app.ts` je zato brisanje dvaju tijela plus jedan `import` i jedan `const`,
 * sto je najmanji moguci otisak u datoteci koju istovremeno mijenja vise sesija.
 *
 * ZASTO GETTER, a ne vrijednost. `productionConfig` je u `app.ts` `let` i mijenja se TRI puta u
 * izvodjenju (inicijalizacija, `saveSetupConfig`, `resetSetupConfig`). Tvornica koja bi konfiguraciju
 * uhvatila pri stvaranju zauvijek bi slala na stari endpoint, i to tiho: `trackEvent` gresku guta i
 * vraca `false`, pa se kvar ne bi vidio ni u konzoli. Zato se cita kroz `deps.config()` pri svakom
 * pozivu.
 *
 * PRIVOLA SE CITA JEDNAKO LIJENO, jer je korisnik moze promijeniti u bilo kojem trenutku.
 */
import { APP_VERSION } from '../config/app-version';

export interface TelemetryDeps {
  /** Ziva konfiguracija; NIKAD uhvacena vrijednost. */
  config: () => { analyticsEndpoint?: string } | null | undefined;
  /** Stanje privole za analitiku, procitano u trenutku poziva. */
  consent: () => unknown;
}

/**
 * Dopusteni kljucevi dogadaja. Popis je BIJELA lista, ne crna: sve neimenovano ispada, pa se
 * sadrzaj dokumenta ne moze omaskom naci u telemetriji ni kad ga netko doda u poziv.
 */
const DOPUSTENI_KLJUCEVI = [
  'event', 'package', 'profileId', 'workType', 'scoreBand', 'provider', 'source', 'total', 'found',
  'missing', 'flagged', 'checked', 'profileStatus', 'pick', 'sizeBucket', 'category', 'issueCount',
  'kind', 'manual', 'count', 'score', 'demo', 'method', 'product', 'ruleId', 'changes', 'stored', 'ms',
];

/**
 * TOK PROIZVODA (plan T14): dogadjaji koji nastaju na STVARNIM promjenama stanja, ne na klikovima. Postojeca imena su
 * zadrzana gdje vec pokrivaju korak (dva duplikata bi mjerila isto dvaput); popunjene su samo praznine.
 *
 *   document_ready         = `file_selected`     dokument prihvacen na intakeu (postojeci)
 *   profile_confirmed      = `profile_completed`  korisnik potvrdio profil (postojeci)
 *   analysis_completed                            analiza zavrsila (postojeci)
 *   repair_plan_opened                            plan ispravaka otvoren na korektorskom stolu (novo)
 *   repair_completed                              popravak IZVRSEN I PROVJEREN ponovnom analizom (novo; ne klik na gumb)
 *   repair_download_started                       korisnik pokrenuo preuzimanje popravljene kopije (novo; "poceto",
 *                                                 preglednik ne potvrdjuje spremanje na disk)
 *   revision_compared                             usporedjene dvije verzije istog rada (novo, T12)
 *
 * Atributi ostaju unutar `DOPUSTENI_KLJUCEVI` (profil, vrsta rada, kategorija, brojevi, trajanje); nikad naslov,
 * autor, naziv datoteke, komentar ni isjecak rada. `tests/product-journey-telemetry.test.ts` tvrdi da se svaki
 * dogadjaj iz ovog popisa stvarno emitira u `src/` i da sanitizacija odbacuje sve izvan bijele liste.
 */
export const PRODUCT_JOURNEY_EVENTS = {
  document_ready: 'file_selected',
  profile_confirmed: 'profile_completed',
  analysis_completed: 'analysis_completed',
  repair_plan_opened: 'repair_plan_opened',
  repair_completed: 'repair_completed',
  repair_download_started: 'repair_download_started',
  revision_compared: 'revision_compared',
} as const;

export function createTelemetry(deps: TelemetryDeps) {
  function sanitizeEventData(data: any): Record<string, unknown> {
    const allowed: any = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (DOPUSTENI_KLJUCEVI.includes(k) && ['string', 'number', 'boolean'].includes(typeof v)) allowed[k] = v;
    }
    return allowed;
  }

  async function trackEvent(event: any, data: any = {}): Promise<boolean> {
    const config = deps.config();
    if (!config?.analyticsEndpoint || deps.consent() !== 'granted') return false;
    try {
      await fetch(config.analyticsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          version: APP_VERSION,
          path: location.pathname || '/',
          timestamp: new Date().toISOString(),
          ...sanitizeEventData(data),
        }),
        keepalive: true,
      });
      return true;
    } catch {
      return false;
    }
  }

  return { trackEvent, sanitizeEventData };
}
