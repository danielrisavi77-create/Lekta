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
import type { FingerprintInput } from '../fingerprint/fingerprint';
import { TERMS_VERSION } from '../legal/legal-content';

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
export const REPAIR_MAX_REFERENCES = 60;

/**
 * Ishod provjere izvora u korpusu, kakav repair-docx vraca uz popravak.
 * `found` sadrzi ISKLJUCIVO pogotke; izostanak reference iz tog popisa NIJE dokaz da izvor ne
 * postoji. `checked`/`total` postoje da se djelomican rezultat (potrosen budzet vremena) ne bi
 * prikazao kao potpun.
 */
export interface RepairSourceCheck {
  found: Array<{
    index: number;
    verdict: 'found' | 'weak';
    score: number;
    matchedTitle: string;
    where: string;
    url: string | null;
  }>;
  checked: number;
  total: number;
  truncated: boolean;
}

/** Meta uz upload (JSON dio multiparta). Bez doslovnog teksta rada. */
export interface RepairMeta {
  workType: ReportWorkType;
  parsedStructure: FingerprintInput;
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
}

export interface RepairChange { ruleId: string; beforeLabel: string; afterLabel: string }

export type RepairOutcome =
  | { kind: 'ok'; docxBytes: Uint8Array; fileName: string; changelog: RepairChange[]; skipped: string[]; slotId?: string; jobId?: string | null; sourceCheck: RepairSourceCheck | null }
  | { kind: 'tier_mismatch'; suggestedWorkType: string }
  | { kind: 'paywall'; workType: ReportWorkType }
  | { kind: 'rate_limited' }
  | { kind: 'unauthorized' }
  | { kind: 'too_large' }
  | { kind: 'no_live_fixers' }
  | { kind: 'invalid_docx' }
  | { kind: 'error'; status?: number; message: string };

/** base64 -> Uint8Array (cisto, bez Node Buffera; `atob` je globalan u pregledniku/Deno/vitest). */
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
  parsedStructure: FingerprintInput;
  requests: RepairFixerRequest[];
  words?: number | null;
  titleMarker?: string | null;
  profileStatus?: string | null;
  profileRef?: string | null;
  fileName?: string | null;
  confirmedMismatch?: boolean;
  references?: RepairReference[] | null;
}): RepairMeta {
  const workType: ReportWorkType = isReportWorkType(input.workType) ? input.workType : 'zavrsni';
  const meta: RepairMeta = {
    workType,
    parsedStructure: {
      title: input.parsedStructure?.title ?? null,
      author: input.parsedStructure?.author ?? null,
      headings: input.parsedStructure?.headings ?? [],
    },
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
  // Reference bez naslova nemaju sto traziti u korpusu (kljuc je naslov), pa ispadaju ovdje umjesto
  // da putuju na server i tamo se tiho odbace. Prazan popis se izostavlja: nema polja, nema provjere.
  const refs = (input.references || [])
    .filter((r) => r && typeof r.title === 'string' && r.title.trim().length > 0)
    .slice(0, REPAIR_MAX_REFERENCES)
    .map((r) => ({ title: r.title.trim(), year: typeof r.year === 'number' && Number.isFinite(r.year) ? r.year : null }));
  if (refs.length) meta.references = refs;
  return meta;
}

/**
 * Procitaj `sourceCheck` iz odgovora obrambeno. Provjera izvora je DODATAK: bilo kakav neocekivan
 * oblik (stari server bez K3, ugasena zastavica, ostecen JSON) daje `null`, a popravak se svejedno
 * isporucuje. Verdikt izvan {found, weak} se odbacuje jer korpus druge presude ne smije donositi.
 */
function parseSourceCheck(raw: unknown): RepairSourceCheck | null {
  const sc = raw as Partial<RepairSourceCheck> | null | undefined;
  if (!sc || typeof sc !== 'object' || !Array.isArray(sc.found)) return null;
  const total = Number(sc.total);
  const checked = Number(sc.checked);
  if (!Number.isFinite(total) || total <= 0) return null;
  const found = sc.found
    .filter((f: any) => f && (f.verdict === 'found' || f.verdict === 'weak')
      && Number.isInteger(f.index) && f.index >= 0 && typeof f.matchedTitle === 'string')
    .map((f: any) => ({
      index: f.index as number,
      verdict: f.verdict as 'found' | 'weak',
      score: Number.isFinite(Number(f.score)) ? Number(f.score) : 0,
      matchedTitle: String(f.matchedTitle),
      where: typeof f.where === 'string' && f.where ? f.where : 'hrvatski repozitorij',
      url: typeof f.url === 'string' && f.url ? f.url : null,
    }));
  const safeChecked = Number.isFinite(checked) ? Math.max(0, Math.min(checked, total)) : 0;
  return { found, checked: safeChecked, total, truncated: sc.truncated === true || safeChecked < total };
}

/**
 * Uploadaj dokument + meta na repair-docx i mapiraj HTTP odgovor u ishod. Ne postavlja
 * `content-type` rucno: FormData sam postavi multipart boundary. Bacanje mreze -> {kind:'error'}.
 */
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
      headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
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
    const data = (await res.json().catch(() => ({}))) as {
      docxBase64?: string; fileName?: string; changelog?: RepairChange[]; skipped?: string[]; slotId?: string; jobId?: string | null;
      sourceCheck?: unknown;
    };
    if (!data.docxBase64) return { kind: 'error', status: 200, message: 'nedostaje docxBase64' };
    return {
      kind: 'ok',
      docxBytes: decodeBase64(data.docxBase64),
      fileName: data.fileName || 'rad-popravljeno.docx',
      changelog: Array.isArray(data.changelog) ? data.changelog : [],
      skipped: Array.isArray(data.skipped) ? data.skipped : [],
      slotId: data.slotId,
      jobId: data.jobId ?? null,
      sourceCheck: parseSourceCheck(data.sourceCheck),
    };
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
  if (res.status === 429) return { kind: 'rate_limited' };
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
