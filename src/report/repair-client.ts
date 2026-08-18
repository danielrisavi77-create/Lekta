/**
 * Klijentska strana SERVER-SIDE repaira (WS-3). Placeni popravak vise ne trosi klijentski
 * src/repair/* kao put isporuke: dokument se uploada (multipart), server iza entitlementa
 * pokrene isti engine i vrati ispravljen .docx (base64). Klijent NIKAD ne odlucuje o pravu
 * pristupa ni o vrsti rada, samo prikazuje ishod.
 *
 * Ciste funkcije uz injektabilan `fetch` (testabilno bez mreze), isti obrazac kao report-client
 * i checkout. Doslovni tekst rada NE ide u `meta` (samo otisak-struktura + brojevi/enumi);
 * sam dokument putuje kao binarni 'file' dio, na plin placeni tok, uz izricitu privolu.
 */

import { isReportWorkType, type ReportWorkType } from './pricing';
import { TERMS_VERSION } from '../legal/terms-version';
import { parseSourceCheck, type RepairSourceCheck } from './source-check-parse';
export { REPAIR_MAX_REFERENCES } from './repair-contract';
import { REPAIR_MAX_REFERENCES } from './repair-contract';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface RepairClientConfig {
  /** URL repair-docx Edge Functiona; prazno znaci nije konfigurirano. */
  endpoint: string;
}

/** Sanitizirani signali vrste rada (za WS-2/WS-5 enforcement): SAMO broj rijeci + enum marker. */
export interface RepairSignals {
  words: number | null;
  titleMarker?: string | null;
}

/** Jedan zahtjev za popravak: koji fixer, koje pravilo, s kojim parametrima. */
export interface RepairFixerRequest {
  fixerId: string;
  ruleId: string;
  params: Record<string, unknown>;
}

/**
 * Bibliografski metapodatak jedne reference, za provjeru postojanja u hrvatskom korpusu (K3/K4).
 * SAMO naslov i godina: to je sve sto korpus treba, pa se ne salje nista suvisno. Sam dokument je
 * ionako u istom zahtjevu, pa ovo nije novo otkrivanje sadrzaja nego uz njega izdvojen podatak.
 */
export interface RepairReference {
  title: string;
  year: number | null;
}

/**
 * Gornja granica broja poslanih referenci. Server ima svoju (CORPUS_MAX_REFS), ali klijent NE smije
 * ovisiti o tome da je serverska granica ista: bez ove kape golemi popis literature napuhne meta dio.
 */

/**
 * Ishod provjere izvora u korpusu. Tip i njegov obrambeni parser sada zive u source-check-parse,
 * jer isti oblik dolazi i iz zasebne source-check funkcije (usporedni put); ovdje se re-exportaju
 * da pozivatelji repair-clienta ostanu nepromijenjeni.
 */
export type { RepairSourceCheck } from './source-check-parse';

/**
 * Meta uz upload (JSON dio multiparta). Bez doslovnog teksta rada.
 *
 * `parsedStructure` (naslov, autor, naslovi poglavlja) UKLONJEN 2026-08-17 (audit DOCX-01/02).
 * Slao se na svaki popravak, a server ga je koristio SAMO kao presence-check: otisak dokumenta
 * racuna se iz stvarnih bajtova uploadanog zipa (RE-18), pa polje nije imalo nikakvu funkciju.
 * Naslovi poglavlja su doslovan tekst rada, dakle jedini dio popravka koji je nosio sadrzaj bez
 * ijednog razloga. Uklanjanjem nestaje i privacy rizik i kontradikcija s marketinskim copyjem.
 *
 * Put punog izvjestaja (`generate-report`) i dalje ga salje i ondje JEST potreban: ondje se
 * otisak racuna IZ njega (`computeFingerprint(body.parsedStructure)`), ne iz datoteke.
 */
