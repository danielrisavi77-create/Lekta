import './result-visuals.css';
import { claimBadgeHtml } from '../profile-claim';
import type { VisualFindingModel, VisualResultModel } from './visual-result-model';
import { categorySummaryHtml } from './category-summary';
import { priorityFindingsHtml } from './priority-findings';
import { findingSummary, findingSummaryHtml, type FindingSummary } from './finding-summary';
import { pluralHr } from './plural-hr';
import { bindDocumentDna, documentDnaHtml } from './document-dna';
import type { DocumentDnaModel } from '../../results/document-dna-model';
import type { RepairOutlookModel } from './repair-outlook';
import { escapeHtml } from '../../utils/helpers';
import { setSiteChromeScore, setSiteChromeStage } from '../../shared/site-chrome';
import type { DeskItem } from './desk-model';
import { mountDesk, type DeskDocument, type DeskHandle } from './desk-mount';
import { buildRepairPlan, type PlanItemInput } from './repair-plan';
import { repairPlanHtml } from './repair-plan-view';

export type ResultsRenderer = 'legacy' | 'cockpit';
export type ResultsCockpitAction =
  | { kind: 'preview'; findingId: string }
  | { kind: 'repair'; findingId: string }
  | { kind: 'confirm'; findingId: string }
  | { kind: 'ignore'; findingId: string; reason: string }
  | { kind: 'reopen'; findingId: string }
  | { kind: 'preview-location'; paragraphIndex: number; footnoteId?: number }
  | { kind: 'open-findings' }
  | { kind: 'simulate-repair'; findingId?: string }
  | { kind: 'repair-safe'; ruleIds?: string[]; findingId?: string }
  | { kind: 'plan-opened' };

/**
 * OPCI ulaz (jedini primarni gumb, `repair-safe`/`simulate-repair`) naspram PO-NALAZNOG ulaza
 * (kartica nalaza / desk, radnja `repair`). `primaryAction` (nize) uvijek lijepi `findingId`
 * PRVOG popravljivog nalaza uz `repair-safe` kao METU popravka, nikad kao korisnikov odabir, pa
 * `app.ts` tu metu smije koristiti za ANIMACIJU cilja, ali NE smije njome preodabrati/najaviti
 * pojedini nalaz kao da je korisnik bas njega trazio (popravak drugog kruga, Z8).
 */
export function isGeneralRepairEntry(action: ResultsCockpitAction): boolean {
  return action.kind === 'repair-safe' || action.kind === 'simulate-repair';
}

/**
 * KOREKTORSKI STOL kao izvor. Ljuska NE zna kako se crta dokument: `mountDocument` joj se
 * predaje, jer je faksimil tezak modul koji se ucitava lijeno, a ovaj bi ga uvoz povukao u
 * graf ekrana rezultata.
 */
export interface ResultsCockpitDesk {
  readonly items: readonly DeskItem<VisualFindingModel>[];
  readonly mountDocument: (host: HTMLElement) => Promise<DeskDocument | null>;
  /**
   * Stavke popravka, u sirovom obliku. Plan se gradi OVDJE, a ne u `app.ts`, iz dva razloga:
   * `app.ts` je na svom budzetu, i klasifikacija pripada sloju rezultata koji vec drzi nalaze.
   */
  readonly planItems?: readonly PlanItemInput[];
}

export interface ResultsCockpitOptions {
  repairAvailable: boolean;
  /** DNA rada. Izostavljen kad rezultat nema mjerene odlomke; sekcija se tada ne crta. */
  documentDna?: DocumentDnaModel;
  /**
   * Sto automatika moze prije nego se pokrene. Od Z8 se NE crta kao zasebna sekcija: od cijelog
   * modela se prikazuje jos samo `ceilingScore`, i to kao druga polovica recenice u sazetku.
   */
  repairOutlook?: RepairOutlookModel;
  advancedOpen?: boolean;
  onAction?: (action: ResultsCockpitAction) => void;
  onAdvancedToggle?: (open: boolean) => void;
  /** Kad je prisutan i ima nalaza, stol zamjenjuje popis tri kartice. */
  desk?: ResultsCockpitDesk;
}

/*
 * KORACI EKRANA `/rad/` SU OD Z15 U TRAKI, NE OVDJE.
 *
 * Model (`siteChromeSteps`, isti identiteti i natpisi) i crtanje su preseljeni u
 * `src/shared/site-chrome.ts`. Razlog je izmjeren okom na snimci: stepper je ovdje stajao na
 * vrhu kokpita, dakle ISPOD ljepljive trake, i bio djelomicno skriven. Sredina trake na `/rad/`
 * sad nosi ime dokumenta, ocjenu i korake, pa vodic kroz cetiri koraka stoji na jednom mjestu.
 *
 * `cockpitSteps` i `cockpitStepsHtml` su UKLONJENI, ne ostavljeni kao neupotrijebljeni izvoz:
 * dva modela istih koraka su dva izvora istine koja se mogu razici.
 */

/**
 * Radnja JEDINOG primarnog gumba.
 *
 * ULAZ U POPRAVAK JE OPCI, NE PO NALAZU. Prva izvedba Z8 je ovdje vracala `{kind:'repair'}` za
 * prvi popravljiv nalaz iz `findings.top`, dakle iz PRVA TRI. Dokument kojem su sva tri vodeca
 * nalaza nepopravljiva, a popravljiv je cetvrti, tada je ostajao bez ijednog ulaza u popravak, i
 * oznaka `repair-entry` bi s njega nestala. Stari redak `cockpit-actions` je imao suprotan ugovor:
 * ulaz postoji UVIJEK kad je popravak dostupan. Taj ugovor ostaje, samo se sad nosi jedan gumb.
 *
 * `repair-safe` i `simulate-repair` su ISTE radnje koje je emitirao ukinuti redak; `app.ts` ih i
 * dalje obraduje istim putem, pa se tok popravka ne mijenja, samo mu je ulaz jedan. Uz radnju sad
 * putuje i neobvezan `findingId` (vidi nize), koji `app.ts` koristi samo za predodabir retka u
 * panelu; kad ga nema, panel se otvara bez mete, tocno kao prije.
 */
function primaryAction(model: VisualResultModel, repairAvailable: boolean): ResultsCockpitAction | null {
  if (repairAvailable) {
    // META POPRAVKA PUTUJE S OPCIM ULAZOM (popravak drugog kruga pregleda). Ulaz OSTAJE opci: vrsta
    // radnje ne zavisi od pojedinog nalaza, pa dokument bez ijednog popravljivog nalaza i dalje
    // dobiva ulaz. Ali kad popravljiv nalaz POSTOJI, njegov `findingId` ide uz radnju, jer je
    // osnovica (e6ca53a1) s primarnog gumba emitirala `{kind:'repair', findingId}` i time panelu
    // rekla KOJI redak predodabrati i osvijetliti. Bez toga je klik vodio u panel bez mete.
    //
    // CITA SE CIJELI `findings.document`, ne `findings.top`: prva izvedba Z8 je gledala samo prva
    // tri nalaza, pa je dokument kojem je popravljiv tek cetvrti ostajao bez mete (i bez ulaza).
    const target = model.findings.document.find((finding) => finding.capabilities.repair);
    const meta = target ? { findingId: target.id } : {};
    // Bez ijedne automatske stavke nema sto "sigurno" popraviti, pa je ulaz simulacija; natpis to
    // i kaze, jer gumb koji obeca plan popravka nad praznim skupom laze.
    return model.signals.automaticFixes > 0
      ? { kind: 'repair-safe', ...meta }
      : { kind: 'simulate-repair', ...meta };
  }
  const previewable = model.findings.top.find((finding) => finding.capabilities.preview);
  return previewable ? { kind: 'preview', findingId: previewable.id } : null;
}

/**
 * `findingId` radnje, kad ga radnja nosi. Optional polje znaci da `'findingId' in action` vise
 * nije dovoljno (`repair-safe` bez mete ima kljuc odsutan, ali tip ga poznaje kao `string |
 * undefined`), pa se prazna vrijednost ovdje svodi na `null` i atribut se ne crta prazan.
 */