export interface RepairMeta {
  workType: ReportWorkType;
  signals: RepairSignals;
  requests: RepairFixerRequest[];
  profileStatus?: string | null;
  profileRef?: string | null;
  fileName?: string | null;
  /** Korisnik je svjesno potvrdio kupnju/popravak nizeg tiera (preskace tier_mismatch). */
  confirmedMismatch?: boolean;
  /** WS-6.3: verzija uvjeta/privatnosti na koju je korisnik pristao pri uploadu (server je trajno biljezi). */
  consentVersion: string;
  /** K4: naslovi literature za provjeru postojanja u korpusu. Izostane kad ih nema. */
  references?: RepairReference[];
  /**
   * Klijent sam zove source-check USPOREDNO, pa server istu provjeru NE smije odraditi jos jednom
   * (dvostruk trosak baze bez ijedne koristi) niti drzati odgovor dok ona traje.
   *
   * Zastavica postoji zbog redoslijeda deploya: server se objavljuje prije klijenta, pa stariji
   * klijent (bez zastavice) mora i dalje dobiti sourceCheck u odgovoru popravka. Kad svi klijenti
   * budu novi, grana na serveru moze nestati.
   */
  sourceCheckSeparate?: boolean;
}

export interface RepairChange { ruleId: string; beforeLabel: string; afterLabel: string }

export type RepairOutcome =
  // storagePending: pohrana ("Moji popravci") se dovrsava u pozadini nakon odgovora, pa jobId JEST
  // dodijeljen, ali posao jos ne mora biti vidljiv. Sucelje tada ne smije tvrditi da je spremljeno.
  | { kind: 'ok'; docxBytes: Uint8Array; fileName: string; changelog: RepairChange[]; skipped: string[]; unknownFixers: string[]; slotId?: string; jobId?: string | null; storagePending: boolean; sourceCheck: RepairSourceCheck | null }
  | { kind: 'tier_mismatch'; suggestedWorkType: string }
  | { kind: 'paywall'; workType: ReportWorkType }
  // RE-33: reason razlikuje placeni dnevni strop od besplatne kvote (po korisniku ili po IP-u),
  // da poruka ne tvrdi "besplatnih" i kad je posrijedi placeni mod ili dijeljeni IP koji korisnik
  // osobno nije potrosio. Odsutan (stari server bez K-oznake) -> generic fallback tekst.
  | { kind: 'rate_limited'; reason?: 'free_user' | 'free_ip' | 'paid_daily' }
  | { kind: 'unauthorized' }
  | { kind: 'too_large' }
  | { kind: 'no_live_fixers' }
  /** Popravak NIJE isporucen jer bi izlazni paket bio neispravan (vrata integriteta u
   *  applyFixers). Izvorni dokument je netaknut i nista nije naplaceno. Mora se razlikovati od
   *  'ok' s praznim changelogom ("nema se sto popraviti"), inace UI tvrdi neistinu. */
  | { kind: 'integrity_failed'; part: string; problem: string; preexisting: boolean }
  | { kind: 'invalid_docx' }
  | { kind: 'error'; status?: number; message: string };

/** base64 -> Uint8Array (cisto, bez Node Buffera; `atob` je globalan u pregledniku/Deno/vitest). */
import {
  decodeRepairFrame,
  REPAIR_BINARY_CONTENT_TYPE,
  REPAIR_BINARY_REQUEST_HEADER,
  REPAIR_BINARY_REQUEST_VALUE,
} from './repair-framing';

export function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Sastavi sanitizirani meta objekt. `signals.words` je profilni officialWords (ili sirovi broj
 * rijeci), `titleMarker` je detektirani naslovnicki marker. Nikad ne ukljucuje doslovni tekst.
 */
export function buildRepairMeta(input: {
  workType: string;
  requests: RepairFixerRequest[];
  words?: number | null;
  titleMarker?: string | null;
  profileStatus?: string | null;
  profileRef?: string | null;
  fileName?: string | null;
  confirmedMismatch?: boolean;
  references?: RepairReference[] | null;
  /** Pozivatelj sam zove source-check usporedno; server tada preskace provjeru izvora. */
  sourceCheckSeparate?: boolean;
}): RepairMeta {
  const workType: ReportWorkType = isReportWorkType(input.workType) ? input.workType : 'zavrsni';
  const meta: RepairMeta = {
    workType,
    signals: { words: typeof input.words === 'number' ? input.words : null, titleMarker: input.titleMarker ?? null },
    requests: input.requests,
    // Upload se u app.ts dogadja tek nakon izricite privole (consent checkbox), pa meta uvijek
    // nosi verziju uvjeta koju je korisnik u tom trenutku vidio; server je zabiljezi uz posao.
    consentVersion: TERMS_VERSION,
  };
  if (input.profileStatus != null) meta.profileStatus = input.profileStatus;
  if (input.profileRef != null) meta.profileRef = input.profileRef;
  if (input.fileName != null) meta.fileName = input.fileName;
  if (input.confirmedMismatch) meta.confirmedMismatch = true;
  if (input.sourceCheckSeparate) meta.sourceCheckSeparate = true;
  // Reference bez naslova nemaju sto traziti u korpusu (kljuc je naslov), pa ispadaju ovdje umjesto
  // da putuju na server i tamo se tiho odbace. Prazan popis se izostavlja: nema polja, nema provjere.
  // Kad provjeru vodi zaseban poziv, popis literature se uz dokument NE salje uopce: server ga tada
  // ne koristi ni za sto, a najmanji ispravan skup podataka je i najbolji.
  if (!input.sourceCheckSeparate) {
    const refs = (input.references || [])
      .filter((r) => r && typeof r.title === 'string' && r.title.trim().length > 0)
      .slice(0, REPAIR_MAX_REFERENCES)
      .map((r) => ({ title: r.title.trim(), year: typeof r.year === 'number' && Number.isFinite(r.year) ? r.year : null }));
    if (refs.length) meta.references = refs;
  }
  return meta;
}