function actionFindingId(action: ResultsCockpitAction | null): string | null {
  if (!action || !('findingId' in action)) return null;
  const id = action.findingId;
  return typeof id === 'string' && id.trim().length > 0 ? id : null;
}

/** Atribut primarnog gumba; prazan niz kad radnja nema metu, da se ne crta `data-finding-id=""`. */
function findingIdAttr(action: ResultsCockpitAction | null): string {
  const id = actionFindingId(action);
  return id ? ' data-finding-id="' + escapeHtml(id) + '"' : '';
}

function statusCopy(model: VisualResultModel): { label: string; description: string; tone: string } {
  if (model.readiness.kind === 'blocked') return { label: model.readiness.label || 'Nije spremno za predaju', description: model.readiness.description, tone: 'blocked' };
  if (model.readiness.kind === 'needs-work') return { label: model.readiness.label || 'Treba doraditi prije predaje', description: model.readiness.description, tone: 'needs-work' };
  if (model.readiness.kind === 'manual-review') return { label: model.readiness.label || 'Potrebna je ručna provjera', description: model.readiness.description, tone: 'manual-review' };
  return { label: model.readiness.label || 'Nema automatskih blokatora', description: model.readiness.description, tone: 'clear' };
}

/**
 * Natpis JEDINOG primarnog gumba na listu presude. Z8 trazi jednu radnju po ekranu, pa tri gumba
 * iz `cockpit-actions` nestaju, a ovaj preuzima ime radnje zbog koje korisnik dolazi.
 *
 * NATPIS SE NE LAZE KAD RADNJE NEMA: bez popravljivog nalaza gumb ne vodi u plan popravka nego
 * otvara prvi nalaz ili napredni panel, pa ondje i dalje nosi svoje staro ime.
 */
function primaryButtonLabel(action: ResultsCockpitAction | null): string {
  if (!action) return 'Prikaži što treba provjeriti';
  if (action.kind === 'repair-safe') return 'Napravi plan popravka';
  return action.kind === 'simulate-repair' ? 'Simuliraj popravak' : 'Otvori prvi nalaz';
}

/**
 * Prvi redak lista presude. AUTORITET IZVORA ZIVI OVDJE: do Z8 ga je crtao zaseban blok
 * (`cockpit-authority`, kvacica i dvije recenice), koji je uz zaglavlje ponavljao istu tvrdnju.
 * Prazni dijelovi se izbacuju, jer " · · " bez sadrzaja izgleda kao kvar.
 *
 * TRECI DIO JE `model.authority.label`, ne `header.authorityLabel`. Prva izvedba Z8 je uzela ovo
 * drugo, pa je `model.authority` ostao bez ijednog citatelja u prikazu: s ekrana je nestala tvrdnja
 * o IZVORU PRAVILA ("Djelomicno provjeren izvor") i ostala samo tvrdnja o opsegu provjere. To su
 * dvije razlicite stvari i obje pripadaju ovom listu; opseg ide u ogradu ispod.
 */
function eyebrowHtml(model: VisualResultModel): string {
  const dijelovi = [model.header.documentName, model.header.profile, model.authority.label]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => escapeHtml(v));
  return `<p class="cockpit-eyebrow" data-cockpit-eyebrow>${dijelovi.join(' · ')}</p>`;
}

/**
 * OGRADA UZ PRESUDU. Zaseban blok autoriteta je ukinut, ali njegova DRUGA recenica nije ukras:
 * kod neprovjerenog ili ogradjenog profila kaze da su nalazi moguca odstupanja, a ne potvrdjeni
 * zahtjevi. Bez nje bi presuda tvrdila vise nego sto izvor nosi.
 *
 * Kod provjerenog izvora se umjesto nje pise OPSEG (`header.authorityLabel`): tamo je opis samo
 * druga formulacija naljepnice koja vec stoji u eyebrowu, pa bi ista tvrdnja stajala dvaput.
 *
 * STOJI ISPOD SAZETKA (popravak drugog kruga), ne izmedju eyebrowa i H1: ograda ogranicava
 * TVRDNJU KOJU KORISNIK UPRAVO PROCITAO (presudu i sazetak), pa dolazi nakon nje, ne prije nje.
 */
function caveatHtml(model: VisualResultModel): string {
  const tekst = model.authority.kind === 'verified' ? model.header.authorityLabel : model.authority.description;
  if (typeof tekst !== 'string' || !tekst.trim()) return '';
  return `<p class="cockpit-caveat" data-cockpit-caveat="${escapeHtml(model.authority.kind)}">${escapeHtml(tekst)}</p>`;
}

/**
 * Dva sitna cipa: je li profil potvrden i koja je razina dokaza. Oboje je zivjelo u zaglavlju
 * koje Z8 gasi, a nijedno nije ukras: prvo kaze mjeri li se po pravom profilu, drugo na cemu ta
 * pravila pocivaju. `claimBadgeHtml` je ISTA projekcija koju crta kartica profila.
 *
 * STOJI UZ PRSTEN (popravak drugog kruga), ne izmedju eyebrowa i H1: prva izvedba Z8 je marks
 * umetnula u tok teksta liste presude, pa je korisnik na dva cipa nailazio prije nego sto uopce
 * procita presudu. `verdictRingHtml` ovaj HTML ugraduje u `cockpit-ring-wrap`, kao metapodatak o
 * mjeracu, ne kao recenicu u prici.
 */
function marksHtml(model: VisualResultModel): string {
  const potvrden = model.header.profileConfirmed;
  const natpis = potvrden ? 'Profil potvrđen' : 'Profil nije potvrđen';
  return '<p class="cockpit-marks">'
    + `<span class="cockpit-mark${potvrden ? ' cockpit-mark--confirmed' : ''}">`
    + `<span aria-hidden="true">${potvrden ? '✓' : 'ℹ'}</span> ${escapeHtml(natpis)}</span>`
    + claimBadgeHtml(model.header.evidenceClaim, escapeHtml)
    + '</p>';
}

/**
 * Pecat presude. DOSLOVNO iz predloska (Results.dc.html), i SAMO za stanja koja predlozak
 * pokazuje: `blocked` ("Nije spremno") i `clear` ("Forma provjerena"). Predlozak NEMA pecat za
 * `needs-work` ni `manual-review` (popravak drugog kruga: prva izvedba je ovdje izmisljala
 * "Treba doradu" i "Za ručnu provjeru", sto nije copy iz predloska nego priblizna formulacija).
 * Umjesto izmisljanja, ta dva stanja OSTAJU BEZ PECATA; presuda je i dalje puno izrecena u H1.
 *
 * Pecat je UKRAS NA VEC IZRECENOJ PRESUDI (H1 kaze isto punim tekstom), pa je `aria-hidden` i
 * nikad ne lezi preko teksta: stoji u stupcu prstena, ispod njega.
 */
const PECAT: Readonly<Partial<Record<string, string>>> = {
  blocked: 'Nije spremno',
  clear: 'Forma provjerena',
};

/**
 * Prsten ocjene (132 px, conic-gradient) i pecat ispod njega. Boja prstena je TON PRESUDE, ne
 * ocjene: prsten koji je zelen dok pise "Nije spremno" bio bi druga presuda od one u naslovu.
 *
 * Nebodovan profil dobiva isti prsten s praznim lukom i brojem PROVJERENIH PRAVILA: bez toga bi
 * nebodovan rezultat izgledao kao da provjera nije ni napravljena. Natpis stoji IZVAN elementa
 * koji nosi `data-cockpit-score`, da ocjena ostane jedna brojka, a ne brojka plus recenica.
 *
 * `marksHtml` STOJI OVDJE, ne u listu presude (ALIGNMENT Z8, popravak drugog kruga): oznake
 * potvrde profila i razine dokaza su metapodatak o mjeracu, ne recenica koju se cita redom uz
 * eyebrow i naslov. Parametar je opcionalan string vec spreman za umetanje, da ovaj modul ne
 * mora znati za `VisualResultModel`.
 */