/**
 * Uploadaj dokument + meta na repair-docx i mapiraj HTTP odgovor u ishod. Ne postavlja
 * `content-type` rucno: FormData sam postavi multipart boundary. Bacanje mreze -> {kind:'error'}.
 */

/**
 * Sastavi uspjesan ishod iz METAPODATAKA i bajtova dokumenta.
 *
 * Dijeljeno izmedju binarnog i JSON oblika odgovora (audit DOCX-05). Da svaki oblik ima svoju
 * kopiju ove logike, dva puta bi trebalo popraviti svaki buduci propust (npr. `unknownFixers`,
 * koji je i nastao kao "podatak koji server salje a klijent ne cita"). Ovako je razlika izmedju
 * oblika iskljucivo u tome KAKO su bajtovi stigli.
 */
function okFromMeta(meta: Record<string, unknown>, docxBytes: Uint8Array): RepairOutcome {
  const m = meta as {
    fileName?: string; changelog?: RepairChange[]; skipped?: string[]; unknownFixers?: unknown[];
    slotId?: string; jobId?: string | null; storagePending?: boolean; sourceCheck?: unknown;
  };
  return {
    kind: 'ok',
    docxBytes,
    fileName: m.fileName || 'rad-popravljeno.docx',
    changelog: Array.isArray(m.changelog) ? m.changelog : [],
    skipped: Array.isArray(m.skipped) ? m.skipped : [],
    // Stavke koje server nije prepoznao kao zive (audit DOCX-13). Prije su se tiho gubile, pa je
    // korisnik dobivao dokument uvjeren da su primijenjene.
    unknownFixers: Array.isArray(m.unknownFixers) ? m.unknownFixers.map(String) : [],
    slotId: m.slotId,
    jobId: m.jobId ?? null,
    // Stari server ne salje polje: tamo je pohrana bila gotova prije odgovora, pa false znaci
    // "ishod je vec poznat", sto je za taj server tocno.
    storagePending: m.storagePending === true,
    sourceCheck: parseSourceCheck(m.sourceCheck),
  };
}

export async function uploadRepair(
  config: RepairClientConfig,
  accessToken: string,
  fileBytes: Uint8Array,
  meta: RepairMeta,
  fetchImpl: typeof fetch = fetch,
  options?: { signal?: AbortSignal },
): Promise<RepairOutcome> {
  if (!config.endpoint) return { kind: 'error', message: 'repairEndpoint nije konfiguriran' };

  const form = new FormData();
  const blob = new Blob([fileBytes as Uint8Array<ArrayBuffer>], { type: DOCX_MIME });
  form.append('file', blob, meta.fileName || 'rad.docx');
  form.append('meta', JSON.stringify(meta));

  let res: Response;
  try {
    res = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        // Trazi binarni oblik odgovora (audit DOCX-05): metapodaci + sirovi bajtovi umjesto
        // base64 u JSON-u. Stariji server ovo zaglavlje ignorira i vrati zatecen JSON, pa
        // klijent mora znati oba oblika (grana ispod).
        [REPAIR_BINARY_REQUEST_HEADER]: REPAIR_BINARY_REQUEST_VALUE,
      },
      body: form,
      ...(options?.signal ? { signal: options.signal } : {}),
    });
  } catch (e) {
    // Prekid (istekao rok ili korisnik) nije "mrezna greska": generickom porukom bi izgledao kao
    // kvar posluzitelja, pa dobiva vlastiti tekst koji kaze sto se stvarno dogodilo.
    if (e instanceof Error && e.name === 'AbortError') {
      return { kind: 'error', message: 'Popravak je prekinut jer je predugo trajao. Provjeri vezu i pokušaj ponovno.' };
    }
    return { kind: 'error', message: e instanceof Error ? e.message : 'mrezna greska' };
  }

  if (res.status === 200) {
    /**
     * DVA OBLIKA ODGOVORA (audit DOCX-05).
     *
     * Novi server vraca okvir (metapodaci + sirovi bajtovi), cime u memoriji nestaju base64 string
     * i njegova kopija u JSON-u. Stariji server, ili onaj kojem zaglavlje nije stiglo, vraca
     * zatecen JSON s `docxBase64`.
     *
     * Klijent mora znati oba: deploy nije atomaran, pa se u prijelazu nova stranica moze naci
     * pred starim serverom i obrnuto. Razlikuju se po Content-Typeu, ne po sadrzaju, da se ne
     * pokusava parsirati binarno tijelo kao tekst.
     */
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes(REPAIR_BINARY_CONTENT_TYPE)) {
      try {
        const body = new Uint8Array(await res.arrayBuffer());
        const frame = decodeRepairFrame<Record<string, unknown>>(body);
        return okFromMeta(frame.meta, frame.docxBytes);
      } catch (e) {
        return { kind: 'error', status: 200, message: e instanceof Error ? e.message : 'neispravan binarni odgovor' };
      }
    }

    const data = (await res.json().catch(() => ({}))) as {
      docxBase64?: string; fileName?: string; changelog?: RepairChange[]; skipped?: string[]; unknownFixers?: string[]; slotId?: string; jobId?: string | null;
      storagePending?: boolean; sourceCheck?: unknown;
      error?: string; integrityFailure?: { part?: unknown; problem?: unknown; preexisting?: unknown };
    };
    if (data.error === 'integrity_failed') {
      const f = data.integrityFailure;
      return { kind: 'integrity_failed', part: String(f?.part ?? 'nepoznat dio'), problem: String(f?.problem ?? 'neispravan izlazni paket'), preexisting: f?.preexisting === true };
    }
    if (!data.docxBase64) return { kind: 'error', status: 200, message: 'nedostaje docxBase64' };
    return okFromMeta(data as Record<string, unknown>, decodeBase64(data.docxBase64));
  }
  if (res.status === 409) {
    const data = (await res.json().catch(() => ({}))) as { suggestedWorkType?: string; workType?: string };
    return { kind: 'tier_mismatch', suggestedWorkType: String(data.suggestedWorkType || data.workType || '') };
  }
  if (res.status === 402) {
    const data = (await res.json().catch(() => ({}))) as { workType?: string };
    const wt = data.workType && isReportWorkType(data.workType) ? data.workType : meta.workType;
    return { kind: 'paywall', workType: wt };
  }
  if (res.status === 429) {
    const data = (await res.json().catch(() => ({}))) as { reason?: string };
    const reason = data.reason === 'free_user' || data.reason === 'free_ip' || data.reason === 'paid_daily' ? data.reason : undefined;
    return { kind: 'rate_limited', reason };
  }
  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 413) return { kind: 'too_large' };
  if (res.status === 415) return { kind: 'invalid_docx' };
  if (res.status === 422) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data?.error === 'no_live_fixers' ? { kind: 'no_live_fixers' } : { kind: 'invalid_docx' };
  }
  if (res.status === 400) {
    // WS-6.3: server odbija upload bez privole na TEKUCE uvjete (consent_required). U praksi rijetko
    // (klijent zigose tekuci TERMS_VERSION); dogodi se ako su uvjeti bumpani, a stranica nije osvjezena.
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data?.error === 'consent_required'
      ? { kind: 'error', status: 400, message: 'Uvjeti su azurirani. Osvjezi stranicu i ponovno potvrdi privolu prije popravka.' }
      : { kind: 'error', status: 400, message: 'neispravan zahtjev' };
  }
  return { kind: 'error', status: res.status, message: `neocekivani odgovor ${res.status}` };
}