function verdictRingHtml(sazetak: FindingSummary, tone: string, marks = ''): string {
  const ocjena = sazetak.ocjena;
  const udio = ocjena ? Math.max(0, Math.min(100, Math.round((ocjena.vrijednost / ocjena.od) * 100))) : 0;
  const broj = ocjena ? ocjena.vrijednost : sazetak.provjerenoPravila;
  const pravila = `${sazetak.provjerenoPravila} ${pluralHr(sazetak.provjerenoPravila, ['pravilo', 'pravila', 'pravila'])}`;
  const opis = ocjena
    ? `Tehnička ocjena ${ocjena.vrijednost} od ${ocjena.od}`
    : `Provjereno ${pravila}, ovaj profil ne boduje`;
  const natpis = ocjena ? 'tehnička ocjena / 100' : `Provjereno ${pravila} · ovaj profil ne boduje`;
  // PECAT SE NE CRTA KAD PREDLOZAK NEMA NATPIS ZA OVAJ TON: izmisljen natpis je gori od
  // izostanka pecata, jer H1 vec izrice presudu punim tekstom.
  const pecatNatpis = PECAT[tone];
  const pecat = pecatNatpis
    ? `<p class="cockpit-stamp" data-cockpit-stamp data-verdict-tone="${tone}" aria-hidden="true">`
      + `${escapeHtml(pecatNatpis)}</p>`
    : '';
  return '<div class="cockpit-ring-wrap">'
    + `<div class="cockpit-ring${ocjena ? '' : ' cockpit-ring--nema'}" data-cockpit-score="${ocjena ? 'scored' : 'none'}"`
    + ` data-verdict-tone="${tone}" style="--ck-ring:${udio}" role="img" aria-label="${escapeHtml(opis)}">`
    + `<span class="cockpit-ring__core">${broj}</span></div>`
    + `<span class="cockpit-ring__label">${escapeHtml(natpis)}</span>`
    + pecat
    + marks
    + '</div>';
}

export function resultRendererFor(doc: Document): ResultsRenderer {
  const search = doc.defaultView?.location.search ?? '';
  const requested = new URLSearchParams(search).get('resultRenderer');
  if (requested === 'legacy') return 'legacy';
  const root = doc.documentElement.dataset.resultRenderer ?? doc.body?.dataset.resultRenderer;
  if (root === 'cockpit' || root === 'v1') return 'cockpit';
  return root === 'legacy' ? 'legacy' : 'cockpit';
}

export function renderResultsCockpit(mount: HTMLElement, model: VisualResultModel, options: ResultsCockpitOptions): void {
  // Stari stol se odbacuje PRIJE nego `innerHTML` odnese njegov DOM: inace bi mu kasni
  // `mountDocument` mogao razapeti slusace po elementima kojih vise nema.
  const drzac = mount as HTMLElement & { _desk?: DeskHandle | null };
  // POLOZAJ PREZIVLJAVA ponovnu montazu; vidi `startIndex` u `desk-mount.ts`.
  const prethodniIndex = drzac._desk?.index ?? 0;
  drzac._desk?.dispose();
  drzac._desk = null;
  const stol = options.desk && options.desk.items.length ? options.desk : null;
  const status = statusCopy(model);
  const action = primaryAction(model, options.repairAvailable);
  const advancedOpen = options.advancedOpen === true;
  const sazetak = findingSummary(model.signals, model.score, model.readiness.authoritative, options.repairAvailable);
  // STROP SE UZIMA SAMO KAD JE POZNAT. `unavailable` model (profil bez bodovanih provjera) nema
  // sto obecati, pa se druga polovica recenice izostavlja umjesto da se izmisli brojka.
  const strop = options.repairOutlook?.kind === 'available' ? options.repairOutlook.ceilingScore : null;
  // OCJENA IDE I U TRAKU (Z15). Kokpit je jedino mjesto koje je vec zna, pa je ovo uzak izlaz
  // prema traki; bez montirane trake je no-op, pa kokpit ne mora znati na kojoj je ruti.
  // NEBODOVAN MODEL NEMA STO POKAZATI U TRAKI: `unscored` (profil bez bodovanih provjera) daje
  // `null`, pa celija ostaje skrivena umjesto da ispise nulu koja bi tvrdila ocjenu.
  setSiteChromeScore(mount.ownerDocument, model.score.kind === 'scored' ? model.score.value : null);
  // FAZA U TRAKI (Z15 popravak). Kokpit je ovdje jedino mjesto koje zna da su nalazi STVARNO
  // nacrtani (main.ts vec javi `scanning` cim je dokument prihvacen, prije nego citanje zavrsi).
  setSiteChromeStage(mount.ownerDocument, 'findings');
  mount.className = 'result-cockpit result-cockpit--' + status.tone;
  mount.dataset.cockpitExperience = 'correction-desk';
  mount.innerHTML = [
    // JEDAN LIST PRESUDE zamjenjuje `cockpit-header`, `cockpit-hero` i `cockpit-actions`.
    //
    // Do Z8 su na ekranu bila TRI zasebna bloka koja odgovaraju na isto pitanje ("gdje sam i sto
    // sad"): zaglavlje s imenom datoteke, hero s presudom i sazetkom, i redak s tri gumba. Redak
    // gumba je pritom trazio odluku izmedu "Pregledaj nalaze", "Simuliraj popravak" i "Popravi
    // sigurne stavke", a sva tri vode u isti panel. Sada je jedan list: eyebrow, presuda, sazetak,
    // jedna spojena recenica o dosegu automatike, JEDAN gumb i jedna tekstualna poveznica.
    //
    // REDOSLIJED (ALIGNMENT Z8, popravak drugog kruga): eyebrow -> H1 -> sazetak -> ograda -> gumb
    // + poveznica. Prva izvedba Z8 je izmedu eyebrowa i H1 umetala `cockpit-marks` i
    // `cockpit-caveat`: ograda je time izgledala kao dio identiteta dokumenta, prije nego korisnik
    // uopce procita presudu. Ograda sad stoji ISPOD sazetka, gdje ogranicava upravo procitanu
    // tvrdnju o dosegu automatike; oznake `cockpit-marks` (potvrda profila i razina dokaza) idu uz
    // prsten ocjene, izvan toka teksta, jer su UKRAS NA PRESUDI, ne recenica koju se cita redom.
    '<section class="cockpit-sheet" data-cockpit-verdict-sheet data-cockpit-status="', status.tone,
    '" aria-labelledby="cockpitVerdictTitle">',
    '<div class="cockpit-sheet__lead" data-cockpit-sheet-lead>',
    eyebrowHtml(model),
    '<h1 class="cockpit-verdict-title" id="cockpitVerdictTitle" data-cockpit-verdict-title data-verdict="',
    status.tone, '">', escapeHtml(status.label), '</h1>',
    // SAZETAK JE POSTOJECI MODUL. Ocjena se iz njega ISKLJUCUJE, jer je u listu presude crta
    // prsten desno; da oba crtaju ocjenu, ekran bi nosio dva mjeraca iste stvari.
    findingSummaryHtml(sazetak, escapeHtml, { strop, ocjena: false }),
    caveatHtml(model),
    '<div class="cockpit-sheet__actions">',
    '<button type="button" class="button button-primary cockpit-primary" data-cockpit-primary',
    findingIdAttr(action),
    // `data-cockpit-action` OSTAJE NA ULAZU U POPRAVAK. Redak s tri gumba je nestao, radnje nisu:
    // sest Playwright specova (repair-panel, repair-cta-opens-panel, repair-selection-restore,
    // workspace-a11y, workspace-viewports, ux-dist/critical-path) trazi bas ovaj atribut unutar
    // `#resultCockpit` kao dokaz da ulaz u popravak postoji i da je omogucen.
    action?.kind === 'repair-safe' || action?.kind === 'simulate-repair'
      ? ' data-cockpit-action="' + action.kind + '"'
      : '',
    // `repair-entry` je OZNAKA OPCEG ULAZA U POPRAVAK i po ugovoru stoji na tocno jednom
    // omogucenom gumbu kad god je popravak dostupan; vidi `primaryAction`.
    options.repairAvailable ? ' data-testid="repair-entry"' : '',
    '>', primaryButtonLabel(action), ' <span aria-hidden="true">&#8594;</span></button>',
    '<button type="button" class="cockpit-link" data-cockpit-action="open-findings">Pregledaj nalaze',
    ' <span aria-hidden="true">&#8595;</span></button>',
    '</div></div>',
    // MARKS UZ PRSTEN: `verdictRingHtml` prima model i crta oznake UNUTAR `cockpit-ring-wrap`,
    // ne u listu presude. `cockpit-sheet` ostaje grid od TOCNO dva izravna djeteta (`__lead` i
    // `.cockpit-ring-wrap`); da marks stoji kao trece dijete, dvostupcani raspored bi se raspao.
    verdictRingHtml(sazetak, status.tone, marksHtml(model)),
    '</section>',
    // STOL ZAMJENJUJE POPIS, ne stoji uz njega. Tri kartice i stol odgovaraju na isto pitanje
    // ("sto prvo"), pa bi jedno ispod drugoga bilo dvostruko citanje istih nalaza.
    '<section class="cockpit-priority', stol ? ' cockpit-priority--stol' : '', '" aria-labelledby="cockpitPriorityTitle">',
    '<div class="cockpit-section-heading"><span class="cockpit-kicker">', stol ? 'Korektorski stol' : 'Prvo pogledajte', '</span>',
    '<h2 id="cockpitPriorityTitle">', stol ? 'Nalaz uz dokument' : 'Najvažniji nalazi', '</h2></div>',
    stol ? '<div data-desk-host></div>' : priorityFindingsHtml(model.findings.top, options.repairAvailable),
    '</section>',
    // SEKUNDARNI LISTOVI: DNA i kategorije u JEDNOM redu ispod stola, prigusenim tonom. Oba su
    // pregled, ne radnja, pa ne smiju tezinom konkurirati presudi i stolu iznad.
    '<div class="cockpit-secondary" data-cockpit-secondary>',
    options.documentDna ? documentDnaHtml(options.documentDna) : '',
    categorySummaryHtml(model.categories),
    // "Sve provjere (N)" zamjenjuje gumb "Detalji provjere" preko cijele sirine: ista meta
    // (`data-cockpit-advanced`), ali oblik poveznice, jer je to izlaz za manjinu. N je STVARAN
    // broj provjera iz modela; fiksna brojka bi lagala na svakom drugom profilu.
    '<button type="button" class="cockpit-allchecks" data-cockpit-action="advanced" data-cockpit-advanced aria-expanded="',
    advancedOpen ? 'true' : 'false', '">Sve provjere (', escapeHtml(model.signals.totalChecks), ')</button>',
    '</div>',
  ].join('');
  mount.dataset.advancedOpen = String(advancedOpen);
  // Ulaz je JEDAN orkestriran trenutak, ne rasuti efekti: razred se pali u sljedecem kadru pa
  // CSS odradi stagger (papir sjeda, prsteni se iscrtaju, kartice se podijele). Nikakva
  // animacija po elementu iz JS-a i nijedno layout svojstvo; reduced-motion gasi sve u CSS-u.
  const raf = mount.ownerDocument.defaultView?.requestAnimationFrame;
  if (typeof raf === 'function') raf(() => { mount.dataset.entered = 'true'; });
  else mount.dataset.entered = 'true';

  if (stol) {
    const domacin = mount.querySelector<HTMLElement>('[data-desk-host]');
    if (domacin) {
      const plan = buildRepairPlan(stol.planItems ?? [], model.findings.document, options.repairAvailable);
      drzac._desk = mountDesk(domacin, {
        items: stol.items,
        startIndex: prethodniIndex,
        repairAvailable: options.repairAvailable,
        esc: escapeHtml,
        // Prazan plan se ne nudi: gumb koji vodi na "nema zahvata" je losiji od izostanka gumba.
        planHtml: plan.prazan ? null : repairPlanHtml(plan, escapeHtml),
        plan: plan.prazan ? null : plan,
        // NA USKOM EKRANU SE DOKUMENT NE CRTA. Raspored 58/42 ondje nema smisla, pa ga CSS
        // sakrije, a tada je `clientWidth` nula. Bez ove provjere bi se faksimil svejedno
        // renderirao: desetci odlomaka u A4 listovima za posao koji nitko nece vidjeti, i to
        // bas na uredaju s najmanje memorije. Odluka stoji OVDJE, a ne u `mountDesk`, jer je
        // ovo mjesto koje zna za raspored; `mountDesk` ostaje cist i mjerljiv bez preglednika.
        mountDocument: (host) => (host.clientWidth > 0 ? stol.mountDocument(host) : Promise.resolve(null)),
        onAction: (action) => options.onAction?.(action),
      });
    }
  }

  // DNA salje iste akcije kao kartice nalaza, pa ljuska ne mora znati odakle je klik dosao.
  bindDocumentDna(mount, (action) => options.onAction?.(action));

  mount.querySelector<HTMLButtonElement>('[data-cockpit-primary]')?.addEventListener('click', () => {
    if (action) options.onAction?.(action);
    else options.onAdvancedToggle?.(true);
  });
  mount.querySelector<HTMLButtonElement>('[data-cockpit-action="open-findings"]')?.addEventListener('click', () => options.onAction?.({ kind: 'open-findings' }));
  mount.querySelector<HTMLButtonElement>('[data-cockpit-advanced]')?.addEventListener('click', () => {
    const next = mount.dataset.advancedOpen !== 'true';
    mount.dataset.advancedOpen = String(next);
    mount.querySelector('[data-cockpit-advanced]')?.setAttribute('aria-expanded', String(next));
    options.onAdvancedToggle?.(next);
  });
  mount.querySelectorAll<HTMLButtonElement>('[data-finding-jump]').forEach((button) => button.addEventListener('click', () => {
    const findingId = button.closest<HTMLElement>('[data-finding-id]')?.dataset.findingId;
    if (findingId) options.onAction?.({ kind: 'preview', findingId });
  }));
  mount.querySelectorAll<HTMLButtonElement>('[data-finding-action]').forEach((button) => button.addEventListener('click', () => {
    const findingId = button.dataset.findingId;
    const kind = button.dataset.findingAction;
    if (!findingId) return;
    if (kind === 'repair') options.onAction?.({ kind: 'repair', findingId });
    else if (kind === 'preview') options.onAction?.({ kind: 'preview', findingId });
    else options.onAdvancedToggle?.(true);
  }));
  mount.querySelectorAll<HTMLButtonElement>('[data-finding-confirm]').forEach((button) => button.addEventListener('click', () => {
    const findingId = button.closest<HTMLElement>('[data-finding-id]')?.dataset.findingId;
    if (findingId) options.onAction?.({ kind: 'confirm', findingId });
  }));
  mount.querySelectorAll<HTMLButtonElement>('[data-finding-ignore]').forEach((button) => button.addEventListener('click', () => {
    button.closest<HTMLElement>('[data-finding-id]')?.querySelector<HTMLElement>('[data-finding-ignore-form]')?.removeAttribute('hidden');
  }));
  mount.querySelectorAll<HTMLButtonElement>('[data-finding-ignore-cancel]').forEach((button) => button.addEventListener('click', () => {
    button.closest<HTMLElement>('[data-finding-ignore-form]')?.setAttribute('hidden', '');
  }));
  mount.querySelectorAll<HTMLButtonElement>('[data-finding-ignore-save]').forEach((button) => button.addEventListener('click', () => {
    const card = button.closest<HTMLElement>('[data-finding-id]');
    const findingId = card?.dataset.findingId;
    const reason = card?.querySelector<HTMLInputElement>('[data-finding-ignore-reason]')?.value.trim() ?? '';
    if (findingId && reason) options.onAction?.({ kind: 'ignore', findingId, reason });
  }));
  mount.querySelectorAll<HTMLButtonElement>('[data-finding-reopen]').forEach((button) => button.addEventListener('click', () => {
    const findingId = button.closest<HTMLElement>('[data-finding-id]')?.dataset.findingId;
    if (findingId) options.onAction?.({ kind: 'reopen', findingId });
  }));
}
