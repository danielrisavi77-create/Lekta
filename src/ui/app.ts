'use strict';
import { DOCX_MAX_UPLOAD_BYTES, repairBlockerMessage } from '../repair/docx-budget';
import { guaranteeAppliesToStatus, guaranteeStatusNote } from '../report/guarantee';
import { escapeHtml, safeHref, clamp, fmt, normalize, els, first, textOf, reframeStatusNote } from '../utils/helpers';
import { focusResult } from '../shared/result-a11y'; // BL-P1-02: fokus + SR-najava rezultata
import { createAnimationRegistry } from '../shared/animation-registry';
// BL-P0-05-4: DOCX parser se koristi tek nakon odabira datoteke (metapodaci, detekcija konteksta),
// pa se uvozi LIJENO (dinamicki import) u tim funkcijama; njegov kod ispada iz glavnog landing chunka.
import { makeCheck, issue, scoreMeta } from '../scoring/checks';
import { parseReference } from '../citations/parse-reference';
import { verifyReferences } from '../citations/verify-existence';
import { VERDICT_BADGE, summarizeVerification } from '../citations/verify-badges';
import { toReportWorkType } from '../report/report-work-type';
import { REPAIR_MAX_REFERENCES } from '../report/repair-contract';
import { buildSourceCheckHtml } from './source-check-view';
import { buildTeaser, redactParagraphQuotes } from '../report/report';
import { tierFor } from '../report/pricing';
import { estimateWorkType, workTypeMismatchLevel, TIER_RANK } from '../report/work-type-estimate';
import { fetchRetailCatalog } from '../catalog/products-catalog';
import { KIND_LABELS_HR, KIND_DOCUMENT_WIDE } from '../tools/typo-lint';
import { SUBMISSION_LABELS_HR } from '../audits/submission-lint';
import { GRAMMAR_KIND_LABELS } from '../audits/grammar-hr';
import { slotProductForWorkType } from '../report/rulebook';
import { VERIFIED_PROFILE_REGISTRY, LEGAL_DEPARTMENT_REGISTRY, PROFILE_STATUS, PROFILE_AUTHORITY, ensureProfileRules, setProfileRulesProvider, profileRulesLoaded, profileRulesFailed } from '../profiles/profile-registry';
import { ensureRulesForCurrentSelection } from '../profiles/ensure-current-rules';
import { fetchProfileRulesWithRetry } from '../report/profile-rules-client';
// Advisory demotion i repair stavke citaju se iz PECENIH mapa (performance-01/02): drafts (~1,3 MB)
// i source-registry (152 KB) vise NISU u glavnom entry chunku. Izvor istine ostaje u draftovima;
// mape pece scripts/gen-profile-runtime-maps.mts, drift hvata tests/profile-runtime-maps.test.ts.
import { evidenceEntriesFor, repairEntriesFor } from '../profiles/profile-runtime-maps';
import { composeAnalysisProfile, isLightBaseline } from '../profiles/compose-profile';
import { ZAGREB_CATALOG } from '../catalog/catalog-loader';
import { attachSelectSearch } from './select-search';
import { workTypesForSelection, defaultWorkTypeForProgram, citationForDefinition, isCitationLocked, languageForDefinition, isLanguageLocked, visibleProgramsForUnit, eligibleDefinitionsFor, resolveDefinition } from './work-selection';
import { oziciSjenu } from './wizard-shadow';
import { renderView } from './wizard-view';
import { INSTITUTIONAL_COVERAGE_MATRIX, COVERAGE_STATUS_META, CORPUS_STATS } from '../coverage/coverage-loader';
import { FPZG_SUBMISSION_CALENDAR as _FPZG_CAL, ACADEMIC_DEADLINES } from '../submission/submission-loader';
import { renderDeadlineReminderToggleIfAvailable } from './deadline-reminder-toggle';
import { DEPLOYMENT_CONFIG } from '../config/deployment';
import { readFacultyContext } from '../tools/faculty-context';
import { findUpcomingDeadline } from '../submission/deadline-registry';
import { renderRepairPanel, renderConfirmation, advancedFormFor } from './repair-panel';
import { renderRepairLedgerModal } from './repair-price-slider';
import { trapModal, releaseModal } from './modal-utils';
import { profileClaimFor, claimSentence } from './profile-claim';
import { buildFindingViewModels, findingCardHtml, topFindings, type FindingSessionState, type FindingViewModel } from './finding-view-model';
import { collectAllPreviewFlags } from '../preview/preview-anchors';
import { resultReadiness, repairCeiling } from './result-readiness';
import { renderProgressScan } from './progress-scan';
import { buildVisualResultModel } from './results/visual-result-model';
import { renderResultsCockpit, resultRendererFor, type ResultsCockpitAction } from './results/results-cockpit';
import { buildDocumentDnaModel } from '../results/document-dna-model';
import { profileStatusForEvent } from './profile-status-event';
import { buildExactEvidence } from './results/exact-evidence';
import { buildRepairOutlook } from './results/repair-outlook';
import { buildDefaultRepairRequests } from '../repair/default-selection';
import { detectPassRegressions, dropStaleFieldRegressions, tocFieldWillRefresh } from '../analysis/repair-regression';
import { summarizeRepairOutcome, describeRepairOutcome, type RepairOutcome } from '../repair/repair-outcome';
import { scoringChangeNote } from './scoring-change-note';
import { startNetworkProbe, networkProofMessage, type NetworkProbe } from './network-proof';
import { buildRepairableItems, asRecommendation, universalRepairableItems, paragraphSpacingRepairableItem, pageNumberingRepairableItem, footnoteSpacingRepairableItem, pageNumberAlignmentRepairableItem, introSectionRepairableItem, tocFieldRepairableItem, headingFormatRepairableItem, headingStructureRepairableItem, footnoteTypographyRepairableItem, headingCaseRepairableItem, titlePageRepairableItem, elementCaptionRepairableItem, bibliographyRepairableItem, citationBibliographySyncRepairableItem, legalFootnoteRepairableItem, finalDocumentInspectorRepairableItem, fieldIntegrityRepairableItem, tableFigureRescueRepairableItem, sectionSurgeryRepairableItem, pickTargetItem, requiredSectionsRepairableItem, linkDoiRepairableItem, crossFileSubmissionRepairableItem } from './repair-items';
import { ensureTemplatesHeavy, selectTemplate } from '../title-pages/template-loader';
// Direktan import (ne preko template-loader): level-slugs.ts je namjerno odvojen da ovaj
// (glavni bundle) modul ne povuce ~0,5 MB templates.json samo za slug<->WorkType mapiranje.
import { workTypeFromSlug } from '../title-pages/level-slugs';
import { buildLektaResult } from '../integrations/lekta-result';
import { croatianTypographyRepairableItem, consistencyRepairableItem } from './repair-items';
import { headingCaseSuggestions } from '../repair/heading-case';
import './repair-panel.css';
import '../preflight/preflight-panel.css';
const FPZG_SUBMISSION_CALENDAR: any = _FPZG_CAL;
import { WORK_TYPE_LABELS, CHECK_ITEMS } from '../config/config-loader';
import { PRICING_TIERS } from '../config/pricing-tiers';
// (R3) zajednicka normalizacija check* zastavica, dijeli se s golden resolveProfile
import { analyzeDocxOffThread, cancelActiveAnalysis, isAnalysisCancelled } from '../analysis/analyze-docx-client';
import { uploadCapBytes, decompressionBudgetBytes } from '../analysis/memory-budget';
import { detectContextFromText, needsProfileConfirmation, isConfidentDetection } from './profile-detect';
import { citationMeta } from '../citations/citation-meta';
import { APP_VERSION } from '../config/app-version';
import { buildErrorReport, makeIncidentId } from '../report/error-redaction';
import { SOCIAL_METHOD_REGISTRY, SOCIAL_METHOD_SOURCE } from '../methodology/methodology-loader';
import { cellCoverage, detectWaitlist } from '../waitlist/waitlist-detect';
import { mountWaitlistBar } from '../waitlist/waitlist-bar';
import { submitUnknownFaculty } from '../waitlist/waitlist-client';
import { TERMS_VERSION } from '../legal/terms-version';
import { canonicalConsentText } from '../legal/consent-text';
import type { PreflightPanel } from '../preflight/preflight-panel';
import { academicYearFromDate } from '../profiles/academic-year';
import { setProgressValue } from '../shared/premium-visuals';
import { computeFingerprint } from '../fingerprint/fingerprint';
import { analyzeCrossFileSubmission, crossFileFingerprint } from '../analysis/cross-file-submission-consistency';
import { activeDocumentProgress, describeProgress } from '../history/progress';
import './referral-share-section.css';
declare global { interface Window { __lektaIcons?: any; __lektaAnimate?: any; __lektaReveal?: any; } }
/**
 * GRANICA ANALIZATORA.
 *
 * Do sada je modul bio vezan uz globalni `document` i montirao se sam, na dnu datoteke. Da bi
 * analizator mogao ziviti na vlastitoj ruti (`/rad/`), treba mu ULAZ koji se poziva izvana i
 * IZLAZ koji se da ugasiti. Ovaj korak uvodi samo taj oblik; ozicenje ostaje nepromijenjeno,
 * pa je dokaz ispravnosti to da svi postojeci testovi prolaze BEZ IJEDNE IZMJENE.
 *
 * `runtimeDocument()` pada natrag na globalni `document`, pa svih ~600 poziva `$()` radi kao
 * prije. Bez tog fallbacka ovaj bi korak trazio izmjenu na svakom od njih odjednom.
 */
let _runtimeDocument: Document|null=null;
let _analyzerMounted=false;
const _mountedDocuments=new WeakSet<Document>();
const _mountAbortControllers=new WeakMap<Document,AbortController>();
function runtimeDocument(): Document{return _runtimeDocument??document}
export function isAnalyzerMounted(doc: Document=document): boolean{return _runtimeDocument===doc&&_analyzerMounted}

// Dogadjaji o ishodu prijema dokumenta zive u vlastitom modulu: cisti su (bez DOM-a i bez
// modulskog stanja analizatora) i `app.ts` je pod ratchetom koji trazi da se SMANJUJE.
export { subscribeAnalyzerDocumentSettled, subscribeAnalyzerDocumentAccepted } from './analyzer-document-events';

/**
 * PROGRAMSKI ULAZ DOKUMENTA. Do sada je dokument mogao uci samo kroz korisnikov klik ili drop,
 * pa obnova sesije nije imala cime vratiti rad u analizator.
 *
 * Obecanje se rjesava iz DOGADJAJA, ne iz `_intake.promise`. Razlog je utrka: `admitFile` svoj
 * promise upisuje TEK nakon `await import(...)`, pa bi citanje odmah nakon `setFile` uhvatilo
 * promise PRETHODNE datoteke i vratilo tudji ishod.
 *
 * SPREMLJEN VERDIKT NIJE DOKAZ: obnovljen dokument prolazi intake gate PONOVNO, jer su se
 * granice i pravila u medjuvremenu mogli promijeniti.
 */
export type AnalyzerDocumentAdmission =
  | { kind: 'accepted'; verdict: unknown }
  | { kind: 'rejected'; message: string }
  | { kind: 'superseded' };

export function loadAnalyzerDocument(file: File): Promise<AnalyzerDocumentAdmission> {
  return new Promise((resolve) => {
    let done = false;
    const settle = (result: AnalyzerDocumentAdmission): void => {
      if (done) return;
      done = true; off(); resolve(result);
    };
    const off = subscribeAnalyzerDocumentSettled((event) => {
      // Ishod DRUGE datoteke nije nas: korisnik je mozda odabrao svoju dok je obnova tekla.
      if (event.file !== file) return;
      settle(event.kind === 'accepted' ? { kind: 'accepted', verdict: event.verdict }
        : event.kind === 'rejected' ? { kind: 'rejected', message: event.message }
        : { kind: 'superseded' });
    });
    setFile(file);
    // SIGURNOSNA MREZA. `setFile` sinkrono odbijanje sada EMITIRA, pa ga hvata pretplata iznad
    // i ova grana ne opali. Ostaje jer bi svaki novi sinkroni izlaz bez dogadjaja inace ostavio
    // obecanje da visi zauvijek, a to se ne prijavljuje kao greska nego kao vjecna "obnova".
    if (selectedDocx !== file) {
      settle({ kind: 'rejected', message: String($('#dropError')?.textContent || 'Dokument nije prihvacen.') });
    }
  });
}

import { emitAnalyzerDocumentSettled, subscribeAnalyzerDocumentSettled } from './analyzer-document-events';


const $=(s: string,r: any=runtimeDocument()): any=>r.querySelector(s), $$=(s: string,r: any=runtimeDocument()): any[]=>[...r.querySelectorAll(s)];
/**
 * ELEMENT ILI PRAZAN OBJEKT. Dodjela rukovatelja (`onclick`, `onchange`) na nepostojeci element
 * baca, pa je ozicenje bilo vezano uz stranicu koja ima SVE korijene. Tanka ruta ima samo svoje;
 * `ctl` cini izostanak bezopasnim no-opom umjesto da rusi montazu na prvom elementu koji fali.
 *
 * Signal se NE gubi nego SELI: `tests/legacy-dom-contract.test.ts` tvrdi da zatecena stranica
 * ima svaki element koji ozicenje dira. To hvata brisanje elementa u CI-ju, nad statickim
 * HTML-om i bez ijednog klika, dakle ranije nego iznimka koju zamjenjuje.
 */
function ctl(sel: string,root?: any): any{return $(sel,root??runtimeDocument())??{}}
let selectedDocx: any=null,selectedPdf: any=null,selectedMetadataDocx: any=null,selectedAvFile: any=null,currentPdfAudit: any=null,currentMetadataAudit: any=null,currentResult: any=null;
let _repairClientPromise: Promise<typeof import('../report/repair-client')>|null=null;
function loadRepairClient(){return _repairClientPromise??=import('../report/repair-client')}
let _sourceCheckClientPromise: Promise<typeof import('../report/source-check-client')>|null=null;
function loadSourceCheckClient(){return _sourceCheckClientPromise??=import('../report/source-check-client')}
let _repairHistoryClientPromise: Promise<typeof import('../report/repair-history')>|null=null;
function loadRepairHistoryClient(){return _repairHistoryClientPromise??=import('../report/repair-history')}
async function fetchRepairJobs(...args: any[]){return (await loadRepairHistoryClient()).fetchRepairJobs(args[0],args[1],args[2])}
async function signRepairDownload(...args: any[]){return (await loadRepairHistoryClient()).signRepairDownload(args[0],args[1],args[2],args[3])}
async function deleteRepairJob(...args: any[]){return (await loadRepairHistoryClient()).deleteRepairJob(args[0],args[1],args[2],args[3])}
let _authClientPromise: Promise<typeof import('../auth/session')>|null=null;
function loadAuthClient(){return _authClientPromise??=import('../auth/session')}
async function getValidAccessToken(...args: any[]){return (await loadAuthClient()).getValidAccessToken(args[0],args[1])}
async function requestEmailOtp(...args: any[]){return (await loadAuthClient()).requestEmailOtp(args[0],args[1])}
async function verifyEmailOtp(...args: any[]){return (await loadAuthClient()).verifyEmailOtp(args[0],args[1],args[2])}
async function signInAnonymously(...args: any[]){return (await loadAuthClient()).signInAnonymously(args[0])}
async function linkEmailToAnonymous(...args: any[]){return (await loadAuthClient()).linkEmailToAnonymous(args[0],args[1],args[2])}
async function confirmEmailLink(...args: any[]){return (await loadAuthClient()).confirmEmailLink(args[0],args[1],args[2],args[3])}
let _checkoutClientPromise: Promise<typeof import('../report/checkout')>|null=null;
function loadCheckoutClient(){return _checkoutClientPromise??=import('../report/checkout')}
async function createCheckout(...args: any[]){return (await loadCheckoutClient()).createCheckout(args[0],args[1],args[2],args[3],args[4],args[5])}
let _reportClientPromise: Promise<typeof import('../report/report-client')>|null=null;
function loadReportClient(){return _reportClientPromise??=import('../report/report-client')}
async function unlockReportRequest(...args: any[]){return (await loadReportClient()).unlockFullReport(args[0],args[1],args[2],args[3])}
let _referralClientPromise: Promise<typeof import('../referral/redeem-referral')>|null=null;
function loadReferralClient(){return _referralClientPromise??=import('../referral/redeem-referral')}
async function postReferralRedeem(...args: any[]){return (await loadReferralClient()).postReferralRedeem(args[0],args[1],args[2])}
let _referralSharePromise: Promise<typeof import('./referral-share-section')>|null=null;
function loadReferralShare(){return _referralSharePromise??=import('./referral-share-section')}
async function renderReferralShareSection(...args: any[]){return (await loadReferralShare()).renderReferralShareSection(args[0])}
const findingStates=new Map<string,FindingSessionState>();
// Profil kojim je currentResult ANALIZIRAN (snapshot iz runAnalysis). Repair
// params smiju doci samo odavde: currentProfile() u trenutku rendera moze biti
// druga selekcija (povijest/odjava) pa bi popravak gadjao krivi fakultet.
let analyzedProfile: any=null;
// Ocuvani DOM podstablo repair panela: renderSubmissionChecklist se ponovno
// izvodi na svaki toggle checkliste i pregazi #repairPanelMount; da korisnikov
// odabir stavki, deep-preklopnik i prikazani sazetak ne nestanu, cuvamo stvarni
// cvor i re-attachamo ga dok je isti rezultat aktivan (samo za placeni panel).
let repairPanelNode: any=null, repairPanelForResult: any=null;
// RESULT-03: zadnji izracunati items/textItems iz renderRepairSection, da klik na "Otvori
// mogucnost popravka" na kartici KONKRETNOG nalaza (wireFindingCards) moze naci bas tu stavku u
// vec-mountiranom panelu bez ponovnog racunanja repair-items liste (skupo, i moglo bi drift-ati
// od onoga sto je korisnik stvarno vidi).
let repairPanelItems: any[]=[], repairPanelTextItems: any[]=[];
let preflightPanel: PreflightPanel|null=null, preflightPanelForResult: any=null;
const STORAGE_KEYS={preferences:'lekta.preferences.v2',history:'lekta.history.v2',production:'lekta.production.v2.1',submission:'lekta.submission.v2.2.2',analyticsConsent:'lekta.analytics-consent.v1',orders:'lekta.orders.v1',waitlist:'lekta.waitlist.v1'};/* jednokratna migracija starih lokalnih podataka na lekta.* (sigurno, bez gubitka) */(function migrateLegacyStorage(){try{var MIG: any={'thesisready.preferences.v2':'lekta.preferences.v2','thesisready.history.v2':'lekta.history.v2','thesisready.production.v2.1':'lekta.production.v2.1','thesisready.submission.v2.2.2':'lekta.submission.v2.2.2','thesisready.analytics-consent.v1':'lekta.analytics-consent.v1','thesisready.orders.v1':'lekta.orders.v1','thesisready.theme':'lekta.theme'};for(var o in MIG){var nk=MIG[o],ov=localStorage.getItem(o);if(ov!==null&&localStorage.getItem(nk)===null)localStorage.setItem(nk,ov);localStorage.removeItem(o);}}catch(e: any){}})();
const SESSION_MEMORY=new Map();
/* WORK_TYPE_LABELS i CHECK_ITEMS se uvoze iz config-loader (data/work-type-labels.json, data/checks) */
const VALID_WORK_TYPES=new Set(Object.keys(WORK_TYPE_LABELS));
const VALID_CITATION_IDS=new Set(['fpzg','pravo-fusnote','pravo-social-author','apa7','harvard','chicago-author','chicago-notes','mla9','vancouver','ieee','custom']);
const params=new URLSearchParams(location.search),qaMode=__DEV_TOOLS__&&params.get('qa')==='1';
/* Setup panel (produkcijska konfiguracija: endpointi, payment linkovi, Supabase URL) NIJE javan.
   Dopusten samo na localhostu ili kad je rucno postavljen admin flag u pregledniku
   (localStorage.setItem('lekta.admin','1')). Time ?setup=1 na zivom siteu ne otvara nista. */
function setupAllowed(){try{if(localStorage.getItem('lekta.admin')==='1')return true;}catch(e){}const h=location.hostname;return h==='localhost'||h==='127.0.0.1'||h==='';}
const setupMode=__DEV_TOOLS__&&params.get('setup')==='1'&&setupAllowed();
/* Admin "mini stats" (?admin=1). Zastavica otvara SAMO UI i namjerno je ista kao za setup panel
   (localhost ili localStorage 'lekta.admin'). Pravo je iskljucivo serversko: admin-stats provjerava
   redak u tablici admin_users i bez njega vraca 403, pa podesavanje localStoragea ne daje podatke.
   Radi i u produkciji (za razliku od QA/setup panela koji su iza __DEV_TOOLS__), pa se panel ucitava
   lijeno da ne uleti u glavni bundle. */
const adminMode=params.get('admin')==='1'&&setupAllowed();
// Tekst privole vise NE zivi ovdje nego u src/legal/consent-text.ts, jer ga mora vidjeti i
// server: `create-checkout` usporedjuje primljeni tekst s kanonskim za poslanu verziju
// uvjeta i odbija sve ostalo (audit A26-08). Dok je zivio samo u pregledniku, zapis
// privole nije bio dokaz nego prepricavanje klijenta.
const CHECKOUT_CONSENT_TEXT=canonicalConsentText(TERMS_VERSION)||'';
const DEFAULT_PRODUCTION_CONFIG={enabled:false,submissionMode:'netlify-form',orderEndpoint:'/',paymentProvider:'lemonsqueezy',paymentLinks:{format:'',panic:'',premium:''},businessName:'Lekta',contactEmail:'lekta.kontakt@gmail.com',privacyController:'',retentionDays:30,uploadMaxBytes:8*1024*1024,analyticsEndpoint:DEPLOYMENT_CONFIG.functionEndpoint('analytics-event'),serverAnalytics:'netlify-optional',reportEndpoint:'',fieldRenderEndpoint:'',repairEndpoint:DEPLOYMENT_CONFIG.functionEndpoint('repair-docx'),profileRulesEndpoint:DEPLOYMENT_CONFIG.functionEndpoint('profile-rules'),checkoutEndpoint:'',guaranteeEndpoint:'',supabaseUrl:DEPLOYMENT_CONFIG.supabaseUrl,supabaseAnonKey:DEPLOYMENT_CONFIG.supabaseAnonKey,waitlistEndpoint:DEPLOYMENT_CONFIG.functionEndpoint('faculty-request'),referralEndpoint:'',errorEndpoint:DEPLOYMENT_CONFIG.functionEndpoint('client-error'),preflightStartEndpoint:'',preflightResultEndpoint:'',preflightMaxUploadMb:30,adminStatsEndpoint:DEPLOYMENT_CONFIG.functionEndpoint('admin-stats')};
// Error tracking (P0 8-1): globalni handleri. Ako je errorEndpoint konfiguriran, salje SANITIZIRAN
// tehnicki kontekst (poruka, skraceni stack, verzija, path) na kolektor (npr. Sentry tunnel same-
// origin ili /functions/v1/log-error). Bez endpointa: samo console.error (Supabase/hosting logovi).
// Bez PII: tekst dokumenta nikad nije u gresci; ne saljemo unos korisnika. NE saljemo ni
// navigator.userAgent (BL-P0-04-4 privola/GDPR data-flow-08): UA je uklonjen iz payloada da se
// bez privole ne salje pseudonimni otisak preglednika. NE dodavati ga natrag bez pravne osnove.
let _errSent=0;
// KLIJENT REDAKTIRA PRIJE SLANJA (audit P1-28). Poruka i stack su slobodan tekst, pa u njih lako
// upadne ime datoteke ("Ivan_Horvat_diplomski.docx"), e-mail ili token iz URL-a. `buildErrorReport`
// ih redaktira i odbacuje svako polje izvan dogovorenog oblika. Posluzitelj vrti ISTI modul pri
// primitku; ovo nije dvostruki posao nego obrana u dubinu, isti obrazac kao kod analitike.
//
// `incidentId` se generira OVDJE, ne na posluzitelju, jer se salje preko `sendBeacon` koji odgovor
// ne cita. Korisnik ga tako moze procitati podrsci, a iz njega se ne da doci do njega.
// Korisnik mora MOCI dobiti oznaku incidenta, inace je sabirnica korisna samo nama (audit P1-28
// trazi "korisnicki incident ID"). Javlja se SAMO na prvu gresku po ucitavanju stranice: svaka
// sljedeca je najcesce posljedica prve, a niz toastova bi uplasio korisnika bez ikakve koristi.
let _incidentToastShown=false;
function announceIncident(incidentId: string){if(_incidentToastShown)return;_incidentToastShown=true;
 try{toast(`Došlo je do greške. Ako javiš podršci, navedi oznaku ${incidentId}.`)}catch(e: any){}}
function installErrorTracking(){const send=(kind: any,message: any,stack: any,feature?: any)=>{try{console.error('[lekta]',kind,message);const ep=productionConfig?.errorEndpoint;if(!ep||_errSent>=20)return;_errSent++;
 const incidentId=makeIncidentId();announceIncident(incidentId);
 const payload=buildErrorReport({kind,message,stack,version:APP_VERSION,path:location.pathname||'/',feature:feature||'nepoznato'},incidentId,new Date().toISOString());
 const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});try{if(!(navigator.sendBeacon&&navigator.sendBeacon(ep,blob)))void fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true})}catch(e: any){}}catch(e: any){}};try{window.addEventListener('error',(e: any)=>send('error',e?.message||'error',e?.error?.stack));window.addEventListener('unhandledrejection',(e: any)=>{const r=e?.reason;send('unhandledrejection',r?.message||String(r||'rejection'),r?.stack)})}catch(e: any){}}
/* FPZG_SUBMISSION_CALENDAR se uvozi iz submission-loader (data/submission/fpzg-calendar.json) */
let productionConfig: any=null;
let lastProfileContext='';let _profileConfirmed=false;
/* ZAGREB_CATALOG se sada uvozi iz catalog-loader (data/catalog/zagreb-catalog.json) */
/* INSTITUTIONAL_COVERAGE_MATRIX i COVERAGE_STATUS_META se uvoze iz coverage-loader (data/coverage) */
/* SOCIAL_METHOD_REGISTRY i SOCIAL_METHOD_SOURCE se uvoze iz methodology-loader (data/methodology) */
// Ponuda ima tri tiera: besplatna automatska provjera (teaser), puni izvjestaj po
// vrsti rada (otkljucava se u rezultatu), i rucno uredivanje (ljudski servis preko
// obrasca narudzbe). Ovo je izvor istine za landing sekciju Paketi.
// PRICING_TIERS zive u `config/pricing-tiers` (vidi ondje zasto).
// Rucni paketi za obrazac narudzbe (ljudska usluga). Automatizirana provjera je gore
// u PRICING_TIERS i ne prolazi kroz ovaj obrazac.
/**
 * Paketi RUCNE obrade (obrazac narudzbe), NE cjenik automatskog popravka.
 *
 * Audit CODE-08 prijavio je "vise izvora istine za cijene". Provjera je pokazala da ih je TRI, a
 * ne dva, i da jedan od njih nitko ne cita:
 *   1. OVAJ popis: jedini koji korisnik stvarno vidi u obrascu rucne narudzbe;
 *   2. `data/packages.json` (kroz `config-loader`): ima jos i paket `instant` (9 EUR) kojeg ovdje
 *      NEMA, a iz aplikacije ga ne cita nitko osim jednog testa koji samo tvrdi da je jednak
 *      svojoj vlastitoj JSON datoteci;
 *   3. tablica `products` u bazi: JEDINI mjerodavan cjenik za placeni automatski popravak
 *      (`slot_*`, `pass_*`, `bundle_*`), s posve drugim proizvodima i cijenama.
 *
 * Popisi 1 i 2 se ne smiju citati kao cjenik proizvoda. Cijena popravka dolazi iskljucivo iz
 * baze (vidi `src/catalog/products-catalog.ts`), pa se mijenja kroz `set_product_price`, nikad
 * ovdje. Prije nego dodas cijenu ovamo, provjeri govoris li o rucnoj obradi ili o popravku.
 */
const PACKAGES=[
 {id:'format',name:'Formatiranje rada',price:39,desc:'Tehnički uređena Word datoteka.',features:['Stilovi naslova i sadržaj','Numeriranje, tablice i slike','Konzistentan izgled dokumenta']},
 {id:'panic',name:'Predaja bez panike',price:69,featured:true,desc:'Formatiranje, citatnice i jedna revizija.',features:['Sve iz paketa formatiranja','Provjera citatnica i literature','Prioritetna obrada i revizija']},
 {id:'premium',name:'Premium obrada',price:99,desc:'Najdetaljnija ručna obrada dokumenta.',features:['Tehničko oblikovanje','Struktura i citatna konzistentnost','Završni izvještaj usklađenosti']}
];

function coverageEvaluation(record: any){
 if(record.scope!=='internal')return{status:'external',profiles:[],gaps:[record.note||'Pravila završetka određuje partnerska ustanova ili konzorcij.']};
 const found=(record.expectedProfileIds||[]).map((id: any)=>VERIFIED_PROFILE_REGISTRY.find(p=>p.id===id)).filter(Boolean);
 const missing=(record.expectedProfileIds||[]).filter((id: any)=>!VERIFIED_PROFILE_REGISTRY.some(p=>p.id===id));
 const mismatched=found.filter((p: any)=>!p.programs?.includes(record.name)||!(record.expectedWorkTypes||[]).some((w: any)=>p.workTypes?.includes(w)));
 if(missing.length||mismatched.length||!found.length){const gaps=[];if(missing.length)gaps.push(`Nedostaju profili: ${missing.join(', ')}`);if(mismatched.length)gaps.push(`Profil nije točno vezan uz program: ${mismatched.map((x: any)=>x.id).join(', ')}`);if(!found.length&&!missing.length)gaps.push('Nema zasebnog normativnog profila.');return{status:'missing',profiles:found,gaps}}
 const partial=found.filter((p: any)=>p.status!=='verified');
 if(partial.length)return{status:'partial',profiles:found,gaps:[`Djelomični profili: ${partial.map((x: any)=>x.id).join(', ')}`]};
 const gaps=[];
 if(record.requiresSubmissionCoverage!==false&&found.some((p: any)=>!(p.submissionFacts||[]).length))gaps.push('Nije ugrađen puni Submission Gate prije i nakon obrane.');
 if(found.some((p: any)=>!(p.sources||[]).length))gaps.push('Nedostaje službeni izvor profila.');
 if(!found.some((p: any)=>p.fieldValidation))gaps.push('Nema strukturirane terenske validacije na stvarnom dokumentu.');
 return{status:gaps.some(x=>x.includes('Submission Gate')||x.includes('službeni izvor'))?'published':'ready',profiles:found,gaps};
}
function coverageSnapshot(){const rows=INSTITUTIONAL_COVERAGE_MATRIX.programs.map(program=>({...program,evaluation:coverageEvaluation(program)}));const counts: any={total:rows.length,internal:rows.filter(x=>x.scope==='internal').length,external:rows.filter(x=>x.evaluation.status==='external').length};for(const id of Object.keys(COVERAGE_STATUS_META))counts[id]=rows.filter(x=>x.evaluation.status===id).length;counts.profiled=rows.filter(x=>['ready','published','partial'].includes(x.evaluation.status)).length;counts.completion=Math.round(((counts.ready+counts.published*.65+counts.partial*.3)/Math.max(1,counts.internal))*100);return{rows,counts}}
// Institucionalna matrica pokrivenosti: javni DOM uklonjen u minimalnom redizajnu, pa su
// render funkcije (initCoverageMatrix/renderCoverageMatrix/reset/download) obrisane.
// coverageSnapshot ostaje jer ga koriste QA konzola (runRegistryDiagnostics) i profileManifest.

/**
 * Poruka korisniku. NIKAD ne rusi pozivatelja: `#toastWrap` je izvan radne povrsine, pa ga tanka
 * ruta moze nemati. Izmjereno pri uvodjenju programskog ulaza dokumenta: bez ove ograde je svako
 * ODBIJANJE dokumenta na `/rad/` rusilo prijem, dakle bas put kojim se javlja greska.
 *
 * Dokument se uzima iz `runtimeDocument()`, ne globalni: cvor stvoren u tudjem dokumentu ne bi se
 * dao umetnuti u ovaj.
 */
function toast(msg: any){const doc=runtimeDocument(),wrap=$('#toastWrap');if(!wrap)return;const n=doc.createElement('div');n.className='toast';n.textContent=msg;wrap.append(n);setTimeout(()=>n.remove(),3500)}
/**
 * NASLIJEDJENO OZICENJE cijele landing stranice. Tijelo je namjerno ostalo isto; jedina dva
 * mjesta koja su se promijenila su ona koja su se OSLANJALA na globalni doseg: tema se pise u
 * proslijedjeni dokument, a odgodjeni demo provjerava je li montaza u medjuvremenu ugasena.
 */
function initLegacy(doc: Document,signal: AbortSignal){
 ctl('#checkGrid').innerHTML=CHECK_ITEMS.map(([i,t,d])=>`<article class="check-card" data-reveal><span class="check-icon">${i}</span><h3>${t}</h3><p>${d}</p></article>`).join('');window.__lektaReveal?.();
 productionConfig=loadProductionConfig();wireProfileRulesProvider();captureReferralCode();installErrorTracking();initCatalog();void ensureRetailCatalog();restorePreferences();applyFacultyContext();syncProfileContext();applyUnitFromUrl();updateRepairHistoryButton();if(adminMode){location.replace('/admin.html');return}
 ctl('#pricingGrid').innerHTML=PRICING_TIERS.map(p=>{const soon=p.id!=='free'&&!paidOffersLive();const badge=soon?'<span class="popular soon">USKORO</span>':(p.featured?'<span class="popular">PREPORUČENO</span>':'');const cta=soon?`<button class="btn btn-secondary" type="button" disabled aria-disabled="true">Uskoro</button>`:(p.cta.order?`<button class="btn btn-secondary order-btn" data-package="${p.cta.order}">${p.cta.label}</button>`:`<a class="btn ${p.featured?'btn-primary':'btn-secondary'}" href="${p.cta.href}">${p.cta.label}</a>`);return`<article class="price-card ${p.featured?'featured':''}${soon?' soon':''}">${badge}<h3>${p.name}</h3><div class="price">${p.price}</div><p>${p.desc}</p><ul class="features">${p.features.map(x=>`<li>${x}</li>`).join('')}</ul>${cta}</article>`}).join('');
 ctl('#packagePicks').innerHTML=PACKAGES.map(p=>`<label class="package-pick"><span><input type="radio" name="package" value="${p.id}" ${p.id==='format'?'checked':''}><strong>${p.name} · ${p.price} €</strong><small>${p.desc}</small></span></label>`).join('');
 bind();updateProfile();updateHistoryBadge();updatePackageUi();if(__DEV_TOOLS__)$('#qaBtn')?.classList.toggle('hidden',!qaMode);renderConsentBanner();renderHeroCoverage();wireNoFaculty();if(!paidOffersLive())$('#orderFromResult')?.classList.add('hidden');renderAuthEntry();
 // T16 B3: stroj stanja vozi se u SJENI, samo u dev buildu. Ne pise u DOM i ne mijenja tok;
 // prijavljuje kad se `viewFor` razidje sa stvarnim prikazom, prije nego itko dira pisca.
 if(__DEV_TOOLS__)oziciSjenu(doc);
 // Cjenik copy: dok su placene tarife "Uskoro" (soft-launch), staticni HTML nosi besplatnu poruku;
 // kad naplata proradi (paidOffersLive), vrati se placeni jamstveni/disclaimer copy s payment info.
 if(paidOffersLive()){const _gn=$('#guaranteeNote');if(_gn)_gn.innerHTML='✓ <strong>Jamstvo pokrivenosti:</strong> za profile označene kao potvrđeni, dakle ne za generičke ni savjetodavne, ako ti referada vrati rad zbog pravila koje je Lekta označila ispravnim, vraćamo novac i besplatno ručno popravimo. Prijava u roku od 30 dana od kupnje, uz dokaz i sporno pravilo. Jamčimo točnost provjere prema pravilniku, a ne ocjenu, prihvaćanje rada ni izvornost teksta (nije provjera plagijata).';const _pd=$('#pricingDisclaimer');if(_pd)_pd.textContent='Usluga provjerava oblikovanje, strukturu, opseg i citatnu tehniku prema dostupnim pravilima. Nije provjera plagijata ni sličnosti teksta (nije Turnitin) i ne jamči prihvaćanje rada, ocjenu, akademsku kvalitetu sadržaja ni odluku mentora ili povjerenstva. Plaćanje se provodi na sigurnoj stranici konfiguriranog payment providera.'}
 let theme=null;try{theme=localStorage.getItem('lekta.theme')}catch(e: any){}if(theme)doc.documentElement.dataset.theme=theme;
 if(location.search.includes('demo=1'))setTimeout(()=>{if(!signal.aborted)runDemo()},300);
 void trackEvent('landing_view');
}
function bind(){
 /* Tema i mobilni izbornik su sada u shared/ui-boot (jedan izvor za sve stranice). */
 ctl('#browseBtn').onclick=(e: any)=>{e.stopPropagation();$('#fileInput')?.click()};ctl('#dropzone').onclick=(e: any)=>{if(!e.target.closest('button'))$('#fileInput')?.click()};ctl('#dropzone').onkeydown=(e: any)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#fileInput')?.click()}};
 ctl('#fileInput').onchange=(e: any)=>setFile(e.target.files[0]);ctl('#browsePdf').onclick=()=>$('#pdfInput')?.click();ctl('#pdfInput').onchange=(e: any)=>setAuxFile('pdf',e.target.files[0]);ctl('#removePdf').onclick=()=>setAuxFile('pdf',null);ctl('#browseMetadata').onclick=()=>$('#metadataInput')?.click();ctl('#metadataInput').onchange=(e: any)=>setAuxFile('metadata',e.target.files[0]);ctl('#removeMetadata').onclick=()=>setAuxFile('metadata',null);ctl('#browseAv').onclick=()=>$('#avInput')?.click();ctl('#avInput').onchange=(e: any)=>setAuxFile('av',e.target.files[0]);ctl('#removeAv').onclick=()=>setAuxFile('av',null);
 for(const ev of ['dragenter','dragover'])$('#dropzone')?.addEventListener(ev,(e: any)=>{e.preventDefault();$('#dropzone')?.classList.add('drag')});
 for(const ev of ['dragleave','drop'])$('#dropzone')?.addEventListener(ev,(e: any)=>{e.preventDefault();$('#dropzone')?.classList.remove('drag')});
 $('#dropzone')?.addEventListener('drop',(e: any)=>setFile(e.dataTransfer.files[0]));ctl('#removeFile').onclick=(e: any)=>{e.stopPropagation();setFile(null)};
 ctl('#institutionSelect').onchange=()=>{populateUnits();syncProfileContext();updatePackageUi()};ctl('#unitSelect').onchange=()=>{populatePrograms();syncProfileContext();updatePackageUi()};ctl('#programSelect').onchange=()=>{autoSelectWorkType();syncProfileContext();updatePackageUi()};ctl('#workType').onchange=()=>{syncProfileContext();updatePackageUi()};ctl('#workVariant').onchange=()=>{syncProfileContext();updatePackageUi()};ctl('#departmentSelect').onchange=syncProfileContext;ctl('#methodologySelect').onchange=syncProfileContext;ctl('#citationStyle').onchange=()=>{updateProfile();savePreferences()};ctl('#docLanguage').onchange=savePreferences;ctl('#strictness').onchange=savePreferences;ctl('#submissionPhase').onchange=()=>{savePreferences();updateSubmissionContextFields();updatePackageUi();if(currentResult)renderSubmissionChecklist(currentResult)};ctl('#fpzgCohort').onchange=()=>{populateFpzgDeadlineOptions();savePreferences();if(currentResult)renderSubmissionChecklist(currentResult)};ctl('#fpzgDeadline').onchange=()=>{savePreferences();if(currentResult)renderSubmissionChecklist(currentResult)};ctl('#mentorOverride').onchange=()=>{$('#customSettings')?.classList.toggle('hidden',!$('#mentorOverride')?.checked);updateProfile();savePreferences()};ctl('#analyzeBtn').onclick=runAnalysis;$('#cancelAnalysisBtn')&&(ctl('#cancelAnalysisBtn').onclick=cancelAnalysis);ctl('#demoBtn').onclick=()=>runDemo('fpzg');ctl('#heroDemoBtn').onclick=()=>{document.querySelector('#analyzer')?.scrollIntoView();setTimeout(()=>runDemo('fpzg'),300)};
 $$('.tab').forEach(b=>{b.onclick=()=>openTab(b.dataset.tab);b.onkeydown=(e: any)=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;const tabs=Array.from<any>(document.querySelectorAll('.tab')).filter((t: any)=>t.offsetParent!==null);const i=tabs.indexOf(b);if(i<0)return;e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?tabs.length-1:e.key==='ArrowRight'?(i+1)%tabs.length:(i-1+tabs.length)%tabs.length;const t=tabs[n];openTab(t.dataset.tab);t.focus()}});ctl('#detailsToggle').onclick=()=>{const d=$('#tabDetails'),hidden=d.hasAttribute('hidden');if(hidden){d.removeAttribute('hidden');$('#detailsToggle')?.classList.add('open');$('#detailsToggle')?.setAttribute('aria-expanded','true');openTab('formatting')}else{d.setAttribute('hidden','');$('#detailsToggle')?.classList.remove('open');$('#detailsToggle')?.setAttribute('aria-expanded','false');openTab('overview')}};ctl('#submissionChecklist').onchange=(e: any)=>{const c=e.target.closest('[data-submission-check]');if(c){saveSubmissionCheck(c.dataset.submissionCheck,c.checked);if(currentResult)renderSubmissionChecklist(currentResult)}};ctl('#submissionChecklist').onclick=(e: any)=>{const b=e.target.closest('[data-download-submission]');if(b){downloadSubmissionReport();return}const ph=e.target.closest('[data-open-phase]');if(ph){$('#resultView')?.classList.add('hidden');$('#wizardView')?.classList.remove('hidden');setWizardStep(3);const d=document.querySelector('.advanced-options');if(d)(d as any).open=true;document.querySelector('#analyzer')?.scrollIntoView({behavior:'smooth'});setTimeout(()=>$('#submissionPhase')?.focus(),350)}};ctl('#categoryGrid').onclick=(e: any)=>{const c=e.target.closest('[data-cat-tab]');if(!c)return;const t=c.dataset.catTab;if(t&&t!=='overview'){revealResultDetails();revealDetails();openTab(t)}};ctl('#categoryGrid').onkeydown=(e: any)=>{if(e.key!=='Enter'&&e.key!==' ')return;const c=e.target.closest('[data-cat-tab]');if(!c)return;e.preventDefault();c.click()};$$('.metric-jump').forEach(m=>{m.onclick=()=>{revealResultDetails();openTab(m.dataset.jump)};m.onkeydown=(e: any)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();revealResultDetails();openTab(m.dataset.jump)}}});{const dm=document.querySelector('.dl-menu'),db=dm?.querySelector('.dl-menu-btn');if(dm&&db){const set=(v: any)=>db.setAttribute('aria-expanded',v?'true':'false');dm.addEventListener('mouseenter',()=>set(true));dm.addEventListener('mouseleave',()=>set(false));dm.addEventListener('focusin',()=>set(true));dm.addEventListener('focusout',()=>set(false));dm.addEventListener('keydown',(e: any)=>{if(e.key==='Escape'){set(false);document.activeElement&&(document.activeElement as any).blur&&(document.activeElement as any).blur()}})}}{const ph=$('#openPhaseFromHint');if(ph)ph.onclick=()=>{setWizardStep(3);const d=document.querySelector('.advanced-options');if(d)(d as any).open=true;const sp=$('#submissionPhase');if(sp){sp.focus();sp.scrollIntoView({behavior:'smooth',block:'center'})}}}
 ctl('#newAnalysis').onclick=resetAnalyzer;$('#previewModeCitljivo')&&(ctl('#previewModeCitljivo').onclick=()=>setPreviewMode('citljivo'));$('#previewModeFaksimil')&&(ctl('#previewModeFaksimil').onclick=()=>setPreviewMode('faksimil'));$('#closePreview')&&(ctl('#closePreview').onclick=closePreview);$('#closePreviewBottom')&&(ctl('#closePreviewBottom').onclick=closePreview);$('#previewModal')&&(ctl('#previewModal').onclick=(e: any)=>{if(e.target.id==='previewModal')closePreview()});$('#reportWrongCheck')&&(ctl('#reportWrongCheck').onclick=reportWrongCheck);$('#closeReport')&&(ctl('#closeReport').onclick=closeReport);$('#cancelReport')&&(ctl('#cancelReport').onclick=closeReport);$('#submitReport')&&(ctl('#submitReport').onclick=submitReport);$('#reportModal')&&(ctl('#reportModal').onclick=(e: any)=>{if(e.target.id==='reportModal')closeReport()});ctl('#printReport').onclick=()=>window.print();ctl('#downloadHtml').onclick=downloadHtmlReport;{const ub=$('#unlockReport');if(ub){ub.onclick=handleUnlockReport;ub.classList.toggle('hidden',!reportEndpointConfigured())}}ctl('#downloadJson').onclick=downloadResult;ctl('#orderFromResult').onclick=()=>openOrder('panic');ctl('#historyBtn').onclick=openHistory;ctl('#closeHistory').onclick=closeHistory;ctl('#closeHistoryBottom').onclick=closeHistory;ctl('#clearHistory').onclick=clearAnalysisHistory;ctl('#historyModal').onclick=(e: any)=>{if(e.target.id==='historyModal')closeHistory()};ctl('#historyList').onclick=handleHistoryAction;$('#repairHistoryBtn')&&(ctl('#repairHistoryBtn').onclick=openRepairHistory);$('#closeRepairHistory')&&(ctl('#closeRepairHistory').onclick=closeRepairHistory);$('#closeRepairHistoryBottom')&&(ctl('#closeRepairHistoryBottom').onclick=closeRepairHistory);$('#repairHistoryModal')&&(ctl('#repairHistoryModal').onclick=(e: any)=>{if(e.target.id==='repairHistoryModal')closeRepairHistory()});$('#repairHistoryList')&&(ctl('#repairHistoryList').onclick=handleRepairHistoryAction);if(__DEV_TOOLS__){ctl('#qaBtn').onclick=openQa;ctl('#closeQa').onclick=closeQa;ctl('#closeQaBottom').onclick=closeQa;ctl('#qaModal').onclick=(e: any)=>{if(e.target.id==='qaModal')closeQa()};ctl('#downloadManifest').onclick=downloadProfileManifest;}$('#closeAuth')&&(ctl('#closeAuth').onclick=closeAuth);$('#authSubmit')&&(ctl('#authSubmit').onclick=authSubmit);$('#authChangeEmail')&&(ctl('#authChangeEmail').onclick=authChangeEmail);$('#authModal')&&(ctl('#authModal').onclick=(e: any)=>{if(e.target.id==='authModal')closeAuth()});$('#authCode')&&$('#authCode')?.addEventListener('keydown',(e: any)=>{if(e.key==='Enter')authSubmit()});$('#authEmail')&&$('#authEmail')?.addEventListener('keydown',(e: any)=>{if(e.key==='Enter'&&_authStep==='email')authSubmit()});$('#closeGuarantee')&&(ctl('#closeGuarantee').onclick=closeGuarantee);$('#guaranteeSubmit')&&(ctl('#guaranteeSubmit').onclick=submitGuaranteeClaim);$('#guaranteeModal')&&(ctl('#guaranteeModal').onclick=(e: any)=>{if(e.target.id==='guaranteeModal')closeGuarantee()});$('#closeCheckoutConsent')&&(ctl('#closeCheckoutConsent').onclick=closeCheckoutConsent);$('#cancelCheckoutConsent')&&(ctl('#cancelCheckoutConsent').onclick=closeCheckoutConsent);$('#checkoutConsentModal')&&(ctl('#checkoutConsentModal').onclick=(e: any)=>{if(e.target.id==='checkoutConsentModal')closeCheckoutConsent()});
 $$('.order-btn').forEach(b=>b.onclick=()=>openOrder(b.dataset.package));ctl('#closeModal').onclick=closeOrder;ctl('#cancelOrder').onclick=closeOrder;ctl('#orderModal').onclick=(e: any)=>{if(e.target.id==='orderModal')closeOrder()};ctl('#submitOrder').onclick=submitOrder;ctl('#orderDocument').onchange=updateOrderFileMeta;document.addEventListener('click',(e: any)=>{const b=e.target.closest('.legal-open');if(b){e.preventDefault();openLegal(b.dataset.legal)}});ctl('#closeLegal').onclick=closeLegal;ctl('#closeLegalBottom').onclick=closeLegal;ctl('#legalModal').onclick=(e: any)=>{if(e.target.id==='legalModal')closeLegal()};ctl('#privacySettingsBtn').onclick=openPrivacySettings;ctl('#analyticsAccept').onclick=()=>setAnalyticsConsent('granted');ctl('#analyticsDecline').onclick=()=>setAnalyticsConsent('denied');try{window.addEventListener('resize',()=>syncConsentBannerInset())}catch(e: any){}if(__DEV_TOOLS__){ctl('#closeSetup').onclick=closeSetup;ctl('#setupModal').onclick=(e: any)=>{if(e.target.id==='setupModal')closeSetup()};ctl('#saveProductionConfig').onclick=saveSetupConfig;ctl('#resetProductionConfig').onclick=resetSetupConfig;ctl('#exportProductionConfig').onclick=exportProductionConfig;}
 document.addEventListener('keydown',(e: any)=>{if(e.key==='Escape'){const _modalOpen=!!document.querySelector('.modal-backdrop:not(.hidden)');closeOrder();closeHistory();closeLegal();closeAuth();closeGuarantee();closeCheckoutConsent();closeReport();closePreview();closeRepairHistory();if(__DEV_TOOLS__){closeQa();closeSetup()}if(!_modalOpen&&$('#progressView')?.classList.contains('hidden')===false)cancelAnalysis()}if(__DEV_TOOLS__&&e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='q'&&qaMode)openQa()});if(__DEV_TOOLS__&&setupMode)setTimeout(openSetup,250);['#institutionSelect','#unitSelect','#programSelect','#workType','#workVariant','#departmentSelect','#methodologySelect'].forEach(s=>$(s)?.addEventListener('change',()=>{_profileConfirmed=true}));$('#analyzeProfile')?.addEventListener('click',(e: any)=>{if(e.target.closest('[data-confirm-profile]')){_profileConfirmed=true;updateProfile();runAnalysis()}else if(e.target.closest('[data-change-profile]')){$('#institutionSelect')?.focus();$('#institutionSelect')?.scrollIntoView({behavior:'smooth',block:'center'})}else if(e.target.closest('[data-confirm-docgate]')){_intake.confirmedSuspicious=true;runAnalysis()}else if(e.target.closest('[data-change-docfile]')){setWizardStep(1);try{$('#dropzone')?.focus()}catch(err: any){}}});$('#wizardView')?.addEventListener('change',()=>{invalidateSpeculative();clearTimeout(_specTimer);_specTimer=setTimeout(()=>{startSpeculativeAnalysis()},450)});$('#stepBackDoc')&&(ctl('#stepBackDoc').onclick=()=>{setWizardStep(1,true);try{$('#dropzone')?.focus()}catch(e: any){}});$('#stepToProfile')&&(ctl('#stepToProfile').onclick=()=>{setWizardStep(2,true);try{$('#institutionSelect')?.focus()}catch(e: any){}});$('#stepToAnalyze')&&(ctl('#stepToAnalyze').onclick=()=>{_profileConfirmed=true;updateProfile();setWizardStep(3,true);try{$('#analyzeBtn')?.focus()}catch(e: any){}});$('#stepBackProfile')&&(ctl('#stepBackProfile').onclick=()=>{setWizardStep(2,true);try{$('#institutionSelect')?.focus()}catch(e: any){}});
 $('#resultBackDoc')&&(ctl('#resultBackDoc').onclick=()=>{backToWizardFromResult(1);try{$('#dropzone')?.focus({preventScroll:true})}catch(e: any){}});$('#resultBackProfile')&&(ctl('#resultBackProfile').onclick=()=>{backToWizardFromResult(2);try{$('#institutionSelect')?.focus({preventScroll:true})}catch(e: any){}});
 $('#paperCoverBtn')&&(ctl('#paperCoverBtn').onclick=()=>revealAnalyzerForm(true));$('#uploadCtaBtn')&&(ctl('#uploadCtaBtn').onclick=()=>revealAnalyzerForm(true));$('#paperCover')?.addEventListener('dragenter',()=>revealAnalyzerForm(false));document.addEventListener('click',(e: any)=>{if(e.target.closest('a[href="#analyzer"]'))revealAnalyzerForm(false)});
 $('#stepToProfile')?.addEventListener('click',()=>{void trackEvent('profile_step_opened',{})});
 $('#stepToAnalyze')?.addEventListener('click',()=>{void trackEvent('profile_completed',{profileStatus:profileStatusForEvent(()=>currentProfile().p)})}); // `currentProfile()` BACA kad pravila nisu ucitana; ovaj je listener bio sinkron i bez garda, pa je dogadjaj tiho nestajao dok je carobnjak isao dalje (korak mijenja DRUGI listener).
 $('#profileNote')?.addEventListener('click',(e: any)=>{if(e.target.closest('[data-profile-change]')){$('#institutionSelect')?.focus();$('#institutionSelect')?.scrollIntoView({behavior:'smooth',block:'center'})}});
 // #issueFilters onclick se ozicuje unutar renderPhaseTwoResultViews (jedini pisac popisa
 // nalaza), ne ovdje: prije analize nema sto filtrirati, a nakon prve analize taj kasniji
 // upis ionako uvijek pregazi bilo koje pocetno ozicenje na ovom elementu.
 // Promaseni drop izvan dropzonea ne smije otvoriti datoteku u pregledniku (file inputi ostaju nativni).
 document.addEventListener('dragover',(e: any)=>e.preventDefault());document.addEventListener('drop',(e: any)=>{if(!e.target.closest('#dropzone,input[type="file"]'))e.preventDefault()});
 // Pretrazive ploce nad selectima profila (select-search.ts). Fakultet pretrazuje SVIH 133 jedinica
 // preko svih ustanova: odabir prvo postavi sveuciliste (change -> populateUnits) pa fakultet.
 attachSelectSearch({select:$('#institutionSelect'),placeholder:'Pretraži sveučilišta i ustanove…'});
 attachSelectSearch({select:$('#unitSelect'),placeholder:'Upiši ime fakulteta, npr. filozofski…',getOptions:()=>allUnits().sort(byNameHr).map((u: any)=>({value:u.id,label:u.name,sub:u.institutionName,extra:{institutionId:u.institutionId}})),apply:(o)=>{const inst=$('#institutionSelect');if(o.extra?.institutionId&&inst.value!==o.extra.institutionId){inst.value=o.extra.institutionId;inst.dispatchEvent(new Event('change',{bubbles:true}))}const u=$('#unitSelect');u.value=o.value;u.dispatchEvent(new Event('change',{bubbles:true}))}});
 attachSelectSearch({select:$('#programSelect'),placeholder:'Pretraži studije…'});
}
// Wizard paneli (jedan ekran po koraku): 1 Dokument, 2 Profil, 3 Provjera. data-step na #wizardView
// gejta CSS panele (index.html LEK blok); spekulativna analiza radi neovisno o panelima.
function setWizardStep(n: any,animate?: any){const w=$('#wizardView');if(!w)return;const apply=()=>{w.dataset.step=String(n);if(n===2&&selectedDocx){const f=$('#stepFileName');if(f){f.textContent=selectedDocx.name;f.title=selectedDocx.name}}};if(animate)withViewTransition(apply);else apply()}
function usesCompactUploadFlow(){return !!(window.matchMedia&&window.matchMedia('(max-width:720px)').matches)}
// Papir-naslovnica: obrazac je skriven dok korisnik ne krene. Jednosmjerno (klasa se ne skida),
// pa "Nova provjera" i povratci NE vracaju cover usred toka. pick=true otvara i OS dijalog za
// odabir datoteke (dozvoljeno jer se poziva iz korisnickog klika).
let _engagedTracked=false;
function revealAnalyzerForm(pick: any){if(!_engagedTracked){_engagedTracked=true;void trackEvent('analyzer_engaged',{pick:!!pick})}const col=document.querySelector('.lek-col-form');if(col)col.classList.add('lek-engaged');if(pick){try{$('#fileInput')?.click()}catch(e: any){}}else{try{$('#dropzone')?.focus({preventScroll:true})}catch(e: any){}}}
// Meki povratak iz rezultata: dokument OSTAJE u memoriji (selectedDocx), samo se vracamo na korak.
// Spekulativna analiza odmah krece u pozadini pa je ponovni Analiziraj bez promjena prakticki instantan.
function backToWizardFromResult(step: any){withViewTransition(()=>{$('#resultView')?.classList.add('hidden');$('#wizardView')?.classList.remove('hidden');setWizardStep(step)});document.querySelector('#analyzer')?.scrollIntoView({behavior:'smooth'});void startSpeculativeAnalysis()}
function setFile(file: any){
  if(file!==selectedDocx)findingStates.clear();
  const err=$('#dropError'),clearErr=()=>{if(err){err.textContent='';err.classList.add('hidden')}$('#dropzone').classList.remove('has-error')};
 const _cap=effectiveUploadCap();if(file&&(!file.name.toLowerCase().endsWith('.docx')||file.size>_cap)){const tooBig=file.size>_cap,isDoc=/\.doc$/i.test(file.name),isMacroExt=/\.(docm|dotm)$/i.test(file.name),msg=tooBig?`Dokument je veći od ${Math.round(_cap/1024/1024)} MB${isLikelyMobile()?' (na mobitelu je granica niža radi memorije; za velike dokumente otvori na računalu)':''}.`:isMacroExt?'Dokumenti s makronaredbama (.docm i .dotm) nisu podržani. U Wordu spremi rad kao .docx bez makronaredbi.':isDoc?'Stariji .doc format nije podržan. U Wordu odaberi Datoteka pa Spremi kao i odaberi .docx.':'Odaberi Word dokument u .docx formatu.';$('#fileInput').value='';if(err){err.textContent=msg;err.classList.remove('hidden')}$('#dropzone').classList.add('has-error');toast(msg);emitAnalyzerDocumentSettled({kind:'rejected',file,message:String(msg||'')});return}
 clearErr();$('#detectBadge')?.classList.add('hidden');
 selectedDocx=file||null;$('#dropEmpty').classList.toggle('hidden',!!file);$('#selectedFile').classList.toggle('hidden',!file);$('#dropzone').classList.toggle('has-file',!!file);$('#analyzeBtn').disabled=!file;$('#demoBtn')?.classList.toggle('hidden',!!file);setWizardStep(file&&!usesCompactUploadFlow()?2:1,!!file);
 if(file){$('#selectedName').textContent=file.name;$('#selectedMeta').textContent=`${(file.size/1024/1024).toFixed(2)} MB · spremno za lokalnu analizu`;void trackEvent('file_selected',{sizeBucket:file.size<1024*1024?'under_1mb':file.size<5*1024*1024?'1_5mb':'over_5mb'});updateQuickStats(file);updateProfile();void admitFile(file)}else{$('#fileInput').value='';invalidateSpeculative()}
}
// Intake gate sloj 1: trijaza datoteke PRIJE detekcije konteksta i spekulativne analize.
// Tvrdi reject (nedvosmisleno nije rad: premalo, nije ZIP, korupcija, makronaredbe, prazno)
// cisti odabir i pokazuje poruku; tek OK datoteka ide na detekciju + spekulaciju, pa
// bomba/makro/ne-zip nikad ne dodje do workera ni do DOM parsea na glavnoj niti.
// Gate modul je fail-open (vlastita greska propusta datoteku); engine iza ima svoje capove.
async function admitFile(file: any){
 const token=++_intakeToken;
 const { inspectDocxIntake }=await import('../docx/intake-gate');
 if(token!==_intakeToken||selectedDocx!==file){emitAnalyzerDocumentSettled({kind:'superseded',file});return}
 const promise=inspectDocxIntake(file);
 _intake={file,promise,verdict:null,confirmedSuspicious:false};
 const v=await promise;
 if(token!==_intakeToken||selectedDocx!==file){emitAnalyzerDocumentSettled({kind:'superseded',file});return}
 _intake.verdict=v;
 if(v.kind==='reject'){
  setFile(null);
  const err=$('#dropError');if(err){err.textContent=v.message;err.classList.remove('hidden')}
  $('#dropzone')?.classList.add('has-error');toast(v.message);
  emitAnalyzerDocumentSettled({kind:'rejected',file,message:String(v.message||'')});
  return;
 }
 // Prihvaceno: verdikt je poznat i dokument je jos aktualan. Tek sada smije nastati sesija.
 emitAnalyzerDocumentSettled({kind:'accepted',file,verdict:v});
 // Spekulativna analiza svjesno krece i za SUMNJIV dokument (gate blokira samo klik na
 // Analiziraj do potvrde); kod potvrde se spekulativni rezultat normalno posvaja pa je
 // potvrda prakticki besplatna.
 applyDetectedContext(file).finally(()=>{startSpeculativeAnalysis()});
}
// Feature 4: auto-detekcija fakulteta/studija/razine s uploada. Cisto citanje parsera (bez izmjene
// enginea): iz naslovnice + core naslova heuristicki pogadja kombinaciju i prretpopuni izbornike.
// Nikad ne blokira analizu; ako nista ne prepozna, ostavlja postojeci odabir. Korisnik moze ispraviti.
let _detectToken=0,_statsToken=0,_analyzeToken=0,_intakeToken=0;
// Intake gate (dvoslojna politika): per-file verdikt trijaze + korisnikova potvrda sumnjivog
// dokumenta. admitFile pri svakoj novoj datoteci zamjenjuje cijeli objekt, pa se odluka
// ("Svejedno analiziraj") pamti po datoteci i ne gnjavi dvaput; guard uvijek provjerava
// _intake.file===selectedDocx da zastarjeli verdikt ne procuri na novu datoteku.
let _intake: any={file:null,promise:null,verdict:null,confirmedSuspicious:false};
// Brzi peek rijeci/stranica iz app.xml (ne dira analyzeDocx); token guard protiv zastarjelog updatea.
async function updateQuickStats(file: any){const token=++_statsToken;const { docxQuickStats }=await import('../docx/quick-stats');const s=await docxQuickStats(file);if(token!==_statsToken||selectedDocx!==file||!s)return;const bits=[];if(s.words)bits.push(`${fmt(s.words)} riječi`);if(s.pages)bits.push(`${s.pages} str.`);if(bits.length&&$('#selectedMeta'))$('#selectedMeta').textContent=`${(file.size/1024/1024).toFixed(2)} MB · ${bits.join(' · ')}`}
async function detectDocxContext(file: any){
 try{
  const { ZipReader, parseXml, paragraphText, MAX_SCAN_PARAGRAPHS }=await import('../docx/parser');
  const zip=new ZipReader(await file.arrayBuffer());const xml=await zip.text('word/document.xml');if(!xml)return null;
  {let _pc=0;const _re=/<w:p[\s/>]/g;while(_re.exec(xml))if(++_pc>MAX_SCAN_PARAGRAPHS)return null} // golem XML: ne DOM-parsaj na glavnoj niti, engine ce ga ionako odbiti
  const doc=parseXml(xml,'Detekcija konteksta'),paras=els(doc,'w:p').map(paragraphText).map(x=>x.trim()).filter(Boolean).slice(0,80);
  let coreTitle='';try{const c=await zip.text('docProps/core.xml');if(c)coreTitle=textOf(first(parseXml(c,'DOCX core'),'dc:title'))||''}catch(e: any){}
  return detectContextFromText(allUnits(),paras.join(' ')+' '+coreTitle);
 }catch(e: any){return null}
}
async function applyDetectedContext(file: any){
 const token=++_detectToken,ctx=await detectDocxContext(file);
 if(token!==_detectToken||!ctx)return;
 setOptionIfExists($('#institutionSelect'),ctx.institutionId||'unizg');populateUnits();
 setOptionIfExists($('#unitSelect'),ctx.unitId);populatePrograms();
 if(ctx.program)setOptionIfExists($('#programSelect'),ctx.program);
 autoSelectWorkType();if(ctx.workType)setOptionIfExists($('#workType'),ctx.workType);
 syncProfileContext();savePreferences();_profileConfirmed=isConfidentDetection(ctx);
 const parts=[ctx.unitName];if(ctx.program)parts.push(ctx.program);if(ctx.workType)parts.push((WORK_TYPE_LABELS as any)[ctx.workType]||ctx.workType);
 const badge=$('#detectBadge');if(badge){badge.innerHTML=`<i data-lucide="info"></i> Prepoznato iz dokumenta: ${escapeHtml(parts.join(' · '))}. Provjeri i ispravi po potrebi.`;badge.classList.remove('hidden');window.__lektaIcons?.()}
 toast('Prepoznato iz dokumenta: '+parts.join(' · ')+'.');
}
function setAuxFile(kind: any,file?: any){
 const isPdf=kind==='pdf',isAv=kind==='av',max=isPdf?100*1024*1024:isAv?8*1024*1024*1024:25*1024*1024,ext=isPdf?'.pdf':isAv?null:'.docx';
 if(file&&((ext&&!file.name.toLowerCase().endsWith(ext))||file.size>max)){toast(file&&file.size>max?`Datoteka je veća od ${Math.round(max/1024/1024)} MB.`:`Odaberi datoteku u ${ext} formatu.`);return}
 if(isPdf){selectedPdf=file||null;currentPdfAudit=null;$('#pdfInput').value=file?'':''}
 else if(isAv){selectedAvFile=file||null;$('#avInput').value=file?'':''}
 else{selectedMetadataDocx=file||null;currentMetadataAudit=null;$('#metadataInput').value=file?'':''}
 updatePackageUi();
}
function currentSubmissionPhase(){return $('#submissionPhase')?.value||'document'}
function currentFpzgCohort(){return $('#fpzgCohort')?.value||'current'}
function currentFpzgDeadlineId(){return $('#fpzgDeadline')?.value||null}
function currentDefinitionId(){return findVerifiedDefinition()?.id||null}
function isFpzgAvProfile(){return $('#unitSelect')?.value==='fpzg'&&currentDefinitionId()==='fpzg-novinarstvo-zavrsni-av'}
function fpzgScheduleType(){const id: any=currentDefinitionId();if(['fpzg-politologija-zavrsni','fpzg-novinarstvo-zavrsni-tekst','fpzg-novinarstvo-zavrsni-av'].includes(id))return'final';if(['fpzg-politologija-diplomski','fpzg-nacionalna-sigurnost-diplomski','fpzg-novinarstvo-diplomski'].includes(id))return'graduate';return null}
function hrDate(value: any,withTime=false){if(!value)return'?';const d=new Date(value.length===10?value+'T12:00:00':value);return new Intl.DateTimeFormat('hr-HR',{day:'2-digit',month:'2-digit',year:'numeric',...(withTime?{hour:'2-digit',minute:'2-digit'}:{})}).format(d)}
function dateRange(a: any,b: any){return`${hrDate(a)} do ${hrDate(b)}`}
function deadlineState(entry: any){const now=Date.now(),start=new Date((entry.defenseStart||entry.start)+'T00:00:00').getTime(),end=new Date((entry.defenseEnd||entry.end)+'T23:59:59').getTime(),cutoff=entry.cutoff?new Date(entry.cutoff).getTime():null;if(now>end)return{key:'closed',label:'rok završen'};if(now>=start&&now<=end)return{key:'active',label:'obrane u tijeku'};if(cutoff&&now>cutoff)return{key:'cutoff',label:'rok prijave prošao'};return{key:'upcoming',label:'nadolazeći rok'}}
function fpzgDeadlineEntries(type=fpzgScheduleType(),cohort=currentFpzgCohort()){if(type==='final')return FPZG_SUBMISSION_CALENDAR.final.windows.filter((x: any)=>x.cohorts.includes(cohort));if(type==='graduate')return FPZG_SUBMISSION_CALENDAR.graduate.sessions;return[]}
function populateFpzgDeadlineOptions(){const type=fpzgScheduleType(),show=!!type&&currentSubmissionPhase()!=='document',cohortField=$('#fpzgCohortField'),deadlineField=$('#fpzgDeadlineField'),select=$('#fpzgDeadline');cohortField?.classList.toggle('hidden',!(show&&type==='final'));deadlineField?.classList.toggle('hidden',!show);$('#fpzgPhaseHint')?.classList.toggle('hidden',!(!!type&&!show));if(!show||!select)return;const previous=select.value,entries=fpzgDeadlineEntries(type);select.innerHTML=entries.map((x: any)=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.label)} · ${escapeHtml(dateRange(x.defenseStart||x.start,x.defenseEnd||x.end))}</option>`).join('');if(entries.some((x: any)=>x.id===previous))select.value=previous;else{const next=entries.find((x: any)=>new Date((x.defenseEnd||x.end)+'T23:59:59').getTime()>=Date.now())||entries.at(-1);if(next)select.value=next.id}const help=$('#fpzgDeadlineHelp');if(help)help.textContent=type==='final'?'Datum obrane mora biti radni dan unutar odabranog razdoblja, a prijava najmanje tri radna dana ranije.':'Odabrani rok određuje krajnji datum D2 obrasca, uvezanog rada i dokumentacije te razdoblje obrane.'}
function updateSubmissionContextFields(){populateFpzgDeadlineOptions()}
function auxState(el: any,state: any,label: any){if(!el)return;el.className=`file-state ${state||''}`;el.textContent=label}
function updatePackageUi(){
 const phase=currentSubmissionPhase(),unit=$('#unitSelect')?.value,showMeta=unit==='pravo'&&['after','full'].includes(phase),showAv=isFpzgAvProfile();$('#metadataFileCard')?.classList.toggle('hidden',!showMeta);$('#avFileCard')?.classList.toggle('hidden',!showAv);updateSubmissionContextFields();
 if($('#wordUploadTitle'))$('#wordUploadTitle').textContent=showAv?'Učitaj prateći tekst u Wordu':'Učitaj rad u Wordu';if($('#wordUploadDescription')){const _capMb=Math.round(effectiveUploadCap()/1024/1024);$('#wordUploadDescription').textContent=showAv?`Prateći tekst · najviše ${_capMb} MB`:`Word (.docx), do ${_capMb} MB`}
 if(selectedPdf){$('#pdfMeta').textContent=`${selectedPdf.name} · ${(selectedPdf.size/1024/1024).toFixed(2)} MB · lokalno`;auxState($('#pdfState'),'ready','odabran');$('#removePdf').classList.remove('hidden')}else{$('#pdfMeta').textContent=phase==='document'?'PDF nije potreban za radnu provjeru.':showAv?'Dodaj konačni PDF pratećeg teksta ako se predaje uz audiovizualni rad.':'Dodaj konačni PDF za predajni preflight.';auxState($('#pdfState'),phase==='document'?'':'warn','nije odabran');$('#removePdf').classList.add('hidden')}
 if(selectedMetadataDocx){$('#metadataMeta').textContent=`${selectedMetadataDocx.name} · ${(selectedMetadataDocx.size/1024/1024).toFixed(2)} MB · lokalno`;auxState($('#metadataState'),'ready','odabran');$('#removeMetadata').classList.remove('hidden')}else{$('#metadataMeta').textContent=showMeta?'Pravni fakultet nakon obrane: zaseban Word s dvojezičnim sažetkom i ključnim riječima.':'Za profile i faze koji ga zahtijevaju.';auxState($('#metadataState'),showMeta?'warn':'','nije odabran');$('#removeMetadata').classList.add('hidden')}
 if(selectedAvFile){$('#avMeta').textContent=`${selectedAvFile.name} · ${(selectedAvFile.size/1024/1024).toFixed(2)} MB · samo lokalno evidentirano`;auxState($('#avState'),'ready','evidentirano');$('#removeAv').classList.remove('hidden')}else{$('#avMeta').textContent='Za audiovizualni završni rad Novinarstva. Datoteka se samo lokalno evidentira.';auxState($('#avState'),showAv?'warn':'','nije odabran');$('#removeAv').classList.add('hidden')}
 const notes: any={document:'Analizira se samo sadržaj i oblikovanje Word dokumenta.',before:'Provjeravaju se konačni dokument, PDF, ciljani godišnji rok i obveze prije obrane.',after:'Provjeravaju se datoteke i obveze koje slijede nakon obrane.',full:'Provjerava se cijeli paket prije i nakon obrane, uključujući godišnji rok.'};if($('#submissionPhaseNote'))$('#submissionPhaseNote').textContent=notes[phase];
}

function safeStorageGet(key: any,fallback: any=null){try{const raw=localStorage.getItem(key);if(raw)return JSON.parse(raw)}catch(e: any){}return SESSION_MEMORY.has(key)?structuredClone(SESSION_MEMORY.get(key)):fallback}
function safeStorageSet(key: any,value: any){SESSION_MEMORY.set(key,structuredClone(value));try{localStorage.setItem(key,JSON.stringify(value));return true}catch(e: any){return false}}
function optionExists(select: any,value: any){return !!select&&[...select.options].some(o=>o.value===value)}
function setOptionIfExists(select: any,value: any){if(value!=null&&optionExists(select,value))select.value=value}
function savePreferences(){const p={institution:$('#institutionSelect')?.value,unit:$('#unitSelect')?.value,program:$('#programSelect')?.value,workType:$('#workType')?.value,variant:$('#workVariant')?.value,department:$('#departmentSelect')?.value,methodology:$('#methodologySelect')?.value,citation:$('#citationStyle')?.value,language:$('#docLanguage')?.value,strictness:$('#strictness')?.value,submissionPhase:$('#submissionPhase')?.value,fpzgCohort:$('#fpzgCohort')?.value,fpzgDeadline:$('#fpzgDeadline')?.value,mentorOverride:!!$('#mentorOverride')?.checked,customFont:$('#customFont')?.value,customSize:$('#customSize')?.value,customSpacing:$('#customSpacing')?.value,customMargin:$('#customMargin')?.value};safeStorageSet(STORAGE_KEYS.preferences,p)}
function restorePreferences(){const p=safeStorageGet(STORAGE_KEYS.preferences);if(!p)return;setOptionIfExists($('#institutionSelect'),p.institution);populateUnits();setOptionIfExists($('#unitSelect'),p.unit);populatePrograms();setOptionIfExists($('#programSelect'),p.program);setOptionIfExists($('#workType'),p.workType);populateVariants();setOptionIfExists($('#workVariant'),p.variant);populateDepartments();setOptionIfExists($('#departmentSelect'),p.department);populateMethodology();setOptionIfExists($('#methodologySelect'),p.methodology);setOptionIfExists($('#citationStyle'),p.citation);setOptionIfExists($('#docLanguage'),p.language);setOptionIfExists($('#strictness'),p.strictness);setOptionIfExists($('#submissionPhase'),p.submissionPhase);updateSubmissionContextFields();setOptionIfExists($('#fpzgCohort'),p.fpzgCohort);populateFpzgDeadlineOptions();setOptionIfExists($('#fpzgDeadline'),p.fpzgDeadline);$('#mentorOverride').checked=!!p.mentorOverride;$('#customSettings').classList.toggle('hidden',!p.mentorOverride);if(p.customFont)$('#customFont').value=p.customFont;if(p.customSize)$('#customSize').value=p.customSize;if(p.customSpacing)$('#customSpacing').value=p.customSpacing;if(p.customMargin)$('#customMargin').value=p.customMargin;_profileConfirmed=true}
function loadProductionConfig(){const saved=safeStorageGet(STORAGE_KEYS.production,{});return{...structuredClone(DEFAULT_PRODUCTION_CONFIG),...(saved||{}),paymentLinks:{...DEFAULT_PRODUCTION_CONFIG.paymentLinks,...(saved?.paymentLinks||{})}}}
function productionStatus(){const links=Object.values(productionConfig?.paymentLinks||{}).filter(Boolean).length,endpoint=String(productionConfig?.orderEndpoint||'').trim();return{active:!!productionConfig?.enabled&&!!endpoint,links,endpoint,provider:productionConfig?.paymentProvider||'lemonsqueezy'}}
// Jesu li placene ponude uzivo (digitalni puni izvjestaj ILI rucno uredjivanje)? Besplatni
// soft-launch: nista nije konfigurirano pa su placene tarife "Uskoro", a narudzba se ne otvara
// (openOrder to gata), dok besplatna analiza radi normalno. Kad se konfigurira endpoint/checkout,
// puni tijek se vraca bez daljnjih izmjena.
function paidOffersLive(){return reportEndpointConfigured()||checkoutConfigured()||productionStatus().active}
function renderProductionState(){const el=$('#productionState');if(!el)return;const st=productionStatus(),max=Math.round((productionConfig.uploadMaxBytes||0)/1024/1024);el.className=`production-state ${st.active?'ready':'warn'}`;el.innerHTML=st.active?`<strong>Produkcijska predaja je aktivna</strong><span class="provider-pill">${escapeHtml(st.provider)}</span> Obrazac se šalje na konfigurirani endpoint. Dokument do ${max} MB može biti uključen u narudžbu.${st.links?` Dostupna su ${st.links} payment linka.`:' Payment linkovi još nisu uneseni.'}`:`<strong>Testni fallback: slanje nije aktivirano</strong>Narudžba će se spremiti kao lokalni JSON bez prijenosa dokumenta. Otvori aplikaciju s <code>?setup=1</code> za testiranje ili uredi <code>DEFAULT_PRODUCTION_CONFIG</code> prije objave.`}
function selectedOrderFile(){return $('#orderDocument')?.files?.[0]||selectedDocx||null}
function updateOrderFileMeta(){const f=selectedOrderFile(),el=$('#orderFileMeta'),max=Math.round((productionConfig.uploadMaxBytes||0)/1024/1024);if(!el)return;el.textContent=f?`${f.name} · ${(f.size/1024/1024).toFixed(2)} MB · ${f.size<=(productionConfig.uploadMaxBytes||0)?'spremno za slanje':'preveliko za konfigurirani kanal'}`:`Nije odabran dokument. Možeš poslati narudžbu bez datoteke i naknadno dogovoriti siguran kanal. Najviše ${max} MB.`}
function makeOrderId(){return`TR-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${Math.random().toString(36).slice(2,8).toUpperCase()}`}
function setOrderStatus(type: any,html?: any){const el=$('#orderStatus');el.className=`order-status ${type}`;el.innerHTML=html;el.classList.remove('hidden')}
function clearOrderStatus(){$('#orderStatus')?.classList.add('hidden');if($('#orderStatus'))$('#orderStatus').innerHTML=''}
function sanitizeEventData(data: any){const allowed: any={};for(const[k,v]of Object.entries(data||{})){if(['event','package','profileId','workType','scoreBand','provider','source','total','found','missing','flagged','checked','profileStatus','pick','sizeBucket','category','issueCount','kind','manual','count','score','demo','method','product','ruleId','changes','stored','ms'].includes(k)&&['string','number','boolean'].includes(typeof v))allowed[k]=v}return allowed}
async function trackEvent(event: any,data: any={}){if(!productionConfig?.analyticsEndpoint||safeStorageGet(STORAGE_KEYS.analyticsConsent)!=='granted')return false;try{await fetch(productionConfig.analyticsEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,version:APP_VERSION,path:location.pathname||'/',timestamp:new Date().toISOString(),...sanitizeEventData(data)}),keepalive:true});return true}catch(e: any){return false}}
// PRIVOLA NE SMIJE ZAROBITI SADRZAJ ISPOD SEBE (audit P0-05).
//
// Banner je `position:fixed` uz dno. Na uskom i niskom zaslonu (mjereno: Pixel 5, 375x667) prelazi
// u stupac, naraste i pokrije donji dio ekrana, a s njim i gumb "Nastavi na profil". Korisnik
// tapne gumb i pogodi banner; ako je analitika konfigurirana, a privola jos nije dana, tok stane
// prije analize. Playwright je to prijavljivao doslovno: `#consentBanner intercepts pointer
// events`, i zbog toga je mobilni test bio izuzet umjesto popravljen.
//
// Visina se MJERI, ne pogadja: ovisi o duljini teksta, jeziku i sirini, pa bi fiksna vrijednost
// bila kriva cim se copy promijeni. Dodatnih 16px je odmak bannera od ruba (`bottom:18px`).
function syncConsentBannerInset(){const b=$('#consentBanner');if(!b)return;const skriven=b.classList.contains('hidden');
 try{const h=skriven?0:Math.ceil(b.getBoundingClientRect().height);
  // Visina ide u CSS varijablu, a ne u fiksnu vrijednost u stilu: banner je na 375x667 visok
  // 169px (mjereno), ali to ovisi o duljini teksta i sirini, pa svaka konstanta brzo postane kriva.
  document.body.style.setProperty('--consent-h',`${h}px`);
  document.body.classList.toggle('has-consent-banner',!skriven);
  document.body.style.paddingBottom=skriven?'':`${h+34}px`}catch(e: any){}}
function renderConsentBanner(force=false){const b=$('#consentBanner');if(!b)return;const configured=!!productionConfig?.analyticsEndpoint,choice=safeStorageGet(STORAGE_KEYS.analyticsConsent);b.classList.toggle('hidden',!configured||(!force&&!!choice));syncConsentBannerInset()}
function setAnalyticsConsent(value: any){safeStorageSet(STORAGE_KEYS.analyticsConsent,value);$('#consentBanner')?.classList.add('hidden');syncConsentBannerInset();toast(value==='granted'?'Anonimna analitika je dopuštena.':'Ostat će aktivne samo nužne lokalne postavke.')}
function openPrivacySettings(){if(productionConfig?.analyticsEndpoint){renderConsentBanner(true)}else openLegal('privacy')}
/* Pravni HTML je potreban samo pri otvaranju modala. Verzija uvjeta ostaje mali staticki
   import jer se biljezi uz privole i narudzbe, a puni tekst ostaje izvan prvog bundlea. */
let _legalOpenToken=0;
// Fokus u modalima (a11y): zarobi Tab unutar modala i vrati fokus na okidac pri zatvaranju.
// Izdvojeno u modal-utils.ts da ga repair-panel.ts/repair-price-slider.ts mogu dijeliti.
async function openLegal(kind='privacy'){const modal=$('#legalModal'),title=$('#legalTitle'),content=$('#legalContent');if(!modal||!title||!content)return;const token=++_legalOpenToken;title.textContent='Učitavam pravne informacije';content.innerHTML='<p>Pripremam aktualni tekst.</p>';modal.classList.remove('hidden');trapModal(modal);try{const {legalDocuments}=await import('../legal/legal-content');if(token!==_legalOpenToken)return;const docs=legalDocuments({org:productionConfig.businessName,contact:productionConfig.contactEmail,controller:productionConfig.privacyController,days:productionConfig.retentionDays}),doc=(docs as any)[kind]||docs.privacy;title.textContent=doc.title;content.innerHTML=doc.html}catch(e: any){if(token!==_legalOpenToken)return;title.textContent='Pravne informacije';content.innerHTML='<p>Tekst trenutačno nije moguće učitati. Pokušaj ponovno.</p>'}}
function closeLegal(){_legalOpenToken++;$('#legalModal')?.classList.add('hidden');releaseModal($('#legalModal'))}
// Pregled dokumenta ima DVIJE verzije: "citljivo" (MVP tijek teksta, render-preview) i "faksimil"
// (vjeran prikaz s layoutom stranice, stvarnim fontom/poravnanjem/marginama i run-oblikovanjem,
// render-facsimile). Oba renderera i normalizator sidara LAZY se uvoze (ostaju izvan glavnog entry
// chunka; faksimil se uvozi tek kad korisnik prijedje na taj mod). Puni tekst dokumenta
// (currentResult.preview) je lokalan; ne ide na mrežu (sanitizeAnalysisResult ga izbacuje) ni u
// localStorage (saveAnalysisHistory sprema samo sažetak).
let _previewCtx: any=null;
const PREVIEW_CAPTIONS: any={
  citljivo:'Ovo je Lektin prikaz teksta, ne Microsoft Word. Crvene i žute oznake pokazuju mjesta koja Lekta može točno locirati; pravila koja vrijede za cijeli dokument navedena su desno.',
  faksimil:'Ovo je Lektin vjeran prikaz oblikovanja (font, poravnanje, margine), ne Microsoft Word: prijelomi stranica i točan razmještaj mogu se razlikovati. Crvene i žute oznake pokazuju mjesta koja Lekta može točno locirati; pravila za cijeli dokument navedena su desno.',
};
async function openPreview(){const r=currentResult;if(!r||!r.preview?.paragraphs?.length){toast('Pregled nije dostupan za ovaj rezultat.');return}const legend=$('#previewLegend');const existence=_existenceVerdicts&&_existenceVerdicts.result===r?_existenceVerdicts.verdicts:null;_previewCtx={r,flags:collectAllPreviewFlags(r,existence),mode:'citljivo',scroll:{},zoomState:null,zoomApi:null,anchorSelector:null};if(legend)legend.innerHTML=`<span class="pv-key"><span class="pv-swatch pv-swatch--error"></span> Treba ispraviti</span><span class="pv-key"><span class="pv-swatch pv-swatch--warning"></span> Provjeri</span><span class="pv-key"><span class="pv-swatch pv-swatch--info"></span> Informativno</span>`;$('#previewModal').classList.remove('hidden');trapModal($('#previewModal'));await renderPreviewMode();trackEvent('preview_opened',{profileId:r.details?.profileDefinitionId||''})}
// Prebaci mod prikaza (citljivo/faksimil) bez zatvaranja modala; ista bocna lista, drugi renderer.
function savePreviewViewport(){const ctx=_previewCtx,docEl=$('#previewDoc');if(!ctx||!docEl)return;ctx.scroll[ctx.mode]={top:docEl.scrollTop,left:docEl.scrollLeft};if(ctx.zoomApi)ctx.zoomState=ctx.zoomApi.getState()}
function setPreviewMode(mode: any){if(!_previewCtx||_previewCtx.mode===mode)return;savePreviewViewport();_previewCtx.zoomApi?.destroy?.();_previewCtx.zoomApi=null;_previewCtx.mode=mode;void renderPreviewMode()}
// Renderiraj trenutni mod u #previewDoc. Race-safe: ako se mod promijeni tijekom lazy importa, stara
// render-putanja odustaje (guard po ctx i modu) pa pobijedi zadnji izbor korisnika.
async function renderPreviewMode(){const ctx=_previewCtx;if(!ctx)return;const {r,flags,mode}=ctx;const docEl=$('#previewDoc'),side=$('#previewSide'),caption=$('#previewCaption');if(!docEl)return;docEl.textContent='Pripremam pregled...';const rendered=mode==='faksimil'?(await import('../preview/render-facsimile')).renderFacsimile(r.preview,flags):(await import('../preview/render-preview')).renderPreview(r.preview,flags);if(_previewCtx!==ctx||_previewCtx.mode!==mode)return;docEl.textContent='';docEl.classList.toggle('is-facsimile',mode==='faksimil');docEl.appendChild(rendered.root);
 /* Zoom: faksimil je pravi A4 (21 cm), pa bez ovoga trazi stalno skrolanje. Zadano "prilagodi
    sirini". Samo za faksimil; citljivi nacin nema stranicu pa nema sto skalirati. */
 $('#previewZoomBar')?.remove();
  if(mode==='faksimil'){try{const {attachFacsimileZoom,createZoomControls}=await import('../preview/facsimile-zoom');const z=attachFacsimileZoom(docEl,rendered.root);ctx.zoomApi=z;z.remeasure();if(ctx.zoomState)z.setState(ctx.zoomState);else z.fitWidth();const bar=createZoomControls(document,[z]);bar.id='previewZoomBar';caption?.parentElement?.insertBefore(bar,caption)}catch(e: any){console.error('Zoom:',e)}}
  const saved=ctx.scroll[mode];if(saved&&mode!=='faksimil'){docEl.scrollTop=saved.top;docEl.scrollLeft=saved.left}if(ctx.anchorSelector){const target=docEl.querySelector(ctx.anchorSelector);target?.scrollIntoView({block:'center'});}if(caption)caption.textContent=(PREVIEW_CAPTIONS[mode]||'')+(r.preview.truncated?' Dokument je velik pa je prikaz skraćen.':'');const cb=$('#previewModeCitljivo'),fb=$('#previewModeFaksimil');if(cb){cb.classList.toggle('is-active',mode==='citljivo');cb.setAttribute('aria-selected',mode==='citljivo'?'true':'false')}if(fb){fb.classList.toggle('is-active',mode==='faksimil');fb.setAttribute('aria-selected',mode==='faksimil'?'true':'false')}if(side)renderPreviewSide(side,flags,rendered);window.__lektaIcons?.()}
function closePreview(){savePreviewViewport();_previewCtx?.zoomApi?.destroy?.();$('#previewZoomBar')?.remove();$('#previewModal')?.classList.add('hidden');releaseModal($('#previewModal'));const d=$('#previewDoc');if(d){d.textContent='';d.classList.remove('is-facsimile')}_previewCtx=null}
function renderPreviewSide(side: any,flags: any[],rendered: any){const dotCls=(sev: string)=>sev==='error'?'pv-dot--error':sev==='warning'?'pv-dot--warning':'pv-dot--info';const anchored=flags.length?flags.map((f: any,i: number)=>{const loc=rendered.flagTargets.has(i);return`<button type="button" class="pv-item" data-flag="${i}"${loc?'':' disabled'}><span class="pv-item-title"><span class="pv-dot ${dotCls(f.severity)}"></span>${escapeHtml(f.title)}</span><span class="pv-item-loc">${f.footnoteId!=null?`bilješka ${f.footnoteId}`:`odlomak ${f.paragraphIndex}`}${loc?'':' · izvan skraćenog prikaza'}</span>${recipeUnlocked()&&f.excerpt?`<span class="pv-item-ex">${escapeHtml(f.excerpt)}</span>`:''}</button>`}).join(''):'<p class="pv-empty">Nema mjesta koja se mogu točno označiti u tekstu.</p>';const globalIssues=(currentResult?.issues||[]).filter((x: any)=>x.category==='formatting'&&(x.severity==='error'||x.severity==='warning'));const globalHtml=globalIssues.length?`<h4>Vrijedi za cijeli dokument</h4><ul class="preview-global">${globalIssues.map((x: any)=>`<li><strong>${escapeHtml(x.title)}</strong>${recipeUnlocked()&&x.detail?`<br><span class="pv-item-loc">${escapeHtml(x.detail)}</span>`:''}</li>`).join('')}</ul>`:'';side.innerHTML=`<h4>Označeno u tekstu (${flags.length})</h4>${anchored}${globalHtml}`;side.querySelectorAll('.pv-item[data-flag]').forEach((b: any)=>{b.onclick=()=>{const idx=Number(b.dataset.flag),f=flags[idx],t=rendered.flagTargets.get(idx);if(!t)return;_previewCtx.anchorSelector=f.footnoteId!=null?`[data-fn-id="${f.footnoteId}"]`:`[data-p-index="${f.paragraphIndex}"]`;void trackEvent('finding_jump',{category:f.kind||'',source:'preview'});t.scrollIntoView({block:'center',behavior:'smooth'});t.classList.add('lekta-flag--active');setTimeout(()=>t.classList.remove('lekta-flag--active'),1600)}})}
function openSetup(){const c=productionConfig;$('#setupEnabled').value=String(!!c.enabled);$('#setupProvider').value=c.paymentProvider||'lemonsqueezy';$('#setupOrderEndpoint').value=c.orderEndpoint||'';$('#setupBusinessName').value=c.businessName||'';$('#setupContactEmail').value=c.contactEmail||'';$('#setupRetentionDays').value=c.retentionDays||30;$('#setupUploadMb').value=Math.round((c.uploadMaxBytes||8*1024*1024)/1024/1024);$('#setupAnalyticsEndpoint').value=c.analyticsEndpoint||'';$('#setupErrorEndpoint')&&($('#setupErrorEndpoint').value=c.errorEndpoint||'');$('#setupReportEndpoint').value=c.reportEndpoint||'';$('#setupRepairEndpoint')&&($('#setupRepairEndpoint').value=c.repairEndpoint||'');$('#setupCheckoutEndpoint').value=c.checkoutEndpoint||'';$('#setupGuaranteeEndpoint')&&($('#setupGuaranteeEndpoint').value=c.guaranteeEndpoint||'');$('#setupSupabaseUrl')&&($('#setupSupabaseUrl').value=c.supabaseUrl||'');$('#setupSupabaseAnon')&&($('#setupSupabaseAnon').value=c.supabaseAnonKey||'');$('#setupPaymentLinks').innerHTML=PACKAGES.map(p=>`<div class="field full"><label for="setupPay-${p.id}">${escapeHtml(p.name)}</label><input class="input setup-payment" id="setupPay-${p.id}" data-package="${p.id}" value="${escapeHtml(c.paymentLinks?.[p.id]||'')}" placeholder="https://…"></div>`).join('');$('#setupModal').classList.remove('hidden');trapModal($('#setupModal'))}
function closeSetup(){$('#setupModal')?.classList.add('hidden');releaseModal($('#setupModal'))}
function readSetupConfig(){const paymentLinks: any={};$$('.setup-payment').forEach(x=>paymentLinks[x.dataset.package]=x.value.trim());return{...productionConfig,enabled:$('#setupEnabled').value==='true',paymentProvider:$('#setupProvider').value,orderEndpoint:$('#setupOrderEndpoint').value.trim(),businessName:$('#setupBusinessName').value.trim()||'Lekta',contactEmail:$('#setupContactEmail').value.trim(),privacyController:$('#setupBusinessName').value.trim()||'Lekta',retentionDays:Number($('#setupRetentionDays').value)||30,uploadMaxBytes:(Number($('#setupUploadMb').value)||8)*1024*1024,analyticsEndpoint:$('#setupAnalyticsEndpoint').value.trim(),errorEndpoint:($('#setupErrorEndpoint')?.value||'').trim(),reportEndpoint:$('#setupReportEndpoint').value.trim(),repairEndpoint:($('#setupRepairEndpoint')?.value||'').trim(),checkoutEndpoint:$('#setupCheckoutEndpoint').value.trim(),guaranteeEndpoint:($('#setupGuaranteeEndpoint')?.value||'').trim(),supabaseUrl:($('#setupSupabaseUrl')?.value||'').trim(),supabaseAnonKey:($('#setupSupabaseAnon')?.value||'').trim(),paymentLinks}}
function saveSetupConfig(){productionConfig=readSetupConfig();safeStorageSet(STORAGE_KEYS.production,productionConfig);closeSetup();renderProductionState();renderConsentBanner();resetUnlockButton();updateRepairHistoryButton();void ensureRetailCatalog(true);toast('Testna produkcijska konfiguracija je spremljena u ovom pregledniku.')}
function resetSetupConfig(){safeStorageSet(STORAGE_KEYS.production,{});productionConfig=structuredClone(DEFAULT_PRODUCTION_CONFIG);openSetup();toast('Vraćene su zadane vrijednosti.')}
function exportProductionConfig(){const c=readSetupConfig();downloadBlob(JSON.stringify(c,null,2),'application/json','Lekta-production-config-v2.2.2.json')}
function buildPaymentUrl(base: any,email: any,orderId: any,pkg: any){if(!base)return'';try{const u=new URL(base,location.href);if(productionConfig.paymentProvider==='stripe'){u.searchParams.set('prefilled_email',email);u.searchParams.set('utm_source','lekta');u.searchParams.set('utm_medium','app');u.searchParams.set('utm_campaign','order');u.searchParams.set('utm_content',pkg);u.searchParams.set('utm_term',orderId)}else if(productionConfig.paymentProvider==='lemonsqueezy'){u.searchParams.set('checkout[email]',email);u.searchParams.set('checkout[custom][order_id]',orderId);u.searchParams.set('checkout[custom][package]',pkg)}else{u.searchParams.set('order_id',orderId);u.searchParams.set('email',email)}return u.toString()}catch(e: any){return base}}
function saveOrderReceipt(order: any){const arr=safeStorageGet(STORAGE_KEYS.orders,[])||[];arr.unshift({orderId:order.orderId,createdAt:order.createdAt,package:order.package?.id,status:order.status,profile:order.analysis?.profile||order.requestedProfile?.unit||null});safeStorageSet(STORAGE_KEYS.orders,arr.slice(0,10))}
function autoSelectWorkType(){const program=$('#programSelect').value,exact=exactWorkTypes(),current=$('#workType').value,pick=defaultWorkTypeForProgram(program,exact,current);if(pick!==current&&$('#workType').querySelector('option[value="'+pick+'"]'))$('#workType').value=pick}
function exactWorkTypes(){const u=selectedUnit(),program=$('#programSelect').value;return workTypesForSelection(VERIFIED_PROFILE_REGISTRY,u.id,program)}
function updateWorkTypeSupport(){const exact=exactWorkTypes(),current=$('#workType').value,wt=$('#workType');for(const o of wt.options){o.textContent=(WORK_TYPE_LABELS as any)[o.value]||o.value}/*A: nikad ne zakljucavaj - svaka vrsta je provjerljiva (poseban profil ili transparentni opci baseline)*/wt.disabled=false;const help=$('#workTypeSupport');if(!help)return;const supported=[...exact].map(x=>(WORK_TYPE_LABELS as any)[x]||x);if(exact.has(current)){help.className='work-support exact';help.textContent='Poseban profil s bodovanim pravilima.'}else{help.className='work-support generic';help.textContent=supported.length?`Opći baseline, nije fakultetski propis: opseg i struktura ovise o silabusu i mentoru. Poseban profil postoji za: ${supported.join(', ')}.`:'Opći baseline: opseg, struktura i sadržaj ovise o silabusu i uputi nastavnika.'}}
function hashString(input: any){let h=2166136261;for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,'0')}
function profileFingerprint(profile: any){const compact={version:APP_VERSION,definition:profile.definitionId||null,department:profile.department?.id||null,workType:profile.selection?.workType,citation:profile.citation,authority:profile.ruleAuthority,rules:{font:profile.font,size:profile.size,spacing:profile.spacing,margins:profile.margins,wordMin:profile.wordMin,wordMax:profile.wordMax,charMin:profile.charMin,charMax:profile.charMax,minReferences:profile.minReferences,requiredSections:profile.requiredSections?.map((x: any)=>x.key),headingRules:profile.headingRules},sources:(profile.sources||[]).map((x: any)=>x.url)};return`LK-${APP_VERSION}-${hashString(JSON.stringify(compact))}`}
function getAnalysisHistory(){return safeStorageGet(STORAGE_KEYS.history,[])||[]}
function saveAnalysisHistory(result: any){if(!result||String(result.version||'').includes('demo'))return;const ids=result.settings?.selectionIds||{};const ds=result.documentStructure;const docFingerprint=ds?computeFingerprint({title:ds.title??null,author:ds.author??null,headings:ds.headings||[]}):null;const item={id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,generatedAt:result.generatedAt,fileName:result.file?.name||'Dokument',score:result.score,issueCount:result.issues?.length||0,errors:(result.issues||[]).filter((x: any)=>x.severity==='error').length,warnings:(result.issues||[]).filter((x: any)=>x.severity==='warning').length,profile:result.profile,fingerprint:result.details?.profileFingerprint||null,docFingerprint,selectionIds:ids};const history=[item,...getAnalysisHistory()].slice(0,20);safeStorageSet(STORAGE_KEYS.history,history);updateHistoryBadge()}
function updateHistoryBadge(){const n=getAnalysisHistory().length;$('#historyCount').textContent=n?`(${n})`:''}
function openHistory(){renderHistory();$('#historyModal').classList.remove('hidden');trapModal($('#historyModal'))}
function closeHistory(){$('#historyModal')?.classList.add('hidden');releaseModal($('#historyModal'))}
function renderHistory(){const h=getAnalysisHistory();const _p=activeDocumentProgress(h);const _pb=(_p&&_p.revisions>=2)?`<div class="preflight-box" style="margin-bottom:10px"><div class="preflight-head"><strong>Napredak: ${escapeHtml(_p.fileName)}</strong><span class="preflight-score">${escapeHtml(describeProgress(_p))}</span></div><div class="readiness-meter"><i style="width:${clamp(Number(_p.latestScore),0,100)}%"></i></div></div>`:'';$('#historyList').innerHTML=_pb+(h.length?h.map((x: any)=>`<article class="history-card"><div class="history-head"><div><h4>${escapeHtml(x.fileName)}</h4><p>${escapeHtml(x.profile)}</p></div><div class="history-score">${Number.isFinite(Number(x.score))?Number(x.score):'?'}</div></div><div class="history-meta"><span>${escapeHtml(new Date(x.generatedAt).toLocaleString('hr-HR'))}</span><span>${Number(x.issueCount)||0} problema</span><span>${Number(x.errors)||0} važnih</span>${x.fingerprint?`<span>${escapeHtml(x.fingerprint)}</span>`:''}</div><div class="history-actions"><button class="btn btn-secondary btn-sm" data-history-profile="${escapeHtml(x.id)}">Učitaj profil</button><button class="btn btn-ghost btn-sm" data-history-delete="${escapeHtml(x.id)}">Ukloni</button></div></article>`).join(''):'<div class="empty">Još nema spremljenih lokalnih rezultata.</div>')}
function handleHistoryAction(e: any){const profileId=e.target.closest('[data-history-profile]')?.dataset.historyProfile,deleteId=e.target.closest('[data-history-delete]')?.dataset.historyDelete;if(deleteId){safeStorageSet(STORAGE_KEYS.history,getAnalysisHistory().filter((x: any)=>x.id!==deleteId));renderHistory();updateHistoryBadge();return}if(!profileId)return;const item=getAnalysisHistory().find((x: any)=>x.id===profileId);if(!item)return;applySelectionIds(item.selectionIds);revealAnalyzerForm(false);closeHistory();toast('Profil iz povijesti je učitan.')}

// WS-6 "Moji popravci": povijest SERVER-side popravaka vezana uz racun (retencija do brisanja).
// Gumb je vidljiv samo kad je repair server konfiguriran. Lista/download(signed URL)/brisanje(erasure)
// preko testirane src/report/repair-history.ts. RLS select-own: server vraca samo korisnikove poslove.
function repairHistoryConfig(){const url=String(productionConfig?.supabaseUrl||'').trim();return{supabaseUrl:url,anonKey:String(productionConfig?.supabaseAnonKey||'').trim(),deleteEndpoint:url?url.replace(/\/+$/,'')+'/functions/v1/delete-repair-job':''}}
function updateRepairHistoryButton(){const b=$('#repairHistoryBtn');if(b)b.classList.toggle('hidden',!repairServerConfigured())}
// Ime preuzete datoteke iz naslova rada: svi popravci su se prije zvali "popravljeno.docx", pa se u
// mapi preuzimanja nisu razlikovali. Znakovi koje datotecni sustavi odbijaju se uklanjaju.
function repairDownloadName(j: any){const raw=String(j?.label||'').trim().replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').slice(0,60).trim();return (raw?`${raw}-popravljeno`:'popravljeno')+'.docx'}
function openRepairHistory(){$('#repairHistoryModal')?.classList.remove('hidden');trapModal($('#repairHistoryModal'));void renderRepairHistoryList()}
function closeRepairHistory(){$('#repairHistoryModal')?.classList.add('hidden');releaseModal($('#repairHistoryModal'))}
async function renderRepairHistoryList(){const el=$('#repairHistoryList');if(!el)return;el.innerHTML='<div class="empty">Učitavam…</div>';const token: any=await ensureAccessToken();if(authConfigured()&&!token){el.innerHTML='<div class="empty">Za pregled popravaka potrebna je prijava.</div>';openAuth(()=>renderRepairHistoryList());return}let jobs: any[]=[];try{jobs=await fetchRepairJobs(repairHistoryConfig(),token||'')}catch(e: any){el.innerHTML='<div class="empty">Popravke trenutačno nije moguće učitati.</div>';return}if(!jobs.length){el.innerHTML='<div class="empty">Još nemaš spremljenih popravaka. Pojave se ovdje nakon "Popravi sve".</div>';return}el.innerHTML=jobs.map((j: any)=>{const tier=tierFor(j.workType),date=j.createdAt?new Date(j.createdAt).toLocaleString('hr-HR'):'',mb=j.resultBytes?`${(j.resultBytes/1024/1024).toFixed(2)} MB`:'';return`<article class="history-card"><div class="history-head"><div><h4>${escapeHtml(j.label||'Popravljeni rad')}</h4><p>${escapeHtml(tier?tier.label:j.workType)}</p></div></div><div class="history-meta"><span>${escapeHtml(date)}</span>${j.changesCount!=null?`<span>${escapeHtml(_plIzmjena(j.changesCount))}</span>`:''}${mb?`<span>${escapeHtml(mb)}</span>`:''}</div><div class="history-actions">${j.deleting?'<span class="muted">Brisanje u tijeku…</span>':`<button class="btn btn-secondary btn-sm" data-repair-download="${escapeHtml(j.id)}" data-path="${escapeHtml(j.resultPath)}" data-name="${escapeHtml(repairDownloadName(j))}">Preuzmi</button><button class="btn btn-ghost btn-sm" data-repair-del="${escapeHtml(j.id)}">Obriši</button>`}</div></article>`}).join('');window.__lektaIcons?.()}
async function handleRepairHistoryAction(e: any){const dl=e.target.closest('[data-repair-download]'),del=e.target.closest('[data-repair-del]');if(!dl&&!del)return;const token: any=await ensureAccessToken();if(authConfigured()&&!token){openAuth(()=>renderRepairHistoryList());return}if(dl){const path=dl.dataset.path,orig=dl.textContent;dl.disabled=true;dl.textContent='Pripremam…';
  // RE-39: a.click() NAKON awaita cesto je popup-blokiran (nema vise svjeze korisnicke geste iza sebe).
  // Prazan tab se otvara SINKRONO, dok gesta jos vrijedi; URL se upisuje tek kad ga dobijemo.
  const win=window.open('','_blank');
  try{let url=await signRepairDownload(repairHistoryConfig(),token||'',path);url+=(url.includes('?')?'&':'?')+'download='+encodeURIComponent(dl.dataset.name||'popravljeno.docx');if(win){win.location.href=url}else{const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.click()}}catch(err: any){if(win)win.close();toast('Preuzimanje trenutačno nije moguće.')}finally{dl.disabled=false;dl.textContent=orig}return}if(del){const id=del.dataset.repairDel;if(!confirm('Trajno obrisati ovaj popravak? Original i popravljena datoteka bit će uklonjeni sa servera.'))return;del.disabled=true;const out=await deleteRepairJob(repairHistoryConfig(),token||'',id);if(out.ok){toast('Popravak je obrisan.');void renderRepairHistoryList()}else{del.disabled=false;toast('Brisanje trenutačno nije moguće.')}return}}
function applySelectionIds(p: any={}){setOptionIfExists($('#institutionSelect'),p.institution);populateUnits();setOptionIfExists($('#unitSelect'),p.unit);populatePrograms();setOptionIfExists($('#programSelect'),p.program);setOptionIfExists($('#workType'),p.workType);populateVariants();setOptionIfExists($('#workVariant'),p.variant);populateDepartments();setOptionIfExists($('#departmentSelect'),p.department);populateMethodology();setOptionIfExists($('#methodologySelect'),p.methodology);setOptionIfExists($('#citationStyle'),p.citation);syncProfileContext()}
/* lekta.faculty-context (src/tools/faculty-context.ts): isti fakultet koji korisnik vec
   odabere na citat/naslovnica alatima. Primjenjuje se SAMO ako restorePreferences() nije
   vec postavila bogatiju analizatorsku memoriju (p.unit) - faculty-context je namjerno
   tanji, medju-alatni "popuni prazno" signal, ne smije prepisati postojecu analizatorsku
   povijest. ?unit= URL parametar (applyUnitFromUrl, poziva se POSLIJE ove funkcije) i dalje
   ima krajnji prioritet. */
function applyFacultyContext(){try{
 const p=safeStorageGet(STORAGE_KEYS.preferences);
 if(p&&p.unit)return;
 const ctx=readFacultyContext();
 if(!ctx.unitId)return;
 const u: any=allUnits().find((x: any)=>x.id===ctx.unitId);
 if(!u)return;
 const sel: any={institution:u.institutionId,unit:u.id};
 if(ctx.program)sel.program=ctx.program;
 if(ctx.level)sel.workType=ctx.level;
 applySelectionIds(sel);
}catch(e: any){}}
/* ?unit=<unitId>[&work=<slug>][&project=<id>] s alat-stranica (SEO citatne stranice i sl.,
   ili Katedra handoff): posjetitelj koji dolazi sa stranice SVOG fakulteta ne mora ga
   ponovno traziti u izborniku. Namjerno POSLIJE restorePreferences (eksplicitni link ima
   prednost pred zapamcenim odabirom); nepoznat unit ILI nepoznat work slug je tihi no-op
   (svaki neovisno o drugom). Koristi istu applySelectionIds putanju kao povijest analiza.
   project je nepromijenjen, netipiziran Katedra Project Manifest ID (Faza C): Lekta ga
   samo prenosi natrag u rezultat (buildAnalysisSettings), nikad ga ne tumaci ni validira. */
let currentProjectId: string|null=null;
function applyUnitFromUrl(){try{
 const uid=(params.get('unit')||'').trim();
 const workType=workTypeFromSlug((params.get('work')||'').trim());
 const project=(params.get('project')||'').trim();
 if(project)currentProjectId=project;
 const sel: any={};
 if(uid){const u: any=allUnits().find((x: any)=>x.id===uid);if(u){sel.institution=u.institutionId;sel.unit=u.id}}
 if(workType)sel.workType=workType;
 if(Object.keys(sel).length)applySelectionIds(sel);
}catch(e: any){}}
/* Katedra (sestrinski proizvod, AI coach za pisanje) integracija, Milestone 1 Task 3
   (MASTER-PLAN.md): prazan URL = znacajka skrivena (jos nema javne Katedra adrese), popuni
   KATEDRA_URL kad postoji. Payload je LektaResult v1 (src/integrations/lekta-result.ts):
   NIKAD tekst/dokument rada (PRODUCT_CONSTITUTION.md #6), samo profileId/projectId/score/
   rulesetVersion + po nalazu issueId/severity/category/fixable/label, isti privacy-okvir
   kao shareScore. */
const KATEDRA_URL='';
function katedraIntegrationEnabled(){return!!KATEDRA_URL.trim()}
function katedraHandoffUrl(r: any){
 if(!katedraIntegrationEnabled())return'';
 const profileId=resultDefinitionId(r);
 if(!profileId)return'';
 const result=buildLektaResult(r,{projectId:currentProjectId,profileId},findingStates);
 try{
  const u=new URL(KATEDRA_URL);
  const payload=btoa(unescape(encodeURIComponent(JSON.stringify(result))));
  u.hash='lekta='+encodeURIComponent(payload);
  return u.toString();
 }catch(e: any){return''}
}
function clearAnalysisHistory(){safeStorageSet(STORAGE_KEYS.history,[]);renderHistory();updateHistoryBadge();toast('Lokalna povijest je obrisana.')}
function allUnits(){return ZAGREB_CATALOG.flatMap(g=>g.units.map(u=>({...u,institutionId:g.id,institutionName:g.name})))}
// Abecedni poredak s hrvatskom kolacijom (Č/Ć/Š/Ž iza C/S/Z, ne po ASCII kodu). Sortira se
// samo pri renderu padajucih izbornika; izvorni katalog i default vrijednosti (.value=) ostaju netaknuti.
const byNameHr=(a: any,b: any)=>String(a?.name||'').localeCompare(String(b?.name||''),'hr');
function selectedInstitution(){return ZAGREB_CATALOG.find(g=>g.id===$('#institutionSelect').value)||ZAGREB_CATALOG[0]}
function selectedUnit(){const g=selectedInstitution();return g.units.find(u=>u.id===$('#unitSelect').value)||g.units[0]}
function initCatalog(){
 $('#institutionSelect').innerHTML=[...ZAGREB_CATALOG].sort(byNameHr).map(g=>`<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
 $('#institutionSelect').value='unizg';populateUnits();$('#unitSelect').value='fpzg';populatePrograms();$('#programSelect').value='Diplomski studij Politologija';$('#workType').value='graduate';populateVariants();populateDepartments();populateMethodology();
}
function populateUnits(){const g=selectedInstitution();$('#unitSelect').innerHTML=[...g.units].sort(byNameHr).map(u=>`<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');populatePrograms()}
function populatePrograms(){const u=selectedUnit();/*B-hide-opci: odluka zivi u work-selection.visibleProgramsForUnit (DOM-free, pokriveno tests/profile-routing)*/$('#programSelect').innerHTML=visibleProgramsForUnit(VERIFIED_PROFILE_REGISTRY,u).map((p,i)=>`<option value="${escapeHtml(p)}" ${i===0?'selected':''}>${escapeHtml(p)}</option>`).join('');autoSelectWorkType();populateVariants();populateDepartments();populateMethodology()}
function eligibleDefinitions(){const u=selectedUnit();return eligibleDefinitionsFor(VERIFIED_PROFILE_REGISTRY,u.id,$('#programSelect').value,$('#workType').value)}
function populateVariants(){const defs=eligibleDefinitions(),variants=defs.filter(d=>d.variant).map(d=>({id:d.variant,label:d.variantLabel})),previous=$('#workVariant').value;const unique=[...new Map(variants.map(v=>[v.id,v])).values()];$('#variantField').classList.toggle('hidden',!unique.length);$('#workVariant').innerHTML=unique.length?unique.map((v,i)=>`<option value="${escapeHtml(v.id)}" ${i===0?'selected':''}>${escapeHtml(v.label)}</option>`).join(''):'<option value="default">Opći profil</option>';if(unique.some(v=>v.id===previous))$('#workVariant').value=previous}
function findVerifiedDefinition(){return resolveDefinition(eligibleDefinitions(),$('#workVariant').value)}
function eligibleDepartments(){const u=selectedUnit(),program=$('#programSelect').value,workType=$('#workType').value;if(u.id!=='pravo')return[];return LEGAL_DEPARTMENT_REGISTRY.filter(d=>d.programs.includes(program)&&d.workTypes.includes(workType))}
function populateDepartments(){const defs=eligibleDepartments(),field=$('#departmentField'),sel=$('#departmentSelect'),previous=sel.value;field.classList.toggle('hidden',!defs.length);sel.innerHTML='<option value="general">Bez posebnog profila katedre</option>'+defs.map(d=>`<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join('');sel.value=defs.some(d=>d.id===previous)?previous:'general'}
function findDepartmentDefinition(){const id=$('#departmentSelect')?.value;if(!id||id==='general')return null;return eligibleDepartments().find(d=>d.id===id)||null}
function uniqueStrings(items: any){return[...new Set((items||[]).filter(Boolean))]}
function uniqueSources(items: any){return[...new Map((items||[]).filter(Boolean).map((x: any)=>[x.url||x.title,x])).values()]}
function sampleSummary(sample: any={}){const parts=[];if(sample.docxAudits)parts.push(`${sample.docxAudits} stvarnih DOCX`);if(sample.syntheticDocxAudits)parts.push(`${sample.syntheticDocxAudits} sintetičkih DOCX testova`);if(sample.publicPdfAudits)parts.push(`${sample.publicPdfAudits} javnih PDF audita`);if(sample.publicTextSnippetAudits)parts.push(`${sample.publicTextSnippetAudits} javna tekstualna isječka`);if(sample.metadataSpotChecks)parts.push(`${sample.metadataSpotChecks} metapodatkovnih provjera`);if(sample.fullTextAudits&&!sample.publicPdfAudits)parts.push(`${sample.fullTextAudits} punih tekstualnih audita`);return parts.join(' + ')||'bez terenskog uzorka'}
function socialMethodologyEligible(){const u=selectedUnit(),program=$('#programSelect').value,workType=$('#workType').value;return u.id==='pravo'&&workType==='graduate'&&['Sveučilišni diplomski studij Socijalni rad','Sveučilišni diplomski studij Socijalna politika'].includes(program)}
function populateMethodology(){const field=$('#methodologyField'),select=$('#methodologySelect');if(!field||!select)return;const eligible=socialMethodologyEligible();field.classList.toggle('hidden',!eligible);if(!eligible)select.value='auto'}
function selectedMethodology(){return socialMethodologyEligible()?($('#methodologySelect')?.value||'auto'):'none'}
function methodologyLabel(id: any){return id==='auto'?'Automatsko prepoznavanje':(SOCIAL_METHOD_REGISTRY[id]?.label||'Nije primjenjivo')}
// citation: svaki KONKRETAN, sluzbeno propisan i verificiran citatni stil (autor-godina, pravne
// fusnote, brojcane/Chicago fusnote, autor-stranica, numericki) nosi punu spremnost jer ga engine
// jednako pouzdano provjerava. Samo 'custom' (prema uputama mentora, bez definiranog stila) ostaje 45.
function profileReadiness(profile: any){const exact=profile.definitionId?100:35,citation=(profile.citationMode&&profile.citationMode!=='custom')?100:45,format=(profile.checkFont||profile.checkSpacing||profile.checkTitlePage)?100:55;const s=profile.fieldValidation?.sample||{},real=(s.docxAudits||0)+(s.publicPdfAudits||0),synthetic=s.syntheticDocxAudits||0,validation=real>=3?100:real?75:synthetic?50:25;const overall=Math.round(exact*.32+citation*.24+format*.22+validation*.22);return{overall,exact,citation,format,validation,label:overall>=85?'Visoka spremnost':overall>=65?'Dobra spremnost':overall>=45?'Ograničena spremnost':'Eksperimentalni profil'}}

function syncProfileContext(){populateVariants();populateDepartments();populateMethodology();updateWorkTypeSupport();const d=findVerifiedDefinition(),ctx=[selectedUnit().id,$('#programSelect').value,$('#workType').value,$('#workVariant').value,$('#departmentSelect')?.value||'general',selectedMethodology()].join('|');const _cit=citationForDefinition(d);if(ctx!==lastProfileContext&&_cit)$('#citationStyle').value=_cit;/*B-cit-lock*/const _cl=isCitationLocked(d);$('#citationStyle').disabled=_cl;$('#citationLockNote')?.classList.toggle('hidden',!_cl);
 // Jezik rada iz profila, isti obrazac kao citatni stil: postavi SAMO na promjenu konteksta (da se
 // rucni izbor ne gazi pri svakom syncu), a zakljucaj kad sluzbeni izvor propisuje jedan jezik.
 // Bez ovoga bi npr. Algebrin diplomski (pise se iskljucivo na engleskom) lazno padao na "Osnovni
 // dijelovi rada", jer detectStructure trazi hrvatske nazive dok je #docLanguage na 'hr'.
 const _lang=languageForDefinition(d);if(ctx!==lastProfileContext&&_lang&&$('#docLanguage'))$('#docLanguage').value=_lang;
 const _ll=isLanguageLocked(d);if($('#docLanguage'))$('#docLanguage').disabled=_ll;$('#languageLockNote')?.classList.toggle('hidden',!_ll);
 lastProfileContext=ctx;updateProfile();updateSubmissionContextFields();savePreferences()}
// Hrvatska sklonidba uz broj: 1 -> one, 2-4 -> few, ostalo -> many (uz 11-14 izuzetak).
function hrPlural(n: any,one: any,few: any,many: any){const a=Math.abs(n)%100,b=a%10;if(b===1&&a!==11)return one;if(b>=2&&b<=4&&!(a>=12&&a<=14))return few;return many}
// Ziva institucijska pokrivenost: broji profile i zbroj stvarnih (javnih PDF + DOCX) audita za ustanovu.
// Samoazurira se iz registra pa se ne tvrdo-kodira po profilu. Vraca null za ustanove bez profila.
function institutionCoverage(u: any){const profs=VERIFIED_PROFILE_REGISTRY.filter((d: any)=>d.unitId===u.id);if(!profs.length)return null;const works=profs.reduce((n: any,d: any)=>n+((d.fieldValidation?.sample?.publicPdfAudits||0)+(d.fieldValidation?.sample?.docxAudits||0)),0);const pPart=`${profs.length} ${hrPlural(profs.length,'studijski profil','studijska profila','studijskih profila')}`;const wPart=works?`, ${works} ${hrPlural(works,'stvarni verificirani rad','stvarna verificirana rada','stvarnih verificiranih radova')} iz službenih repozitorija`:'';return{status:'institution-covered',label:'Pokrivenost ustanove',note:`${u.name}: pokriveno ${pPart}${wPart}.`}}
// Globalni hero signal pokrivenosti: zivo iz registra (samoazurira se), sakriven ako nema profila.
function renderHeroCoverage(){const el=$('#heroCoverage');if(!el)return;const profs=VERIFIED_PROFILE_REGISTRY;if(!profs.length){el.hidden=true;return}const units=new Set(profs.map((p: any)=>p.unitId));const insts=ZAGREB_CATALOG.filter((g: any)=>(g.units||[]).some((u: any)=>units.has(u.id))).length;
 // "Javnih radova" je snapshot M4 korpusa (Hrcak+Dabar, scripts/gen-corpus-stats.mjs), NE
 // fieldValidation audit-uzorak (taj mjeri nesto drugo: institutionCoverage nize ga i dalje
 // koristi za "stvarni verificirani rad").
 const corpusWorks=CORPUS_STATS.works;
 el.innerHTML=`<div class="cov-stats"><div class="cov-stat"><b data-cu="${profs.length}">${profs.length}</b><span>${hrPlural(profs.length,'studijski profil','studijska profila','studijskih profila')}</span></div><div class="cov-stat"><b data-cu="${insts}">${insts}</b><span>${hrPlural(insts,'ustanova','ustanove','ustanova')}</span></div><div class="cov-stat"><b data-cu="${corpusWorks}">${fmt(corpusWorks)}</b><span>${hrPlural(corpusWorks,'javni rad','javna rada','javnih radova')}</span></div></div><span class="cov-note">Utemeljeno na stvarnim javnim radovima iz službenih repozitorija.</span>`;el.hidden=false;countUpOnReveal(el)}
// Count-up landing brojki (marketing: statistike "ozive" na ulasku u viewport = djeluju
// kredibilnije i drze paznju iznad folda). Finalna vrijednost je VEC u DOM-u (ispravno za no-JS i
// reduced-motion); animiramo 0->cilj tek kad strip ude u vidno polje. Mijenja se samo PRIKAZ brojke,
// izvor podatka je isti (VERIFIED_PROFILE_REGISTRY / CORPUS_STATS), pa tocnost/privatnost netaknuti.
function countUpOnReveal(container: any){const A=_animate();if(motionReduced()||typeof A!=='function')return;const nodes=Array.prototype.slice.call(container.querySelectorAll('[data-cu]'));if(!nodes.length)return;nodes.forEach((n: any)=>{n.textContent=fmt(0)});const run=()=>nodes.forEach((n: any)=>{const t=Number(n.dataset.cu);if(isFinite(t))countUp(n,t,fmt)});if(typeof IntersectionObserver!=='function'){run();return}const io=new IntersectionObserver((ents: any,obs: any)=>{for(const e of ents){if(e.isIntersecting){run();obs.disconnect();break}}},{threshold:.4});io.observe(container)}
// Rules-on-demand wiring (faza B3, tvrdi rez): produkcija/staging koriste ISKLJUCIVO
// profile-rules endpoint; lokalni provider iz lazy chunkova postoji jos samo u DEV
// serveru bez backenda (npm run dev, Playwright). Gate je import.meta.env.DEV build
// konstanta NAMJERNO: u produkcijskom buildu se grana tree-shakea pa heavy i
// repair-map chunkovi NESTAJU iz dista (bundleSizeGuard to sada i dokazuje).
let _rulesProviderMode: 'network'|'local'|null=null;
function wireProfileRulesProvider(){
 const ep=String(productionConfig.profileRulesEndpoint||'');
 const localBackend=/^http:\/\/(127\.0\.0\.1|localhost)([:/]|$)/.test(String(productionConfig.supabaseUrl||''));
 if(import.meta.env.DEV&&(!ep||localBackend)){_rulesProviderMode='local';void import('../profiles/profile-rules-local').then(m=>m.installLocalRulesProvider()).catch(e=>console.error('Lokalni rules provider:',e));return}
 _rulesProviderMode='network';
 setProfileRulesProvider(async(profileId)=>{
  // Bearer se salje SAMO ako sesija vec postoji; besplatni tok ne forsira prijavu.
  const token=await resolveAccessToken();
  const out=await fetchProfileRulesWithRetry({endpoint:ep},profileId,token);
  if(out.kind==='ok')return{kind:'ok',profile:out.record.profile as any,repairEntries:out.record.repairEntries};
  if(out.kind==='rate_limited')toast('Dosegnuta je dnevna granica dohvata pravila profila; analiza ide po općoj provjeri.');
  return{kind:'failed',reason:out.kind};
 });
}
function currentProfile(){
 const g=selectedInstitution(),u=selectedUnit(),_rawDefinition=findVerifiedDefinition(),department=findDepartmentDefinition(),cit=citationMeta($('#citationStyle').value),workType=$('#workType').value,methodologyId=selectedMethodology(),methodology=SOCIAL_METHOD_REGISTRY[methodologyId]||null;
 // BRANA LIGHT STUBA (faza B): light indeks nosi djelomican rules objekt, pa bi compose s
 // neucitanim heavyjem TIHO bodovao po 2-4 kljuca. Neucitano stanje je programerska greska
 // (fali await ensureProfileRules) i BACA; 'failed' je posten mrezni kvar i degradira na
 // opcu provjeru (definition=null -> obiteljski baseline), uz izricitu oznaku na profilu.
 const _rulesFailed=!!(_rawDefinition&&profileRulesFailed(_rawDefinition.id));
 if(_rawDefinition&&!_rulesFailed&&!profileRulesLoaded(_rawDefinition.id))throw new Error(`currentProfile: pravila profila ${_rawDefinition.id} nisu ucitana. Pozovi await ensureProfileRules(currentDefinitionId()) prije citanja profila (svjesna brana protiv tihog bodovanja po light stubu).`);
 const definition=_rulesFailed?null:_rawDefinition;
 const override=$('#mentorOverride').checked,lightBaseline=isLightBaseline(definition,workType);
 // Pravila koja ANALIZA cita slaze profiles/compose-profile (DOM-free: baseline -> lagani rad ->
 // overlay katedre -> normalizeCheckFlags -> mentorov override -> scored/advisory demotija).
 // Ovdje ostaje samo prezentacija. Redoslijed slojeva je ugovor i opisan je u tom modulu.
 const base: any=composeAnalysisProfile({definition,department,family:u.family,unitId:u.id,workType,citationStyle:$('#citationStyle').value,override:override?{font:$('#customFont').value,sizePt:Number($('#customSize').value),spacing:Number($('#customSpacing').value),marginCm:Number($('#customMargin').value)}:null});
 const fallbackStatus=(PROFILE_STATUS as any)[u.status]||PROFILE_STATUS.generic;
 const deptSuffix=department?` · ${department.name}`:'',methodSuffix=methodology?` · ${methodology.shortLabel}`:(methodologyId==='auto'&&socialMethodologyEligible()?' · metodologija: auto':'');
 base.name=`${u.name} · ${$('#programSelect').value} · ${workTypeLabel(workType)}${definition?.variantLabel?' · '+definition.variantLabel:''}${deptSuffix}${methodSuffix}`;
 base.statusKey=definition?.status||(u.status==='verified'?'generic':u.status);base.status=((PROFILE_STATUS as any)[base.statusKey]||fallbackStatus).label;base.verified=base.statusKey==='verified';base.citation=$('#citationStyle').value;/*accessDate i citationMode postavlja composeAnalysisProfile*/
 base.sources=uniqueSources([...(definition?.sources||[]),...(department?.sources||[]),...(socialMethodologyEligible()?[SOCIAL_METHOD_SOURCE]:[])]);base.facts=uniqueStrings([...(definition?.facts||[]),...(department?.facts||[]),...(methodology?.facts||[])]);base.verifiedAt=definition?.verifiedAt||null;base.documentDate=definition?.documentDate||null;base.definitionId=definition?.id||null;base.manualChecks=uniqueStrings([...((definition?.rules?.manualChecks as any[])||[]),...((department?.manualChecks as any[])||[])]);base.sourceHierarchy=uniqueStrings([...(department?['Posebna službena uputa odabrane katedre']:[]),...(definition?.sourceHierarchy||[])]);base.submissionFacts=definition?.submissionFacts||[];base.submissionMetadata=definition?.submissionMetadata||null;base.ruleAuthority=department?.ruleAuthority||definition?.ruleAuthority||'generic';base.authority=(PROFILE_AUTHORITY as any)[base.ruleAuthority]||PROFILE_AUTHORITY.generic;base.fieldValidation=definition?.fieldValidation||null;base.departmentValidation=department?.fieldValidation||null;base.coverage=definition?.coverage||institutionCoverage(u);base.validationNote=definition?.validationNote||null;base.normativeScope=uniqueStrings([...(definition?.normativeScope||[]),...(department?['posebna pravila odabrane katedre u opsegu navedenom u izvoru']:[])]);base.advisoryScope=uniqueStrings([...(definition?.advisoryScope||[]),...(department?['katedarski profil ne nadjačava noviju pisanu uputu mentora']:[])]);base.repositoryRole=definition?.repositoryRole||'Regresijsko testiranje parsera; radovi nisu izvor pravila.';
 base.department=department?{id:department.id,name:department.name,status:department.status,note:department.note,sources:department.sources||[]}:null;base.socialMethodologyEnabled=socialMethodologyEligible();base.methodologySelection=methodologyId;base.methodologyProfile=methodology;base.methodologyProfiles=SOCIAL_METHOD_REGISTRY;
 base.note=(definition?.note||((PROFILE_STATUS as any)[base.statusKey]||PROFILE_STATUS.generic).note)+(department?` Odabran je dodatni profil: ${department.name}. ${department.note}`:'')+(override?' Posebni korisnički zahtjevi imaju prednost u tehničkoj provjeri.':'');
 if(lightBaseline&&!override){base.note='Opća provjera za seminarski, projektni ili istraživački rad: oblikovanje i citiranje provjeravaju se prema općem hrvatskom akademskom baselineu, a opseg, struktura i sadržaj (npr. Sadržaj) ovise o silabusu i pisanoj uputi nastavnika. Nije fakultetski propis.';base.advisoryScope=uniqueStrings([...(base.advisoryScope||[]),'opseg, struktura i sadržaj ovise o silabusu i uputi nastavnika','oblikovanje i citiranje su opća preporuka, nije fakultetski propis']);}
 // Postena degradacija (odluka vlasnika 2026-08-23): kvar dohvata pravila NIKAD ne boduje
 // tiho po light stubu nego izricito prelazi na opcu provjeru, s vidljivom oznakom.
 if(_rulesFailed){base.rulesUnavailable=true;base.name+=' · opća provjera (pravila fakulteta nisu učitana)';base.note='Pravila fakultetskog profila trenutačno nisu dostupna (poslužitelj nije odgovorio), pa je primijenjena opća provjera. Rezultat NIJE prema pravilima fakulteta; pokušaj ponovno kako bi se analiza izvela po profilu fakulteta. '+base.note;}
 base.selection={country:'Hrvatska',city:'Zagreb',institution:g.name,unit:u.name,program:$('#programSelect').value,department:department?.name||null,workType,workVariant:definition?.variantLabel||null,methodology:methodologyId==='none'?null:methodologyLabel(methodologyId),citationStyle:cit.label,mentorOverride:override,mentorNotes:$('#mentorNotes').value.trim()};base.readiness=profileReadiness(base);base.fingerprint=profileFingerprint(base);
 // SCOPE-01: razina dokaza (A-E) je DRUGA os od statusa pravila. Ide na kraj, nakon svih izmjena
 // biljeske (lightBaseline, _rulesFailed), da je nijedna grana ne pregazi. Kad pravila nisu
 // ucitana definition je null, pa se razina namjerno NE prikazuje umjesto da laze.
 base.claimEvidence=profileClaimFor(definition?.id||null);
 if(base.claimEvidence)base.note=`${base.note} ${claimSentence(base.claimEvidence)}`;
 return{id:[definition?.id||u.id,department?.id,methodologyId!=='none'?methodologyId:null].filter(Boolean).join('::'),p:base};
}
function workTypeLabel(v: any){return (WORK_TYPE_LABELS as any)[v]||v}
// BL-P0-05-1 + faza B: teska profilna pravila stizu PO PROFILU (ensureProfileRules(id) preko
// providera). updateProfile cita currentProfile()->definition.rules pa mora pricekati dohvat;
// picker/hero rade odmah. Kvar dohvata currentProfile posteno degradira (vidi branu gore).
async function updateProfile(){
 await ensureRulesForCurrentSelection(currentDefinitionId,ensureProfileRules);
 const {p}=currentProfile(),sel=p.selection,sm=(PROFILE_STATUS as any)[p.statusKey]||PROFILE_STATUS.generic,am=p.authority||PROFILE_AUTHORITY.generic;
 const sourceHtml=p.sources?.length?`<div class="source-stack">${p.sources.map((s: any)=>`<div class="source-line">Službeni izvor: <a href="${escapeHtml(safeHref(s.url))}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a></div>`).join('')}${p.verifiedAt?`<div class="source-line">Ručno provjereno: ${escapeHtml(new Date(p.verifiedAt+'T12:00:00').toLocaleDateString('hr-HR'))}${p.documentDate?' · Dokument: '+escapeHtml(p.documentDate):''}${academicYearFromDate(p.verifiedAt)?' · ak. godina verifikacije: '+escapeHtml(academicYearFromDate(p.verifiedAt)):''}</div>`:''}</div>`:`<div class="source-line">Posebna pravila još nisu povezana s provjerenim službenim izvorom. Primjenjuje se generička provjera.</div>`;
 const facts=p.facts?.length?`<div class="rule-facts">${p.facts.map((f: any)=>`<span class="rule-fact">${escapeHtml(f)}</span>`).join('')}</div>`:'';
 const variant=sel.workVariant?` · ${escapeHtml(sel.workVariant)}`:'',methodVariant=sel.methodology?` · ${escapeHtml(sel.methodology)}`:'';
 const hierarchy=p.sourceHierarchy?.length?`<div class="source-line"><strong>Hijerarhija pravila:</strong> ${p.sourceHierarchy.map(escapeHtml).join(' → ')}</div>`:'';
 const submission=p.submissionFacts?.length?`<div class="source-line"><strong>Predajna checklista:</strong> ${p.submissionFacts.length} izvanbodovne stavke prikazat će se zasebno u rezultatu analize.</div>`:'';
 const scoredBlock=`<div class="scored-block"><div class="scored-row yes"><span class="mk">✓</span><div><strong>Bodujemo:</strong> <span class="lst">${p.normativeScope?.length?p.normativeScope.map(escapeHtml).join(' · '):'pravila povezana sa službenim izvorom'}</span></div></div>${p.advisoryScope?.length?`<div class="scored-row info"><span class="mk">○</span><div><strong>Informativno:</strong> <span class="lst">${p.advisoryScope.map(escapeHtml).join(' · ')}</span></div></div>`:''}</div>`;
 const readiness=p.readiness||profileReadiness(p);
 const _cs=p.fieldValidation?.sample||{},_vr=(_cs.docxAudits||0)+(_cs.publicPdfAudits||0);
 const _citTxt=readiness.citation>=80?'Autor-godina / pravne fusnote':p.citationMode==='numeric'?'Numeričko (IEEE/Vancouver)':p.citationMode==='notes'?'Bilješke (Chicago)':p.citationMode==='author-page'?'Autor-stranica (MLA)':'Prema uputama mentora';
 const _fmtTxt=readiness.format>=80?'Prema propisanoj tipografiji':'Fakultet ne propisuje font službeno';
 const _valTxt=_vr>=3?`${_vr} stvarna javna rada`:_vr?`${_vr} stvarni uzorak`:'sintetički predložak';
 const _srcTxt=p.sources?.length?`Provjereno prema: ${escapeHtml(p.sources[0].title)}${p.documentDate?' ('+escapeHtml(p.documentDate)+')':(p.verifiedAt?' ('+escapeHtml(p.verifiedAt)+')':'')}`:'';
 const preflight=`<div class="preflight-box"><div class="preflight-head"><strong>Pokrivenost profila</strong><span class="preflight-score">${escapeHtml(readiness.label)} · ${readiness.overall}%</span></div>${_srcTxt?`<div class="source-line" style="margin:2px 0 6px">${_srcTxt}</div>`:''}<div class="preflight-grid"><div class="preflight-item ${readiness.exact>=80?'ok':'warn'}"><span>Normativni profil</span><b>${readiness.exact>=80?'Točno podudaranje':'Generički sloj'}</b></div><div class="preflight-item ${readiness.citation>=80?'ok':'warn'}"><span>Citatni stil</span><b>${escapeHtml(_citTxt)}</b></div><div class="preflight-item ${readiness.format>=80?'ok':'warn'}"><span>Oblikovanje</span><b>${escapeHtml(_fmtTxt)}</b></div><div class="preflight-item ${readiness.validation>=70?'ok':'warn'}"><span>Validacija</span><b>${escapeHtml(_valTxt)}</b></div></div><div class="readiness-meter"><i style="width:${readiness.overall}%"></i></div></div>`;
 const fv=p.fieldValidation,dfv=p.departmentValidation,coverage=p.coverage,fieldValidation=(fv||dfv||coverage)?`<div class="source-stack" style="border-left:3px solid var(--ok);padding-left:10px">${coverage?`<div class="source-line"><strong>${escapeHtml(coverage.label)}:</strong> ${escapeHtml(coverage.note)}</div>`:''}${fv?`<div class="source-line"><strong>Terenska verifikacija studijskog profila:</strong> ${escapeHtml(sampleSummary(fv.sample))}. ${escapeHtml(fv.scope)}</div><div class="source-line"><strong>Važno:</strong> ${escapeHtml(fv.productDecision)}</div>`:''}${dfv?`<div class="source-line"><strong>Validacija katedarskog sloja:</strong> ${escapeHtml(sampleSummary(dfv.sample))}. ${escapeHtml(dfv.productDecision)}</div>`:''}</div>`:(p.validationNote?`<div class="source-line"><strong>Status terenskog testa:</strong> ${escapeHtml(p.validationNote)}</div>`:'');
 // Vrijedi li garancija IZVODI se iz statusa profila (guarantee.ts), umjesto da korisnik sam
 // povezuje "T2/T3" iz cjenika s "Potvrđeni profil" iz badgea. Recenica se prikazuje za SVAKI
 // status, i kad garancija vrijedi i kad ne vrijedi: sutnja je prije citana kao "vrijedi".
 const guaranteeApplies=guaranteeAppliesToStatus(p.statusKey);
 const guaranteeLine=`<div class="source-line"><strong>Garancija:</strong> ${escapeHtml(guaranteeStatusNote(p.statusKey))}</div>`;
 const guaranteeHtml=`<div class="source-stack profile-guarantee" style="border-left:3px solid var(--${guaranteeApplies?'ok':'warn'});padding-left:10px;margin-top:7px">${(p.statusKey!=='verified'&&sm.guarantee)?`<div class="source-line"><strong>Što je pokriveno:</strong> ${escapeHtml(sm.guarantee)}</div>`:''}${guaranteeLine}${p.statusKey!=='verified'?`<div class="source-line"><a href="${safeHref('#pricing')}" class="guarantee-cta">Pogledaj pakete provjere →</a></div>`:''}</div>`;
 const detailsBody=`${reframeStatusNote(p.note)?`<div class="source-line" style="color:var(--text)">${escapeHtml(reframeStatusNote(p.note))}</div>`:''}${facts}<div class="source-line"><strong>Autoritet pravila:</strong> ${escapeHtml(am.note)}</div>${hierarchy}<div class="source-line"><strong>Uloga repozitorija:</strong> ${escapeHtml(p.repositoryRole)}</div>${submission}${fieldValidation}${sourceHtml}<div class="source-line" style="opacity:.7">Pokrivenost mjeri koliko su pravila ovog studija provjerena prema službenom izvoru, nije jamstvo ocjene.</div><span class="profile-fingerprint">Otisak profila: ${escapeHtml(p.fingerprint)}</span>`;
 /* Kartica profila = ISHOD odabira, ne ponavljanje odabranog: put (grad/ustanova/studij) vec stoji u
    selectima iznad i u sazetku koraka 3, pa ga ovdje ne dupliciramo. Oba nekadasnja "more" bloka
    (pokrivenost + izvor/metoda) spojena su u jedan, da korak 2 ostane kratak. */
 $('#profileNote').innerHTML=`<div class="pcard-label">Tvoj profil</div><div class="chips"><span class="profile-status ${escapeHtml(p.statusKey)}">${p.statusKey==='verified'?'✓':'●'} ${escapeHtml(sm.label)}</span>${p.claimEvidence?`<span class="profile-status evidence" title="${escapeHtml(p.claimEvidence.label)}">Razina dokaza ${escapeHtml(p.claimEvidence.claim)}</span>`:''}<span class="authority-status ${escapeHtml(am.className)}">⚖ ${escapeHtml(am.label)}</span></div><div class="pcard-path"><strong>${escapeHtml(sel.unit)}</strong>${sel.program?`<span>${escapeHtml(sel.program)}</span>`:''}</div><div class="pcard-work"><strong>${escapeHtml(workTypeLabel(sel.workType))}${variant}${methodVariant} · ${escapeHtml(sel.citationStyle)}</strong></div>${p.verifiedAt?`<div class="pcard-date">Pravila provjerena ${escapeHtml(new Date(p.verifiedAt+'T12:00:00').toLocaleDateString('hr-HR'))}</div>`:''}<button type="button" class="btn btn-ghost btn-sm pcard-change" data-profile-change>Promijeni profil</button><details class="more"><summary><span class="chev">▸</span> Izvori, metoda i pokrivenost</summary><div class="more-body">${preflight}${scoredBlock}${guaranteeHtml}${detailsBody}</div></details>`;renderAnalyzeSummary(p);
}
function renderAnalyzeSummary(p: any){const el=$('#analyzeProfile');if(!el)return;const sel=p.selection,sm=(PROFILE_STATUS as any)[p.statusKey]||PROFILE_STATUS.generic,path=[sel.institution,sel.unit,sel.program,workTypeLabel(sel.workType),sel.citationStyle].filter(Boolean).map((x: any)=>escapeHtml(x)).join(' · '),needsConfirm=!!selectedDocx&&needsProfileConfirmation(p.statusKey,_profileConfirmed);el.innerHTML=`<div class="ap-head"><span class="profile-status ${escapeHtml(p.statusKey)}">${p.statusKey==='verified'?'✓':'●'} ${escapeHtml(sm.label)}</span><span class="ap-path">${path}</span></div>${needsConfirm?`<div class="ap-warn"><p>Ovo je zadani profil. Provjeri je li to tvoj fakultet i studij prije analize, inače rezultat neće odgovarati tvojoj ustanovi.</p><div class="ap-actions"><button class="btn btn-primary btn-sm" type="button" data-confirm-profile>Da, ovo je moj profil</button><button class="btn btn-secondary btn-sm" type="button" data-change-profile>Promijeni fakultet</button></div></div>`:''}`}
// Intake gate sloj 2: pred-run potvrda za sumnjiv dokument (malo rijeci po docProps/app.xml).
// Ista kartica i klase kao potvrda profila (#analyzeProfile, ap-warn); odluka se pamti
// per-file u _intake.confirmedSuspicious pa se ne pita dvaput za istu datoteku.
function renderDocGateConfirm(v: any){const el=$('#analyzeProfile');if(!el)return;el.innerHTML=`<div class="ap-warn"><p>Ovo ne izgleda kao završni ili diplomski rad${v&&v.suspicionReason?` (${escapeHtml(v.suspicionReason)})`:''}. Svejedno analiziraj?</p><div class="ap-actions"><button class="btn btn-primary btn-sm" type="button" data-confirm-docgate>Svejedno analiziraj</button><button class="btn btn-secondary btn-sm" type="button" data-change-docfile>Učitaj drugu datoteku</button></div></div>`;window.__lektaIcons?.()}
const LEGAL_SOURCE_LABELS: any={book:'Knjige',article:'Članci u časopisima',chapter:'Poglavlja / zbornici',commentary:'Komentari zakona',web:'Mrežni izvori',law:'Hrvatski propisi',euAct:'Pravni akti EU',international:'Međunarodni dokumenti',domesticCase:'Hrvatska sudska praksa',echrCase:'ESLJP',cjeuCase:'Sud EU',secondary:'Posredno citiranje',opcit:'op. cit.',ibid:'Ibid.',other:'Ostalo'};
/* analyzeDocx i auditni helperi zive u src/analysis/analyze-docx.ts (split monolita) */
function progress(p: any,msg: any){$('#progressBar').style.width=p+'%';$('#progressPercent').textContent=p+'%';$('#progressMessage').textContent=msg;
  // Rendgen (progress-scan.ts) se hrani ISTIM stvarnim postotkom; nema vlastiti tajmer,
  // pa ne moze prikazati napredak koji se nije dogodio. Poruka za aria-live ostaje iznad.
  renderProgressScan(Number(p));
}

// PDF preflight je izvucen u tipiziran modul src/pdf/pdf-preflight.ts (cist, testiran, uz
// S5 granicu skeniranja); ovdje ostaje tanki I/O omotac koji cita bajtove datoteke.
// BL-P0-05-4: modul se ucitava LIJENO (dinamicki import) tek kad korisnik doda PDF, pa
// preflight/dekompresijski kod ispada iz glavnog chunka landinga (nepotreban za docx put).
async function analyzePdfFile(file: any){if(!file)return null;const { pdfPreflight }=await import('../pdf/pdf-preflight');return pdfPreflight(new Uint8Array(await file.arrayBuffer()),file.name,file.size)}
async function analyzeMetadataDocx(file: any){
 if(!file)return null;try{const { ZipReader, parseXml, paragraphText }=await import('../docx/parser');const zip=new ZipReader(await file.arrayBuffer()),xml=await zip.text('word/document.xml'),doc=parseXml(xml,'Zasebni Word dokument'),paras=els(doc,'w:p').map(paragraphText).map(x=>x.trim()).filter(Boolean),text=paras.join('\n'),n=normalize(text),required={summary:n.includes('sazetak'),abstract:n.includes('abstract'),keywordsHr:n.includes('kljucnerijeci'),keywordsEn:n.includes('keywords')};const keywordCount=(labelRe: any)=>{const i=paras.findIndex(x=>labelRe.test(x));if(i<0)return null;let value=paras[i].replace(labelRe,'').replace(/^\s*[:–-]\s*/,'').trim();if(!value&&paras[i+1])value=paras[i+1];return value.split(/[,;]+/).map(x=>x.trim()).filter(Boolean).length};const sectionText=(startRe: any,endRe: any)=>{const a=paras.findIndex(x=>startRe.test(x));if(a<0)return'';let end=paras.length;for(let i=a+1;i<paras.length;i++)if(endRe.test(paras[i])){end=i;break}return paras.slice(a+1,end).join(' ')};const hrKeywords=keywordCount(/^\s*Klju[čc]ne\s+rije[čc]i\b/i),enKeywords=keywordCount(/^\s*Keywords?\b/i),hrSummary=sectionText(/^\s*Sa[žz]etak\s*$/i,/^\s*(Klju[čc]ne\s+rije[čc]i|Abstract)\b/i),enSummary=sectionText(/^\s*Abstract\s*$/i,/^\s*Keywords?\b/i),sentences=(x: any)=>(x.match(/[.!?]+(?:\s|$)/g)||[]).length||(+!!x),summarySentences={hr:sentences(hrSummary),en:sentences(enSummary)},keywordRangeOk=[hrKeywords,enKeywords].every(x=>x!=null&&x>=6&&x<=8),summaryRangeOk=summarySentences.hr<=20&&summarySentences.en<=20&&summarySentences.hr>0&&summarySentences.en>0,complete=Object.values(required).every(Boolean);return{name:file.name,size:file.size,valid:true,required,complete,compliant:complete&&keywordRangeOk&&summaryRangeOk,keywordCounts:{hr:hrKeywords,en:enKeywords},summarySentences,keywordRangeOk,summaryRangeOk,wordCount:(text.match(/[\p{L}\p{N}]+/gu)||[]).length}}catch(e: any){return{name:file.name,size:file.size,valid:false,complete:false,compliant:false,error:e.message}}
}
async function docxCoreMetadata(file: any){try{const { ZipReader, parseXml }=await import('../docx/parser');const zip=new ZipReader(await file.arrayBuffer()),xml=await zip.text('docProps/core.xml');if(!xml)return{};const doc=parseXml(xml,'DOCX metapodaci'),get=(tag: any)=>textOf(first(doc,tag)).trim()||null;return{title:get('dc:title'),creator:get('dc:creator'),subject:get('dc:subject'),lastModifiedBy:get('cp:lastModifiedBy'),fingerprint:crossFileFingerprint(xml)}}catch(e: any){return{}}}
function buildCrossFileSubmissionConsistency(result: any, profile: any, core: any, pdfAudit: any, docxFile: any, pdfFile: any){
 const frontLines=(result?.preview?.paragraphs||[]).filter((paragraph: any)=>paragraph?.text&&Number(paragraph.index)<=18).map((paragraph: any)=>String(paragraph.text).trim()).filter((text: string)=>text.length>=2);
 const titleFromStructure=String(result?.documentStructure?.title||'').trim();
 const authorFromStructure=String(result?.documentStructure?.author||'').trim();
 const mentorFromFront=frontLines.find((text: string)=>/^\s*(?:mentor(?:ica)?|supervisor)\s*[:\-]?\s*.+/i.test(text))?.replace(/^\s*(?:mentor(?:ica)?|supervisor)\s*[:\-]?\s*/i,'').trim()||'';
 const front=(result?.preview?.paragraphs||[]).filter((paragraph: any)=>paragraph?.text&&Number(paragraph.index)<=18).map((paragraph: any)=>String(paragraph.text).trim()).filter((text: string)=>text.length>=8&&!/^(sadr[žz]aj|sa[žz]etak|abstract|mentor|student|ime|godina|mjesto|sveu[čc]ili[šs]te)\b/i.test(text));
 const title=titleFromStructure||front.find((text: string)=>text.split(/\s+/).length>=2&&text.length<=300);
 const year=(result?.preview?.paragraphs||[]).map((paragraph: any)=>String(paragraph?.text||'')).join(' ').match(/\b(?:19|20)\d{2}(?:[./-](?:19|20)?\d{2})?\b/)?.[0];
 const selection=profile?.selection||{};
 const docxValues: any[]=[];
 if(title)docxValues.push({field:'title',value:title,source:'docx',location:'prednji dio DOCX-a',evidence:['naslov prepoznat u prednjem dijelu dokumenta']});
 if(authorFromStructure)docxValues.push({field:'author',value:authorFromStructure,source:'docx',location:'struktura DOCX-a',evidence:['autor prepoznat u strukturi dokumenta']});
 if(core?.title)docxValues.push({field:'title',value:core.title,source:'docx-metadata',location:'docProps/core.xml, dc:title',evidence:['naslov iz DOCX metapodataka']});
 if(core?.creator)docxValues.push({field:'author',value:core.creator,source:'docx-metadata',location:'docProps/core.xml, dc:creator',evidence:['autor iz DOCX metapodataka']});
 if(mentorFromFront)docxValues.push({field:'mentor',value:mentorFromFront,source:'docx',location:'naslovnica DOCX-a',evidence:['mentor prepoznat uz oznaku Mentor']});
 if(year)docxValues.push({field:'academicYear',value:year,source:'docx',location:'prednji dio DOCX-a',evidence:['godina prepoznata u dokumentu']});
 if(selection.institution)docxValues.push({field:'institution',value:String(selection.institution),source:'form',location:'odabrani profil',evidence:['odabrana ustanova']});
 if(selection.unit)docxValues.push({field:'study',value:String(selection.unit),source:'form',location:'odabrani profil',evidence:['odabrani studij ili sastavnica']});
 if(selection.program)docxValues.push({field:'track',value:String(selection.program),source:'form',location:'odabrani profil',evidence:['odabrani smjer ili program']});
 if(selection.workType)docxValues.push({field:'workType',value:String(selection.workType),source:'form',location:'odabrani profil',evidence:['odabrana vrsta rada']});
 const files: any[]=[{name:String(docxFile?.name||result?.file?.name||'rad.docx'),type:'docx',size:Number(docxFile?.size||result?.file?.size||0),fingerprint:String(core?.fingerprint||crossFileFingerprint(String(docxFile?.name||''))),values:docxValues}];
 if(pdfFile&&pdfAudit)files.push({name:String(pdfFile.name),type:'pdf',size:Number(pdfFile.size||0),fingerprint:crossFileFingerprint(String(pdfFile.name)+':'+String(pdfFile.size||0)),values:[...(pdfAudit.title?[{field:'title',value:String(pdfAudit.title),source:'pdf-metadata',location:'PDF metapodaci, Title',evidence:['naslov iz PDF metapodataka']}]:[]),...(pdfAudit.author?[{field:'author',value:String(pdfAudit.author),source:'pdf-metadata',location:'PDF metapodaci, Author',evidence:['autor iz PDF metapodataka']}]:[])]});
 return analyzeCrossFileSubmission({files,rules:profile?.effectiveRules?.crossFileSubmissionRules||profile?.crossFileSubmissionRules});
}
function resultDefinitionId(r: any){return r.details?.profileDefinitionId||r.settings?.profileDefinitionId||currentDefinitionId()}
function selectedDeadlineFor(type: any,id: any,cohort: any){return fpzgDeadlineEntries(type,cohort).find((x: any)=>x.id===id)||fpzgDeadlineEntries(type,cohort)[0]||null}
function fpzgProfileKind(profileId: any){const map: any={
 'fpzg-politologija-zavrsni':{type:'final',label:'Politologija · završni rad',mode:'text'},
 'fpzg-novinarstvo-zavrsni-tekst':{type:'final',label:'Novinarstvo · tekstualni završni rad',mode:'text'},
 'fpzg-novinarstvo-zavrsni-av':{type:'final',label:'Novinarstvo · audiovizualni završni rad',mode:'av'},
 'fpzg-politologija-diplomski':{type:'graduate',label:'Politologija · diplomski rad',mode:'text'},
 'fpzg-nacionalna-sigurnost-diplomski':{type:'graduate',label:'Politologija, Nacionalna sigurnost · diplomski rad',mode:'text'},
 'fpzg-novinarstvo-diplomski':{type:'graduate',label:'Novinarstvo · diplomski rad',mode:'text'}
 };return map[profileId]||null}
function profileSubmissionBlueprint(r: any){
 const unit=r.settings?.selectionIds?.unit||$('#unitSelect')?.value,work=r.settings?.workType||$('#workType')?.value,program=r.selection?.program||'',phase=r.settings?.submissionPhase||currentSubmissionPhase(),profileId=resultDefinitionId(r),kind=fpzgProfileKind(profileId),items: any[]=[],files={docx:true,pdf:false,pdfa:false,metadata:false,av:false,avAdvisory:false};
 const add=(id: any,label: any,description: any,blocking=true,section='Postupak')=>items.push({id,label,description,blocking,section});
 const cohort=r.settings?.fpzgCohort||currentFpzgCohort(),deadlineId=r.settings?.fpzgDeadline||currentFpzgDeadlineId(),deadlineType=kind?.type||null,deadline=kind?selectedDeadlineFor(deadlineType,deadlineId,cohort):null;
 const deadlineCalendar=kind?{academicYear:FPZG_SUBMISSION_CALENDAR.academicYear,type:deadlineType,cohort,selectedId:deadline?.id||null,milestones:deadlineType==='final'?[{label:'Tema i mentor odobreni',date:FPZG_SUBMISSION_CALENDAR.final.topicDeadline}]:[{label:'Tema i obrazac D1',date:FPZG_SUBMISSION_CALENDAR.graduate.topicDeadline}],entries:fpzgDeadlineEntries(deadlineType,cohort).map((x: any)=>({...x,state:deadlineState(x)}))}:null;
 if(phase==='document')return{id:`${profileId||unit}-document`,phase,files,items,sourceDate:FPZG_SUBMISSION_CALENDAR.sourceDate,program,profileId,profileLabel:kind?.label||program,deadlineCalendar,selectedDeadline:deadline};
 if(unit==='fpzg'&&kind){
  const before=['before','full'].includes(phase),after=['after','full'].includes(phase);
  if(kind.type==='final'){
   files.pdf=before;files.av=before&&kind.mode==='av';files.avAdvisory=kind.mode==='av';
   if(before){
    add(`${profileId}-topic-2026`,'Tema i mentor odobreni su do 23. siječnja 2026.','Studenti koji žele braniti u 2025./2026. morali su do tog datuma imati dogovorenu temu i odobrenu prijavu mentora u aplikaciji.',true,'Godišnji rokovi 2025./2026.');
    if(deadline)add(`${profileId}-${deadline.id}-window`,`Obrana je dogovorena unutar razdoblja ${deadline.label}`,`Dopušteno razdoblje: ${dateRange(deadline.start,deadline.end)}. Datum mora biti radni dan i ne smije biti izvan službenog ispitnog roka.`,true,'Godišnji rokovi 2025./2026.');
    add(`${profileId}-three-working-days`,'Rad i obrana prijavljeni su najmanje tri radna dana prije termina','Završni rad predaje se putem aplikacije za ocjenske radove, a obrana se prijavljuje u zasebnoj intranetskoj aplikaciji.',true,'Godišnji rokovi 2025./2026.');
    add(`${profileId}-mentor-approved`,'Mentor je u aplikaciji upisao datum i odobrio obranu','Nakon mentorskog odobrenja prijavu obrađuje Ured za studente i studije.',true,'Prijava i odobrenje');
    add(`${profileId}-all-obligations`,'Položeni su svi ispiti i sve ocjene evidentirane u ISVU-u','Ured provjerava sve prethodne obveze prije konačnog odobrenja obrane.',true,'Prijava i odobrenje');
    add(`${profileId}-office-approval`,'Ured za studente i studije dao je konačnu potvrdu obrane','Bez odobrenja Ureda student ne može pristupiti obrani niti se može upisati ocjena.',true,'Prijava i odobrenje');
    add(`${profileId}-statements`,'Ispunjene su izjava o autorstvu i suglasnosti za pohranu/objavu','Izjave se popunjavaju u aplikaciji pri digitalnoj predaji završnog rada.',true,'Digitalna predaja');
    if(kind.mode==='text')add(`${profileId}-scope`,'Tekstualni rad ima 5.000-6.000 riječi i odgovara opterećenju od 5 ECTS','Odluka navodi 20-25 kartica teksta odnosno 5.000-6.000 riječi.',true,'Profil rada');
    else{
     add(`${profileId}-hours`,'Audiovizualni rad predstavlja približno 150 studentskih radnih sati','Odluka propisuje radno opterećenje, ali ne jedinstven format ili trajanje završne datoteke.',true,'Profil rada');
     add(`${profileId}-av-format`,'Format, trajanje i način predaje AV rada potvrđeni su s mentorom i administratorom','Javno dostupni izvori ne propisuju jedinstveni tehnički standard audiovizualne datoteke.',true,'Profil rada');
     add(`${profileId}-rights`,'Provjerena su prava korištenja snimki, glazbe, fotografija i arhivske građe','Autor treba moći dokazati dopuštenje ili valjanu osnovu korištenja svakog tuđeg elementa.',true,'Profil rada');
    }
    add(`${profileId}-xcard`,'Studentska iskaznica predana je ili je prijavljen gubitak','Dokumentacija za završetak prijediplomskog studija predaje se najmanje tri radna dana prije obrane.',true,'Dokumentacija Studentske referade');
    add(`${profileId}-library`,'Pribavljena je potvrda knjižnice o vraćenim knjigama','Potvrda se traži neovisno o tome jesu li knjige ikada posuđivane.',true,'Dokumentacija Studentske referade');
    add(`${profileId}-forms`,'Ispunjeni su anketni obrasci Studentske referade','Anketni upitnik i anketa Središnjeg prijavnog ureda preuzimaju se u referadi.',true,'Dokumentacija Studentske referade');
    add(`${profileId}-payment`,'Plaćen je aktualni trošak promocije','Na službenoj stranici 29. lipnja 2026. naveden je iznos 57,50 €; prije uplate provjeri aktualnost.',true,'Dokumentacija Studentske referade');
   }
   if(after)add(`${profileId}-grade`,'Ocjena završnog rada prenesena je iz aplikacije u ISVU','Nakon obrane mentor upisuje ocjenu u aplikaciju, a ona se automatski prenosi u ISVU.',true,'Nakon obrane');
  }else if(kind.type==='graduate'){
   files.pdf=before;files.pdfa=before;
   if(before){
    add(`${profileId}-d1-2026`,'Tema diplomskog rada i obrazac D1 dovršeni su do 24. ožujka 2026.','Student je do roka morao imati dogovorenu temu i mentorov elektronički potpis na obrascu D1.',true,'Godišnji rokovi 2025./2026.');
    if(deadline){
     if(deadline.mentorDraftDeadline)add(`${profileId}-${deadline.id}-mentor-draft`,'Završna radna verzija dostavljena je mentoru do 19. lipnja 2026.','Za obranu u rujnu tražila se cjelovita, sadržajno i koncepcijski zaokružena završna radna verzija.',true,'Godišnji rokovi 2025./2026.');
     add(`${profileId}-${deadline.id}-cutoff`,`D2, uvezan rad i dokumentacija predani su do ${hrDate(deadline.cutoff,true)}`,`Nakon tog roka prijava za termin ${deadline.label} ne prihvaća se. Obrane: ${dateRange(deadline.defenseStart,deadline.defenseEnd)}.`,true,'Godišnji rokovi 2025./2026.');
    }
    add(`${profileId}-mentor-final`,'Mentor je u obrascu D2 potvrdio spremnost za usmenu obranu','Potpisani elektronički D2 i sva dokumentacija moraju biti predani do roka odabranog termina.',true,'Prijava obrane');
    add(`${profileId}-bound-copy`,'Uvezani rad i sva dokumentacija predani su Uredu','Odluka za 2025./2026. uvjetuje ulazak na popis obrana pravodobnom predajom.',true,'Prijava obrane');
    add(`${profileId}-xcard`,'Studentska iskaznica predana je ili je prijavljen gubitak','Administrativna obveza završetka diplomskog studija.',true,'Dokumentacija Studentske referade');
    add(`${profileId}-library`,'Pribavljena je potvrda knjižnice o vraćenim knjigama','Potvrda se traži neovisno o ranijem posuđivanju.',true,'Dokumentacija Studentske referade');
    add(`${profileId}-payment`,'Plaćen je aktualni trošak promocije','Na službenoj stranici 29. lipnja 2026. naveden je iznos 57,50 €; prije uplate provjeri aktualnost.',true,'Dokumentacija Studentske referade');
    add(`${profileId}-pdfa-24`,'Konačna verzija u PDF/A formatu učitana je najmanje 24 sata prije obrane','Nakon učitavanja treba spremiti promjene i odabrati „Predaj administratoru na pregled”.',true,'Digitalna predaja');
    add(`${profileId}-admin-confirmed`,'Administrator je potvrdio digitalnu predaju','Provjeri e-poštu i neželjenu poštu; vraćenu izjavu ili datoteku treba doraditi i ponovno poslati.',true,'Digitalna predaja');
   }
   if(after)add(`${profileId}-post-defense`,'Ocjena obrane i završni status studija evidentirani su','Provjeri ISVU i status u Uredu za studente i studije nakon završene obrane.',true,'Nakon obrane');
  }
 }else if(unit==='pravo'){
  const isFinal=['final','graduate'].includes(work);files.pdf=isFinal&&(phase!=='after'||unit==='pravo');
  if(['before','full'].includes(phase)){add('pravo-studomat','Termin obrane prijavljen je na Studomatu','Student ne može pristupiti obrani ako termin nije prijavljen.');add('pravo-student-mail','Koristi se službena adresa iz domene student@pravo.hr','Službena komunikacija studenta odvija se s fakultetske adrese.');add('pravo-obligations','Položeni su svi ispiti i dovršene ostale obveze','Studentska služba provjerava uvjete za pristup obrani.');add('pravo-mentor-48','Mentor je najavio obranu najmanje 48 sati ranije','Mentor Studentskoj službi šalje elektronički popunjeni obrazac.');add('pravo-turnitin','Student i mentor proveli su provjeru u Turnitinu','Mentor potvrđuje autentičnost rada u zapisniku.');}
  if(['after','full'].includes(phase)){files.metadata=true;add('pravo-record-24','Mentor je poslao zapisnik najkasnije 24 sata nakon obrane','Datum mora odgovarati terminu prijavljenom na Studomatu.');add('pravo-student-24','Student je poslao svu dokumentaciju najkasnije 24 sata nakon obrane','Dokumentacija se šalje Studentskoj službi na službenu adresu za završetak studija.');add('pravo-declaration-pdf','Izjava o izvornosti nalazi se u PDF-u','Dopuštena je oznaka imena i prezimena uz v. r. kada vlastoručni elektronički potpis nije dostupan.');add('pravo-declaration-docx','Izjava o izvornosti nalazi se u Word dokumentu','Izjava mora biti sastavni dio predane Word verzije.');add('pravo-metadata','Zasebni Word sadrži dvojezične sažetke i ključne riječi','Uobičajeno se traži sažetak do 20 rečenica i 6-8 ključnih riječi na hrvatskom i engleskom.');}
 }else{add('generic-current','Provjerene su aktualne upute ustanove i mentora','Za ovaj profil nije ugrađen puni administrativni workflow.',true)}
 if(files.pdf){add('package-pdf-open','Konačni PDF ručno je otvoren i vizualno pregledan','Provjeri sve stranice, prijelome, tablice, slike, fusnote i sadržaj nakon izvoza iz Worda.',true,'Ručna provjera datoteka');add('package-word-pdf-match','Word i PDF predstavljaju istu konačnu verziju','Usporedi naslov, broj stranica, zadnju izmjenu i ključne završne elemente.',true,'Ručna provjera datoteka');add('package-pdf-search','Tekst u PDF-u može se označiti i pretraživati','Ručno pokušaj pronaći nekoliko riječi i kopirati tekst.',true,'Ručna provjera datoteka')}
 if(files.pdfa)add('package-pdfa-validator','PDF/A je potvrđen u namjenskom validatoru','Lokalna heuristika nije dovoljna za konačnu certifikaciju PDF/A usklađenosti.',true,'Ručna provjera datoteka');
 const sources=unit==='fpzg'?FPZG_SUBMISSION_CALENDAR.sources:unit==='pravo'?[{title:'Pravni fakultet: postupak završetka studija',url:'https://www.pravo.unizg.hr/studenti/zavrsni-diplomski-rad/'},{title:'Pravni fakultet: studijski programi i postupci obrane',url:'https://www.pravo.unizg.hr/studiji/'}]:[];
 return{id:`${profileId||unit}-${phase}-${deadline?.id||'general'}`,phase,files,items,sources,sourceDate:unit==='fpzg'?FPZG_SUBMISSION_CALENDAR.sourceDate:'2026-06-29',program,profileId,profileLabel:kind?.label||program,deadlineCalendar,selectedDeadline:deadline};
}
function submissionStorageKey(r: any){const d=r.settings?.fpzgDeadline||currentFpzgDeadlineId()||'none',c=r.settings?.fpzgCohort||currentFpzgCohort();return`${r.profileFingerprint||r.details?.profileFingerprint||r.profile}|${r.settings?.submissionPhase||currentSubmissionPhase()}|${c}|${d}`}
function getSubmissionChecks(r: any){const all=safeStorageGet(STORAGE_KEYS.submission,{});return all[submissionStorageKey(r)]||{}}
function saveSubmissionCheck(id: any,checked: any){if(!currentResult)return;const all=safeStorageGet(STORAGE_KEYS.submission,{}),key=submissionStorageKey(currentResult);all[key]={...(all[key]||{}),[id]:!!checked};safeStorageSet(STORAGE_KEYS.submission,all)}
function submissionAssessment(r: any){
 const bp=profileSubmissionBlueprint(r),manual=getSubmissionChecks(r),docErrors=(r.issues||[]).filter((x: any)=>x.severity==='error'),docStatus=docErrors.length?'blocked':'ready',fileBlockers=[],fileWarnings=[];
 if(bp.files.docx&&!selectedDocx&&!r.file?.name)fileBlockers.push('Nedostaje Word dokument.');if(bp.files.pdf&&!selectedPdf)fileBlockers.push('Nedostaje konačni PDF.');if(selectedPdf&&currentPdfAudit&&!currentPdfAudit.valid)fileBlockers.push('PDF nije valjan ili je šifriran.');if(bp.files.pdfa&&selectedPdf&&currentPdfAudit?.pdfa?.detected===false)fileWarnings.push('PDF/A oznaka nije potvrđena lokalnim preflightom; provjeri datoteku službenim PDF/A validatorom.');if(bp.files.metadata&&!selectedMetadataDocx)fileBlockers.push('Nedostaje zasebni Word dokument s metapodatcima.');if(bp.files.av&&!selectedAvFile)fileWarnings.push('Audiovizualna datoteka nije lokalno evidentirana. Format i kanal predaje moraju se potvrditi s mentorom i administratorom.');
 if(selectedPdf&&currentPdfAudit){for(const n of currentPdfAudit.notes||[]){if(n.level==='error')fileBlockers.push(n.text);else if(n.level==='warning')fileWarnings.push(n.text)}if(!currentPdfAudit.pageCount)fileWarnings.push('Broj PDF stranica nije moguće pouzdano očitati.')}if(bp.files.metadata&&currentMetadataAudit&&!currentMetadataAudit.complete)fileBlockers.push('Zasebni Word nema sve prepoznate dvojezične elemente.');if(bp.files.metadata&&currentMetadataAudit?.complete&&!currentMetadataAudit.compliant)fileBlockers.push('Zasebni Word ne zadovoljava prepoznati raspon: do 20 rečenica i 6-8 ključnih riječi po jeziku.');
 if(bp.selectedDeadline&&['before','full'].includes(bp.phase)){const state=deadlineState(bp.selectedDeadline);if(state.key==='closed'&&bp.phase==='before')fileBlockers.push(`Odabrani godišnji rok „${bp.selectedDeadline.label}” završio je.`);else if(state.key==='closed')fileWarnings.push(`Odabrani godišnji rok „${bp.selectedDeadline.label}” završen je; za cijeli paket ručno potvrdi da su svi rokovi bili pravodobno ispunjeni.`);else if(state.key==='cutoff')fileWarnings.push(`Krajnji rok prijave za „${bp.selectedDeadline.label}” je prošao; status može biti spreman samo ako je prijava već pravodobno predana.`);if(bp.selectedDeadline.mentorDraftDeadline&&Date.now()>new Date(bp.selectedDeadline.mentorDraftDeadline).getTime())fileWarnings.push(`Rok za dostavu završne radne verzije mentoru za „${bp.selectedDeadline.label}” bio je ${hrDate(bp.selectedDeadline.mentorDraftDeadline)}; ručno potvrdi da je obveza ispunjena.`)}
 const incomplete=bp.items.filter(x=>x.blocking&&!manual[x.id]),procedureStatus=incomplete.length?'conditional':'ready';const fileStatus=fileBlockers.length?'blocked':fileWarnings.length?'conditional':'ready',overall=(docStatus==='blocked'||fileStatus==='blocked')?'blocked':(fileStatus==='conditional'||procedureStatus==='conditional')?'conditional':'ready';
 return{blueprint:bp,manual,document:{status:docStatus,errors:docErrors.length},files:{status:fileStatus,blockers:fileBlockers,warnings:fileWarnings,av:selectedAvFile?{name:selectedAvFile.name,size:selectedAvFile.size,type:selectedAvFile.type}:null},procedure:{status:procedureStatus,incomplete},overall};
}
function statusLabel(s: any){return s==='ready'?'SPREMNO':s==='conditional'?'TREBA POTVRDITI':'NIJE SPREMNO'}
function renderPdfPreflight(){const el=$('#pdfPreflightSummary');if(!el)return;if(!selectedPdf){el.innerHTML='<div class="preflight"><div class="preflight-head"><h3>PDF preflight</h3><span class="file-state warn">PDF nije učitan</span></div><div class="preflight-notes"><div class="preflight-note">Dodaj konačni PDF kako bi se provjerili zaglavlje, zaštita, PDF/A oznaka, stranice, A4 i sigurnosne značajke.</div></div></div>';return}if(!currentPdfAudit){el.innerHTML='<div class="preflight"><div class="preflight-head"><h3>PDF preflight</h3><span class="file-state">čeka analizu</span></div></div>';return}const p=currentPdfAudit,notes=(p.notes||[]).map((n: any)=>`<div class="preflight-note"><strong>${n.level==='error'?'Važno':n.level==='warning'?'Provjeri':'Napomena'}:</strong> ${escapeHtml(n.text)}</div>`).join('');el.innerHTML=`<div class="preflight"><div class="preflight-head"><h3>PDF preflight · ${escapeHtml(p.name)}</h3><span class="file-state ${p.valid?'ready':'fail'}">${p.valid?'valjan PDF':'problem'}</span></div><div class="preflight-grid"><div class="preflight-cell"><span>VERZIJA</span><b>${escapeHtml(p.version||'?')}</b></div><div class="preflight-cell"><span>STRANICE</span><b>${p.pageCount||'nepoznato'}</b></div><div class="preflight-cell"><span>PDF/A OZNAKA</span><b>${p.pdfa.detected?`da · ${escapeHtml(p.pdfa.part||'?')}${escapeHtml(p.pdfa.conformance||'')}`:'nije potvrđena'}</b></div><div class="preflight-cell"><span>A4 STRANICE</span><b>${p.a4Share==null?'nepoznato':Math.round(p.a4Share*100)+'%'}</b></div><div class="preflight-cell"><span>ŠIFRIRANJE</span><b>${p.encrypted?'da':'ne'}</b></div><div class="preflight-cell"><span>UGRAĐENI FONTOVI</span><b>${p.fontObjects?`${p.embeddedFontFiles}/${p.fontObjects}`:'nepoznato'}</b></div><div class="preflight-cell"><span>AKTIVNI SADRŽAJ</span><b>${p.hasJavascript?'JavaScript':'nije pronađen'}</b></div><div class="preflight-cell"><span>VELIČINA</span><b>${(p.size/1024/1024).toFixed(2)} MB</b></div></div><div class="preflight-notes"><div class="preflight-note"><strong>Napomena:</strong> .docx daje punu strukturnu provjeru (oblikovanje, stilovi, fusnote, citiranje). PDF preflight je ograničen na tehničku ispravnost datoteke (format, zaštita, PDF/A, stranice), ne na sadržajno oblikovanje.</div>${notes||'<div class="preflight-note"><strong>U redu:</strong> Nisu pronađeni očiti tehnički problemi.</div>'}</div></div>`}
function renderSubmissionGate(r: any){const el=$('#submissionGate');if(!el)return;const a=submissionAssessment(r),text=a.overall==='ready'?'Svi provjerljivi tehnički uvjeti prolaze i ručne obveze si označio. Ovo nije potvrda prihvaćanja rada, ocjene ni odluke mentora.':a.overall==='conditional'?'Dokument ili datoteke nemaju blokirajuću pogrešku, ali ostaju ručne ili neizvjesne stavke.':'Postoji barem jedan blokirajući problem u dokumentu ili paketu datoteka.';el.innerHTML=`<div class="gate-hero ${a.overall}"><div><h3>Tehnička spremnost za predaju: ${statusLabel(a.overall)}</h3><p>${escapeHtml(text)}</p></div><span class="gate-badge">Faza: ${escapeHtml(({document:'dokument',before:'prije obrane',after:'nakon obrane',full:'cijeli paket'} as any)[a.blueprint.phase])}</span></div><div class="gate-grid"><article class="gate-card ${a.document.status}"><span>Dokument</span><b>${statusLabel(a.document.status)}</b><small>${a.document.errors?`${a.document.errors} kritičnih upozorenja`:'bez kritičnih upozorenja'}</small></article><article class="gate-card ${a.files.status}"><span>Datoteke</span><b>${statusLabel(a.files.status)}</b><small>${a.files.blockers.length?`${a.files.blockers.length} blokirajućih stavki`:a.files.warnings.length?`${a.files.warnings.length} neizvjesnih stavki`:'paket datoteka prolazi'}</small></article><article class="gate-card ${a.procedure.status}"><span>Postupak</span><b>${statusLabel(a.procedure.status)}</b><small>${a.procedure.incomplete.length?`${a.procedure.incomplete.length} nepotvrđenih obveza`:'sve ručno potvrđeno'}</small></article></div>`;return a}
function downloadSubmissionReport(){if(!currentResult)return;const a=submissionAssessment(currentResult);if(paywallGateActive()){downloadBlob(JSON.stringify({watermark:true,note:'Besplatni sažetak s vodenim žigom. Puni predajni izvještaj je dio serverski potvrđenog punog izvještaja.',profile:currentResult.profile,phase:a.blueprint.phase,status:a.overall,document:{status:a.document.status},files:{status:a.files.status},procedure:{status:a.procedure.status}},null,2),'application/json',`Lekta-predaja-sazetak-${(currentResult.file?.name||'rad').replace(/\.docx$/i,'')}.json`);trackEvent('report_downloaded',{source:'submission-teaser',profileId:currentResult.details?.profileDefinitionId||''});return}const payload={appVersion:APP_VERSION,generatedAt:new Date().toISOString(),profile:currentResult.profile,profileFingerprint:currentResult.profileFingerprint,phase:a.blueprint.phase,status:a.overall,document:a.document,files:a.files,procedure:{status:a.procedure.status,incomplete:a.procedure.incomplete.map(x=>x.label)},pdf:currentPdfAudit,metadataDocument:currentMetadataAudit,avFile:selectedAvFile?{name:selectedAvFile.name,size:selectedAvFile.size,type:selectedAvFile.type}:null,deadline:a.blueprint.selectedDeadline||null,manualChecks:a.manual,sourceDate:a.blueprint.sourceDate,sources:a.blueprint.sources||[]};downloadBlob(JSON.stringify(payload,null,2),'application/json',`Lekta-predaja-${(currentResult.file?.name||'rad').replace(/\.docx$/i,'')}.json`)}

// Feature detection (P0 6): bez File.arrayBuffer ili DOMParsera analiza ne moze proci; umjesto
// tihog kvara (bijeli ekran / neuhvacena greska) daj jasnu poruku.
function browserSupportsDocxAnalysis(file: any){try{if(typeof DOMParser==='undefined')return false;if(file&&typeof file.arrayBuffer!=='function')return false;return true}catch(e: any){return false}}
// Snapshot SVIH ulaza koji utjecu na rezultat analize; dijele ga stvarni run (runAnalysis) i
// pozadinska spekulativna analiza, pa je usporedivost kljuceva garantirana istom funkcijom.
function buildAnalysisSettings(id: any,p: any){return{profileId:id,profileDefinitionId:p.definitionId||null,selection:p.selection,profileStatus:p.statusKey,workType:$('#workType').value,citationStyle:$('#citationStyle').value,language:$('#docLanguage').value,strictness:$('#strictness').value,submissionPhase:currentSubmissionPhase(),fpzgCohort:currentFpzgCohort(),fpzgDeadline:currentFpzgDeadlineId(),mentorOverride:$('#mentorOverride').checked,mentorNotes:$('#mentorNotes').value.trim(),methodology:selectedMethodology(),maxDecompressedBytes:decompressionBudgetBytes({deviceMemory:deviceMemoryGb(),coarsePointer:coarsePointer()}),project:currentProjectId,selectionIds:{institution:$('#institutionSelect').value,unit:$('#unitSelect').value,program:$('#programSelect').value,workType:$('#workType').value,variant:$('#workVariant').value,department:$('#departmentSelect')?.value||'general',methodology:$('#methodologySelect')?.value||'auto',citation:$('#citationStyle').value}}}
// Pozadinska (spekulativna) analiza: krece odmah nakon uploada/detekcije dok korisnik jos bira
// profil, pa klik na Analiziraj cesto samo POSVOJI vec gotov rezultat. Ispravnost jamci usporedba
// kljuca (isti File + identican settings snapshot) u trenutku klika; invalidacija na change je
// samo optimizacija (oslobadja worker). Radi ISKLJUCIVO uz Web Worker: inline fallback bi vrtio
// analizu na glavnoj niti i kocio sucelje bas dok korisnik ispunjava obrazac.
let _spec: {key: string|null;promise: Promise<any>|null;file: any;pct: number;msg: string;adopted: boolean}={key:null,promise:null,file:null,pct:0,msg:'',adopted:false};
let _specTimer: any=null;
function specKey(file: any,settings: any){return JSON.stringify(settings)+'|'+file.name+'|'+file.size+'|'+file.lastModified}
function clearSpec(){_spec={key:null,promise:null,file:null,pct:0,msg:'',adopted:false}}
// Otkazi spekulaciju samo ako NIJE posvojena i nema vidljivog runa (cancelActiveAnalysis je globalan
// pa ne smije ugasiti analizu koju korisnik upravo gleda); stanje se cisti uvijek.
function invalidateSpeculative(){if(_spec.promise&&!_spec.adopted&&$('#progressView')?.classList.contains('hidden'))cancelActiveAnalysis();clearSpec()}
async function startSpeculativeAnalysis(){
 const file=selectedDocx;
 if(!file||typeof Worker==='undefined'||!browserSupportsDocxAnalysis(file))return;
 if(!$('#progressView')?.classList.contains('hidden'))return; // vidljivi run ima prednost
 await ensureRulesForCurrentSelection(currentDefinitionId,ensureProfileRules);
 if(selectedDocx!==file)return; // datoteka promijenjena dok su se pravila ucitavala
 const {id,p}=currentProfile(),settings=buildAnalysisSettings(id,p),key=specKey(file,settings);
 if(_spec.promise&&_spec.file===file&&_spec.key===key)return; // ista spekulacija vec u tijeku ili gotova
 invalidateSpeculative();
 const promise=analyzeDocxOffThread(file,p,settings,(pct: any,msg: any)=>{_spec.pct=pct;_spec.msg=msg;if(_spec.adopted)progress(pct,msg)});
 _spec={key,promise,file,pct:0,msg:'',adopted:false};
 promise.catch(()=>{if(_spec.promise===promise&&!_spec.adopted)clearSpec()}); // cancel/greska: stvarni run ce gresku ponoviti korisniku
}
async function runAnalysis(){if(!selectedDocx)return;if(!browserSupportsDocxAnalysis(selectedDocx)){const err=$('#dropError'),msg='Ovaj preglednik ne podržava čitanje datoteka potrebno za analizu. Ažuriraj preglednik ili otvori aplikaciju u novijem Chromeu, Safariju ili Firefoxu.';if(err){err.textContent=msg;err.classList.remove('hidden')}$('#dropzone')?.classList.add('has-error');toast(msg);return}if(_intake.file===selectedDocx&&_intake.promise){const _iv=_intake.verdict||await _intake.promise;if(!selectedDocx||_intake.file!==selectedDocx)return;if(_iv.kind==='reject'){toast(_iv.message);return}}await ensureRulesForCurrentSelection(currentDefinitionId,ensureProfileRules);const {id,p}=currentProfile(),settings=buildAnalysisSettings(id,p);if(p.rulesUnavailable)toast('Pravila fakulteta nisu učitana; analiza ide po općoj provjeri, ne po pravilima fakulteta.');if(needsProfileConfirmation(p.statusKey,_profileConfirmed)){renderAnalyzeSummary(p);$('#analyzeProfile')?.scrollIntoView({behavior:'smooth',block:'center'});toast('Potvrdi profil prije analize: provjeri fakultet i studij.');return}const _dgv=_intake.file===selectedDocx?_intake.verdict:null;if(_dgv&&_dgv.kind==='ok'&&_dgv.suspicious&&!_intake.confirmedSuspicious){renderDocGateConfirm(_dgv);$('#analyzeProfile')?.scrollIntoView({behavior:'smooth',block:'center'});toast('Provjeri je li učitan pravi rad prije analize.');return}const _specHit=!!(_spec.promise&&_spec.file===selectedDocx&&_spec.key===specKey(selectedDocx,settings));if(_specHit)_spec.adopted=true;else invalidateSpeculative();const token=++_analyzeToken,analyzeBtn=$('#analyzeBtn'),docxFile=selectedDocx;if(analyzeBtn)analyzeBtn.disabled=true;withViewTransition(()=>{renderView('analiza')});progress(0,'Pripremam paketnu analizu');_netProbe=startNetworkProbe();if(_specHit)progress(Math.max(_spec.pct||0,4),_spec.msg||'Analiza već radi u pozadini');$('#progressView')?.scrollIntoView({behavior:'smooth',block:'start'});void trackEvent('analysis_started',{profileStatus:p.statusKey||'generic',workType:settings.workType||''});try{
 // Pomocne datoteke (PDF, metapodaci) NE smiju obarati glavnu analizu: neuspjeh se biljezi
 // kao stavka, a glavni .docx se svejedno analizira (F1).
 currentPdfAudit=selectedPdf?await safeAux(()=>analyzePdfFile(selectedPdf),'PDF preflight'):null;
 currentMetadataAudit=selectedMetadataDocx?await safeAux(()=>analyzeMetadataDocx(selectedMetadataDocx),'zasebni Word'):null;
 const core=await safeAux(()=>docxCoreMetadata(selectedDocx),'metapodaci')||{};
 const result=_specHit&&_spec.promise?await _spec.promise:await analyzeDocxOffThread(docxFile,p,settings,progress);
 if(token!==_analyzeToken||selectedDocx!==docxFile)return; // pokrenuta je novija analiza; odbaci zastarjeli rezultat
 if(_specHit)clearSpec();
 result.details=result.details||{};result.details.docxCore=core;result.details.pdfPreflight=currentPdfAudit;result.details.metadataDocument=currentMetadataAudit;result.details.avFile=selectedAvFile?{name:selectedAvFile.name,size:selectedAvFile.size,type:selectedAvFile.type}:null;result.details.submissionPhase=settings.submissionPhase;if(!result.demo){const { postRunSuspicion }=await import('../docx/intake-gate');const _gw=postRunSuspicion({words:result.stats?.words,headings:result.stats?.headings});// Severity 'error' + unshift NAMJERNO: renderResultGuide sortira po severityju (error prije
// warning) pa reze na top 4; kao 'warning' bi ovaj nalaz zavrsio ispod nalaza o fontu i
// marginama, a upravo on govori da CIJELI izvjestaj nije reprezentativan (ako dokument nije
// rad, odstupanje fonta je sum). Ne oduzima bodove (nije check). Uvjet je uzak (postRunSuspicion:
// <1000 rijeci I nula naslova u Word stilovima) pa je lazna uzbuna na stvarnom radu neizgledna.
 if(_gw){result.issues=result.issues||[];result.issues.unshift(issue('error','structure','Dokument ne izgleda kao završni ili diplomski rad',`${_gw} Provjeri je li učitana prava datoteka; rezultat provjere za ovakav dokument nije reprezentativan.`,'Cijeli dokument'))}}if(token!==_analyzeToken||selectedDocx!==docxFile)return;currentResult=result;analyzedProfile=p;void trackEvent('analysis_completed',{profileStatus:p.statusKey||'generic',workType:settings.workType||'',issueCount:result.issues?.length||0});withViewTransition(()=>renderResult(currentResult));saveAnalysisHistory(currentResult)}catch(e: any){if(token!==_analyzeToken||isAnalysisCancelled(e))return;if(_specHit)clearSpec();console.error(e);currentResult=null;analyzedProfile=null;currentPdfAudit=null;currentMetadataAudit=null;toast(analysisErrorMessage(e));renderView('provjera')}finally{if(token===_analyzeToken&&analyzeBtn)analyzeBtn.disabled=false}}
function cancelAnalysis(){if($('#progressView').classList.contains('hidden'))return;_analyzeToken++;cancelActiveAnalysis();clearSpec();void trackEvent('analysis_cancelled',{});const b=$('#analyzeBtn');if(b)b.disabled=!selectedDocx;withViewTransition(()=>{renderView('provjera')});progress(0,'Pripremam analizu');toast('Analiza je prekinuta.');setTimeout(()=>{try{$('#analyzeBtn')?.focus()}catch(e: any){}},0)}
// Izvrsi pomocnu analizu (aux datoteka); nikad ne baca - neuspjeh vrati null i zabiljezi u konzolu.
async function safeAux(fn: any,label: any){try{return await fn()}catch(e: any){console.warn(`Pomoćna analiza (${label}) nije uspjela:`,e);return null}}
// Razlikovanje uzroka greske glavne analize u citljivu poruku (F5).
function analysisErrorMessage(e: any){const m=String(e&&e.message||'');if(/dekompresijska bomba|sigurnosnu granicu|previše odlomaka|trajala predugo/i.test(m))return m+(isLikelyMobile()?' Na ovom uređaju granica je niža radi memorije; za velike dokumente pokušaj na računalu.':'');if(/DTD/i.test(m))return'Dokument sadrži nedopuštenu XML deklaraciju i odbijen je iz sigurnosnih razloga.';if(/ZIP\/DOCX arhiva|Oštećen lokalni zapis|glavni Word dokument|DataView|out of bounds|Offset is outside/i.test(m))return'Datoteka je oštećena ili nije valjan .docx. Ponovno je izvezi iz Worda (Spremi kao .docx).';if(/kompresija/i.test(m))return'Ovaj oblik .docx kompresije nije podržan. Ponovno spremi dokument iz Worda.';return m||'Dokument nije moguće analizirati.'}
// UX 3.2: demo kao sredisnji alat povjerenja. Tri javna primjera izvjestaja (FPZG diplomski,
// Pravo diplomski, genericki seminarski) s realisticnim nalazima; prebacuju se u demo traci
// iznad rezultata. Uzorci su izmisljeni radi prikaza i ne tvrde nista o sluzbenim pravilima.
const DEMO_VARIANTS: any={fpzg:{label:'FPZG diplomski',toast:'Prikazan je primjer rezultata na uzorku diplomskog rada (FPZG), ne na tvom dokumentu.'},pravo:{label:'Pravo diplomski',toast:'Prikazan je primjer rezultata na uzorku diplomskog rada (Pravni fakultet), ne na tvom dokumentu.'},seminar:{label:'Seminarski (generički)',toast:'Prikazan je primjer rezultata na uzorku seminarskog rada (generički profil), ne na tvom dokumentu.'}};
function runDemo(kind='fpzg'){void trackEvent('demo_played',{kind});document.querySelector('.lek-col-form')?.classList.add('lek-engaged');currentResult=demoResult(kind);analyzedProfile=null;withViewTransition(()=>{renderView('rezultat');renderResult(currentResult)});toast((DEMO_VARIANTS[kind]||DEMO_VARIANTS.fpzg).toast);document.querySelector('#analyzer')?.scrollIntoView({behavior:'smooth'})}
function demoResult(kind='fpzg'){const k=(kind==='pravo'||kind==='seminar')?kind:'fpzg',r: any=k==='pravo'?demoResultPravo():k==='seminar'?demoResultSeminar():demoResultFpzg();r.demo=true;r.demoKind=k;return r}
function demoResultFpzg(){const checks=[makeCheck('formatting','Dominantni font','pass',8,8,'Times New Roman (94%)'),makeCheck('formatting','Veličina osnovnog teksta','pass',6,6,'12 pt'),makeCheck('formatting','Prored osnovnog teksta','warn',4,6,'1,43'),makeCheck('formatting','Margine dokumenta','warn',4,6,'Desna margina: 2,0 cm'),makeCheck('formatting','Poravnanje osnovnog teksta','pass',4,4,'Obostrano'),makeCheck('structure','Hijerarhija naslova','warn',4,6,'3 moguća preskakanja razine'),makeCheck('structure','Sadržaj dokumenta','pass',5,5,'Automatski TOC pronađen'),makeCheck('structure','Brojevi stranica','pass',4,4,'PAGE polje pronađeno'),makeCheck('structure','Osnovni dijelovi rada','pass',6,6,'Uvod, zaključak i literatura prepoznati'),makeCheck('structure','Uporaba Word stilova naslova','warn',2,4,'2 ručno oblikovana naslova'),makeCheck('citations','Prepoznate citatnice','pass',3,3,'87 autor-godina zapisa'),makeCheck('citations','Citirano → literatura','fail',3,10,'5 citatnica bez podudaranja'),makeCheck('citations','Literatura → citirano','warn',4,7,'3 izvora bez citatnice'),makeCheck('citations','Potpunost bibliografskih zapisa','warn',3,5,'2 moguća nepotpuna zapisa'),makeCheck('citations','Datumi pristupa mrežnim izvorima','warn',3,5,'3 mrežna izvora bez datuma pristupa'),makeCheck('elements','Naslovi tablica','warn',3,5,'7 tablica · 5 naslova'),makeCheck('elements','Naslovi slika i grafikona','pass',5,5,'4 elementa · 4 naslova'),makeCheck('elements','Oblik poveznica','pass',3,3,'Nema očitih problema'),makeCheck('elements','Prazni odlomci','pass',2,2,'12 praznih odlomaka (4%)')];const issues=[issue('error','citations','Pet citatnica nije pronađeno u literaturi','Barić 2019, Caratan 2000, Smith 2021, Horvat 2022 i Kovač 2020.','Citatnice i literatura'),issue('warning','structure','Tri naslova preskaču razinu hijerarhije','Nakon Naslova 1 izravno se pojavljuje Naslov 3.','Odlomci 88, 142 i 209'),issue('warning','elements','Dvije tablice nemaju prepoznat naslov','Dodaj oznaku i opis iznad ili ispod tablice prema pravilima profila.','Tablice 4 i 7'),issue('warning','formatting','Desna margina odstupa od profila','Pronađeno 2,0 cm; profil očekuje približno 2,5 cm.','Postavke stranice'),issue('warning','citations','Tri mrežna izvora nemaju datum pristupa','Provjeri zahtijeva li odabrani stil datum pristupa.','Literatura'),issue('info','structure','Dva naslova možda su ručno oblikovana','Upotrijebi Word stil Heading/Naslov kako bi sadržaj ostao stabilan.','Odlomci 71 i 180')];const categories: any={};for(const c of checks){categories[c.category]??={earned:0,max:0};categories[c.category].earned+=c.earned;categories[c.category].max+=c.max}const max=checks.reduce((s,c)=>s+c.max,0),earned=checks.reduce((s,c)=>s+c.earned,0);return{version:'2.2.1-demo',appVersion:APP_VERSION,generatedAt:new Date().toISOString(),file:{name:'Primjer - diplomski rad.docx',size:1867452},profile:'Fakultet političkih znanosti · Politologija · Diplomski rad',profileStatus:'verified',selection:{country:'Hrvatska',city:'Zagreb',institution:'Sveučilište u Zagrebu',unit:'Fakultet političkih znanosti',program:'Politologija',workType:'graduate',citationStyle:'FPZG autor-godina'},settings:{profileId:'fpzg',workType:'graduate',citationStyle:'fpzg',language:'hr',strictness:'balanced'},score:Math.round(earned/max*100),checks,issues,categories,stats:{words:18426,paragraphs:326,headings:31,references:52,citations:87,tables:7,images:4,sections:2,dominantFont:'Times New Roman',dominantSize:12,dominantSpacing:1.43},details:{missingReferences:[],uncitedReferences:[],incompleteReferences:[],sections:[],submissionFacts:['Provjeri aktualni rok i postupak predaje na službenoj stranici fakulteta.'],submissionMetadata:null,ruleAuthority:'official-sources-only',profileFingerprint:'LK-2.0.0-demo0001',references:[{raw:'Watson, J. D., & Crick, F. H. C. (1953). Molecular structure of nucleic acids. Nature, 171(4356), 737-738. https://doi.org/10.1038/171737a0',p:120,author:'Watson',year:'1953'},{raw:'Petak, Z. (2008). Javne financije i proračunski proces. Zagreb: Fakultet političkih znanosti.',p:121,author:'Petak',year:'2008'},{raw:'Fabbricato, L. (2021). An invented meta-analysis of imaginary policy outcomes. Journal of Nonexistent Policy Studies, 3(1), 1-12.',p:122,author:'Fabbricato',year:'2021'}]}}}
// Zajednicko sastavljanje demo rezultata: kategorije i ocjena se racunaju iz checks (isti
// obrazac kao FPZG demo), a varijanta donosi samo svoje podatke.
function demoAssemble(base: any,checks: any,issues: any){const categories: any={};for(const c of checks){categories[c.category]??={earned:0,max:0};categories[c.category].earned+=c.earned;categories[c.category].max+=c.max}const max=checks.reduce((s: any,c: any)=>s+c.max,0),earned=checks.reduce((s: any,c: any)=>s+c.earned,0);return{version:'2.2.1-demo',appVersion:APP_VERSION,generatedAt:new Date().toISOString(),score:Math.round(earned/max*100),checks,issues,categories,...base}}
function demoResultPravo(){
 const checks=[makeCheck('formatting','Dominantni font','pass',8,8,'Times New Roman (97%)'),makeCheck('formatting','Veličina osnovnog teksta','pass',6,6,'12 pt'),makeCheck('formatting','Prored osnovnog teksta','pass',6,6,'1,5'),makeCheck('formatting','Margine dokumenta','pass',6,6,'2,5 cm sa svih strana'),makeCheck('structure','Hijerarhija naslova','pass',6,6,'Bez preskakanja razine'),makeCheck('structure','Sadržaj dokumenta','pass',5,5,'Automatski TOC pronađen'),makeCheck('structure','Brojevi stranica','pass',4,4,'PAGE polje pronađeno'),makeCheck('structure','Uporaba Word stilova naslova','warn',2,4,'3 ručno oblikovana naslova'),makeCheck('citations','Prepoznate fusnote','pass',3,3,'214 fusnota s citatima'),makeCheck('citations','Ponovljena navođenja (Ibid., op. cit.)','warn',4,7,'4 Ibid. bez jasne prethodne bilješke'),makeCheck('citations','Citirano → literatura','fail',3,10,'3 izvora iz fusnota nema u popisu literature'),makeCheck('citations','Navođenje propisa (NN)','warn',3,5,'2 propisa bez broja Narodnih novina'),makeCheck('citations','Potpunost bibliografskih zapisa','warn',3,5,'2 moguća nepotpuna zapisa'),makeCheck('elements','Naslovi tablica','pass',3,3,'2 tablice · 2 naslova'),makeCheck('elements','Oblik poveznica','pass',3,3,'Nema očitih problema'),makeCheck('elements','Prazni odlomci','warn',1,2,'28 praznih odlomaka (9%)')];
 const issues=[issue('error','citations','Tri izvora iz fusnota nisu u popisu literature','Barbić 2015, Klarić i Vedriš 2014 te Gavella 2019 citirani su u fusnotama, a nema ih u literaturi.','Fusnote 41, 87 i 156'),issue('warning','citations','Četiri Ibid. bilješke nemaju jasnu prethodnu bilješku','Ibid. se smije koristiti samo neposredno nakon pune bilješke istog izvora.','Fusnote 63, 64, 118 i 201'),issue('warning','citations','Dva propisa navedena su bez broja Narodnih novina','Zakon o obveznim odnosima i Zakon o radu navedeni su bez NN broja i izmjena.','Fusnote 12 i 95'),issue('warning','structure','Tri naslova možda su ručno oblikovana','Upotrijebi Word stil Heading/Naslov kako bi sadržaj ostao stabilan.','Odlomci 54, 122 i 240'),issue('info','elements','Povećan udio praznih odlomaka','Razmake između cjelina rješavaj stilovima odlomka, ne praznim odlomcima.','Cijeli dokument')];
 return demoAssemble({file:{name:'Primjer - diplomski rad (pravo).docx',size:2147201},profile:'Pravni fakultet u Zagrebu · Pravo · Diplomski rad',profileStatus:'verified',selection:{country:'Hrvatska',city:'Zagreb',institution:'Sveučilište u Zagrebu',unit:'Pravni fakultet',program:'Pravo',workType:'graduate',citationStyle:'Pravne fusnote'},settings:{profileId:'pravo',workType:'graduate',citationStyle:'pravo-fusnote',language:'hr',strictness:'balanced',submissionPhase:'document',selectionIds:{unit:'pravo'}},stats:{words:21830,paragraphs:412,headings:26,references:64,citations:214,tables:2,images:1,sections:2,dominantFont:'Times New Roman',dominantSize:12,dominantSpacing:1.5},details:{missingReferences:[],uncitedReferences:[],incompleteReferences:[],sections:[],submissionFacts:['Provjeri aktualni rok i postupak predaje na službenoj stranici fakulteta.'],submissionMetadata:null,ruleAuthority:'official-sources-only',profileFingerprint:'LK-2.0.0-demo0002'}},checks,issues)}
function demoResultSeminar(){
 const checks=[makeCheck('formatting','Dominantni font','warn',4,8,'Calibri (58%), Times New Roman (39%)'),makeCheck('formatting','Veličina osnovnog teksta','pass',6,6,'12 pt'),makeCheck('formatting','Prored osnovnog teksta','pass',6,6,'1,5'),makeCheck('formatting','Margine dokumenta','pass',6,6,'2,5 cm sa svih strana'),makeCheck('structure','Hijerarhija naslova','pass',6,6,'Bez preskakanja razine'),makeCheck('structure','Sadržaj dokumenta','warn',2,5,'Automatski TOC nije pronađen'),makeCheck('structure','Brojevi stranica','fail',0,4,'PAGE polje nije pronađeno'),makeCheck('structure','Osnovni dijelovi rada','pass',6,6,'Uvod, razrada, zaključak i literatura prepoznati'),makeCheck('citations','Prepoznate citatnice','pass',3,3,'12 autor-godina zapisa'),makeCheck('citations','Citirano → literatura','warn',6,10,'1 citatnica bez podudaranja'),makeCheck('citations','Literatura → citirano','pass',7,7,'Svi izvori citirani'),makeCheck('elements','Oblik poveznica','warn',1,3,'2 gole poveznice bez opisa'),makeCheck('elements','Prazni odlomci','pass',2,2,'5 praznih odlomaka (3%)')];
 const issues=[issue('error','structure','Dokument nema automatske brojeve stranica','Umetni broj stranice preko Umetanje pa Broj stranice (PAGE polje), ne ručnim upisivanjem.','Podnožje stranice'),issue('warning','structure','Sadržaj (tablica sadržaja) nije pronađen','Ako ga kolegij traži, umetni automatski sadržaj preko Reference pa Tablica sadržaja.','Početak dokumenta'),issue('warning','formatting','Font nije ujednačen kroz dokument','Calibri i Times New Roman se izmjenjuju; ujednači na font koji traže upute kolegija.','Cijeli dokument'),issue('warning','citations','Jedna citatnica nije pronađena u literaturi','(Perić, 2023) nema odgovarajući zapis u popisu literature.','Poglavlje 2'),issue('info','elements','Dvije gole poveznice','Umjesto golog URL-a navedi naziv izvora i datum pristupa prema stilu citiranja.','Literatura')];
 return demoAssemble({file:{name:'Primjer - seminarski rad.docx',size:412034},profile:'Generički akademski profil · Seminarski rad',profileStatus:'generic',selection:{country:'Hrvatska',city:'',institution:'',unit:'Generički profil',program:'',workType:'seminar',citationStyle:'Harvard / autor-godina'},settings:{profileId:'generic',workType:'seminar',citationStyle:'harvard',language:'hr',strictness:'balanced',submissionPhase:'document'},stats:{words:3480,paragraphs:74,headings:8,references:9,citations:12,tables:1,images:2,sections:1,dominantFont:'Calibri',dominantSize:12,dominantSpacing:1.5},details:{missingReferences:[],uncitedReferences:[],incompleteReferences:[],sections:[],submissionFacts:['Za seminarske radove vrijede upute kolegija; provjeri ih prije predaje.'],submissionMetadata:null,ruleAuthority:'generic',profileFingerprint:'LK-2.0.0-demo0003'}},checks,issues)}
// UX 3.2: demo traka iznad primjera rezultata: jasno "ovo je uzorak, ne tvoj dokument",
// prebacivanje tri demo profila i posteno objasnjenje sto je besplatno, a sto u punom
// izvjestaju (copy ovisi o tome je li paywall uopce konfiguriran; soft-launch je sve besplatno).
function renderDemoBar(r: any){const el=$('#demoBar');if(!el)return;if(!r?.demo){el.classList.add('hidden');el.innerHTML='';return}
 const active=r.demoKind||'fpzg',chips=Object.entries(DEMO_VARIANTS).map(([k,v]: any)=>`<button class="demo-chip" type="button" data-demo-kind="${k}" aria-pressed="${k===active?'true':'false'}">${escapeHtml(v.label)}</button>`).join('');
 // Copy o cijeni je "za tvoj stvarni rad" (uzorak iznad prikazuje puni izvjestaj), a grana ovisi
 // o STVARNO ozicenim ponudama: puni izvjestaj (reportEndpoint) > samo rucno sredjivanje
 // (paidOffersLive) > soft-launch (sve besplatno). Time nema kontradikcije "uskoro" vs zivi order.
 const freefull=reportEndpointConfigured()?`Za tvoj stvarni rad: besplatna provjera daje ocjenu, sve kategorije i prvih ${TEASER_SAMPLE} problema s uputama, a puni izvještaj otključava cijeli popis, detaljne tablice provjera i serverski potvrđen izvještaj bez vodenog žiga.`:paidOffersLive()?'Za tvoj stvarni rad: automatska provjera je besplatna, a možeš dodatno naručiti ručno sređivanje dokumenta.':'Trenutačno je cijela automatska provjera besplatna; plaćene opcije (puni izvještaj, ručno sređivanje) stižu uskoro.';
 el.innerHTML=`<span class="demo-title">Primjer izvještaja bez učitavanja dokumenta</span>Prikazan je uzorak s tipičnim stvarnim problemima; tvoj dokument nije učitan ni analiziran.<div class="demo-switch" role="group" aria-label="Odaberi demo profil">${chips}</div><div class="demo-freefull">${freefull}</div>`;el.classList.remove('hidden');
 // Tipkovnicki fokus (WCAG 2.4.3): klik na chip re-renderira traku pa se fokus mora vratiti na
 // ekvivalentni novi chip; preventScroll da se ne bori sa scrollIntoform u runDemo.
 el.querySelectorAll('[data-demo-kind]').forEach((b: any)=>{b.onclick=()=>{const k=b.dataset.demoKind;runDemo(k);const nb=$('#demoBar')?.querySelector(`[data-demo-kind="${k}"]`);if(nb)nb.focus({preventScroll:true})}})}
// UX 3.3: jasan sljedeci korak nakon rezultata: popravi sam po planu / preuzmi izvjestaj /
// otkljucaj puni izvjestaj / naruci rucno sredjivanje, s posteno objasnjenom razlikom izmedju
// punog izvjestaja (automatika bez ogranicenja) i rucne usluge (covjek uredjuje dokument).
// Ovdje je i 3.1 nudge: napredne opcije se nude TEK nakon prvog rezultata.
// Sklopivi "svi detalji" (tabovi+panels). Zatvoreno po zadanom (vodjeni prvi korak); jumpovi ga otvore.
function revealResultDetails(){const d=$('#resultDetails');if(d)d.removeAttribute('hidden');const t=$('#resultDetailsToggle');if(t){t.setAttribute('aria-expanded','true');t.classList.add('open')}}
function toggleResultDetails(){const d=$('#resultDetails');if(!d)return;if(d.hasAttribute('hidden')){revealResultDetails();d.scrollIntoView({behavior:'smooth',block:'nearest'})}else{d.setAttribute('hidden','');const t=$('#resultDetailsToggle');if(t){t.setAttribute('aria-expanded','false');t.classList.remove('open')}}}
// "Zasto <score>?": posten razlomak ocjene. Ocjena = zaokruzeno (osvojeni/maksimalni bodovi) preko
// SVIH bodovanih (max>0) strojno provjerljivih provjera profila. Ovdje se pokazuje tocno koliko je
// osvojeno i koja pravila skidaju bodove, da broj ne bude neproziran. Nema skrivenog stropa: sto se
// vidi ovdje, to je cijeli izracun. Prazan string kad ocjene nema ili nema bodovanih provjera.
function scoreBreakdownHtml(r: any): string{
  if(r?.score==null||!Array.isArray(r.checks))return '';
  const scored=r.checks.filter((c: any)=>c&&c.scored&&c.max>0);
  if(!scored.length)return '';
  const earned=scored.reduce((s: number,c: any)=>s+(Number(c.earned)||0),0);
  const max=scored.reduce((s: number,c: any)=>s+(Number(c.max)||0),0);
  const catNames: any={formatting:'Oblikovanje',structure:'Struktura',citations:'Citatnice',elements:'Elementi'};
  const lost=scored.filter((c: any)=>c.earned<c.max).sort((a: any,b: any)=>(b.max-b.earned)-(a.max-a.earned));
  const rows=lost.map((c: any)=>`<li><span class="sw-pts">−${c.max-c.earned}</span><span class="sw-body"><span class="sw-title">${escapeHtml(c.title)}</span> <span class="sw-cat">${escapeHtml(catNames[c.category]||c.category||'')}</span>${c.detail?`<span class="sw-detail">${escapeHtml(c.detail)}</span>`:''}</span></li>`).join('');
  const head=lost.length
    ?`Ocjena je <strong>${earned} od ${max} bodova</strong> strojno provjerljivih pravila ovog profila. Bodove skidaju:`
    :`Ocjena je <strong>${earned} od ${max} bodova</strong>: sva bodovana pravila su prošla. Ostatak do 100 su pravila koja nisu automatski provjerljiva.`;
  return `<details class="score-why"><summary>Zašto ${r.score}?</summary><p class="sw-head">${head}</p>${lost.length?`<ul class="sw-list">${rows}</ul>`:''}<p class="sw-note">Ocjena mjeri samo automatski provjerljiva pravila (oblikovanje, struktura, citatnice). Ne ocjenjuje sadržaj, argument ni hoće li rad biti prihvaćen.</p></details>`;
}
// Jedna UI projekcija za vrh rezultata, plan ispravaka i puni popis. Engineov rezultat ostaje isti.
function findingsFor(r: any): FindingViewModel[]{return buildFindingViewModels(r,findingStates)}
function repairAvailableFor(r: any){return !r?.demo&&!!$('#repairPanelMount')?.childElementCount}
function wireFindingCards(root: any,r: any){
  root?.querySelectorAll('[data-finding-id]').forEach((card: any)=>{
    const id=String(card.dataset.findingId),finding=findingsFor(r).find(x=>x.id===id);if(!finding)return;
    card.querySelector('[data-finding-jump]')?.addEventListener('click',()=>{void trackEvent('finding_opened',{category:finding.category});if(finding.scope.kind==='anchor')void openPreviewAt(finding.scope.paragraphIndex,finding.scope.footnoteId)});
    card.querySelector('[data-finding-repair]')?.addEventListener('click',()=>{void trackEvent('finding_opened',{category:finding.category});scrollToRepairPanel(r,finding)});
    card.querySelector('[data-finding-confirm]')?.addEventListener('click',()=>{findingStates.set(id,{status:'confirmed'});void trackEvent('finding_resolved',{category:finding.category,manual:true});toast('Nalaz je označen kao ručno provjeren. Automatska ocjena se nije promijenila.');refreshFindingViews(r)});
    card.querySelector('[data-finding-reopen]')?.addEventListener('click',()=>{findingStates.delete(id);toast('Nalaz je vraćen u otvorene stavke.');refreshFindingViews(r)});
    const ignore=card.querySelector('[data-finding-ignore]'),form=card.querySelector('.finding-ignore-form'),input=card.querySelector('[data-finding-ignore-reason]');
    ignore?.addEventListener('click',()=>{form?.classList.remove('hidden');input?.focus()});
    card.querySelector('[data-finding-ignore-cancel]')?.addEventListener('click',()=>{form?.classList.add('hidden');if(input)input.value=''});
    card.querySelector('[data-finding-ignore-save]')?.addEventListener('click',()=>{const reason=String(input?.value||'').trim();if(!reason){input?.setAttribute('aria-invalid','true');input?.focus();toast('Upiši razlog prije zanemarivanja nalaza.');return}findingStates.set(id,{status:'ignored',ignoredReason:reason});void trackEvent('finding_ignored',{category:finding.category});toast('Nalaz je zanemaren i uklonjen iz tri najvažnija koraka. Automatska ocjena se nije promijenila.');refreshFindingViews(r)});
  });
}
function renderReadinessHeader(r: any){
  // Autoritet ulazi u verdikt: "blokator" se izgovara samo kad iza nalaza stoji VERIFICIRAN
  // fakultetski izvor. Za genericki profil isti nalaz ostaje "moguce odstupanje" (RE-63).
  const readiness=resultReadiness(r?.issues||[],{profileStatus:r?.profileStatus??null,ruleAuthority:r?.details?.ruleAuthority??null}),el=$('#resultReadiness'),scoreLabel=$('#scoreLabel'),subtitle=$('#resultSubtitle'),stamp=$('#readyStamp');
  if(scoreLabel)scoreLabel.textContent=r?.score!=null?'Automatska tehnička ocjena':'Automatska provjera';
  if(subtitle)subtitle.textContent=`Profil: ${r?.profile||'nije odabran'}.`;
  if(el){el.className=`result-readiness result-readiness--${readiness.kind}`;el.innerHTML=`<strong>${escapeHtml(readiness.label)}</strong><span>${escapeHtml(readiness.description)}</span>`}
  if(stamp){stamp.textContent='Bez automatskih blokatora';stamp.classList.toggle('hidden',readiness.kind!=='clear')}
}
// renderTriage je jedini pisac #triagePanel/#resultGuide/#issuesList: sve dalje ide kroz
// renderPhaseTwoResultViews (isti obrazac za pocetni render i za refreshFindingViews nakon
// potvrde/zanemarivanja nalaza). Raniji kod je ovdje imao VLASTITI, uvijek pregazen zapis
// #triagePanel-a (ukljucujuci rani "return" kad findings.length===0, sto je za savrsen
// dokument bez ijednog nalaza potpuno preskocilo Fazu 2, ostavljajuci #resultGuide/#issuesList
// prazne umjesto Phase-Two "Nema otvorenih problema" poruke).
function renderTriage(r: any){
  renderReadinessHeader(r);
  renderPhaseTwoResultViews(r);
  syncPremiumResultVisuals(r);
  window.__lektaIcons?.();
  renderResultsCockpitForResult(r);
}
function refreshFindingViews(r: any){renderTriage(r)}

/* Results Cockpit (vizualni sloj v2). Cockpit je PROJEKCIJA postojeceg rezultata: ne zove
   analizu, ne izvodi nove nalaze i ne smije prikazati nista sto rezultat ne nosi. Zatecen
   ekran rezultata ostaje netaknut i seli se, sa svim svojim zicama, u sklopljenu "Naprednu
   provjeru" ispod. `?resultRenderer=legacy` vraca stari raspored 1:1. */
function resultsCockpitEnabled(){return resultRendererFor(document)==='cockpit'}
/* Seli SVE sto u #resultView stoji iza #resultCockpit-a. Namjerno NIJE popis ID-jeva: takav
   popis tiho ostavi sirocad (score ring, izbornik preuzimanja, "Nova provjera") vidljivom ili,
   jos gore, sakrivenom CSS-om bez ijednog nacina da se do nje dodje. Navigacija i demo traka
   ostaju IZNAD cockpita, pa se ne sele. Premjestanje cvora cuva vec vezane listenere. */
function ensureResultsCockpitAdvancedShell(): HTMLElement|null{
  const mount=$('#resultCockpit') as HTMLElement|null;
  if(!mount)return null;
  const existing=$('#resultCockpitAdvanced') as HTMLElement|null;
  if(existing)return existing;
  const shell=document.createElement('section');
  shell.id='resultCockpitAdvanced';
  shell.className='result-cockpit-advanced-shell';
  shell.setAttribute('aria-label','Napredna provjera');
  shell.innerHTML='<div class="result-cockpit-advanced-head"><strong>Napredna provjera</strong><p>Puni popis nalaza, bodovanje, plan ispravaka i dodatne provjere ostaju ovdje, nepromijenjeni.</p></div><div class="result-cockpit-advanced-content" id="resultCockpitAdvancedContent" data-cockpit-advanced-content></div>';
  const moved: Element[]=[];
  for(let node=mount.nextElementSibling;node;node=node.nextElementSibling)moved.push(node);
  mount.insertAdjacentElement('afterend',shell);
  const content=shell.querySelector<HTMLElement>('[data-cockpit-advanced-content]');
  if(content)for(const node of moved)content.appendChild(node);
  return shell;
}
function setResultsCockpitAdvanced(open:boolean){
  const shell=$('#resultCockpitAdvanced') as HTMLElement|null;
  const content=$('#resultCockpitAdvancedContent') as HTMLElement|null;
  if(!content)return;
  content.hidden=!open;
  if(shell)shell.dataset.open=String(open);
  ($('#resultCockpit [data-cockpit-advanced]') as HTMLElement|null)?.setAttribute('aria-expanded',String(open));
  if(open){revealResultDetails();revealDetails()}
}
function handleResultsCockpitAction(r: any,action: ResultsCockpitAction){
  if(action.kind==='preview-location'){
    if(Number.isInteger(action.paragraphIndex)&&action.paragraphIndex>=0)void openPreviewAt(action.paragraphIndex,action.footnoteId);
    return;
  }
  if(action.kind==='open-findings'){setResultsCockpitAdvanced(true);openTab('issues');$('#issuesList')?.scrollIntoView({behavior:'smooth',block:'start'});return}
  if(action.kind==='simulate-repair'||action.kind==='repair-safe'){scrollToRepairPanel(r);return}
  const finding=findingsFor(r).find(x=>x.id===action.findingId);
  if(!finding)return;
  if(action.kind==='preview'){
    void trackEvent('finding_opened',{category:finding.category});
    if(finding.scope.kind==='anchor')void openPreviewAt(finding.scope.paragraphIndex,finding.scope.footnoteId);
    return;
  }
  if(action.kind==='repair'){void trackEvent('finding_opened',{category:finding.category});scrollToRepairPanel(r,finding);return}
  if(action.kind==='confirm'){
    findingStates.set(finding.id,{status:'confirmed'});
    void trackEvent('finding_resolved',{category:finding.category,manual:true});
    toast('Nalaz je označen kao ručno provjeren. Automatska ocjena se nije promijenila.');
    refreshFindingViews(r);
    return;
  }
  if(action.kind==='ignore'){
    findingStates.set(finding.id,{status:'ignored',ignoredReason:action.reason});
    void trackEvent('finding_ignored',{category:finding.category});
    toast('Nalaz je zanemaren i uklonjen iz tri najvažnija koraka. Automatska ocjena se nije promijenila.');
    refreshFindingViews(r);
    return;
  }
  findingStates.delete(finding.id);
  toast('Nalaz je vraćen u otvorene stavke.');
  refreshFindingViews(r);
}
function renderResultsCockpitForResult(r: any){
  const mount=$('#resultCockpit') as HTMLElement|null,resultView=$('#resultView') as HTMLElement|null;
  if(!mount||!resultView)return;
  const enabled=resultsCockpitEnabled();
  resultView.classList.toggle('result-renderer-v1',enabled);
  const shell=ensureResultsCockpitAdvancedShell();
  const content=shell?.querySelector<HTMLElement>('[data-cockpit-advanced-content]');
  if(!enabled){
    mount.className='hidden';mount.innerHTML='';
    if(content)content.hidden=false;
    if(shell)shell.dataset.open='false';
    return;
  }
  const advancedOpen=shell?.dataset.open==='true';
  // DNA rada cita STVARNE mjere: ukupan broj odlomaka dolazi iz measurements (racunat PRIJE
  // skracivanja pregleda), a doseg skoka iz zadnjeg odlomka koji je u pregledu ostao. Bez te
  // razlike traka bi tvrdila da se moze skociti u dio rada koji uopce nije ucitan.
  const _m=r?.details?.measurements,_pv=r?.preview;
  const _pvParas=Array.isArray(_pv?.paragraphs)?_pv.paragraphs:[];
  const _dnaReadiness=resultReadiness(Array.isArray(r?.issues)?r.issues:[],{profileStatus:r?.profileStatus??null,ruleAuthority:r?.details?.ruleAuthority??null});
  const _dna=buildDocumentDnaModel({
    totalParagraphs:Number(_m?.counts?.paragraphs)||0,
    lastPreviewedParagraph:_pvParas.length?(Number(_pvParas[_pvParas.length-1]?.index)||null):null,
    previewTruncated:_pv?.truncated===true,
    headings:Array.isArray(_m?.structure?.headings)?_m.structure.headings:[],
    findings:Array.isArray(r?.details?.triage?.findings)?r.details.triage.findings:[],
    provisional:_dnaReadiness.authoritative!==true,
  });
  // Dokazna lupa: mapa `issueKey -> doslovan navod iz sluzbene upute`. Prazna je kad pravila
  // nisu ucitana ili nijedno nema citat, i tada se sucelje ponasa tocno kao prije.
  // DVA IZVORA DOKAZA, namjerno spojena ovdje a ne uzvodno. `ruleEntries` na profilu nose citate
  // iz repair-mape, a `evidenceEntriesFor` one iz autorskih draftova; dolaze razlicitim putem i
  // pune se u razlicitim trenucima, pa bi oslanjanje na jedan od njih tiho izgubilo drugi.
  // Id se cita iz REZULTATA, ne iz DOM-a: odabir se u medjuvremenu mogao promijeniti, a dokaz
  // mora pripadati profilu po kojem je rad ZAISTA mjeren.
  const _evidence=buildExactEvidence(
    r?.checks,
    r?.issues,
    [...(analyzedProfile?.ruleEntries||[]), ...evidenceEntriesFor(r?.details?.profileDefinitionId)],
  );
  // Prije popravka: samo determinisicko. Predodabir se cita kroz `buildDefaultRepairRequests`,
  // dakle kroz TOCNO onaj put koji se izvodi kad korisnik samo klikne Popravi; brojanje po
  // vlastitom kriteriju mjerilo bi tok koji nitko ne izvodi.
  const _outlook=r?.demo?undefined:buildRepairOutlook(
    r?.checks,
    typeof r?.score==='number'?r.score:null,
    buildDefaultRepairRequests([...repairPanelItems,...repairPanelTextItems]).length,
  );
  const model=buildVisualResultModel({
    ...r,
    capabilities:{preview:true,repair:!r?.demo,exactEvidence:Object.keys(_evidence).length>0},
  },{
    exactEvidence:_evidence,
    states:findingStates,
    repairItems:[...repairPanelItems,...repairPanelTextItems],
    ruleEntries:analyzedProfile?.ruleEntries,
  });
  renderResultsCockpit(mount,model,{
    repairAvailable:!r?.demo,
    documentDna:_dna,
    repairOutlook:_outlook,
    advancedOpen,
    onAction:(action)=>handleResultsCockpitAction(r,action),
    onAdvancedToggle:(open)=>setResultsCockpitAdvanced(open),
  });
  setResultsCockpitAdvanced(advancedOpen);
  window.__lektaIcons?.();
}

// Faza 2: jedan put kroz nalaze. Prioriteti ostaju gore, a puni popis zivi na
// jednom mjestu. Ogranicenja alata ostaju dostupna, ali nisu "problemi rada".
function renderPhaseTwoResultViews(r: any){
  const all=findingsFor(r),documentFindings=all.filter(f=>f.kind==='document'),limitations=all.filter(f=>f.kind==='limitation');
  const manualOrder=$('#orderFromResult');if(manualOrder){manualOrder.textContent='Ručna obrada uz privolu';manualOrder.title='Dokument se za ručnu obradu prilaže tek nakon tvoje izričite privole.'}
  const open=documentFindings.filter(f=>f.status!=='ignored'),top=topFindings(open,3),first=top[0],anchored=documentFindings.find(f=>f.scope.kind==='anchor');
  const blockers=open.filter(f=>f.severity==='error').length,warnings=open.filter(f=>f.severity==='warning').length,manual=open.filter(f=>f.severity==='info').length;
  const resultReadiness=$('#resultReadiness');
  if(resultReadiness){
    const base=resultReadiness.querySelector('strong')?.textContent||'';
    const description=resultReadiness.querySelector('span')?.textContent||'';
    resultReadiness.innerHTML=`<strong>${escapeHtml(base)}</strong><span>${escapeHtml(description)}</span><small>${blockers} ${blockers===1?'blokator':'blokatora'}, ${warnings} ${warnings===1?'dorada':'dorada'}, ${manual} ${manual===1?'ručna provjera':'ručnih provjera'} u dokumentu</small>`;
  }
  const metric=$('#metricIssues');if(metric)metric.textContent=String(open.length);
  const issueTab=$('#issueTabCount');if(issueTab)issueTab.textContent=`(${open.length})`;
  const issueTabButton=$('#tabbtn-issues');if(issueTabButton)issueTabButton.childNodes[0].textContent='Svi nalazi ';
  $('#tabbtn-action')?.classList.add('hidden');

  const guide=$('#resultGuide');
  if(guide){
    // #resultGuide pocinje s class="hidden" u index.html; stara (sad uklonjena) renderResultGuide
    // je to cistila, ovaj blok je od Faze 2 jedini pisac pa mora sam preuzeti taj posao.
    guide.classList.remove('hidden');
    const summary=[blockers?`${blockers} ${blockers===1?'blokator':'blokatora'}`:'',warnings?`${warnings} dorada`:'',manual?`${manual} ${manual===1?'ručna provjera':'ručne provjere'}`:''].filter(Boolean).join(', ');
    const primary=anchored
      ?`<button class="btn btn-primary btn-lg" id="guideOpenPreview" type="button">Otvori označeno mjesto u dokumentu →</button>`
      :first?`<button class="btn btn-primary btn-lg" id="guideOpenPriority" type="button">Pregledaj prvi nalaz →</button>`:'';
    // RE-01/RESULT-01: "Zasto <ocjena>?" (scoreBreakdownHtml) i "Podijeli ocjenu" (shareScore) su
    // izvorno zivjeli u sad-uklonjenoj renderResultGuide, koja je pisala u #resultGuide PRIJE ovog
    // bloka u istom renderResult() prolazu; ovaj blok je oduvijek pisao u ISTI element POSLIJE, pa
    // je tiho brisao oboje bez ijedne vidljive greske. Sad su ovdje, jedini pisac #resultGuide-a.
    const shareCta=(r.score!=null)?`<button class="btn btn-ghost guide-share" id="guideShareScore" type="button"><i data-lucide="share-2"></i> Podijeli ocjenu</button>`:'';
    const katedraCta=katedraIntegrationEnabled()?`<button class="btn btn-ghost guide-katedra" id="guideKatedraCta" type="button"><i data-lucide="external-link"></i> Riješi u Katedri</button>`:'';
    guide.innerHTML=first
      ?`<h3 class="guide-h">Što prvo napraviti</h3><p class="guide-summary">${escapeHtml(summary)}. Počni s: <strong>${escapeHtml(first.title)}</strong>.</p>${scoreBreakdownHtml(r)}<div class="guide-cta">${primary}${shareCta}${katedraCta}<button class="tab-toggle guide-more" id="resultDetailsToggle" type="button" aria-expanded="false" aria-controls="resultDetails">Prikaži sve nalaze i provjere</button></div>`
      :`<div class="guide-clean">Nema otvorenih problema dokumenta. Prije predaje pregledaj ograničenja analize i posebne upute profila.</div>${scoreBreakdownHtml(r)}<div class="guide-cta">${shareCta}${katedraCta}</div>`;
    $('#guideOpenPreview')?.addEventListener('click',()=>{if(anchored?.scope.kind==='anchor')void openPreviewAt(anchored.scope.paragraphIndex,anchored.scope.footnoteId)});
    $('#guideOpenPriority')?.addEventListener('click',()=>{$('#triagePanel')?.scrollIntoView({behavior:'smooth',block:'start'})});
    $('#guideShareScore')?.addEventListener('click',()=>{void shareScore(r)});
    $('#guideKatedraCta')?.addEventListener('click',()=>{const url=katedraHandoffUrl(r);if(url)window.open(url,'_blank','noopener')});
    $('#resultDetailsToggle')?.addEventListener('click',toggleResultDetails);
  }

  const triage=$('#triagePanel');
  if(triage){
    triage.classList.toggle('hidden',!top.length);
    triage.innerHTML=top.length?`<h3 class="triage-head">Najvažniji nalazi</h3><div class="finding-list finding-list--top">${top.map(f=>findingCardHtml(f,repairAvailableFor(r))).join('')}</div>`:'';
    wireFindingCards(triage,r);
  }

  const filters=$('#issueFilters'),list=$('#issuesList'),count=$('#issueCountLabel');
  if(!filters||!list||!count)return;
  const active=filters.dataset.phaseTwoFilter||'all';
  filters.innerHTML='<button class="filter-btn" data-filter="all">Problemi dokumenta</button><button class="filter-btn" data-filter="error">Blokatori</button><button class="filter-btn" data-filter="warning">Dorade</button><button class="filter-btn" data-filter="manual">Ručna provjera</button><button class="filter-btn" data-filter="limitations">Ograničenja analize</button><button class="filter-btn" data-filter="confirmed">Ručno provjereno</button><button class="filter-btn" data-filter="ignored">Zanemareno</button>';
  filters.querySelector(`[data-filter="${active}"]`)?.classList.add('active');
  filters.onclick=(event: any)=>{const button=event.target.closest('[data-filter]');if(!button)return;filters.dataset.phaseTwoFilter=button.dataset.filter;renderPhaseTwoResultViews(r)};
  const selected=all.filter(f=>{
    if(active==='all')return f.kind==='document'&&f.status!=='ignored';
    if(active==='manual')return f.kind==='document'&&f.severity==='info'&&f.status!=='ignored';
    if(active==='limitations')return f.kind==='limitation';
    if(active==='confirmed'||active==='ignored')return f.kind==='document'&&f.status===active;
    return f.kind==='document'&&f.severity===active&&f.status!=='ignored';
  });
  count.textContent=`${open.length} problema dokumenta, ${limitations.length} ograničenja analize`;
  list.innerHTML=selected.length?`<div class="finding-list">${selected.map(f=>findingCardHtml(f,repairAvailableFor(r))).join('')}</div>`:'<div class="empty"><p>Nema nalaza u ovom prikazu.</p></div>';
  wireFindingCards(list,r);
  renderPhaseFourTrust(r);
}

// Zavrsni trust sloj je namjerno jedanput uz zakljucak rezultata. Izvor profila
// nije izvor svakog pojedinog nalaza, pa ga ne ponavljamo po karticama.
function renderPhaseFourTrust(r: any){
  const readiness=$('#resultReadiness'),existing=$('#resultTrust');
  if(!readiness)return;
  const source=r?.details?.sources?.find((item: any)=>item?.title&&item?.url);
  const checked=r?.details?.documentDate||r?.details?.verifiedAt;
  const date=checked?new Date(`${checked}T12:00:00`).toLocaleDateString('hr-HR'):'';
  const trust=existing||document.createElement('details');
  trust.id='resultTrust';trust.className='result-trust';
  trust.innerHTML=`<summary>Pravila i granice ove provjere</summary><div class="result-trust__body"><p><strong>Profil:</strong> ${escapeHtml(r?.profile||'Nije odabran profil')}.</p><p><strong>Ocjena uključuje:</strong> automatizirana tehnička pravila odabranog profila.</p><p><strong>Ne potvrđuje:</strong> odluku mentora ili povjerenstva, akademsku kvalitetu sadržaja, plagijat ni prihvaćanje rada.</p>${source?`<p><strong>Izvor profila:</strong> <a href="${escapeHtml(safeHref(source.url))}" target="_blank" rel="noopener">${escapeHtml(source.title)}</a>${date?` (${escapeHtml(date)})`:''}.</p>`:'<p>Za ovaj profil nije povezan pojedinačni službeni izvor.</p>'}</div>`;
  if(!existing)readiness.insertAdjacentElement('afterend',trust);
  const download=$('.dl-menu-btn');if(download&&download.firstChild)download.firstChild.textContent='Preuzmi izvještaj ';
  const rerun=$('#newAnalysis');if(rerun){rerun.textContent='Ponovno analiziraj';rerun.title='Ponovno analiziraj dokument nakon izmjena da potvrdiš rezultat.'}
}
/* Glavni ulaz u automatski popravak, uz sam rezultat.
   Panel popravka fizicki zivi u kartici "Spremnost za predaju" (#repairPanelMount), sto korisnik
   nema kako pogoditi: cak ga ni autor aplikacije nije nasao. Triage ima svoj CTA, ali je uvjetovan
   I postojanjem triage podataka I brojem auto-popravljivih (auto > 0), pa popravak zna ostati
   posve neotkriven. Ovaj ulaz ovisi SAMO o tome je li panel stvarno renderiran s necim akcijskim,
   pa ne moze voditi na prazno. */
function renderRepairCta(r: any){
  const el=$('#repairEntry'); if(!el) return;
  const mount=$('#repairPanelMount');
  const available=!r?.demo&&!!mount?.childElementCount;
  if(!available){el.classList.add('hidden');el.innerHTML='';return}
  el.classList.remove('hidden');
  // RE-34: renderPhaseThreeRepairEntry pise u ISTI element odmah ispod, pa je posebna verzija
  // teksta ovdje uvijek bila mrtva (odmah pregazena); jedini pisac je sad renderPhaseThreeRepairEntry.
  renderPhaseThreeRepairEntry(r);
  window.__lektaIcons?.();
}

// Copy mora biti gejtan na stvarni put popravka (repairServerConfigured()): server je LIVE po
// defaultu, pa tvrdnja "ne salje se na posluzitelj" NIJE tocna kad god je repairEndpoint
// konfiguriran (RE-34). Rucna obrada ostaje odvojena, uz zasebnu privolu.
function renderPhaseThreeRepairEntry(r: any){
  const entry=$('#repairEntry'),order=$('#orderFromResult');
  if(order){order.textContent='Ručna obrada uz privolu';order.title='Dokument se za ručnu obradu prilaže tek nakon tvoje izričite privole.'}
  if(!entry||entry.classList.contains('hidden'))return;
  const auto=Number(r?.details?.triage?.counts?.auto)||0;
  // Preporuke fakulteta se broje ODVOJENO od bodovanih stavki i namjerno ne diraju ocjenu:
  // vecina hrvatskih uputa su preporuke, pa bi bodovanje dalo lazan nalaz studentu koji je
  // postupio po mentorovoj uputi. Broj se ipak pokazuje, jer je to stvarna vrijednost koju
  // korisnik dobiva, a bez njega preporuke prolaze nezapazeno.
  const recommendedCount=repairPanelItems.filter((i: any)=>i&&i.violated===false&&i.recommended===true).length;
  const serverSide=repairServerConfigured();
  const heading=serverSide?'Automatski popravak':'Automatski popravci na ovom uređaju';
  const action=auto
    ?`${serverSide?'Možeš poslati na popravak':'Možeš lokalno primijeniti'} ${auto} ${auto===1?'podržanu stavku':'podržane stavke'} i preuzeti novi Word dokument.`
    :`Pregledaj podržane ${serverSide?'':'lokalne '}popravke i preuzmi novi Word dokument.`;
  const disclosure=serverSide?' Dokument se pritom šalje na server radi popravka i pohranjuje dok ga ne obrišeš.':' Dokument se pri tome ne šalje na poslužitelj.';
  const recommendedNote=recommendedCount
    ?`<p class="repair-entry-recommended">Uz to, tvoj fakultet <strong>preporučuje</strong> još ${recommendedCount} ${recommendedCount===1?'uskladbu':'uskladbi'}. Ne ulaze u ocjenu, ali ih možemo popraviti u istom prolazu.</p>`
    :'';
  entry.innerHTML=`<h3>${escapeHtml(heading)}</h3><p>${action}${disclosure}</p>${recommendedNote}<button type="button" class="triage-repair-cta" data-repair-entry><i data-lucide="wand-2"></i>${serverSide?'Pošalji na popravak':'Odaberi lokalne popravke'} <span aria-hidden="true">→</span></button>`;
  (entry.querySelector('[data-repair-entry]') as any).onclick=()=>scrollToRepairPanel(r);
}
// Most iz besplatne dijagnoze u placeni popravak: prebaci na karticu "Spremnost za predaju" gdje
// zivi #repairPanelMount, doskrolaj i kratko istakni panel te fokusiraj njegovu glavnu akciju.
// RESULT-03: kad je poziv dosao s KONKRETNE kartice nalaza (finding), ne otvara se samo opceniti
// panel bez veze s kliknutim nalazom - trazi se bas ona stavka koja popravlja taj nalaz
// (repair-items.pickTargetItem preko matchKeys), istice se i njoj se pomice fokus. Kad takva
// stavka trenutno nije ponudjena (npr. dokument nema upotrebljiv split sekcija za numeriranje),
// korisnik dobiva postenu poruku umjesto tihog slijetanja na nepovezanu stavku.
function scrollToRepairPanel(r: any,finding?: any){
  // renderResult zatvori #resultDetails I #tabDetails, a openTab samo prebacuje klase. Bez ova dva
  // otkrivanja CTA je prebacivao karticu koja je i dalje skrivena, pa se naizgled nista ne dogodi
  // (isti obrazac koji vec koriste kartice u #categoryGrid).
  revealResultDetails();
  revealDetails();
  openTab('submission');
  const m=$('#repairPanelMount');
  let act: any=null;
  if(m){
    m.scrollIntoView({behavior:motionReduced()?'auto':'smooth',block:'center'});
    m.classList.remove('repair-flash');void (m as any).offsetWidth;m.classList.add('repair-flash');
    if(finding){
      const target=pickTargetItem(finding.matchKeys,repairPanelItems)||pickTargetItem(finding.matchKeys,repairPanelTextItems);
      if(target){
        // Glavne stavke (data-idx) sad zive SAMO kao ledger redak (list je trajno skriven, vidi
        // renderRepairSection): otvori ledger PRIJE trazenja retka, inace redak jos ne postoji u
        // DOM-u. Tekstualne stavke (renderTextItemsSection, data-text-apply) ostaju izvan ledgera,
        // uvijek vidljive - za njih vrijedi stari put preko #repairPanelMount.
        const triggerBtn: any=m.querySelector('.lekta-repair-trigger__btn');
        triggerBtn?.click();
        const ledgerRow: any=document.querySelector(`.lekta-repair-ledger-row[data-rule-id="${target.ruleId}"]`);
        const targetEl: any=ledgerRow||m.querySelector(`[data-rule-id="${target.ruleId}"]`);
        if(targetEl){
          targetEl.scrollIntoView({behavior:motionReduced()?'auto':'smooth',block:'center'});
          const flashClass=ledgerRow?'lekta-repair-ledger-row--target':'lekta-repair-panel__item--target';
          targetEl.classList.remove(flashClass);void targetEl.offsetWidth;targetEl.classList.add(flashClass);
          if(ledgerRow){
            // Redak je <button role="checkbox">: klik njime pogoni I stvarni (skriveni) checkbox I
            // ledgerov vizualni "on" prikaz ISTOVREMENO (renderAll() unutra) - izravno postavljanje
            // checkboxa bi checkbox oznacilo, ali redak bi vizualno ostao neoznacen (renderRepairLedgerModal
            // ne slusa promjene na skrivenoj listi izvana, samo klik na vlastiti redak).
            if(ledgerRow.getAttribute('aria-checked')!=='true')ledgerRow.click();
            act=ledgerRow;
          }else{
            const cb: any=targetEl.querySelector('input[type="checkbox"]');
            // Prisilno oznaci SAMO glavne stavke (data-idx): korisnik je izricito trazio bas ovaj popravak.
            // Tekstualne stavke (data-text-apply, mijenjaju autorov tekst) OSTAJU opt-in, samo se istaknu.
            if(cb&&!cb.checked&&cb.hasAttribute('data-idx')){cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}))}
            act=cb||targetEl.querySelector('button,a[href]')||targetEl;
          }
          toast(`Otvoren je popravak za: ${target.label}.`);
        }
      }else{
        toast('Ovaj popravak trenutno nije ponuđen kao automatska stavka za ovaj dokument. Pogledaj cijeli popis ispod.');
      }
    }
    if(!act)act=m.querySelector('[data-repair-go]:not(:disabled),button:not(:disabled),a[href]');
    if(act)act.focus?.({preventScroll:true});else{m.setAttribute('tabindex','-1');m.focus?.({preventScroll:true})}
  }
  try{void trackEvent('triage_repair_cta',{count:r?.details?.triage?.counts?.auto||0})}catch(e: any){}
}
// Dokaziva privatnost (Faza 4): mjeri mrezne zahtjeve tijekom analize i posteno prikaze koliko ih
// je otislo prema vanjskim posluziteljima. Probe se pokrece u runAnalysis, cita u renderResult.
let _netProbe: NetworkProbe|null=null;
function renderNetworkProof(){
  const el=$('#networkProof');if(!el)return;
  const probe=_netProbe;_netProbe=null;
  if(!probe){el.classList.add('hidden');el.innerHTML='';return}
  const msg=networkProofMessage(probe.stop(),{rulesFetchedFromServer:_rulesProviderMode==='network'});
  if(!msg){el.classList.add('hidden');el.innerHTML='';return}
  el.classList.remove('hidden');
  el.innerHTML=`<span class="np-dot ${msg.safe?'np-dot--ok':'np-dot--warn'}" aria-hidden="true"></span><span class="np-text">${escapeHtml(msg.text)} <span class="np-hint">${escapeHtml(msg.hint)}</span></span>`;
}
// Otvori pregled i skoci na odlomak/fusnotu (data-p-index / data-fn-index iz render-preview).
async function openPreviewAt(paragraphIndex: number,footnoteId?: number){
  await openPreview();
  const doc=$('#previewDoc');if(!doc)return;
  const sel=footnoteId!=null?`[data-fn-id="${footnoteId}"]`:`[data-p-index="${paragraphIndex}"]`;
  if(_previewCtx)_previewCtx.anchorSelector=sel;
  const t=doc.querySelector(sel);
  if(t){void trackEvent('finding_jump',{source:'report'});(t as any).scrollIntoView({block:'center',behavior:'smooth'});t.classList.add('lekta-flag--active');setTimeout(()=>t.classList.remove('lekta-flag--active'),1600)}
}
const _celebrated=new WeakSet();
function celebrateReady(r: any){
  // Suptilna nagrada samo kad je dokument oblikovno spreman: visok rezultat i nula
  // blokirajucih (error) problema. Postuje prefers-reduced-motion; okida jednom po rezultatu.
  try{
    if(!r||r.score==null||r.score<90)return;
    if((r.issues||[]).some((x: any)=>x.severity==='error'))return;
    if(typeof r==='object'){if(_celebrated.has(r))return;_celebrated.add(r)}
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;
    import('canvas-confetti').then(mod=>{
      const confetti=mod.default||mod;const colors=['#33407e','#4b50a4','#1a7a54','#c9a227'];
      confetti({particleCount:70,spread:64,startVelocity:42,origin:{y:.32},colors,scalar:.9,ticks:160,disableForReducedMotion:true});
      setTimeout(()=>confetti({particleCount:40,spread:82,startVelocity:30,origin:{y:.28},colors,scalar:.8,ticks:150,disableForReducedMotion:true}),150);
    }).catch(()=>{});
  }catch(e: any){}
}
// Animacije ekrana rezultata (count-up, ring sweep, punjenje traka). Sve ima instant-fallback
// na prefers-reduced-motion ili ako Motion nije dostupan; vrijednosti su uvijek tocne.
function motionReduced(){return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches)}
// Lokalni View Transition: glatki morph pri swapu analyzer viewova i koraka wizarda. Fallback na
// obicnu mutaciju bez podrske ili uz reduced-motion. .vt-local (na <html>) gasi root fade i imenuje
// analyzer viewove (motion.css). mutate MORA biti sinkron (renderResult jest) da novi snapshot
// uhvati dovrsen DOM. Sekvencijalni pozivi su ok; VT se ne preklapaju (novi preskoci stari).
function withViewTransition(mutate: any){const d: any=document;if(motionReduced()||typeof d.startViewTransition!=='function'){mutate();return}const root=document.documentElement;root.classList.add('vt-local');try{const t=d.startViewTransition(()=>mutate());t.ready&&t.ready.catch(()=>{});t.finished.catch(()=>{}).finally(()=>root.classList.remove('vt-local'))}catch(e: any){root.classList.remove('vt-local');mutate()}}
// Mobilno-svjestan limit velicine (P1 6, BL-P0-05-7): docx do 50 MB dekomprimira do ~200 MB po
// zapisu, sto na slabijem mobitelu moze premasiti memoriju taba prije nego capovi parsera reagiraju.
// Granice su izvucene u cistu, testabilnu jezgru (src/analysis/memory-budget.ts); ovdje samo citamo
// signale uredaja iz preglednika i delegiramo.
function deviceMemoryGb(){try{return (navigator as any).deviceMemory ?? null}catch(e: any){return null}}
function coarsePointer(){try{return !!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches)}catch(e: any){return false}}
function isLikelyMobile(){return coarsePointer()||((deviceMemoryGb() as number)>0&&(deviceMemoryGb() as number)<=4)}
function effectiveUploadCap(){return uploadCapBytes({deviceMemory:deviceMemoryGb(),coarsePointer:coarsePointer()})}
function _animate(){return window.__lektaAnimate} // lijeno ucitan Motion (ui-boot); null dok se ne ucita
const resultAnimations=createAnimationRegistry();
function stopResultAnimations(){resultAnimations.stopAll()}
function countUp(el: any,to: any,fmtFn?: any){if(!el)return;const target=Number(to);if(!isFinite(target)){el.textContent=to;return}const out=(v: any)=>{const n=Math.round(v);el.textContent=fmtFn?fmtFn(n):String(n)};const A=_animate();if(motionReduced()||typeof A!=='function'){out(target);return}resultAnimations.track(A(0,target,{duration:.9,ease:[.22,1,.36,1],onUpdate:out}))}
function animateScore(ring: any,valueEl: any,score: any){stopResultAnimations();countUp(valueEl,score==null?'?':score);if(!ring)return;const s=Number(score),A=_animate();if(!isFinite(s)||motionReduced()||typeof A!=='function'){ring.style.setProperty('--score',isFinite(s)?s:0);return}resultAnimations.track(A(ring,{'--score':[0,s]},{duration:.95,ease:[.22,1,.36,1]}))}
function animateBars(){const A=_animate();document.querySelectorAll('#categoryGrid .bar > i').forEach((el: any)=>{const p=Number(el.dataset.fill)||0;if(motionReduced()||typeof A!=='function'){el.style.width=p+'%';return}resultAnimations.track(A(el,{width:['0%',p+'%']},{duration:.8,ease:[.22,1,.36,1],delay:.12}))})}
function syncPremiumResultVisuals(r: any){
  const score=Number(r?.score),ring=$('#resultPremiumRing'),ringValue=$('#resultPremiumRingValue'),ringLabel=$('#resultPremiumRingLabel');
  if(ring){const percent=Number.isFinite(score)?setProgressValue(ring,score,100):setProgressValue(ring,0,100);ring.style.setProperty('--viz-value',String(percent));ring.style.setProperty('--ring-color',r?.score!=null?String(scoreMeta(r.score).color):'var(--paper-muted)')}
  if(ringValue)ringValue.textContent=Number.isFinite(score)?String(Math.round(score)):'?';
  if(ringLabel)ringLabel.textContent=Number.isFinite(score)?(score>=90?'Spremno za završni pregled':score>=70?'Dobra osnova za doradu':'Prvo riješi najvažnije nalaze'):'Informativni rezultat';
  const names: any={formatting:'Oblikovanje',structure:'Struktura',citations:'Citatnice',elements:'Elementi'};
  Object.entries(r?.categories||{}).forEach(([key,value]: any)=>{const card=document.querySelector<HTMLElement>(`#resultCategoryChart [data-category="${key}"]`);if(!card)return;const percent=value?.max?Math.round(Number(value.earned||0)/Number(value.max)*100):0;const label=card.querySelector('span'),number=card.querySelector('b'),bar=card.querySelector<HTMLElement>('[data-premium-progress]');if(label)label.textContent=names[key]||key;if(number)number.textContent=`${percent}%`;if(bar){bar.dataset.value=String(percent);setProgressValue(bar,percent,100)}});
  const open=(r?.issues||[]).filter((item: any)=>item?.status!=='ignored'),counts={error:0,warning:0,info:0};open.forEach((item: any)=>{if(item?.severity in counts)counts[item.severity as keyof typeof counts]++});
  const error=$('#resultErrorCount'),warning=$('#resultWarningCount'),info=$('#resultInfoCount');if(error)error.textContent=String(counts.error);if(warning)warning.textContent=String(counts.warning);if(info)info.textContent=String(counts.info);
}
// Onboarding footgun (P0 7.1) + WS-2: upozori PRIJE kupnje ako je odabrana vrsta rada vjerojatno
// niza od stvarne (npr. diplomski placen kao seminarski). Rasponi su izvedeni iz fakultetskih uputa
// (data/work-type-scope.json), primarni pouzdani signal je naslovnicki marker (details.titlePageWorkType).
// Klijent je MEKO upozorenje; autoritativna blokada je serverska (WS-3/WS-5). Fail-open: granicni radovi
// (dug seminar, kratak diplomski) NE pale (workTypeMismatchLevel === 'none').
function workTypeMismatchNote(r: any){const selected=toReportWorkType(r.settings?.workType||r.selection?.workType||'final');const words=r.stats?.officialWords||r.stats?.words||null;const marker=r.details?.titlePageWorkType||null;const level=workTypeMismatchLevel(selected,{words,titleMarker:marker});if(level==='none')return null;const est=estimateWorkType({words,titleMarker:marker});if(TIER_RANK[est.workType]<=TIER_RANK[selected])return null;const label=(tierFor(est.workType)?.label||est.workType).toLowerCase();return marker?`Naslovnica upućuje na drugu vrstu rada (${label}). Provjeri jesi li odabrao ispravnu vrstu rada prije popravka.`:`Opseg teksta (${fmt(words)} riječi) odgovara višoj vrsti rada (${label}). Provjeri jesi li odabrao ispravnu vrstu rada i dokument prije popravka.`}
// Kanal "ova provjera je kriva" (P0 3-3): salje kontekst (profil, otisak, verzija, odabir) na
// konfigurirani kontakt (mailto) ili, ako kontakt nije postavljen, preuzima JSON za rucnu predaju.
function reportWrongCheck(){if(!currentResult)return;const t=$('#reportNote');if(t)t.value='';$('#reportModal').classList.remove('hidden');trapModal($('#reportModal'))} function closeReport(){$('#reportModal')?.classList.add('hidden');releaseModal($('#reportModal'))} function submitReport(){if(!currentResult)return;const note=String($('#reportNote')?.value||'').trim();if(!note){toast('Upiši kratki opis prije slanja.');$('#reportNote')?.focus();return}const ctx: any={type:'wrong-check',appVersion:APP_VERSION,at:new Date().toISOString(),profileId:currentResult.details?.profileDefinitionId||currentResult.profile||null,profileFingerprint:currentResult.profileFingerprint||null,selection:currentResult.selection||null,file:currentResult.file?.name||null,score:currentResult.score??null,note:note.slice(0,1000)};closeReport();const contact=productionConfig.contactEmail;if(contact&&!/nije konfiguriran/i.test(contact)){location.href=`mailto:${contact}?subject=${encodeURIComponent('Lekta: prijava pogrešne provjere')}&body=${encodeURIComponent('Prijava pogrešne provjere\n\n'+JSON.stringify(ctx,null,2))}`}else{downloadBlob(JSON.stringify(ctx,null,2),'application/json',`Lekta-prijava-provjere-${ctx.profileFingerprint||'rad'}.json`);toast('Kontakt nije konfiguriran; preuzet je JSON prijave za ručnu predaju.')}trackEvent('wrong_check_reported',{profileId:ctx.profileId||''})}
// Komunikacija promjene pravila (P1 3-6): ako je isti dokument (isti fileName + odabir) vec
// analiziran, a otisak profila se promijenio, pravila su azurirana u meduvremenu pa se rezultat
// mogao promijeniti. Povijest se sprema NAKON renderResulta, pa u ovom trenutku drzi prethodne
// analize.
function ruleChangeNotice(r: any){try{const fp=r.details?.profileFingerprint;if(!fp)return null;const fn=r.file?.name,sel=JSON.stringify(r.settings?.selectionIds||{});const prior=getAnalysisHistory().find((x: any)=>x.fileName===fn&&x.fingerprint&&JSON.stringify(x.selectionIds||{})===sel);return prior&&prior.fingerprint!==fp?'Pravila ovog profila ažurirana su od tvoje prethodne provjere ovog dokumenta (novi otisak pravila), pa se rezultat mogao promijeniti.':null}catch(e: any){return null}}
// Faza 2: napredak istog rada kroz revizije (progres-dopamin). currentDocumentProgress ukljucuje
// TRENUTNU analizu u putanju (povijest se sprema TEK nakon renderResulta), pa banner odmah pokaze
// rast score-a. Cista logika je u src/history/progress.ts; ovdje su samo tanki most i prikaz.
function currentDocumentProgress(r: any){try{const ds=r?.documentStructure;const cur={id:'current',generatedAt:r.generatedAt,fileName:r.file?.name||'Dokument',score:r.score,docFingerprint:ds?computeFingerprint({title:ds.title??null,author:ds.author??null,headings:ds.headings||[]}):null};const p=activeDocumentProgress([cur,...getAnalysisHistory()]);return(p&&p.revisions>=2&&p.entryIds[0]==='current')?p:null}catch(e: any){return null}}
function currentProgressBanner(r: any){const p=currentDocumentProgress(r);if(!p)return'';const c=p.trend==='up'?['#ecfdf5','#a7f3d0']:p.trend==='down'?['#fff7e6','#ecd9a8']:['#eef2ff','#c7d2fe'],arrow=p.trend==='up'?'📈':p.trend==='down'?'📉':'➖',best=p.bestScore>p.latestScore?` · najbolji dosad: ${p.bestScore}`:'';return`<div style="padding:10px 12px;background:${c[0]};border:1px solid ${c[1]};border-radius:10px;margin-bottom:10px">${arrow} <strong>Napredak ovog rada:</strong> ${escapeHtml(describeProgress(p))}${best}</div>`}
// --- Waitlist nepokrivenih fakulteta (WAITLIST_NEPOKRIVENI_FAKULTETI.md) ---
// Endpoint: eksplicitni waitlistEndpoint ili izveden iz supabaseUrl. Prazno = feature off
// (traka se ne prikazuje; postojeca genericka napomena u kartici profila ostaje). Sav DOM glue
// je u src/waitlist/waitlist-bar.ts (testiran); ovdje su samo config, storage i detekcija.
function waitlistConfig(){const wl=String(productionConfig?.waitlistEndpoint||'').trim(),url=String(productionConfig?.supabaseUrl||'').trim();return{endpoint:wl||(url?url.replace(/\/+$/,'')+'/functions/v1/faculty-request':''),anonKey:String(productionConfig?.supabaseAnonKey||'').trim()}}
function waitlistStateAll(){return safeStorageGet(STORAGE_KEYS.waitlist,{})||{}}
function waitlistEntry(key: any){return waitlistStateAll()[key]||null}
function setWaitlistEntry(key: any,val: any){const all=waitlistStateAll();all[key]=val;safeStorageSet(STORAGE_KEYS.waitlist,all)}
// Detekcija iz zive selekcije (isti izvor kao currentProfile): pokriveno = postoji verificiran profil.
function currentWaitlistDetection(){const u=selectedUnit(),program=$('#programSelect').value,workType=$('#workType').value,cov=cellCoverage(VERIFIED_PROFILE_REGISTRY as any,u.id,program,workType);return detectWaitlist({facultyId:u.id,facultyName:u.name,program,workType,coverage:cov})}
function renderWaitlistBar(){mountWaitlistBar($('#waitlistBar'),currentWaitlistDetection(),{config:waitlistConfig(),getEntry:waitlistEntry,setEntry:setWaitlistEntry,resolveToken:resolveAccessToken})}
// Stanje C: "Nema mog fakulteta na popisu" (fakultet izvan kataloga). Feature-gate kao traka.
function wireNoFaculty(){const btn=$('#noFacultyBtn'),panel=$('#noFacultyPanel'),submit=$('#noFacultySubmit');if(btn){btn.classList.toggle('hidden',!waitlistConfig().endpoint);btn.onclick=()=>{if(panel)panel.hidden=!panel.hidden}}if(submit)submit.onclick=submitNoFaculty}
async function submitNoFaculty(){const name=String($('#noFacultyName')?.value||'').trim(),msg=$('#noFacultyMsg');if(name.length<3){if(msg)msg.textContent='Upiši naziv fakulteta (barem 3 znaka).';return}const email=String($('#noFacultyEmail')?.value||'').trim(),btn=$('#noFacultySubmit');if(btn)btn.disabled=true;if(msg)msg.textContent='';try{const token=await resolveAccessToken(),out=await submitUnknownFaculty(waitlistConfig(),{name,workType:$('#workType').value,email},token||'');if(out.kind==='ok'){const panel=$('#noFacultyPanel');if(panel)panel.innerHTML=`<div class="wl-title">Hvala. Zabilježili smo tvoj fakultet.${email?' Javit ćemo ti se e-mailom kad bude gotov.':''}</div>`}else{if(msg)msg.textContent='Nije uspjelo poslati. Pokušaj kasnije.';if(btn)btn.disabled=false}}catch(e: any){if(msg)msg.textContent='Nije uspjelo poslati. Pokušaj kasnije.';const b2=$('#noFacultySubmit');if(b2)b2.disabled=false}}
function renderResult(r: any){const _rvWasHidden=$('#resultView').classList.contains('hidden');renderView('rezultat');$('#resultView').scrollIntoView({behavior:'smooth',block:'start'});resetUnlockButton();{const f=$('#resultFileName');if(f){f.textContent=selectedDocx?.name||'';f.title=selectedDocx?.name||''}}const m=r.score!=null?scoreMeta(r.score):{label:'Nije bodovano',color:'var(--muted)',text:'Ovaj profil ne daje bodovnu ocjenu; prikazane provjere su informativne.'};$('#scoreRing').style.setProperty('--score-color',m.color);animateScore($('#scoreRing'),$('#scoreValue'),r.score);$('#scoreLabel').textContent=m.label;const _scnEl=$('#scoringChangeNote'),_scn=r.score!=null?scoringChangeNote():null;if(_scnEl){_scnEl.textContent=_scn||'';_scnEl.classList.toggle('hidden',!_scn)}const _ready=r.score!=null&&r.score>=90&&!(r.issues||[]).some((x: any)=>x.severity==='error'),_stamp=$('#readyStamp');if(_stamp){_stamp.classList.toggle('hidden',!_ready);_stamp.classList.remove('stamp-in');if(_ready&&!motionReduced()){void _stamp.offsetWidth;_stamp.classList.add('stamp-in')}}$('#resultTitle').textContent=r.file.name;focusResult($('#resultTitle'));const methodText=r.details?.methodologyAudit?.profileLabel?` Metodologija: ${r.details.methodologyAudit.profileLabel}.`:'';$('#resultSubtitle').textContent=`${m.text} Profil: ${r.profile}.${methodText}`;countUp($('#metricIssues'),r.issues.length);countUp($('#metricWords'),r.stats.officialWords||r.stats.words,fmt);countUp($('#metricRefs'),r.stats.references,fmt);countUp($('#metricCitations'),r.stats.citations,fmt);$('#issueTabCount').textContent=`(${r.issues.length})`;$('#categoryGrid').innerHTML=Object.entries(r.categories).map(([k,v]: any)=>{const p=v.max?Math.round(v.earned/v.max*100):0,names: any={formatting:'Oblikovanje',structure:'Struktura',citations:'Citatnice',elements:'Elementi'},tabMap: any={formatting:'formatting',structure:'structure',citations:'citations',elements:'structure'},jt=tabMap[k]||'overview';return`<article class="category-card" data-cat-tab="${jt}" role="button" tabindex="0" aria-label="Prikaži detalje: ${escapeHtml(names[k]||k)}"><div class="category-head"><h3>${names[k]||k}</h3><b>${p}%</b></div><div class="bar"><i style="width:0%" data-fill="${p}"></i></div><span class="cat-jump" aria-hidden="true">Detalji →</span></article>`}).join('');animateBars();const authorityNote=r.details?.ruleAuthority==='official-recommended-mentor-priority'?' Kod ovog profila drukčija pisana uputa mentora ima prednost pred općom preporukom.':'';const _rsrc=r.details?.sources?.[0],_rdate=r.details?.documentDate||r.details?.verifiedAt,_trustHtml=_rsrc?`<div class="source-line" style="margin-bottom:8px"><strong>Provjereno prema:</strong> <a href="${escapeHtml(safeHref(_rsrc.url))}" target="_blank" rel="noopener">${escapeHtml(_rsrc.title)}</a>${_rdate?' ('+escapeHtml(_rdate)+')':''}</div>`:'';const _mm=workTypeMismatchNote(r),_mmHtml=_mm?`<div style="padding:10px 12px;background:#fff7e6;border:1px solid #ecd9a8;border-radius:10px;margin-bottom:10px;font-weight:600">⚠ ${escapeHtml(_mm)}</div>`:'';const _rc=ruleChangeNotice(r),_rcHtml=_rc?`<div style="padding:10px 12px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;margin-bottom:10px">ℹ ${escapeHtml(_rc)}</div>`:'';const _checksN=r.checks.length,_issuesN=r.issues.length,_leadSummary=_checksN?`Lekta je provjerila <strong>${fmt(_checksN)} ${_checksN===1?'pravilo':'pravila'}</strong> za ovaj profil i pronašla <strong>${fmt(_issuesN)} ${_issuesN===1?'nalaz':'nalaza'}</strong>. `:'';
const _dlFacultyId=r.settings?.selectionIds?.unit||null,_dlWorkType=_dlFacultyId?toReportWorkType(r.settings?.workType||r.selection?.workType||'final'):null,_dlEntry=_dlFacultyId&&_dlWorkType?findUpcomingDeadline({facultyId:_dlFacultyId,workType:_dlWorkType},ACADEMIC_DEADLINES):null,_dlDays=_dlEntry?Math.round((Date.parse(_dlEntry.deadlineDate)-Date.parse(new Date().toISOString().slice(0,10)))/86400000):null,_dlWhen=_dlDays==null?'':_dlDays<=0?'danas':_dlDays===1?'sutra':`za ${_dlDays} dana`,_dlNote=_dlEntry?`Rok za predaju je ${_dlWhen} (${new Date(_dlEntry.deadlineDate+'T00:00:00').toLocaleDateString('hr-HR',{day:'numeric',month:'long',year:'numeric'})}). `:'';
$('#summaryNote').innerHTML=currentProgressBanner(r)+_rcHtml+_mmHtml+_trustHtml+_leadSummary+_dlNote+`Automatska analiza obuhvatila je <strong>${fmt(r.stats.paragraphs)} odlomaka</strong>${r.stats.officialWords?`, profilni opseg procijenjen je na <strong>${fmt(r.stats.officialWords)} riječi</strong>${r.stats.footnoteWords?` (uključujući ${fmt(r.stats.footnoteWords)} riječi u fusnotama)`:''}`:''}, <strong>${r.stats.headings} naslova</strong>, <strong>${r.stats.tables} tablica</strong> i <strong>${r.stats.images} grafičkih elemenata</strong>. Bodovna ocjena odnosi se samo na automatizirana pravila odabranog profila; informativne i predajne stavke ne utječu na rezultat.${escapeHtml(authorityNote)}`;renderCheckTable('formattingChecks',r.checks.filter((c: any)=>c.category==='formatting'));renderTypoLint(r);renderSpellcheckHr(r);renderRegisterLint(r);renderGrammarHr(r);renderSubmissionLint(r);renderCheckTable('citationChecks',r.checks.filter((c: any)=>c.category==='citations'));renderLegalCitationSummary(r);renderReferencesExistence(r);renderCheckTable('structureChecks',r.checks.filter((c: any)=>['structure','elements'].includes(c.category)));renderValidationSummary(r);renderSubmissionChecklist(r);renderFullReportBanner(r);renderDemoBar(r);renderTriage(r);renderRepairCta(r);renderNetworkProof();$('#nextSteps')?.classList.add('hidden');try{renderPreflightSection(r)}catch(e: any){console.error('Preflight panel:',e)}wireLockCtas();$('#tabDetails')?.setAttribute('hidden','');$('#detailsToggle')?.classList.remove('open');$('#detailsToggle')?.setAttribute('aria-expanded','false');$('#resultDetails')?.setAttribute('hidden','');openTab('overview');window.__lektaIcons?.();celebrateReady(r);try{renderWaitlistBar()}catch(e: any){}try{void renderReferralShareBar(r)}catch(e: any){}applyResultEntrance(_rvWasHidden);ensureResultScrollProgress();if(_rvWasHidden)void trackEvent('result_shown',{score:r.score??null,demo:!!r.demo,profileId:r.details?.profileDefinitionId||''})}
// Reading-progress traka rezultata (marketing: sitni orijentir "koliko je ostalo" na dugoj stranici
// rezultata smanjuje napustanje). Element se ubaci jednom (lijeno); vidljivost i scroll-punjenje su
// CISTO CSS (motion.css: :has(#resultView) gate + scroll() timeline), pa nema JS scroll listenera.
function ensureResultScrollProgress(){if(document.getElementById('lekResultProgress'))return;try{const bar=document.createElement('div');bar.id='lekResultProgress';bar.setAttribute('aria-hidden','true');document.body.appendChild(bar)}catch(e: any){}}
// Podijeli ocjenu (marketing: visok rezultat je nagrada + organski share-trigger). PRIVATNOST:
// dijeli se SAMO ocjena + adresa stranice, NIKAD tekst rada ni ime datoteke.
// Web Share API se koristi SAMO na dodirnim uredajima (mobitel), gdje je nativni share sheet
// pouzdan i ocekivan. Na desktopu navigator.share zna VISJETI (promise se ne razrijesi bez OS UI-a)
// ili tiho pasti bez ikakvog feedbacka; zato desktop uvijek kopira u međuspremnik uz jasan toast.
// Svaki put je zajamcen vidljiv ishod: nativni sheet, ili kopiranje uz jasan toast (moderni
// clipboard, uz legacy execCommand fallback). Bez native prompt dijaloga; zamijenjen je modalom
// drugdje i to cuva tests/report-modal.test.ts. Ako i kopiranje padne, toast prikaze tekst rucno.
async function shareScore(r: any){const score=r?.score,url=(()=>{try{const u=new URL('/',location.origin||location.href);u.searchParams.set('utm_source','score_share');u.searchParams.set('utm_medium','organic');u.searchParams.set('utm_campaign','result');return u.toString()}catch(e: any){return(location.origin||'')+'/'}})(),text=score!=null?`Moj rad je ${score}/100 na tehničkoj provjeri (Lekta).`:'Provjerio/la sam rad na Lekti.',full=`${text} ${url}`,data={title:'Lekta',text,url};if(coarsePointer()&&(navigator as any).share&&(typeof (navigator as any).canShare!=='function'||(navigator as any).canShare(data))){try{await (navigator as any).share(data);void trackEvent('score_shared',{method:'web-share',score:score??null});return}catch(e: any){if((e as any)?.name==='AbortError')return}}const done=(method: any)=>{toast('Ocjena kopirana. Zalijepi je gdje želiš podijeliti (bez teksta rada).');void trackEvent('score_shared',{method,score:score??null})};try{await navigator.clipboard.writeText(full);done('clipboard');return}catch(e: any){}try{const ta=document.createElement('textarea');ta.value=full;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.top='-1000px';ta.style.opacity='0';document.body.appendChild(ta);ta.select();const ok=!!(document.execCommand&&document.execCommand('copy'));document.body.removeChild(ta);if(ok){done('execCommand');return}}catch(e: any){}toast('Kopiranje nije uspjelo u ovom pregledniku. Podijeli ručno: '+full)}
// Ulazni prijelaz ekrana rezultata (korak 4): fokalna kartica prioriteta i metrike kaskadno ulaze
// (motion.css #resultView.result-enter) SAMO pri prvom prikazu rezultata (progres/wizard -> rezultat,
// tj. view je bio skriven prije rendera), ne pri in-place re-renderu (npr. otkljucavanje punog
// izvjestaja) da se sadrzaj koji korisnik cita ne pre-kaskadira. Gejtirano prefers-reduced-motion;
// reflow (offsetWidth) restarta animaciju, uklanjanje klase na svakom renderu je cisti reset.
function applyResultEntrance(wasHidden: any){const rv=$('#resultView');if(!rv)return;rv.classList.remove('result-enter');if(wasHidden&&!motionReduced()){void rv.offsetWidth;rv.classList.add('result-enter')}}
function renderValidationSummary(r: any){const el=$('#validationSummary'),fv=r.details?.fieldValidation,dfv=r.details?.departmentValidation,cov=r.details?.coverage,dept=r.details?.department,sources=r.details?.sources||[];const card=(title: any,body: any,cls='')=>`<article class="validation-card ${cls}"><h3>${escapeHtml(title)}</h3>${body}</article>`;const list=(items: any)=>items?.length?`<ul>${items.map((x: any)=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`:'<p>Nema dodatnih zabilješki.</p>';let html='<div class="validation-grid">';const readiness=r.details?.readiness,ma=r.details?.methodologyAudit;if(readiness)html+=card('Spremnost profila',`<p><strong>${readiness.overall}/100 · ${escapeHtml(readiness.label)}</strong></p><div class="readiness-meter"><i style="width:${readiness.overall}%"></i></div><p style="margin-top:8px">Normativni profil ${readiness.exact}/100 · citatni engine ${readiness.citation}/100 · oblikovanje ${readiness.format}/100 · validacija ${readiness.validation}/100</p>`);if(ma){const scoreCards=Object.entries(ma.scores||{}).map(([id,s]: any)=>`<div class="methodology-card"><span>${escapeHtml(SOCIAL_METHOD_REGISTRY[id].shortLabel)}</span><b>${s.score}</b></div>`).join('');html+=card('Metodološki profil',`<span class="methodology-chip">${escapeHtml(ma.profileLabel||'Nije prepoznato')}</span><span class="methodology-confidence">Automatska pouzdanost: ${ma.confidence}%</span><div class="methodology-grid">${scoreCards}</div>${ma.missing?.length?`<div class="methodology-missing"><strong>Nije prepoznato:</strong> ${ma.missing.map((x: any)=>escapeHtml(x.label)).join(', ')}</div>`:''}<p style="margin-top:9px">${escapeHtml(ma.note||'')}</p>`)}html+=card('Pokrivenost objavljenih pravila',cov?`<span class="coverage-badge ${cov.status==='published-rules-covered'?'':'partial'}">${escapeHtml(cov.label)}</span><p>${escapeHtml(cov.note)}</p>`:'<span class="coverage-badge partial">Ograničena pokrivenost</span><p>Profil nema posebnu izjavu o potpunosti objavljenih pravila.</p>');html+=card('Terenski uzorak',fv?`<p><strong>${escapeHtml(sampleSummary(fv.sample))}</strong></p><p style="margin-top:7px">${escapeHtml(fv.scope)}</p>`:'<p>Za ovaj profil još nema strukturiranog terenskog uzorka.</p>');html+=card('Potvrđeno i opaženo',fv?`<p><strong>Potvrđeno:</strong></p>${list(fv.confirmed)}<p style="margin-top:10px"><strong>Opažena odstupanja:</strong></p>${list(fv.observedDeviations)}`:'<p>Terenske tvrdnje nisu dostupne.</p>');html+=card('Odluka proizvoda',fv?`<p>${escapeHtml(fv.productDecision)}</p>`:'<p>Rezultat treba tumačiti prema statusu profila i navedenim službenim izvorima.</p>');if(dept)html+=card('Odabrani profil katedre',`<span class="coverage-badge partial">${escapeHtml(dept.name)}</span><p>${escapeHtml(dept.note||'')}</p>${dfv?`<div class="department-note"><strong>${escapeHtml(sampleSummary(dfv.sample))}</strong><br>${escapeHtml(dfv.productDecision)}</div>`:''}`);if(r.details?.profileFingerprint)html+=card('Reproduktivni otisak profila',`<p><strong>${escapeHtml(r.details.profileFingerprint)}</strong></p><p>Otisak povezuje verziju aplikacije, normativni profil, citatni način i ključna pravila korištena u analizi.</p>`);if(sources.length)html+=card('Izvori profila',sources.map((x: any)=>`<div class="validation-source"><a href="${escapeHtml(safeHref(x.url))}" target="_blank" rel="noopener">${escapeHtml(x.title)}</a></div>`).join(''));html+='</div>';el.innerHTML=html}
// Brief za rucno (ljudsko) uredjivanje: sazetak NALAZA analize (naslovi problema), ne tekst
// rada. Dokument se prilaze tek u narudzbi, uz izricitu privolu (postojeci #orderConsent).
function downloadBlob(content: any,type: any,name: any){const blob=new Blob([content],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function buildStandaloneReport(r: any){const status=(PROFILE_STATUS as any)[r.profileStatus]||PROFILE_STATUS.generic,authority=(PROFILE_AUTHORITY as any)[r.details?.ruleAuthority]||PROFILE_AUTHORITY.generic,sub=r.submission,subHtml=sub?`<h2>Tehnička spremnost (provjerljiva pravila)</h2><section class="hero"><h3>${escapeHtml(statusLabel(sub.overall))}</h3><div class="grid"><div class="box"><span>Dokument</span><b>${escapeHtml(statusLabel(sub.document.status))}</b></div><div class="box"><span>Datoteke</span><b>${escapeHtml(statusLabel(sub.files.status))}</b></div><div class="box"><span>Postupak</span><b>${escapeHtml(statusLabel(sub.procedure.status))}</b></div><div class="box"><span>Faza</span><b>${escapeHtml(sub.blueprint.phase)}</b></div></div>${sub.blueprint.selectedDeadline?`<p><strong>Odabrani godišnji rok:</strong> ${escapeHtml(sub.blueprint.selectedDeadline.label)} · ${escapeHtml(dateRange(sub.blueprint.selectedDeadline.defenseStart||sub.blueprint.selectedDeadline.start,sub.blueprint.selectedDeadline.defenseEnd||sub.blueprint.selectedDeadline.end))}</p>`:''}${sub.files.blockers?.length?`<p><strong>Blokira:</strong> ${escapeHtml(sub.files.blockers.join(' · '))}</p>`:''}${sub.procedure.incomplete?.length?`<p><strong>Nepotvrđeno:</strong> ${escapeHtml(sub.procedure.incomplete.map((x: any)=>x.label).join(' · '))}</p>`:''}</section>`:'';const checkRows=(r.checks||[]).map((c: any)=>`<tr><td>${escapeHtml(c.title)}</td><td>${c.status==='unmeasurable'?'Nije provjerljivo':c.max===0?'Informativno':c.status==='pass'?'U redu':c.status==='fail'?'Važno':'Provjeri'}</td><td>${escapeHtml(c.detail)}</td><td>${c.max===0?'?':`${Math.round(c.earned*10)/10}/${c.max}`}</td></tr>`).join('');const issueRows=(r.issues||[]).map((i: any)=>`<article class="issue ${i.severity}"><h3>${escapeHtml(i.title)}</h3><p>${escapeHtml(i.detail)}</p><small>${escapeHtml(i.where||i.category)}</small></article>`).join('')||'<p>Nema prijavljenih problema.</p>';const sourceRows=(r.details?.sources||[]).map((x: any)=>`<li><a href="${escapeHtml(safeHref(x.url))}">${escapeHtml(x.title)}</a></li>`).join('');return`<!doctype html><html lang="hr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Lekta izvještaj ? ${escapeHtml(r.file.name)}</title><style>body{font:15px/1.55 Arial,sans-serif;color:#172033;max-width:1050px;margin:40px auto;padding:0 24px}h1{font-size:30px;margin-bottom:4px}.muted{color:#667085}.hero{border:1px solid #dfe4ee;border-radius:18px;padding:22px;margin:22px 0}.score{font-size:42px;font-weight:800}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.box{border:1px solid #dfe4ee;border-radius:12px;padding:12px}.box span{display:block;color:#667085;font-size:11px}.box b{font-size:19px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{text-align:left;border-bottom:1px solid #dfe4ee;padding:9px;vertical-align:top}th{font-size:11px;color:#667085}.issue{border-left:4px solid #d08b00;padding:10px 13px;margin:9px 0;background:#fafafa}.issue.error{border-color:#c9364f}.issue.info{border-color:#246fb8}.issue h3{font-size:14px;margin:0}.issue p{margin:4px 0}.issue small{color:#667085}.note{padding:12px;background:#eef2ff;border-radius:10px}.wm-banner{padding:12px;background:#fff7e6;border:1px solid #ecd9a8;border-radius:10px;margin:14px 0;font-weight:600}.wm-diag{position:fixed;top:42%;left:50%;transform:translate(-50%,-50%) rotate(-28deg);font-size:64px;font-weight:800;color:rgba(23,32,51,.08);white-space:nowrap;pointer-events:none;z-index:0}@media(max-width:700px){.grid{grid-template-columns:1fr 1fr}}</style></head><body>${r.watermark?'<div class="wm-diag" aria-hidden="true">LEKTA · BESPLATNI SAŽETAK</div>':''}<h1>Lekta izvještaj</h1>${r.watermark?'<div class="wm-banner">Besplatni sažetak s vodenim žigom: prikazan je ograničen broj problema, bez detaljnih tablica provjera. Serverski potvrđen puni izvještaj je bez žiga.</div>':''}<p class="muted">Generirano ${escapeHtml(new Date(r.generatedAt).toLocaleString('hr-HR'))} · verzija ${escapeHtml(r.appVersion||APP_VERSION)}</p><section class="hero"><div class="score">${r.score??'?'}/100</div><h2>${escapeHtml(r.file.name)}</h2><p>${escapeHtml(r.profile)}</p>${r.progressLine?`<p class="muted"><strong>Napredak:</strong> ${escapeHtml(r.progressLine)}</p>`:''}${r.details?.sources?.length?`<p class="muted"><strong>Provjereno prema:</strong> <a href="${escapeHtml(safeHref(r.details.sources[0].url))}">${escapeHtml(r.details.sources[0].title)}</a>${(r.details.documentDate||r.details.verifiedAt)?' ('+escapeHtml(r.details.documentDate||r.details.verifiedAt)+')':''}</p>`:''}<p class="muted">${escapeHtml(status.label)} · ${escapeHtml(authority.label)} · ${escapeHtml(r.details?.profileFingerprint||'bez otiska')}</p><div class="grid"><div class="box"><span>Problemi</span><b>${r.issueTotal??(r.issues?.length||0)}</b></div><div class="box"><span>Riječi</span><b>${fmt(r.stats?.officialWords||r.stats?.words)}</b></div><div class="box"><span>Izvori</span><b>${fmt(r.stats?.references)}</b></div><div class="box"><span>Citatnice</span><b>${fmt(r.stats?.citations)}</b></div></div></section><p class="note">Izvještaj ne sadrži tekst dokumenta. Rezultat je pomoćna tehnička provjera i ne zamjenjuje službene upute ni odluku mentora.</p>${subHtml}${r.watermark&&!checkRows?'<h2>Automatske provjere</h2><p class="note">Detaljne tablice provjera dio su punog izvještaja.</p>':`<h2>Automatske provjere</h2><table><thead><tr><th>Provjera</th><th>Status</th><th>Rezultat</th><th>Bodovi</th></tr></thead><tbody>${checkRows}</tbody></table>`}<h2>Pronađeni problemi</h2>${issueRows}${sourceRows?`<h2>Izvori profila</h2><ul>${sourceRows}</ul>`:''}</body></html>`}
function downloadHtmlReport(){if(!currentResult)return;const exportResult=structuredClone(currentResult);exportResult.submission=submissionAssessment(currentResult);exportResult.details.pdfPreflight=currentPdfAudit;exportResult.details.metadataDocument=currentMetadataAudit;const _prog=currentDocumentProgress(currentResult);if(_prog)exportResult.progressLine=describeProgress(_prog);if(paywallGateActive()){exportResult.watermark=true;exportResult.issueTotal=(exportResult.issues||[]).length;exportResult.checks=[];exportResult.issues=(exportResult.issues||[]).slice(0,TEASER_SAMPLE)}else if(!recipeUnlocked())stripRecipeForExport(exportResult);downloadBlob(buildStandaloneReport(exportResult),'text/html;charset=utf-8',`Lekta-izvjestaj-${currentResult.file.name.replace(/\.docx$/i,'')}.html`);trackEvent('report_downloaded',{source:paywallGateActive()?'html-teaser':'html',profileId:currentResult.details?.profileDefinitionId||''})}
function profileManifest(){const coverage=coverageSnapshot();return{appVersion:APP_VERSION,generatedAt:new Date().toISOString(),coverage:{verifiedAt:INSTITUTIONAL_COVERAGE_MATRIX.verifiedAt,summary:coverage.counts,programs:coverage.rows.map(x=>({id:x.id,unitId:x.unitId,name:x.name,level:x.level,scope:x.scope,expectedWorkTypes:x.expectedWorkTypes,status:x.evaluation.status,gaps:x.evaluation.gaps,profileIds:x.evaluation.profiles.map((p: any)=>p.id),source:x.source}))},profiles:VERIFIED_PROFILE_REGISTRY.map(p=>({id:p.id,unitId:p.unitId,programs:p.programs,workTypes:p.workTypes,status:p.status,variant:p.variant||null,verifiedAt:p.verifiedAt||null,ruleAuthority:p.ruleAuthority||null,sources:(p.sources||[]).map(x=>x.url)})),departments:LEGAL_DEPARTMENT_REGISTRY.map(d=>({id:d.id,name:d.name,programs:d.programs,workTypes:d.workTypes,status:d.status,ruleAuthority:d.ruleAuthority,sources:(d.sources||[]).map(x=>x.url)}))}}
function runRegistryDiagnostics(){const rows: any[]=[],add=(level: any,title: any,detail: any)=>rows.push({level,title,detail});const profileIds=VERIFIED_PROFILE_REGISTRY.map(x=>x.id),departmentIds=LEGAL_DEPARTMENT_REGISTRY.map(x=>x.id),unitMap=new Map(allUnits().map(x=>[x.id,x]));for(const [label,ids]of ([['Profil',profileIds],['Katedarski profil',departmentIds]] as [string, any][])){const dup=[...new Set(ids.filter((x: any,i: any)=>ids.indexOf(x)!==i))];add(dup.length?'fail':'pass',`${label}: jedinstveni ID-jevi`,dup.length?`Duplikati: ${dup.join(', ')}`:`${ids.length} jedinstvenih zapisa`)}for(const p of VERIFIED_PROFILE_REGISTRY){const unit=unitMap.get(p.unitId);if(!unit){add('fail',p.id,`Nepostojeći unitId: ${p.unitId}`);continue}const missingPrograms=(p.programs||[]).filter(x=>!unit.programs.includes(x));if(missingPrograms.length)add('fail',p.id,`Program nije u katalogu: ${missingPrograms.join(', ')}`);const badTypes=(p.workTypes||[]).filter(x=>!VALID_WORK_TYPES.has(x));if(badTypes.length)add('fail',p.id,`Nepoznata vrsta rada: ${badTypes.join(', ')}`);if(!p.rules||typeof p.rules!=='object')add('fail',p.id,'Nedostaje rules objekt');const badSources=(p.sources||[]).filter(x=>!/^https:\/\//.test(x.url||''));if(badSources.length)add('warn',p.id,`${badSources.length} izvora nije HTTPS`);const citation=p.rules?.recommendedCitation;if(citation&&!VALID_CITATION_IDS.has(citation as any))add('fail',p.id,`Nepoznat citatni profil: ${citation}`)}const pravo=unitMap.get('pravo');for(const d of LEGAL_DEPARTMENT_REGISTRY){const missing=(d.programs||[]).filter(x=>!pravo?.programs.includes(x));if(missing.length)add('fail',d.id,`Program nije u katalogu Pravnog fakulteta: ${missing.join(', ')}`);const bad=(d.workTypes||[]).filter(x=>!VALID_WORK_TYPES.has(x));if(bad.length)add('fail',d.id,`Nepoznata vrsta rada: ${bad.join(', ')}`);if(!(d.sources||[]).length)add('warn',d.id,'Nema službenog izvora')}const coveredFpzg=['fpzg-politologija-zavrsni','fpzg-novinarstvo-zavrsni-tekst','fpzg-novinarstvo-zavrsni-av','fpzg-politologija-diplomski','fpzg-nacionalna-sigurnost-diplomski','fpzg-novinarstvo-diplomski'];const missingFpzg=coveredFpzg.filter(id=>!VERIFIED_PROFILE_REGISTRY.some(p=>p.id===id));add(missingFpzg.length?'fail':'pass','FPZG v2.2.2 predajni profili',missingFpzg.length?`Nedostaju: ${missingFpzg.join(', ')}`:'6/6 odvojenih profila povezano s godišnjim kalendarom 2025./2026.');const matrixRows=coverageSnapshot().rows,matrixIds=matrixRows.map(x=>x.id),matrixDup=[...new Set(matrixIds.filter((x,i)=>matrixIds.indexOf(x)!==i))];add(matrixDup.length?'fail':'pass','Institucionalna matrica: jedinstveni ID-jevi',matrixDup.length?`Duplikati: ${matrixDup.join(', ')}`:`${matrixIds.length} jedinstvenih programa`);for(const unitId of ['fpzg','pravo']){const unit=unitMap.get(unitId),matrixPrograms=matrixRows.filter(x=>x.unitId===unitId).map(x=>x.name),catalogPrograms=(unit?.programs||[]).filter(x=>!/^Opći/.test(x));const absent=matrixPrograms.filter(x=>!catalogPrograms.includes(x)),unmapped=catalogPrograms.filter(x=>!matrixPrograms.includes(x));add(absent.length||unmapped.length?'fail':'pass',`${unitId.toUpperCase()}: katalog ↔ matrica`,absent.length||unmapped.length?`Nema u katalogu: ${absent.join(', ')||'?'}; nema u matrici: ${unmapped.join(', ')||'?'}`:`${matrixPrograms.length} programa u potpunosti mapirano`)}const matrixGaps=matrixRows.filter(x=>['missing','partial','published'].includes(x.evaluation.status));add(matrixGaps.length?'warn':'pass','Preostali razvojni jaz',matrixGaps.length?`${matrixGaps.length} internih programa još nije na statusu potpune spremnosti.`:'Svi interni programi imaju potpuni profil.');const externalRows=matrixRows.filter(x=>x.evaluation.status==='external');add('pass','Partnerski i združeni programi',`${externalRows.length} programa odvojeno označeno kao vanjsko upravljanje pravilima.`);const ps=productionStatus();add(ps.active?'pass':'warn','Produkcijska predaja',ps.active?`Aktivna: ${ps.endpoint}`:'Nije aktivirana; koristi se lokalni fallback.');add(ps.links===PACKAGES.length?'pass':'warn','Payment linkovi',`${ps.links}/${PACKAGES.length} paketa ima konfiguriran checkout.`);add(productionConfig.contactEmail?'pass':'warn','Kontakt privatnosti',productionConfig.contactEmail||'Kontakt e-mail nije konfiguriran.');if(productionConfig.analyticsEndpoint)add(safeStorageGet(STORAGE_KEYS.analyticsConsent)?'pass':'warn','Klijentska analitika','Endpoint postoji; privola se prikuplja u sučelju.');else add('pass','Klijentska analitika','Nije uključena; nema klijentskog praćenja.');const noSource=VERIFIED_PROFILE_REGISTRY.filter(p=>!(p.sources||[]).length);add(noSource.length?'warn':'pass','Shipani profili: izvor pravila',noSource.length?`${noSource.length} profila bez navedenog izvora (npr. ${noSource.slice(0,3).map(p=>p.id).join(', ')}). Prije launcha svaki shipani profil treba izvor.`:`Svih ${VERIFIED_PROFILE_REGISTRY.length} profila ima barem jedan izvor.`);const noDate=VERIFIED_PROFILE_REGISTRY.filter(p=>!p.verifiedAt&&!p.documentDate);add(noDate.length?'warn':'pass','Shipani profili: datum verifikacije',noDate.length?`${noDate.length} profila bez datuma verifikacije ni dokumenta.`:'Svi profili imaju datum verifikacije ili dokumenta.');if(!rows.some(x=>x.level==='fail'))add('pass','Usmjeravanje profila','Nisu pronađene blokirajuće pogreške u registrima.');return rows}
function openQa(){const rows=runRegistryDiagnostics(),pass=rows.filter(x=>x.level==='pass').length,warn=rows.filter(x=>x.level==='warn').length,fail=rows.filter(x=>x.level==='fail').length,cov=coverageSnapshot().counts;$('#qaResults').innerHTML=`<div class="qa-summary"><div class="qa-stat"><span>PROGRAMI</span><b>${cov.total}</b></div><div class="qa-stat"><span>SPREMNO</span><b>${cov.ready}</b></div><div class="qa-stat"><span>PROFILI</span><b>${VERIFIED_PROFILE_REGISTRY.length}</b></div><div class="qa-stat"><span>UPOZORENJA</span><b>${warn}</b></div><div class="qa-stat"><span>POGREŠKE</span><b>${fail}</b></div></div><div class="qa-list">${rows.map(x=>`<div class="qa-row ${x.level}"><span>${x.level==='pass'?'<i data-lucide="check-circle"></i>':x.level==='fail'?'<i data-lucide="alert-circle"></i>':'<i data-lucide="alert-triangle"></i>'}</span><div><strong>${escapeHtml(x.title)}</strong><p>${escapeHtml(x.detail)}</p></div></div>`).join('')}</div><p class="profile-note"><strong>Rezultat:</strong> ${pass} prolaznih provjera, ${warn} upozorenja i ${fail} blokirajućih pogrešaka. QA konzola provjerava strukturu registra, ne sadržaj službenih dokumenata.</p>`;window.__lektaIcons?.();$('#qaModal').classList.remove('hidden');trapModal($('#qaModal'))}
function closeQa(){$('#qaModal')?.classList.add('hidden');releaseModal($('#qaModal'))}
function downloadProfileManifest(){downloadBlob(JSON.stringify(profileManifest(),null,2),'application/json',`Lekta-profile-manifest-v${APP_VERSION}.json`)}
function reportEndpointConfigured(){return!!String(productionConfig?.reportEndpoint||'').trim()}
// Server-side repair (WS-3): eksplicitni opt-in (kao reportEndpoint), NE derivira se iz supabaseUrl,
// da soft-launch (prazan repairEndpoint) zadrzi lokalni besplatni popravak. Kad je postavljen,
// placeni popravak ide na server (upload -> repair-docx -> gotov docx).
function repairServerConfigured(){return!!String(productionConfig?.repairEndpoint||'').trim()}
function repairConfig(){return{endpoint:String(productionConfig?.repairEndpoint||'').trim()}}
// Provjera izvora ide zasebnom funkcijom (source-check) USPOREDNO s uploadom, da popravak vise ne
// ceka korpusni budzet. Endpoint se izvodi iz repairEndpointa (ista Supabase projektna baza, susjedna
// funkcija), isti obrazac kao repairHistoryConfig; zaseban setup unos ne bi imao sto dodati.
// Izvodi se SAMO kad repairEndpoint stvarno zavrsava na /repair-docx: inace bi se zahtjev za
// provjeru izvora poslao na nepoznat URL (u najgorem slucaju na sam repair, koji ocekuje multipart).
// Bez podudaranja nema endpointa, a klijent to cita kao "provjera nije dostupna", ne kao gresku.
function sourceCheckConfig(){const r=String(productionConfig?.repairEndpoint||'').trim();return{endpoint:/\/repair-docx\/?$/.test(r)?r.replace(/\/repair-docx\/?$/,'/source-check'):''}}
function eurLabel(n: any){return`${Number(n).toFixed(2).replace('.',',')} €`}
// Teaser/full granica (buildTeaser semantika u zivom UI-u). Aktivna SAMO kad je paywall
// konfiguriran (reportEndpoint) i rezultat jos nije otkljucan; bez konfiguracije aplikacija
// ostaje potpuno besplatna kao dosad. Granica je proizvodna, ne DRM: sav izracun je lokalan.
const TEASER_SAMPLE=2;
// Demo (r.demo) je javni uzorak, ne stvarna analiza: NIKAD nije iza paywalla (prikazuje se
// puni primjer izvjestaja), pa ni njegovi teaser [data-unlock-cta] gumbi ne mogu poslati
// fabricirane demo podatke na generate-report/checkout.
function paywallGateActive(){return reportEndpointConfigured()&&!!currentResult&&!currentResult.fullReport&&!currentResult.demo}
// Recept vs dijagnoza: besplatno se vidi STO i GDJE je greska (naslov, vrsta, "odlomak N",
// brojaci), ali NE doslovni isjecak iz rada ni tocna uputa za popravak (to je "recept" koji
// bi drugi AI iskoristio). Recept-polja (isjecak/uputa/doslovni citat u detalju) prikazuju se
// SAMO kad je rezultat otkljucan (placeni puni izvjestaj) ili je demo javni uzorak. Neovisno o
// naplati: i u soft-launchu (bez reportEndpointa) dijagnoza je bez recepta.
function recipeUnlocked(){return!!currentResult&&(!!currentResult.fullReport||!!currentResult.demo)}
// Redaktiraj doslovni citat rada ugradjen u opis nalaza ("odlomak N: <tekst>" -> "odlomak N")
// osim kad je recept otkljucan. Za nizove/brojace/naslove je no-op.
function diagText(s: any){return recipeUnlocked()?s:(redactParagraphQuotes(s)||s)}
// Ukloni recept-polja (isjecak/uputa) iz KLONA rezultata prije lokalnog izvoza u dijagnostickom
// modu; zadrzava strukturu (vrsta, lokacija, brojaci), brise samo copy-paste sadrzaj.
function stripRecipeForExport(x: any){if(!x)return x;const rd=(s: any)=>redactParagraphQuotes(s)||s;(x.issues||[]).forEach((i: any)=>{if(i&&i.detail)i.detail=rd(i.detail)});(x.checks||[]).forEach((c: any)=>{if(!c)return;if(c.detail)c.detail=rd(c.detail);if(c.issue&&c.issue.detail)c.issue.detail=rd(c.issue.detail)});const d=x.details||{};const strip=(coll: any,fields: string[])=>{if(coll&&Array.isArray(coll.findings))coll.findings=coll.findings.map((f: any)=>{const g={...f};fields.forEach(k=>delete g[k]);return g})};strip(d.typoLint,['excerpt','suggestion']);strip(d.submissionLint,['excerpt','message']);strip(d.registerLint,['excerpt','suggestion']);if(d.legalCitationEngine&&Array.isArray(d.legalCitationEngine.problems))d.legalCitationEngine.problems=d.legalCitationEngine.problems.map((p: any)=>{const g={...p};delete g.message;return g});return x}
function doObraneProduct(workType: any){if(!_retailCatalog)return null;return _retailCatalog.find((x: any)=>x.id===`slot_${workType}_do_obrane`&&x.kind==='slot'&&x.audience==='retail'&&x.active)||null}
let _paywallViewedFor: any=null;
// Vise mjesta na stranici moze renderirati zakljucani panel za ISTI rezultat (typo-lint,
// repair panel, submission gate...); paywall_viewed se broji jednom po rezultatu (referenca
// na currentResult), ne jednom po pozivu, inace bi jedan prikaz rezultata umjetno napuhao broj.
function paywallLockHtml(what: any){if(currentResult&&_paywallViewedFor!==currentResult){_paywallViewedFor=currentResult;void trackEvent('paywall_viewed')}const wt=toReportWorkType(currentResult?.settings?.workType||'final'),tier=tierFor(wt),price=tier?(livePriceEur(tier.workType)??tier.priceEur):null,ob=checkoutConfigured()?doObraneProduct(wt):null;return`<div class="lock-panel"><i data-lucide="lock" aria-hidden="true"></i><div><strong>${escapeHtml(what)}</strong><p>Dio punog izvještaja: serverski potvrđen, bez vodenog žiga${tier?`, ${escapeHtml(tier.label.toLowerCase())} ${eurLabel(price)}`:''}${tier?`, uz ${tier.windowDays} dana besplatnih ponovnih provjera istog rada nakon ispravka`:', uz besplatne ponovne provjere istog rada unutar prozora'}. Pri otključavanju se poslužitelju šalju parsirana struktura i rezultat analize; sam dokument ostaje na uređaju.</p><button class="btn btn-primary btn-sm" type="button" data-unlock-cta>Otključaj puni izvještaj</button>${ob?` <button class="btn btn-secondary btn-sm" type="button" data-buy-obrana="${escapeHtml(wt)}">Do obrane: ${ob.slotWindowDays} dana ponovnih provjera · ${eurLabel(ob.priceEur)}</button>`:''}</div></div>`}
function wireLockCtas(){$$('[data-unlock-cta]').forEach(b=>{b.onclick=handleUnlockReport});$$('[data-buy-obrana]').forEach(b=>{b.onclick=()=>startReportCheckout(b.dataset.buyObrana,'do_obrane')});window.__lektaIcons?.()}
const SESSION_KEY='lekta.session';
const authStore={load:()=>safeStorageGet(SESSION_KEY,null),save:(s: any)=>safeStorageSet(SESSION_KEY,s)};
function authConfig(){return{supabaseUrl:String(productionConfig?.supabaseUrl||'').trim(),anonKey:String(productionConfig?.supabaseAnonKey||'').trim()}}
function authConfigured(){const c=authConfig();return!!(c.supabaseUrl&&c.anonKey)}
// Valjan pristupni token: iz Supabase sesije ako je auth konfiguriran (null -> pozivatelj otvara prijavu),
// inace null (nema vise statickog tokena; nekonfigurirano okruzenje nema pristup).
async function resolveAccessToken(){if(authConfigured()){try{return await getValidAccessToken(authConfig(),authStore)}catch(e: any){return null}}return null}
/* Token BEZ trazenja e-maila: ako sesije nema, tiho otvori anonimnu. Sluzi tokovima koji moraju
   biti bez trenja (popravak, "Moji popravci"). Identitet je i dalje pravi user_id, pa RLS, mapa u
   Storageu i pravo na brisanje rade nepromijenjeno; samo ne trazimo e-mail. Ako anonimna prijava
   nije ukljucena na projektu, vracamo null pa pozivatelj pada natrag na e-mail prijavu.
   NE koristiti za admin/kupnju: ondje identitet mora biti vezan uz osobu. */
async function ensureAccessToken(){if(!authConfigured())return null;const existing=await resolveAccessToken();if(existing)return existing;try{const out=await signInAnonymously(authConfig());if(!out.ok)return null;authStore.save(out.session);renderAuthEntry();return out.session.accessToken}catch(e: any){return null}}
// Referral (pozovi-prijatelja, 0013): kod se hvata iz ?ref na ucitavanju (safeStorage, prezivi
// email-potvrdu u novom tabu), veze se na signup nakon OTP prijave, a share sekcija se prikaze na
// ekranu 6 ako korisnik ima referral_code (prva kupnja). Sve preko service role u Edge Functionima.
const REFERRAL_CODE_KEY='lekta.referral-code';
function referralConfig(){const rf=String(productionConfig?.referralEndpoint||'').trim(),url=String(productionConfig?.supabaseUrl||'').trim();return{endpoint:rf||(url?url.replace(/\/+$/,'')+'/functions/v1/redeem-referral-signup':'')}}
function captureReferralCode(){try{const ref=new URLSearchParams(location.search).get('ref');if(ref)safeStorageSet(REFERRAL_CODE_KEY,ref.trim().toUpperCase())}catch(e: any){}}
async function maybeRedeemReferral(){const code=String(safeStorageGet(REFERRAL_CODE_KEY,'')||'').trim(),ep=referralConfig().endpoint;if(!code||!ep)return;const token: any=await resolveAccessToken();if(!token)return;try{await postReferralRedeem(ep,token,code)}finally{safeStorageSet(REFERRAL_CODE_KEY,'')}}
async function renderReferralShareBar(r?: any){const el=$('#referralShareBar');if(!el)return;el.innerHTML='';const c=authConfig();if(!c.supabaseUrl||!c.anonKey)return;const token: any=await resolveAccessToken();if(!token)return;const facultyId=r?.settings?.selectionIds?.unit||null;const workType=facultyId?toReportWorkType(r.settings?.workType||r.selection?.workType||'final'):null;try{await renderReferralShareSection({supabaseUrl:c.supabaseUrl,anonKey:c.anonKey,accessToken:token,appBaseUrl:location.origin||'',mountEl:el,facultyId,workType,deadlineRegistry:ACADEMIC_DEADLINES,onShare:()=>{void trackEvent('referral_shared')}})}catch(e: any){}}
let _authEmail='',_authStep='email',_pendingAuthAction: any=null;
// Kad nije prazno, potvrda ide kroz email_change nad TIM uuid-om (P0-07), ne kroz obican OTP.
let _authLinkUserId='';
function setAuthStatus(type: any,msg?: any){const st=$('#authStatus');if(!st)return;if(!msg){st.className='order-status hidden';st.textContent='';return}st.className=`order-status ${type}`;st.textContent=msg}
function resetAuthModal(){_authEmail='';_authStep='email';_authLinkUserId='';const em=$('#authEmail'),cc=$('#authCode');if(em){em.value='';em.disabled=false}if(cc)cc.value='';$('#authCodeField')?.classList.add('hidden');$('#authChangeEmail')?.classList.add('hidden');const sub=$('#authSubmit');if(sub){sub.textContent='Pošalji kod';sub.disabled=false}setAuthStatus('','')}
function openAuth(afterSignIn: any){_pendingAuthAction=afterSignIn||null;resetAuthModal();$('#authModal')?.classList.remove('hidden');trapModal($('#authModal'));setTimeout(()=>$('#authEmail')?.focus(),40)}
function closeAuth(){$('#authModal')?.classList.add('hidden');releaseModal($('#authModal'))}
// PRIJAVA IZ ANONIMNE SESIJE IDE POVEZIVANJEM, NE NOVIM RACUNOM (audit P0-07).
//
// `requestEmailOtp` salje `create_user: true`, pa za nepoznat e-mail nastaje NOV korisnik s NOVIM
// uuid-om. Anonimni korisnik koji se tako prijavi ostaje bez svojih popravaka: RLS ih ne pusta,
// Storage prefiks se ne poklapa, "Moji popravci" je prazan. U produkciji SVI repair poslovi
// pripadaju anonimnim racunima, pa je to pogadjalo svakoga tko se prijavi.
//
// Zato se prvo gleda ima li vec anonimna sesija. Ako ima, ide `linkEmailToAnonymous`
// (PUT /auth/v1/user s njezinim tokenom) pa `confirmEmailLink` (verify tipa `email_change`),
// sto zadrzava isti `user_id`. Bez anonimne sesije ostaje stari OTP tok, nepromijenjen.
function anonymousSessionForLink(){const s=authStore.load();return s&&s.isAnonymous&&s.userId&&!s.email?s:null}
async function authSubmit(){const sub=$('#authSubmit');if(!sub)return;if(sub.disabled)return;
 if(_authStep==='email'){
  const email=($('#authEmail')?.value||'').trim();sub.disabled=true;setAuthStatus('pending','Šaljem kod…');
  const anon=anonymousSessionForLink();
  if(anon){
   const token: any=await resolveAccessToken();
   if(token){
    const link: any=await linkEmailToAnonymous(authConfig(),token,email);sub.disabled=false;
    if(link.ok){_authEmail=email;_authLinkUserId=anon.userId;_authStep='code';const em=$('#authEmail');if(em)em.disabled=true;$('#authCodeField')?.classList.remove('hidden');$('#authChangeEmail')?.classList.remove('hidden');sub.textContent='Potvrdi kod';setAuthStatus('success',`Kod je poslan na ${email}. Nakon potvrde tvoji popravci ostaju na istom računu.`);setTimeout(()=>$('#authCode')?.focus(),40);return}
    // Sudar s postojecim racunom se NE rjesava tiho. Korisnik mora znati da bi prijavom na taj
    // racun napustio popravke s ovog uredjaja, pa mu se to kaze prije nego bilo sto poduzme.
    if(link.reason==='email_taken'){setAuthStatus('error','Taj e-mail već ima račun. Prijavom na njega popravci s ovog uređaja ostaju na anonimnom računu i neće se prenijeti. Koristi drugi e-mail ili nam se javi.');return}
    if(link.reason==='not_anonymous'){/* propada na obican OTP ispod */}
    else{setAuthStatus('error',link.message||'Povezivanje e-maila nije uspjelo.');return}
   }else{sub.disabled=false}
   sub.disabled=true;
  }
  const out=await requestEmailOtp(authConfig(),email);sub.disabled=false;
  if(out.ok){_authEmail=email;_authLinkUserId='';_authStep='code';const em=$('#authEmail');if(em)em.disabled=true;$('#authCodeField')?.classList.remove('hidden');$('#authChangeEmail')?.classList.remove('hidden');sub.textContent='Potvrdi kod';setAuthStatus('success',`Kod je poslan na ${email}. Provjeri i mapu neželjene pošte.`);setTimeout(()=>$('#authCode')?.focus(),40)}
  else{setAuthStatus('error',out.message||'Slanje koda nije uspjelo.')}
 }else{
  const code=($('#authCode')?.value||'').trim();sub.disabled=true;setAuthStatus('pending','Provjeravam kod…');
  const out: any=_authLinkUserId
   ?await confirmEmailLink(authConfig(),_authEmail,code,_authLinkUserId)
   :await verifyEmailOtp(authConfig(),_authEmail,code);
  sub.disabled=false;
  if(out.ok){const upgraded=!!_authLinkUserId;authStore.save(out.session);void maybeRedeemReferral();closeAuth();toast(upgraded?'Račun je povezan, popravci su sačuvani.':'Prijava uspješna.');trackEvent(upgraded?'auth_anon_upgraded':'auth_signed_in',{});renderAuthEntry();const a=_pendingAuthAction;_pendingAuthAction=null;if(a)a()}
  else{setAuthStatus('error',out.message||'Kod nije točan.')}
 }}
function authChangeEmail(){_authStep='email';_authLinkUserId='';const em=$('#authEmail');if(em)em.disabled=false;const cc=$('#authCode');if(cc)cc.value='';$('#authCodeField')?.classList.add('hidden');$('#authChangeEmail')?.classList.add('hidden');const sub=$('#authSubmit');if(sub)sub.textContent='Pošalji kod';setAuthStatus('','');em?.focus()}
// Prijava neovisna o paywall-u: nav gumb [data-auth-entry] otvara OTP modal kad je auth
// konfiguriran (supabaseUrl+anon). Bez toga je skriven. Prijava daje sesiju koju cita i
// toggle podsjetnika na rok. NE ovisi o naplati (reportEndpoint ostaje prazan).
function authSessionActive(){const s=authStore.load();return authConfigured()&&s&&s.email?s:null}
function afterAuthChange(){renderAuthEntry();if(currentResult)renderSubmissionChecklist(currentResult)}
function authLogout(){authStore.save(null);toast('Odjavljen/a si.');trackEvent('auth_signed_out',{});afterAuthChange()}
function renderAuthEntry(){const s=authSessionActive();$$('[data-auth-entry]').forEach((b: any)=>{if(!authConfigured()){b.classList.add('hidden');return}b.classList.remove('hidden');if(s){b.textContent='Odjava';b.title=`Prijavljen/a: ${s.email}`;b.onclick=authLogout}else{b.textContent='Prijava';b.title='Prijava e-mailom (kod)';b.onclick=()=>openAuth(afterAuthChange)}})}
function checkoutConfigured(){return!!String(productionConfig?.checkoutEndpoint||'').trim()}
// Garancijski zahtjev (file-guarantee-claim Edge Function). Pokriva TOCNOST verificiranih
// bodovanih pravila (T2/T3, 30 dana od vezivanja), NE prihvacanje rada; odluka je rucna.
// "Dokaz" se u ovoj verziji salje kao tekstualni opis/poveznica u evidencePath (bez
// zasebnog storage uploada); admin ga cita pri rucnoj odluci.
function guaranteeConfigured(){return!!String(productionConfig?.guaranteeEndpoint||'').trim()}
function guaranteeEligible(){const fr=currentResult?.fullReport;return!!(fr&&Number(fr.coverageTier)>=2&&currentResult.fullReportSlotId&&guaranteeConfigured())}
function setGuaranteeStatus(type: any,msg?: any){const st=$('#guaranteeStatus');if(!st)return;if(!msg){st.className='order-status hidden';st.textContent='';return}st.className=`order-status ${type}`;st.textContent=msg}
function openGuarantee(){if(!guaranteeEligible())return;const sel=$('#guaranteeRule');if(sel){const checks=(currentResult.fullReport.checks||[]).filter((c: any)=>c&&c.confidence&&c.confidence!=='informational'&&c.status==='pass');sel.innerHTML=checks.length?checks.map((c: any)=>`<option value="${escapeHtml(c.title)}">${escapeHtml(c.title)}</option>`).join(''):'<option value="">Nema bodovanih pravila označenih prolaznim</option>'}const ev=$('#guaranteeEvidence');if(ev)ev.value='';setGuaranteeStatus('','');$('#guaranteeModal')?.classList.remove('hidden');trapModal($('#guaranteeModal'))}
function closeGuarantee(){$('#guaranteeModal')?.classList.add('hidden');releaseModal($('#guaranteeModal'))}
async function submitGuaranteeClaim(){if(!guaranteeEligible()){setGuaranteeStatus('error','Garancija vrijedi samo uz otključan puni izvještaj verificiranog (T2/T3) profila.');return}const ruleKey=($('#guaranteeRule')?.value||'').trim(),evidence=($('#guaranteeEvidence')?.value||'').trim();if(!ruleKey){setGuaranteeStatus('error','Odaberi sporno pravilo.');return}if(evidence.length<20){setGuaranteeStatus('error','Opiši dokaz (povrat referade) u barem jednoj rečenici, po mogućnosti s poveznicom.');return}const token: any=await resolveAccessToken();if(authConfigured()&&!token){openAuth(()=>submitGuaranteeClaim());return}const btn=$('#guaranteeSubmit');if(btn)btn.disabled=true;setGuaranteeStatus('pending','Šaljem zahtjev…');try{const res=await fetch(String(productionConfig.guaranteeEndpoint).trim(),{method:'POST',headers:{'content-type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({slotId:currentResult.fullReportSlotId,ruleKey,evidencePath:evidence})});const data=await res.json().catch(()=>({}));if(res.ok&&data.ok){setGuaranteeStatus('success',`Zahtjev ${data.claimId?String(data.claimId).slice(0,8):''} je zaprimljen (status: na čekanju). Odluku donosi čovjek nakon pregleda dokaza; odgovor stiže e-mailom.`);trackEvent('guarantee_claim_filed',{})}else{const reason=String(data.error||'');const msgs: any={tier_too_low:'Garancija vrijedi samo za verificirane (T2/T3) profile.',window_expired:'Prošlo je više od 30 dana od vezivanja izvještaja.',missing_evidence:'Nedostaje opis dokaza.',evidence_too_short:'Opis dokaza je prekratak, opiši ga u barem jednoj rečenici.',evidence_too_long:'Opis dokaza je predugačak, skrati ga.',evidence_kind_invalid:'Nepoznata vrsta dokaza.',evidence_path_not_owned:'Priloženi dokaz ne pripada ovom računu.',evidence_path_invalid:'Putanja priloženog dokaza nije valjana.',evidence_type_not_allowed:'Dopušteni su samo PNG, JPG, WEBP i PDF.',evidence_not_found:'Priloženi dokaz nije pronađen. Učitaj ga ponovno.',evidence_too_large:'Priloženi dokaz je prevelik (najviše 10 MB).',evidence_unavailable:'Priloženi dokaz trenutačno nije čitljiv. Pokušaj ponovno.',payload_too_large:'Zahtjev je prevelik.',missing_rule_key:'Nedostaje sporno pravilo.',slot_not_found:'Pripadajući izvještaj nije pronađen na ovom računu.',unauthorized:'Za zahtjev je potrebna prijava.'};setGuaranteeStatus('error',msgs[reason]||'Zahtjev trenutačno nije moguće poslati.')}}catch(e: any){setGuaranteeStatus('error','Mrežna pogreška pri slanju zahtjeva.')}finally{if(btn)btn.disabled=false}}
function resetUnlockButton(){const ub=$('#unlockReport');if(!ub)return;ub.textContent='Otključaj puni izvještaj';ub.onclick=handleUnlockReport;ub.disabled=false;ub.classList.toggle('hidden',!reportEndpointConfigured())}
// Klijentski checkout: salje samo productId (kriterij 14.1). Bez Supabase JWT-a server
// vraca 401 pa se prikaze uputa za prijavu. Puni tok radi tek kad je backend spojen.
// Consent gate (P0 1-1): kupnja digitalnog passa NE smije poceti bez izricitog pristanka na
// trenutnu isporuku i odricanja od 14-dnevnog prava na odustanak. Tekst + timestamp + verzija
// Uvjeta salju se serveru (create-checkout) i trajno biljeze uz narudzbu/entitlement.
function openCheckoutConsent(summary: any,onConfirm: any){const m=$('#checkoutConsentModal');if(!m){onConfirm({immediateDelivery:true,withdrawalWaived:true,text:CHECKOUT_CONSENT_TEXT,timestamp:new Date().toISOString(),termsVersion:TERMS_VERSION});return}const chk=$('#checkoutConsentCheck'),btn=$('#confirmCheckoutConsent');$('#checkoutConsentSummary').textContent=summary;$('#checkoutConsentText').textContent=CHECKOUT_CONSENT_TEXT;chk.checked=false;btn.disabled=true;chk.onchange=()=>{btn.disabled=!chk.checked};btn.onclick=()=>{if(!chk.checked)return;const consent={immediateDelivery:true,withdrawalWaived:true,text:CHECKOUT_CONSENT_TEXT,timestamp:new Date().toISOString(),termsVersion:TERMS_VERSION};closeCheckoutConsent();onConfirm(consent)};m.classList.remove('hidden');trapModal(m);window.__lektaIcons?.()}
function closeCheckoutConsent(){const m=$('#checkoutConsentModal');if(!m)return;m.classList.add('hidden');releaseModal(m)}
async function startReportCheckout(workType: any,variant?: any){const base=slotProductForWorkType(workType),productId=variant==='do_obrane'&&base?`${base}_do_obrane`:base;if(!productId){toast('Za ovu vrstu rada checkout nije dostupan.');return}const token: any=await resolveAccessToken();if(authConfigured()&&!token){openAuth(()=>startReportCheckout(workType,variant));return}const tier=tierFor(workType),price=tier?(livePriceEur(tier.workType)??tier.priceEur):null,summary=`Kupuješ: ${tier?tier.label:workType}${price!=null?` · ${eurLabel(price)}`:''}. Puni izvještaj postaje dostupan odmah nakon uspješnog plaćanja.`;openCheckoutConsent(summary,(consent: any)=>proceedReportCheckout(productId,token,consent))}
async function proceedReportCheckout(productId: any,token: any,consent: any){const ub=$('#unlockReport');if(ub)ub.disabled=true;toast('Otvaram sigurno plaćanje…');try{const out=await createCheckout({endpoint:String(productionConfig.checkoutEndpoint).trim()},token,productId,null,fetch,consent);if(out.kind==='ok'){trackEvent('checkout_started',{product:productId});location.href=out.checkoutUrl;return}if(out.kind==='unauthorized')toast('Za kupnju paketa potrebna je prijava.');else if(out.kind==='forbidden')toast('Ovaj paket trenutačno nije dostupan.');else if(out.kind==='not_found')toast('Paket nije pronađen u katalogu.');else toast('Plaćanje trenutačno nije dostupno.')}catch(e: any){toast('Greška pri otvaranju plaćanja.')}finally{if(ub)ub.disabled=false}}
let _retailCatalog: any=null;
// Cijene iz products tablice (kriterij 14.2, "cijena bez deploya"): dohvat je lijeni i
// kesiran; paywall preferira zivu cijenu, a na bilo koji neuspjeh pada na WORK_TYPE_TIERS.
async function ensureRetailCatalog(force?: any){if(_retailCatalog&&!force)return _retailCatalog;if(!paidOffersLive())return null;/* naplata OFF: ne diraj products tablicu (izbjegni 404 kad monetizacija nije deployana) */const supabaseUrl=String(productionConfig?.supabaseUrl||'').trim(),anonKey=String(productionConfig?.supabaseAnonKey||'').trim();if(!supabaseUrl||!anonKey)return null;try{_retailCatalog=await fetchRetailCatalog({supabaseUrl,anonKey})}catch(e: any){_retailCatalog=null}return _retailCatalog}
function livePriceEur(workType: any){if(!_retailCatalog)return null;const p=_retailCatalog.find((x: any)=>x.kind==='slot'&&x.audience==='retail'&&x.active&&x.workType===workType);return p&&isFinite(p.priceEur)?p.priceEur:null}
function showPaywall(workType: any){const tier=tierFor(workType),price=tier?(livePriceEur(tier.workType)??tier.priceEur):0,label=tier?`${tier.label} (${eurLabel(price)})`:workType,ub=$('#unlockReport');if(checkoutConfigured()&&tier&&ub){ub.classList.remove('hidden');ub.disabled=false;ub.textContent=`Kupi paket: ${tier.label} · ${eurLabel(price)} →`;ub.onclick=()=>startReportCheckout(tier.workType);toast(`Za puni izvještaj potreban je paket: ${label}.`)}else{toast(`Za puni izvještaj potreban je paket: ${label}.`);document.querySelector('#pricing')?.scrollIntoView({behavior:'smooth'})}}
async function handleUnlockReport(){if(!currentResult)return;if(!reportEndpointConfigured()){toast('Puni izvještaj nije konfiguriran u ovom okruženju.');return;}const ub=$('#unlockReport');if(ub)ub.disabled=true;const token: any=await resolveAccessToken();if(authConfigured()&&!token){if(ub)ub.disabled=false;openAuth(()=>handleUnlockReport());return}try{const cfg={endpoint:String(productionConfig.reportEndpoint).trim()},workType=currentResult.settings?.workType||$('#workType')?.value||'final';const out=await unlockReportRequest(currentResult,workType,cfg,token);if(out.kind==='ok'){currentResult.fullReport=out.report;currentResult.fullReportSlotId=out.slotId||null;renderResult(currentResult);toast('Puni izvještaj je otključan.');trackEvent('full_report_unlocked',{profileId:currentResult.details?.profileDefinitionId||''});trackEvent('purchase_completed',{profileId:currentResult.details?.profileDefinitionId||'',workType})}else if(out.kind==='paywall'){showPaywall(out.workType)}else if(out.kind==='unauthorized'){toast('Prijava je potrebna za puni izvještaj.')}else if(out.kind==='rate_limited'){toast('Previše zahtjeva u kratko vrijeme. Pokušaj kasnije.')}else{toast('Puni izvještaj trenutačno nije dostupan.')}}catch(e: any){toast('Greška pri otključavanju izvještaja.')}finally{if(ub)ub.disabled=false}}
// Prikaz punog izvjestaja: banner se pojavi tek kad server vrati fullReport (coverageTier +
// traceToken). Do tada je skriven; teaser rezultat ostaje potpuno lokalan i besplatan.
function renderFullReportBanner(r: any){const el=$('#fullReportBanner');if(!el)return;const fr=r&&r.fullReport;if(!fr){el.classList.add('hidden');el.innerHTML='';return}const tier=Number(fr.coverageTier)||0,labels=['Osnovna pokrivenost','Proširena pokrivenost','Verificirana pokrivenost (garancija)','Potpuna pokrivenost (garancija)'],tierLabel=labels[tier]||`Razina ${tier}`,token=fr.traceToken?`<span class="frb-token">trag: ${escapeHtml(String(fr.traceToken))}</span>`:'';const checks=Array.isArray(fr.checks)?fr.checks:[],cnt=(k: any)=>checks.filter((c: any)=>c&&c.confidence===k).length,scored=typeof fr.scoredCount==='number'?fr.scoredCount:checks.length-cnt('informational'),unver=typeof fr.unverifiedCount==='number'?fr.unverifiedCount:cnt('informational'),high=cnt('high'),med=cnt('medium'),low=cnt('low'),conf=`<span class="frb-conf">Bodovano: ${scored}${high||med||low?` (visoka ${high}, srednja ${med}, niska ${low})`:''}</span><span class="frb-conf frb-unver">Nepotvrđeno: ${unver}</span>`;el.classList.remove('hidden');const guaranteeBtn=guaranteeEligible()?`<button class="btn btn-secondary btn-sm" type="button" id="guaranteeOpen">Garancija točnosti (T2/T3) →</button>`:'';el.innerHTML=`<span class="frb-title"><i data-lucide="badge-check"></i> Puni izvještaj otključan</span><span class="frb-tier">${escapeHtml(tierLabel)}</span>${conf}${token}${guaranteeBtn}<p class="frb-note">Bodovana pravila nose oznaku pouzdanosti prema statusu profila; nepotvrđene stavke prikazuju se informativno i ne ulaze u ocjenu. Puni izvještaj je serverski potvrđen i bez vodenog žiga.${guaranteeEligible()?' Garancija pokriva točnost verificiranih bodovanih pravila, ne prihvaćanje rada.':''}</p>`;const _gb=$('#guaranteeOpen');if(_gb)_gb.onclick=openGuarantee;window.__lektaIcons?.()}
// Tipografska provjera (typo-lint): deterministicka mehanicka provjera, NE ulazi u ocjenu
// i nije zamjena za ljudsku lekturu. Vizualno dijeli legal-engine klase (bez novog CSS-a).
const TYPO_KIND_LABELS: any=KIND_LABELS_HR;
function renderTypoLint(r: any){const el=$('#typoLintSummary'),tl=r.details?.typoLint;if(!el)return;if(!tl||!tl.summary){el.classList.add('hidden');el.innerHTML='';return}el.classList.remove('hidden');const chips=Object.entries(tl.summary.byKind||{}).sort((a: any,b: any)=>b[1]-a[1]).map(([k,n]: any)=>`<span class="legal-type-chip"><strong>${escapeHtml(TYPO_KIND_LABELS[k]||k)}</strong> · ${KIND_DOCUMENT_WIDE.has(k)?'otkriveno u dokumentu':n}</span>`).join('');const shown=(tl.findings||[]).slice(0,50),rows=shown.map((f: any)=>`<div class="legal-problem"><strong>Odlomak ${f.paragraphIndex+1} · ${escapeHtml(TYPO_KIND_LABELS[f.kind]||f.kind)}</strong>${recipeUnlocked()?`${escapeHtml(f.suggestion)}${f.excerpt?`<br><small>…${escapeHtml(f.excerpt)}…</small>`:''}`:''}</div>`).join(''),more=(tl.findings||[]).length>shown.length||tl.truncated?`<div class="legal-engine-note">Prikazano prvih ${shown.length} nalaza${tl.truncated?' (popis je skraćen pri analizi)':''}.</div>`:'';const gated=paywallGateActive(),body=tl.summary.total?(gated?`<div class="legal-type-list">${chips}</div>${paywallLockHtml('Pojedinačni tipografski nalazi s mjestom i prijedlogom ispravka')}`:`<div class="legal-type-list">${chips}</div><div class="legal-problem-list">${rows}</div>${more}`):'<div class="legal-engine-note">Nisu pronađena tipografska odstupanja.</div>';el.innerHTML=`<section class="legal-engine"><div class="legal-engine-head"><div><h3>Tipografska provjera</h3><p>Mehanička provjera razmaka, interpunkcije, crtica, navodnika i brojeva. Ne ulazi u bodovnu ocjenu i nije zamjena za ljudsku lekturu.</p></div><span class="legal-engine-badge">${tl.summary.total} ${tl.summary.total===1?'nalaz':'nalaza'}</span></div>${body}</section>`;if(gated)wireLockCtas()}
// Hrvatski PRAVOPIS (opt-in, savjetodavno): PRAVI Hunspell (WASM) + hrvatski rjecnik, 100% lokalno.
// Cita tekst iz r.preview.paragraphs (lokalno; analiza .docx ovo NE zove pa golden i renderNetworkProof
// ostaju netaknuti). Rjecnik: Denis Lackovic (LGPL/SISSL), lijeno ucitan tek na klik (zaseban chunk).
// Nije zamjena za lekturu; rjecnik nije potpun pa je izlaz savjetodavan ("provjeri"), nikad presuda.
let _spellcheckRunning=false;
function renderSpellcheckHr(r: any){
 const el=$('#spellcheckSummary');if(!el)return;
 const paras=(r.preview?.paragraphs||[]).filter((p: any)=>p&&typeof p.text==='string'&&p.text.trim()).map((p: any)=>({index:p.index,text:p.text}));
 if(!paras.length){el.classList.add('hidden');el.innerHTML='';return}
 el.classList.remove('hidden');
 const truncNote=r.preview?.truncated?' Dokument je velik pa je provjeren prikazani dio.':'';
 el.innerHTML=`<section class="legal-engine"><div class="legal-engine-head"><div><h3>Pravopis (hrvatski)</h3><p>Neobavezna provjera pravopisa hrvatskim rječnikom, potpuno u tvom pregledniku: rječnik i mehanizam učitavaju se lokalno, tekst rada se <strong>ne šalje nikamo</strong>. Savjetodavno je i ne ulazi u ocjenu; rječnik nije potpun pa vlastita imena te strane i stručne riječi mogu biti lažno označene.${escapeHtml(truncNote)}</p></div><span class="legal-engine-badge">${paras.length} ${paras.length===1?'odlomak':'odlomaka'}</span></div><div style="margin:10px 0"><button class="btn btn-secondary btn-sm" id="runSpellcheck" type="button"${_spellcheckRunning?' disabled':''}>Provjeri pravopis (hrvatski)</button></div><div class="sr-only" id="spellcheckStatus" role="status" aria-live="polite"></div><div id="spellcheckList"></div><div class="legal-engine-note">Rječnik: hrvatski Hunspell, Denis Lacković (LGPL/SISSL). Provjera je savjetodavna i ne zamjenjuje ljudsku lekturu.</div></section>`;
 const btn=$('#runSpellcheck');if(btn)btn.onclick=()=>{void runSpellcheckHrUi(paras)};
}
async function runSpellcheckHrUi(paras: any[]){
 if(_spellcheckRunning)return;if(!$('#runSpellcheck'))return;_spellcheckRunning=true;
 const orig='Provjeri pravopis (hrvatski)';
 const setBtn=(t: string,dis?: boolean)=>{const b=$('#runSpellcheck');if(b){b.textContent=t;if(dis!==undefined)b.disabled=dis}};
 const announce=(m: string)=>{const s=$('#spellcheckStatus');if(s)s.textContent=m};
 setBtn('Učitavam rječnik…',true);announce('Učitavam hrvatski rječnik…');
 try{
  const {runHrSpellcheck}=await import('../audits/spellcheck-runner');
  setBtn('Provjeravam…',true);announce('Provjeravam pravopis…');
  const res=await runHrSpellcheck(paras);
  const list=$('#spellcheckList');
  if(list){
   if(!res.findings.length){list.innerHTML='<div class="legal-engine-note">Nisu pronađene sumnjive riječi. Ishod je okviran, ne zamjenjuje lekturu.</div>'}
   else{
    const rows=res.findings.map((f: any)=>{const sug=(f.suggestions||[]).length?` <small>→ ${f.suggestions.map((s: string)=>escapeHtml(s)).join(', ')}</small>`:'';const cnt=f.count>1?` <small>(${f.count}×)</small>`:'';return`<div class="legal-problem"><strong style="color:var(--warn,#c9821f)">${escapeHtml(f.word)}</strong>${cnt}${sug} <small>· odlomak ${f.paragraphIndex}</small></div>`}).join('');
    const more=res.summary.truncated?`<div class="legal-engine-note">Prikazano prvih ${res.findings.length} od ${res.summary.flaggedDistinct} različitih sumnjivih riječi.</div>`:'';
    list.innerHTML=`<div class="legal-problem-list">${rows}</div>${more}`;
   }
  }
  announce(`Provjera pravopisa gotova: ${res.summary.flaggedDistinct} ${res.summary.flaggedDistinct===1?'sumnjiva riječ':'sumnjivih riječi'}${res.summary.truncated?` (prikazano ${res.findings.length})`:''}. Ishod je okviran; provjeri ručno.`);
  void trackEvent('spellcheck_hr_run',{flagged:res.summary.flaggedDistinct,checked:res.summary.checkedDistinct});
 }catch(e: any){console.error('Spellcheck:',e);announce('Provjera pravopisa nije uspjela (učitavanje rječnika). Pokušaj ponovno.')}
 finally{_spellcheckRunning=false;setBtn(orig,false)}
}
// Registar i jasnoca (Faza 3, odluka B): read-only, ne-generativne zastavice. INFORMATIVNO,
// ne ulazi u bodovnu ocjenu i ne prepisuje tekst. Vizualno dijeli legal-engine klase (bez CSS-a).
const REGISTER_KIND_LABELS: any={'duga-recenica':'Duge rečenice','od-strane':'Konstrukcija „od strane“','kolokvijalizam':'Kolokvijalizmi','prvo-lice':'Prvo lice jednine'};
const SUBMISSION_KIND_LABELS: any=SUBMISSION_LABELS_HR;
function renderSubmissionLint(r: any){const el=$('#submissionLintSummary'),sl=r.details?.submissionLint;if(!el)return;if(!sl||!sl.summary||!sl.summary.total){el.classList.add('hidden');el.innerHTML='';return}el.classList.remove('hidden');const chips=Object.entries(sl.summary.byKind||{}).sort((a: any,b: any)=>b[1]-a[1]).map(([k,n]: any)=>`<span class="legal-type-chip"><strong>${escapeHtml(SUBMISSION_KIND_LABELS[k]||k)}</strong> · ${n}</span>`).join('');const shown=(sl.findings||[]).slice(0,50),rows=shown.map((f: any)=>`<div class="legal-problem"><strong>${f.paragraphIndex>0?`Odlomak ${f.paragraphIndex} · `:''}${escapeHtml(SUBMISSION_KIND_LABELS[f.kind]||f.kind)}</strong>${recipeUnlocked()?`${escapeHtml(f.message||'')}${f.excerpt?`<br><small>…${escapeHtml(f.excerpt)}…</small>`:''}`:''}</div>`).join(''),more=(sl.findings||[]).length>shown.length||sl.truncated?`<div class="legal-engine-note">Prikazano prvih ${shown.length} nalaza.</div>`:'';const gated=paywallGateActive(),listBody=gated?paywallLockHtml('Pojedinačni nalazi predaje s mjestom i uputom'):`<div class="legal-problem-list">${rows}</div>${more}`;el.innerHTML=`<section class="legal-engine"><div class="legal-engine-head"><div><h3>Česte greške pri predaji (informativno)</h3><p>Read-only savjeti: naslov s točkom, izravni citat bez stranice, gole poveznice u tekstu, nesklad autor-godina, nevaljan ISBN/DOI i slično. Ne ulaze u ocjenu.</p></div><span class="legal-engine-badge">${sl.summary.total} ${sl.summary.total===1?'nalaz':'nalaza'}</span></div><div class="legal-type-list">${chips}</div>${listBody}</section>`;if(gated)wireLockCtas()}
function renderRegisterLint(r: any){const el=$('#registerLintSummary'),rl=r.details?.registerLint;if(!el)return;if(!rl||!rl.summary){el.classList.add('hidden');el.innerHTML='';return}el.classList.remove('hidden');const chips=Object.entries(rl.summary.byKind||{}).sort((a: any,b: any)=>b[1]-a[1]).map(([k,n]: any)=>`<span class="legal-type-chip"><strong>${escapeHtml(REGISTER_KIND_LABELS[k]||k)}</strong> · ${n}</span>`).join('');const shown=(rl.findings||[]).slice(0,50),rows=shown.map((f: any)=>`<div class="legal-problem"><strong>Odlomak ${f.paragraphIndex+1} · ${escapeHtml(REGISTER_KIND_LABELS[f.kind]||f.kind)}</strong>${recipeUnlocked()?`${escapeHtml(f.suggestion)}${f.excerpt?`<br><small>…${escapeHtml(f.excerpt)}…</small>`:''}`:''}</div>`).join(''),more=(rl.findings||[]).length>shown.length||rl.truncated?`<div class="legal-engine-note">Prikazano prvih ${shown.length} nalaza${rl.truncated?' (popis je skraćen pri analizi)':''}.</div>`:'';const gated=paywallGateActive(),body=rl.summary.total?(gated?`<div class="legal-type-list">${chips}</div>${paywallLockHtml('Pojedinačni prijedlozi registra i jasnoće s mjestom u tekstu')}`:`<div class="legal-type-list">${chips}</div><div class="legal-problem-list">${rows}</div>${more}`):'<div class="legal-engine-note">Nema zapažanja o registru i jasnoći.</div>';el.innerHTML=`<section class="legal-engine"><div class="legal-engine-head"><div><h3>Registar i jasnoća (informativno)</h3><p>Read-only prijedlozi za akademski ton i čitljivost (duge rečenice, „od strane“, kolokvijalizmi, prvo lice). Forma izraza, ne sadržaj. Ne ulazi u ocjenu, ne prepisujemo tekst i ne ocjenjujemo argument.</p></div><span class="legal-engine-badge">${rl.summary.total} ${rl.summary.total===1?'nalaz':'nalaza'}</span></div>${body}</section>`;if(gated)wireLockCtas()}
// Gramatika i stil (informativno): savjetodavne provjere cestih hr pogresaka (grammar-hr.ts). Kao
// registerLint - read-only, ne ulazi u ocjenu, ne prepisuje tekst. BESPLATNO (akvizicija), bez paywalla.
function renderGrammarHr(r: any){const el=$('#grammarLintSummary'),gl=r.details?.grammarLint;if(!el)return;if(!gl||!gl.summary||!gl.summary.total){el.classList.add('hidden');el.innerHTML='';return}el.classList.remove('hidden');const chips=Object.entries(gl.summary.byKind||{}).sort((a: any,b: any)=>b[1]-a[1]).map(([k,n]: any)=>`<span class="legal-type-chip"><strong>${escapeHtml(GRAMMAR_KIND_LABELS[k]||k)}</strong> · ${n}</span>`).join('');const shown=(gl.findings||[]).slice(0,60),rows=shown.map((f: any)=>`<div class="legal-problem"><strong>Odlomak ${f.paragraphIndex+1} · ${escapeHtml(GRAMMAR_KIND_LABELS[f.kind]||f.kind)}</strong> ${escapeHtml(f.suggestion)}${f.excerpt?`<br><small>…${escapeHtml(f.excerpt)}…</small>`:''}</div>`).join(''),more=(gl.findings||[]).length>shown.length||gl.truncated?`<div class="legal-engine-note">Prikazano prvih ${shown.length} nalaza${gl.truncated?' (popis je skraćen pri analizi)':''}.</div>`:'';el.innerHTML=`<section class="legal-engine"><div class="legal-engine-head"><div><h3>Gramatika i stil (informativno)</h3><p>Savjetodavne provjere čestih hrvatskih pogrešaka (nijek „ne”, kondicional, ije/je, zarez ispred „ali”, „s obzirom”, „je li”, s/sa, nestandardni oblici, pleonazmi, administrativizmi i anglizmi). Potpuno lokalno, ne ulazi u ocjenu i ne prepisuje tekst; provjeri prijedloge jer neki mogu biti okvirni.</p></div><span class="legal-engine-badge">${gl.summary.total} ${gl.summary.total===1?'nalaz':'nalaza'}</span></div><div class="legal-type-list">${chips}</div><div class="legal-problem-list">${rows}</div>${more}</section>`}
function renderLegalCitationSummary(r: any){const el=$('#legalCitationSummary'),engine=r.details?.legalCitationEngine;if(!engine){el.classList.add('hidden');el.innerHTML='';return}el.classList.remove('hidden');const labels=LEGAL_SOURCE_LABELS;const chips=Object.entries(engine.typeCounts||{}).filter(([,n]: any)=>n>0).sort((a: any,b: any)=>b[1]-a[1]).map(([k,n]: any)=>`<span class="legal-type-chip"><strong>${escapeHtml(labels[k]||k)}</strong> · ${n}</span>`).join('');const _lcGated=paywallGateActive();const problems=_lcGated?((engine.problems||[]).length?paywallLockHtml(`${(engine.problems||[]).length} citatnih mjesta za ručni pregled s obrazloženjem`):''):(engine.problems||[]).slice(0,6).map((p: any)=>`<div class="legal-problem"><strong>Bilješka ${escapeHtml(p.note)}</strong>${recipeUnlocked()?escapeHtml(p.message):''}</div>`).join('');const coverage=Math.round((engine.coverage||0)*100);el.innerHTML=`<section class="legal-engine"><div class="legal-engine-head"><div><h3>Provjera pravnih citata</h3><p>Heuristički povezuje prva i ponovljena navođenja, propise, sudsku praksu i bibliografiju. Rezultat treba potvrditi u kontekstu rada.</p></div><span class="legal-engine-badge">${coverage}% klasificirano</span></div><div class="legal-engine-grid"><div class="legal-engine-card"><span>Fusnote</span><b>${fmt(engine.summary?.footnotes||0)}</b></div><div class="legal-engine-card"><span>op. cit. / Ibid. / id.</span><b>${fmt((engine.summary?.opCit||0)+(engine.summary?.ibid||0)+(engine.summary?.id||0))}</b></div><div class="legal-engine-card"><span>Pravni akti</span><b>${fmt(engine.summary?.legalActs||0)}</b></div><div class="legal-engine-card"><span>Sudske odluke</span><b>${fmt(engine.summary?.cases||0)}</b></div></div><div class="legal-type-list">${chips||'<span class="legal-type-chip">Nema klasificiranih izvora</span>'}</div>${problems?`<div class="legal-problem-list">${problems}</div>`:''}<div class="legal-engine-note">Povezivanje je konzervativno: nepoznat ili složen navod označava se za ručni pregled umjesto da se automatski proglasi pogrešnim.</div></section>`}
// Opt-in ONLINE provjera POSTOJANJA navedenih izvora (protiv izmisljenih/haluciniranih referenci).
// Analiza ostaje 100% lokalna; ovo je ZASEBAN, post-analiza, eksplicitni klik s vidljivom disclosure.
// Salje SAMO strukturiranu referencu (autor/naslov/DOI/godina) CrossRef-u; tijelo rada NIKAD. Besplatno,
// savjetodavno (ne ulazi u ocjenu). VERDICT_BADGE + verifyReferences dijeljeni s citat alatom. Nikad "izmisljeno".
let _existCheckRunning=false;
// Verdikti zadnje OPT-IN provjere postojanja, vezani uz konkretan rezultat. Zive SAMO ovdje (lokalno
// stanje UI-ja), nikad u result.details -> ne idu na mrezu (sanitizeAnalysisResult) ni u golden.
// Preview ih sidri na odlomke literature preko .p (collectExistenceFlags).
let _existenceVerdicts: { result: any; verdicts: Array<{ p: number; verdict: string }> } | null = null;
function renderReferencesExistence(r: any){const el=$('#referencesExistence');if(!el)return;if(_existenceVerdicts&&_existenceVerdicts.result!==r)_existenceVerdicts=null;const refs=(r.details?.references||[]).filter((x: any)=>x&&x.raw&&String(x.raw).trim());if(!refs.length){el.classList.add('hidden');el.innerHTML='';return}el.classList.remove('hidden');const list=refs.map((x: any,i: number)=>`<li class="legal-problem" data-exist="${i}"><span class="exist-badge" style="font-weight:700"></span> <small>${escapeHtml(String(x.raw).slice(0,180))}${String(x.raw).length>180?'…':''}</small></li>`).join('');el.innerHTML=`<section class="legal-engine"><div class="legal-engine-head"><div><h3>Postoje li navedeni izvori (online)</h3><p>Neobavezna provjera protiv baze CrossRef, protiv izmišljenih (haluciniranih) referenci. Šalje samo autore, naslove, DOI i godinu tvojih referenci; naslov rada i tijelo teksta se ne šalju. Ishod je okvirni: za domaće izvore (Hrčak, Dabar) CrossRef često nema zapis pa „nije pronađeno” ne znači da izvor ne postoji.</p></div><span class="legal-engine-badge">${refs.length} ${refs.length===1?'referenca':'referenci'}</span></div><div style="margin:10px 0"><button class="btn btn-secondary btn-sm" id="verifyExistence" type="button"${_existCheckRunning?' disabled':''}>Provjeri postoje li izvori (online)</button></div><div class="sr-only" id="existenceStatus" role="status" aria-live="polite"></div><ol class="legal-problem-list" id="existenceList">${list}</ol><div class="legal-engine-note">Provjera postojanja ne ulazi u ocjenu; služi kao znak za ručni pregled sumnjivih navoda.</div></section>`;const btn=$('#verifyExistence');if(btn)btn.onclick=()=>{void runExistenceCheck(refs,r)}}
async function runExistenceCheck(refs: any[],resultRef?: any){if(_existCheckRunning)return;if(!$('#verifyExistence'))return;_existCheckRunning=true;const orig='Provjeri postoje li izvori (online)';const setBtn=(t: string,dis?: boolean)=>{const b=$('#verifyExistence');if(b){b.textContent=t;if(dis!==undefined)b.disabled=dis}};const announce=(m: string)=>{const s=$('#existenceStatus');if(s)s.textContent=m};setBtn('Provjeravam…',true);announce('Provjeravam postojanje izvora…');try{const inputs=refs.map((x: any)=>parseReference(x.raw,'auto').fields);const mailto=productionConfig?.contactEmail||undefined;const results=await verifyReferences(inputs,{mailto,onProgress:(done: number,total: number)=>setBtn(`Provjeravam… ${done}/${total}`)});results.forEach((res: any,i: number)=>{const meta=(VERDICT_BADGE as any)[res.verdict]||VERDICT_BADGE.unchecked;const cell=document.querySelector(`#existenceList li[data-exist="${i}"] .exist-badge`) as any;if(cell){cell.style.color=meta.color;const match=(res.verdict==='found'||res.verdict==='weak')&&res.matchedTitle?` — podudara se s: „${escapeHtml(String(res.matchedTitle))}”`:'';cell.innerHTML=escapeHtml(meta.text)+match}});_existenceVerdicts={result:resultRef||currentResult,verdicts:refs.map((x: any,i: number)=>({p:Number(x&&x.p),verdict:String((results[i]&&results[i].verdict)||'unchecked')})).filter((v: any)=>Number.isInteger(v.p)&&v.p>=1)};announce(summarizeVerification(results));const found=results.filter((r2: any)=>r2.verdict==='found').length,missing=results.filter((r2: any)=>r2.verdict==='not-found').length;void trackEvent('references_existence_checked',{total:results.length,found,missing})}catch(e: any){announce('Provjera nije uspjela (mreža). Pokušaj ponovno.')}finally{_existCheckRunning=false;setBtn(orig,false)}}
function renderDeadlineCalendar(bp: any){if(!bp.deadlineCalendar)return'';const c=bp.deadlineCalendar,entries=c.entries||[],milestones=(c.milestones||[]).map((m: any)=>`<span class="deadline-milestone"><strong>${escapeHtml(m.label)}:</strong> ${escapeHtml(hrDate(m.date))}</span>`).join(''),cards=entries.map((x: any)=>{const state=x.state||deadlineState(x),selected=x.id===c.selectedId,cutoff=x.cutoff?`<p><strong>Krajnji rok:</strong> ${escapeHtml(hrDate(x.cutoff,true))}</p>`:'<p><strong>Prijava:</strong> najmanje 3 radna dana prije obrane</p>',mentor=x.mentorDraftDeadline?`<p><strong>Završna verzija mentoru:</strong> ${escapeHtml(hrDate(x.mentorDraftDeadline))}</p>`:'';return`<article class="deadline-card ${selected?'selected':''} ${state.key==='closed'?'closed':''}"><h4>${escapeHtml(x.label)}</h4>${cutoff}${mentor}<p><strong>Obrane:</strong> ${escapeHtml(dateRange(x.defenseStart||x.start,x.defenseEnd||x.end))}</p><span class="deadline-status ${escapeHtml(state.key)}">${escapeHtml(state.label)}${selected?' · odabrano':''}</span></article>`}).join('');const cohort=c.type==='final'?` · ${c.cohort==='carried'?'prenesen iz 2024./2025.':'upisan u 2025./2026.'}`:'';return`<section class="deadline-board"><div class="deadline-board-head"><div><h3>Godišnji rokovi · ${escapeHtml(bp.profileLabel||'FPZG')}</h3><p>Službeni raspored obrana i krajnjih rokova za odabrani profil${escapeHtml(cohort)}.</p></div><span class="deadline-year">${escapeHtml(c.academicYear)}</span></div>${milestones?`<div class="deadline-milestones">${milestones}</div>`:''}<div class="deadline-grid">${cards}</div><div class="deadline-foot"><strong>Napomena:</strong> status se računa prema datumu na uređaju. Ručna potvrda ostaje potrebna jer aplikacija ne može znati je li prijava već predana.</div></section>`}
function renderSubmissionChecklist(r: any){
 const a: any=renderSubmissionGate(r),bp=a.blueprint,manual=a.manual,deadlineHtml=renderDeadlineCalendar(bp);renderPdfPreflight();const count=bp.items.length+a.files.blockers.length+a.files.warnings.length;$('#submissionTabCount').textContent=count?`(${count})`:'';
 const blockers=[...a.files.blockers.map((x: any)=>`<div class="crossfile-warning"><strong>Blokira predaju:</strong> ${escapeHtml(x)}</div>`),...a.files.warnings.map((x: any)=>`<div class="crossfile-warning"><strong>Treba potvrditi:</strong> ${escapeHtml(x)}</div>`)].join('');
 const groups=[...new Set(bp.items.map((x: any)=>x.section))].map(section=>`<div class="phase-block"><div class="phase-title">${escapeHtml(section)}</div><div class="phase-list">${bp.items.filter((x: any)=>x.section===section).map((x: any)=>`<label class="phase-item"><input type="checkbox" data-submission-check="${escapeHtml(x.id)}" ${manual[x.id]?'checked':''}><div><strong>${escapeHtml(x.label)}</strong><p>${escapeHtml(x.description||'')}</p></div><span class="phase-tag ${x.blocking?'blocking':''}">${x.blocking?'obvezno':'informativno'}</span></label>`).join('')}</div></div>`).join('');
 const meta=currentMetadataAudit?`<div class="${currentMetadataAudit.compliant?'crossfile-ok':'crossfile-warning'}"><strong>Zasebni Word:</strong> ${currentMetadataAudit.valid?(currentMetadataAudit.complete?`Prepoznati su dvojezični elementi. Ključne riječi HR/EN: ${currentMetadataAudit.keywordCounts?.hr??'?'}/${currentMetadataAudit.keywordCounts?.en??'?'}; rečenice sažetka HR/EN: ${currentMetadataAudit.summarySentences?.hr??'?'}/${currentMetadataAudit.summarySentences?.en??'?'}.`:'Nisu prepoznati svi očekivani dvojezični elementi.'):'Datoteku nije moguće pročitati.'}</div>`:'';
 const sources=(bp.sources||[]).map((x: any)=>`<div class="source-line">Službeni izvor: <a href="${escapeHtml(safeHref(x.url))}" target="_blank" rel="noopener">${escapeHtml(x.title)}</a></div>`).join('');$('#submissionChecklist').innerHTML=`<div class="submission-intro"><strong>Provjera spremnosti nije službena potvrda fakulteta.</strong> Automatizirano provjerava dostupne elemente datoteka, a administrativne obveze potvrđuješ ručno prema aktualnom službenom postupku. Pravila su zadnji put provjerena ${escapeHtml(bp.sourceDate)}.</div>${deadlineHtml}${blockers}${meta}${selectedAvFile?`<div class="crossfile-ok"><strong>Audiovizualni prilog:</strong> ${escapeHtml(selectedAvFile.name)} · ${(selectedAvFile.size/1024/1024).toFixed(2)} MB · evidentirano samo lokalno.</div>`:''}${groups||'<div class="empty" style="text-align:left"><p style="margin:0 0 8px">Način „Samo dokument” provjerava samo Word datoteku, pa ovdje još nema checkliste predaje.</p><p style="margin:0 0 12px">Za provjeru spremnosti za predaju odaberi fazu (prije ili nakon obrane, ili cijeli paket) i dodaj konačni PDF, pa ponovno pokreni analizu.</p><button class="btn btn-secondary btn-sm" type="button" data-open-phase>Odaberi fazu predaje i dodaj PDF</button></div>'}${sources?`<div class="source-stack">${sources}</div>`:''}<div id="deadlineReminderMount"></div><div id="repairPanelMount"></div><div class="submission-tools"><button class="btn btn-secondary btn-sm" type="button" data-download-submission>Preuzmi paketni izvještaj</button></div>`;
 // Opt-in podsjetnik na potvrden rok (ROKOVI_PODSJETNICI.md): prikaze se samo kad postoji
 // potvrden rok u ACADEMIC_DEADLINES i kad je korisnik prijavljen; inace no-op (registar je prazan
 // dok se ne unesu rokovi, a auth je OFF dok supabaseUrl/anon nisu postavljeni).
 const _sess=authConfigured()?authStore.load():null;
 renderDeadlineReminderToggleIfAvailable({facultyId:r.settings?.selectionIds?.unit||null,programId:r.selection?.program||null,workType:toReportWorkType(r.settings?.workType||r.selection?.workType||'final'),deadlineRegistry:ACADEMIC_DEADLINES,config:authConfig(),accessToken:_sess?.accessToken||'',userId:_sess?.userId||'',mountEl:$('#deadlineReminderMount')});
 // Ocuvaj vec renderiran placeni repair panel (checkboxi, deep-preklopnik,
 // sazetak) umjesto da ga innerHTML iznad pregazi: re-attach isti cvor.
 if(repairPanelNode&&repairPanelForResult===r){const m=$('#repairPanelMount');if(m){m.appendChild(repairPanelNode);return}}
 void renderRepairSection(r).catch((e: any)=>console.error('Repair panel:',e));
}

// Repair Engine (REPAIR_ENGINE.md): panel se mountira u rezultatu ali je gejtan paywallom.
// Besplatno: teaser "ovo mozemo popraviti"; placeno (fullReport): preuzimanje ispravljenog
// docx. Params dolaze ISKLJUCIVO iz analyzedProfile (profil kojim je r analiziran), nikad iz
// currentProfile() u trenutku rendera: selekcija se u meduvremenu mogla promijeniti (povijest).
// Stropna cijena za "koliko platis, toliko popravaka" slider: ista cijena koju vec placa paywall
// za ovu vrstu rada (ziva cijena iz kataloga uz pad na WORK_TYPE_TIERS, isti obrazac kao
// paywallLockHtml/startReportCheckout). Slider samo dijeli postojecu cijenu na stavke, ne mijenja
// je - null kad vrsta rada nema definiran tier (nepoznato), slider tada prikazuje samo broj stavki.
// DOCX-13: stavke koje server NIJE prepoznao kao zive. Prije su se tiho gubile, pa je korisnik
// dobivao dokument uvjeren da su primijenjene. Tisina je ovdje najgori ishod jer je nerazlucva od
// uspjeha, zato se prikazuju odvojeno od `skipped` (koji znaci "prepoznato, ali nije trebalo").
function unknownFixerNote(out: any): string{
  const list=Array.isArray(out?.unknownFixers)?out.unknownFixers:[];
  if(!list.length)return '';
  // Bez tvrdnji o naplati: popravak se naplacuje po dokumentu, ne po stavci, pa "nije naplaceno"
  // ne bi bilo tocno. Kaze se samo ono sto pouzdano znamo: stavka nije primijenjena.
  return `<p><strong>Nismo prepoznali ${list.length===1?'stavku':'stavke'}:</strong> ${list.map(escapeHtml).join(', ')}. `
    +`${list.length===1?'Ona nije primijenjena na dokument':'One nisu primijenjene na dokument'}. Ako se ovo ponovi, javi nam.</p>`;
}
async function renderRepairSection(r: any){
 const mount=$('#repairPanelMount'); if(!mount) return; mount.innerHTML='';
 repairPanelNode=null; repairPanelForResult=null; // dok se ne renderira stateful panel, nema sto cuvati
 repairPanelItems=[]; repairPanelTextItems=[];
 try{
 const defId=r.details?.profileDefinitionId; if(!defId) return;
 if(r!==currentResult||!analyzedProfile) return; // demo, zastarjeli rezultat ili nema snapshota
 await ensureTemplatesHeavy();
 // Faza B: repair unosi profila stizu s pravilima (ensureProfileRules ih prime-a u
 // profile-runtime-maps); za povijest/stale rezultate ovo dohvaca i profil rezultata.
 await ensureProfileRules(defId);
 if(r!==currentResult||!analyzedProfile) return;
 // BAKANI ruleEntries (repair-map.json preko repairEntriesFor) MORAJU biti na analyzedProfile
 // PRIJE poziva *RepairableItem funkcija ispod: element-caption/bibliography/citation-sync/
 // legal-footnote/table-figure-rescue/section-surgery/required-sections citaju profile.ruleEntries
 // izravno (gen-profile-runtime-maps.mts, ASSISTED_RULE_ENTRY_CHECK_IDS). Bez ovoga je to polje
 // uvijek prazno u zivom appu pa ovih 7 fixera nikad ne bi aktiviralo, ma koliko podataka postojalo.
 const entries=repairEntriesFor(defId);
 analyzedProfile.ruleEntries=entries;
 if(!r.details?.crossFileSubmissionConsistency) r.details.crossFileSubmissionConsistency=buildCrossFileSubmissionConsistency(r,analyzedProfile,r.details?.docxCore,r.details?.pdfPreflight,currentResult?.file,selectedPdf);
 const templateSelection=selectTemplate(r.settings?.selectionIds?.unit||r.selection?.unit, r.settings?.workType||r.selection?.workType||'final');
  const titleItems=titlePageRepairableItem(r,analyzedProfile,templateSelection.template);
  const elementItems=asRecommendation(analyzedProfile,'element-caption-rules',elementCaptionRepairableItem(r,analyzedProfile));
  const bibliographyItems=asRecommendation(analyzedProfile,'bibliography-rules',bibliographyRepairableItem(r,analyzedProfile));
  const citationBibliographySyncItems=asRecommendation(analyzedProfile,'citation-sync-rules',citationBibliographySyncRepairableItem(r,analyzedProfile));
  const legalFootnoteItems=asRecommendation(analyzedProfile,'legal-footnote-repair-rules',legalFootnoteRepairableItem(r,analyzedProfile));
  const finalDocumentInspectorItems=finalDocumentInspectorRepairableItem(r);
  const fieldIntegrityItems=fieldIntegrityRepairableItem(r);
  const croatianTypographyItems=croatianTypographyRepairableItem(r);
  const consistencyItems=consistencyRepairableItem(r);
  const tableFigureRescueItems=asRecommendation(analyzedProfile,'table-figure-rescue-rules',tableFigureRescueRepairableItem(r,analyzedProfile));
  const sectionSurgeryItems=asRecommendation(analyzedProfile,'section-surgery-rules',sectionSurgeryRepairableItem(r,analyzedProfile));
  const requiredSectionsItems=asRecommendation(analyzedProfile,'required-section-rules',requiredSectionsRepairableItem(r,analyzedProfile));
  const linkDoiItems=linkDoiRepairableItem(r,analyzedProfile);
  const crossFileSubmissionItems=crossFileSubmissionRepairableItem(r,analyzedProfile);
 if(paywallGateActive()){
  // Teaser: samo prekrseno (Opcija A); "uskladi sve" + dubinsko ciscenje je placeni dio (Feature B).
  const items=[...buildRepairableItems(r.checks||[],analyzedProfile,entries),...universalRepairableItems(r.issues||[]).filter((i: any)=>i.violated),...paragraphSpacingRepairableItem(r.checks||[],analyzedProfile,r).filter((i: any)=>i.violated),...pageNumberingRepairableItem(r,analyzedProfile).filter((i: any)=>i.violated),...footnoteSpacingRepairableItem(r.checks||[],analyzedProfile).filter((i: any)=>i.violated),...pageNumberAlignmentRepairableItem(r.checks||[],analyzedProfile).filter((i: any)=>i.violated),...introSectionRepairableItem(r,analyzedProfile).filter((i: any)=>i.violated),...tocFieldRepairableItem(r,analyzedProfile).filter((i: any)=>i.violated),...headingFormatRepairableItem(r.checks||[],analyzedProfile).filter((i: any)=>i.violated),...footnoteTypographyRepairableItem(r.checks||[],analyzedProfile).filter((i: any)=>i.violated),...titleItems];
  items.push(...headingStructureRepairableItem(r,analyzedProfile).filter((i: any)=>i.violated));
  items.push(...elementItems.filter((i: any)=>i.violated));
  items.push(...bibliographyItems.filter((i: any)=>i.violated));
  items.push(...citationBibliographySyncItems.filter((i: any)=>i.violated));
  items.push(...legalFootnoteItems.filter((i: any)=>i.violated));
  items.push(...finalDocumentInspectorItems.filter((i: any)=>i.violated));
  items.push(...fieldIntegrityItems.filter((i: any)=>i.violated));
  items.push(...tableFigureRescueItems.filter((i: any)=>i.violated));
  items.push(...sectionSurgeryItems.filter((i: any)=>i.violated));
  items.push(...croatianTypographyItems.filter((i: any)=>i.violated));
  items.push(...consistencyItems.filter((i: any)=>i.violated));
  items.push(...requiredSectionsItems.filter((i: any)=>i.violated));
  items.push(...linkDoiItems.filter((i: any)=>i.violated));
  items.push(...crossFileSubmissionItems.filter((i: any)=>i.violated));
  if(!items.length) return;
  mount.innerHTML=`<div class="lekta-repair-panel"><p><strong>Ovo možemo popraviti umjesto tebe:</strong> ${items.map((i: any)=>escapeHtml(i.label)).join(', ')}.</p></div>`+paywallLockHtml('Automatski popravak s dubinskim usklađivanjem cijelog dokumenta i preuzimanje ispravljene datoteke');
  wireLockCtas(); return; // teaser je bez stanja: re-render na svakom toggleu je bezopasan
 }
 // Placeno (fullReport) ili soft-launch: Feature B, nudi i neprekrsene dimenzije
 // ("uskladi cijeli dokument") uz v2 dubinsko ciscenje izravnog formatiranja.
 const items=[...buildRepairableItems(r.checks||[],analyzedProfile,entries,{includeNonViolated:true}),...universalRepairableItems(r.issues||[]),...paragraphSpacingRepairableItem(r.checks||[],analyzedProfile,r),...pageNumberingRepairableItem(r,analyzedProfile),...footnoteSpacingRepairableItem(r.checks||[],analyzedProfile),...pageNumberAlignmentRepairableItem(r.checks||[],analyzedProfile),...introSectionRepairableItem(r,analyzedProfile),...tocFieldRepairableItem(r,analyzedProfile),...headingFormatRepairableItem(r.checks||[],analyzedProfile),...footnoteTypographyRepairableItem(r.checks||[],analyzedProfile),...titleItems];
 repairPanelItems=items; // RESULT-03: dostupno wireFindingCards-u i prije eventualnog ranog izlaska
 items.push(...headingStructureRepairableItem(r,analyzedProfile));
 items.push(...elementItems);
 items.push(...bibliographyItems);
 items.push(...citationBibliographySyncItems);
 items.push(...legalFootnoteItems);
 items.push(...finalDocumentInspectorItems);
 items.push(...fieldIntegrityItems);
 items.push(...tableFigureRescueItems);
 items.push(...sectionSurgeryItems);
 items.push(...croatianTypographyItems);
 items.push(...consistencyItems);
 items.push(...requiredSectionsItems);
 items.push(...linkDoiItems);
 items.push(...crossFileSubmissionItems);
 if(!items.length) return;
 if(!selectedDocx){mount.innerHTML=`<div class="lekta-repair-panel"><p>Za automatski popravak ponovno učitaj .docx datoteku (dokument više nije u memoriji).</p></div>`;return}
 const file=selectedDocx;
 // WS-3: kad je repair server konfiguriran, placeni popravak ide na SERVER (upload -> gotov docx),
 // a klijentski src/repair vise nije put isporuke. Bez servera (soft-launch) ostaje lokalni popravak.
 // Zahvati u TEKST rada drze se odvojeno od "Popravi sve": za njih se trazi zasebna privola, a
 // korisniku se uvijek nudi i opcija da samo vidi prijedlog i odluci sam.
 const textItems=headingCaseRepairableItem(r.checks||[],analyzedProfile);
 repairPanelTextItems=textItems;
 // GRANICE POPRAVKA se provjeravaju PRIJE izbora panela, da vrijede za OBA puta.
 //
 // Prvotno je ova zastita stajala samo u serverskom panelu, pa je lokalni put (bez konfiguriranog
 // repairEndpointa) i dalje nudio popravak dokumenta koji se ne moze popraviti; padao bi tek u
 // readZip, dakle upravo ono lazno obecanje koje je zastita trebala ukloniti.
 if(!renderRepairCapabilityBlock(mount,r)){repairPanelNode=mount.firstElementChild;repairPanelForResult=r;return}
 if(repairServerConfigured()){renderServerRepairPanel(mount,r,items,file,textItems);repairPanelNode=mount.firstElementChild;repairPanelForResult=r;return}
 renderRepairPanel({items,getDocxBytes:async()=>new Uint8Array(await file.arrayBuffer()),originalFileName:r.file?.name||'rad.docx',mountEl:mount,beforeScore:{score:r.score,categories:r.categories,checks:r.checks},fieldRenderEndpoint:String(productionConfig?.fieldRenderEndpoint||'').trim(),getAccessToken:async()=>String(await resolveAccessToken()||''),reanalyze:async(bytes: Uint8Array)=>{const f=new File([bytes as Uint8Array<ArrayBuffer>],r.file?.name||'rad.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});const res: any=await analyzeDocxOffThread(f,analyzedProfile,r.settings,()=>{});return res?{score:res.score,categories:res.categories,checks:res.checks,tocFieldWillRefresh:tocFieldWillRefresh(res)}:null}});
 // Zapamti stvarni cvor placenog panela za ocuvanje kroz re-render checkliste.
 repairPanelNode=mount.firstElementChild; repairPanelForResult=r;
 } finally {
  // RE-34 nastavak: mount se puni ASINKRONO (ensureTemplatesHeavy + fixer builderi), a renderRepairCta
  // se prvi put zove SINKRONO odmah nakon poziva ove funkcije (renderResult), dok je mount jos prazan
  // -> #repairEntry ostajao trajno skriven i kad panel ispod stvarno ima sadrzaj. try/finally hvata
  // SVAKI izlaz iz ove funkcije (i rane return-ove kad nema stavki, gdje ponovni izracun ostaje no-op).
  if(r===currentResult){renderRepairCta(r);renderResultsCockpitForResult(r);}
 }
}

// WS-3 SERVER-SIDE repair panel: jedan gumb "Popravi sve jednim klikom" -> privola (upload+pohrana)
// -> auth -> uploadRepair (repair-docx) -> preuzmi vraceni docx + lokalni recheck spremnosti.
// Doslovni tekst rada ne ide u meta (samo otisak-struktura + sanitizirani signali). Fixer DEEP flag
// se salje kao param (server pokrene ISTE fixere, tamne K5/K6/K7 sam preskace dok WS-4 ne prodje).
const _SERVER_DEEP_FIXERS=new Set(['font-fixer','line-spacing-fixer','alignment-fixer','paragraph-spacing-fixer','footnote-spacing-fixer']);
// Hrvatska sklonidba uz broj: 1 izmjena, 2-4 izmjene, 5+ izmjena (iznimka 11-14 -> izmjena).
function _plIzmjena(n: number){const d=n%10,dd=n%100;if(d===1&&dd!==11)return`${n} izmjena`;if(d>=2&&d<=4&&!(dd>=12&&dd<=14))return`${n} izmjene`;return`${n} izmjena`}
/**
 * Iskrena recenica o ISHODU popravka na serverskom putu.
 *
 * Tvrdnja i brojke dolaze iz `describeRepairOutcome` (`src/repair/repair-outcome.ts`), isti izvor
 * koji koristi lokalni panel; ovdje je samo omot u HTML string. Do sada je serverski put govorio
 * samo "Popravljeno na serveru (N izmjena)", sto je cinjenica o izmjenama, ne o ishodu.
 */
function _ishodHtml(o: RepairOutcome|null): string{
 const copy=describeRepairOutcome(o);
 if(!copy)return'';
 return`<p><strong>${escapeHtml(copy.headline)}</strong>${escapeHtml(copy.detail)}</p>`;
}
// K4: literatura za provjeru postojanja u hrvatskom korpusu (placeni dodatak uz popravak). Naslov se
// izvlaci ISTIM parserom kao besplatna CrossRef provjera, pa oba puta gledaju isti podatak. Reference
// bez naslova ispadaju ODMAH ovdje, jer server indeksira pogotke po poziciji u POSLANOM nizu: kad bi
// se filtriralo tek u buildRepairMeta, prikaz bi „tvoj navod” vezao uz krivu referencu.
function repairReferencesFrom(r: any){
 return (r.details?.references||[])
  .filter((x: any)=>x&&x.raw&&String(x.raw).trim())
  .map((x: any)=>{const f: any=parseReference(String(x.raw),'auto').fields;const y=Number(f.year??x.year);return{title:String(f.title||'').trim(),year:Number.isFinite(y)?y:null,raw:String(x.raw)}})
  .filter((x: any)=>x.title)
  .slice(0,REPAIR_MAX_REFERENCES);
}
// Gornja granica uploada za popravak, USKLADJENA sa serverskim REPAIR_MAX_DOCX_BYTES (20 MB).
// Bez ovoga korisnik potvrdi privolu, otvori se sesija i cijeli se dokument prenese uzalud da bi
// tek server vratio 413. `uploadMaxBytes` iz konfiguracije NE vrijedi ovdje (gejta samo narudzbe).
const REPAIR_MAX_UPLOAD_BYTES=DOCX_MAX_UPLOAD_BYTES;
// Krajnji rok jednog popravka. Namjerno velikodusan (spor uplink + serverska obrada), ali konacan:
// bez njega zaglavljen zahtjev ostavlja gumb zauvijek u stanju "Saljem".
const REPAIR_TIMEOUT_MS=180000;
/* Sekcija "zahvati u tekst rada": stavke koje mijenjaju AUTOROV TEKST. Namjerno izvan "Popravi
   sve" i s dvije ravnopravne opcije, jer je odluka o sadrzaju korisnikova, ne nasa:
     1. "Primijeni" (kvacica, po zadanom ISKLJUCENA) -> stavka ide uz popravak,
     2. "Pokazi prijedlog" -> tocan popis sto bi se promijenilo, BEZ ijedne izmjene dokumenta.
   Prijedlog se racuna lokalno iz vec analizirane strukture, pa ne treba ni server ni upload. */
function renderTextItemsSection(host: any,r: any,textItems: any[]){
 if(!textItems.length)return;
 const box=document.createElement('div');box.className='lekta-repair-text';
 box.innerHTML=`<p><strong>Zahvati u tekst rada.</strong> Ovo mijenja sadržaj, ne samo oblikovanje, pa se ne radi automatski. Možeš ga primijeniti ili samo vidjeti prijedlog i odlučiti sam.</p>`;
 for(const it of textItems){
  const row=document.createElement('div');row.className='lekta-repair-text__row';row.dataset.ruleId=it.ruleId;
  row.innerHTML=`<label><input type="checkbox" data-text-apply value="${escapeHtml(it.ruleId)}"><span><strong>${escapeHtml(it.label)}</strong> ${escapeHtml(it.confirmationText||'')}</span></label><button type="button" class="btn btn-ghost btn-sm" data-text-preview>Pokaži prijedlog</button><div class="lekta-repair-text__preview" hidden></div>`;
  const prev: any=row.querySelector('.lekta-repair-text__preview');
  row.querySelector('[data-text-preview]')?.addEventListener('click',()=>{
   if(!prev.hidden){prev.hidden=true;return}
   const headings=(r.documentStructure?.headings||[]).map((h: any)=>({level:h.level,text:h.text}));
   const levels=(it.params?.levels||[]) as number[];
   const sug=headingCaseSuggestions(headings,levels);
   prev.innerHTML=sug.length
    ? `<p>Promijenilo bi se ${sug.length} ${sug.length===1?'naslov':'naslova'}:</p><ul>${sug.map((s: any)=>`<li><span class="muted">${escapeHtml(s.from)}</span> → <strong>${escapeHtml(s.to)}</strong></li>`).join('')}</ul>`
    : '<p>Nijedan naslov ne bi se promijenio: svi su već napisani velikim slovima.</p>';
   prev.hidden=false;
   void trackEvent('repair_text_preview',{ruleId:it.ruleId,changes:sug.length});
  });
  box.appendChild(row);
 }
 host.appendChild(box);
}

/**
 * Smije li se popravak UOPCE ponuditi za ovaj dokument. Vraca `true` kad smije.
 *
 * Popravak ima uze granice od analize (cita CIJELI paket, analiza samo XML dijelove koje treba),
 * pa dokument moze proci analizu a biti prevelik za popravak. `details.capability` je izracunat jos
 * pri otvaranju zipa (docx-budget.docxCapability), bez ijedne dodatne dekompresije.
 *
 * Zove se PRIJE izbora panela, pa vrijedi i za serverski i za lokalni put. Kad je stajala samo u
 * serverskom panelu, lokalni je i dalje obecavao popravak koji nije mogao izvesti.
 */
function renderRepairCapabilityBlock(mount: any,r: any): boolean{
 const capability=r?.details?.capability;
 if(!capability||capability.canRepair!==false)return true;
 const wrap=document.createElement('div');wrap.className='lekta-repair-panel';
 const blocked=document.createElement('p');blocked.className='lekta-repair-panel__blocked';
 blocked.innerHTML=`<strong>Automatski popravak nije moguć za ovaj dokument.</strong> ${capability.repairBlocker?escapeHtml(repairBlockerMessage(capability.repairBlocker)):''} Analiza iznad vrijedi i možeš je koristiti za ručni ispravak.`;
 wrap.appendChild(blocked);mount.appendChild(wrap);
 return false;
}

function renderServerRepairPanel(mount: any,r: any,items: any[],file: any,textItems: any[]=[]){
 const wrap=document.createElement('div');wrap.className='lekta-repair-panel';
 const intro=document.createElement('p');
 intro.innerHTML='<strong>Popravi sve jednim klikom.</strong> Dokument se šalje na server, popravi se i vraća gotov. Popravljaju se oblikovanje, numeriranje i struktura; ne diraju se sadržaj, citati ni argument. Datoteka se pohranjuje dok je ne obrišeš (Moji popravci); kod prijave bez e-maila najviše 30 dana.';
 wrap.appendChild(intro);
 // RE-35: popis stavki (kao lokalni panel), ne skriveno "sve ili nista": prekrsene su predodabrane
 // (opt-out), neprekrsene ("uskladi sve", Feature B) su opt-in. Trece: institucijska preporuka
 // (advisory, recommended:true) - uvijek opt-in, uvijek ponudjena (nije bodovana pa "prekrseno"
 // nema smisla za nju), u vlastitoj skupini s jasnom "Preporučeno" oznakom.
 const list=document.createElement('ul');list.className='lekta-repair-panel__list';
 const rank=(i: any)=>i.violated!==false?0:i.recommended?2:1;
 const ordered=[...items].sort((a: any,b: any)=>rank(a)-rank(b));
 const firstExtraIdx=ordered.findIndex((i: any)=>rank(i)===1);
 const firstRecommendedIdx=ordered.findIndex((i: any)=>rank(i)===2);
 ordered.forEach((item: any,orderIdx: number)=>{
  const idx=items.indexOf(item),isViolated=item.violated!==false;
  if(orderIdx===firstExtraIdx&&firstExtraIdx!==-1){
   const sub=document.createElement('li');sub.className='lekta-repair-panel__subtitle';
   sub.textContent=firstExtraIdx===0?'Sve prepoznato je usklađeno. Po želji dodatno uskladi:':'Uskladi i ostalo (trenutno nije prekršeno):';
   list.appendChild(sub);
  }
  if(orderIdx===firstRecommendedIdx&&firstRecommendedIdx!==-1){
   const sub=document.createElement('li');sub.className='lekta-repair-panel__subtitle';
   sub.textContent='Preporučeno, nije obavezno (institucija to ne propisuje):';
   list.appendChild(sub);
  }
  const li=document.createElement('li');li.className='lekta-repair-panel__item';li.dataset.ruleId=item.ruleId;
  const badgeText=item.recommended?'Preporučeno':(isViolated?'Možemo ovo popraviti umjesto tebe':'Uskladi s profilom');
  li.innerHTML=`<label><input type="checkbox" ${isViolated?'checked':''} data-idx="${idx}" /><span>${escapeHtml(item.label)}</span></label><span class="lekta-repair-panel__badge">${badgeText}</span>`;
  list.appendChild(li);
  // Napredna forma (literatura, citati, fusnote, naslovnica...) se VISE ne gradi ovdje inline:
  // list je uvijek skriven (ledger je jedini vidljivi prikaz, vidi nize). advancedFormFor
  // (repair-panel.ts, dijeljeno s lokalnim panelom) je jedino mjesto koje zna koji render*Controls
  // ide uz koju formu; renderRepairLedgerModal ga zove LIJENO, tek na klik/otvaranje retka. Ovime
  // server panel dobiva i svih 15 vrsta naprednih formi (prije je imao samo 6 od 15 - Section
  // Surgery/Consistency Engine/Field Integrity i dr. su bili goli checkboxi bez uvida).
 });
 wrap.appendChild(list);
 // Ledger+modal je SADA uvijek jedini vidljivi prikaz (list ostaje checkbox izvor istine za
 // getCheckedItems, ali skriven) - isti mehanizam kao lokalni panel (repair-panel.ts).
 list.hidden=true;
 wrap.appendChild(renderRepairLedgerModal({items,listEl:list,advancedFormFor}));
 // Isti v2 dubinski preklopnik i disclosure recenica kao lokalni panel (RE-35: prije je serverski
 // put PRISILNO ukljucivao deep bez ijedne rijeci u copyju).
 const deepAvailable=items.some((i: any)=>_SERVER_DEEP_FIXERS.has(i.fixerId));
 let deepToggle: any=null;
 if(deepAvailable){
  const deepRow=document.createElement('label');deepRow.className='lekta-repair-panel__deep';
  deepRow.innerHTML='<input type="checkbox" checked /><span>Uskladi i ručno formatirane dijelove, da popravak stvarno primi.</span><details class="lekta-repair-panel__deep-more"><summary>Što to znači</summary><p>Ako je oblikovanje upisano izravno u tekst, ono nadjačava stilove i popravak se vizualno ne vidi. Ovo uklanja takvo izravno oblikovanje (font, prored, poravnanje). <strong>Netaknuti ostaju:</strong> naslovi i stilizirani dijelovi, podebljano i kurziv, centrirano, veće naslovne veličine, formule, tablice (prored i poravnanje), simbolski fontovi, tekstualni okviri i citatne kontrole (npr. Zotero, Mendeley). Tekst pisan drugim fontom uskladit će se s fontom profila.</p></details><span></span>';
  wrap.appendChild(deepRow);
  deepToggle=deepRow.querySelector('input');
 }
 const consentRow=document.createElement('label');consentRow.className='lekta-repair-panel__deep';
 consentRow.innerHTML='<input type="checkbox" data-repair-consent><span>Pristajem da se dokument pošalje na server i pohrani do brisanja. Besplatna analiza ostaje na uređaju.</span>';
 wrap.appendChild(consentRow);
 // Namjerno bez native disabled dok privola nije oznacena: disabled gumb ne ispaljuje click uopce,
 // pa je klik izgledao kao da gumb "ne radi" (nijedna povratna informacija zasto). Umjesto toga
 // btn.onclick nize provjerava privolu i jasno upozori + fokusira kucicu.
 const consentHint=document.createElement('p');consentHint.className='lekta-repair-panel__consent-hint';consentHint.hidden=true;consentHint.textContent='Prvo označi privolu iznad, pa klikni ponovno.';
 wrap.appendChild(consentHint);
 const btn=document.createElement('button');btn.type='button';btn.className='lekta-repair-panel__download';btn.textContent='Popravi sve jednim klikom';
 wrap.appendChild(btn);
 // RE-19: potvrdni korak za stavke koje traze potvrdu lokacije (K6 section-insert), isti obrazac
 // i CSS klase kao lokalni panel (renderConfirmation, dijeljen iz repair-panel.ts).
 const confirmBox=document.createElement('div');confirmBox.className='lekta-repair-panel__confirm-box';confirmBox.hidden=true;
 wrap.appendChild(confirmBox);
 const summary=document.createElement('div');summary.className='lekta-repair-panel__summary';summary.hidden=true;
 wrap.appendChild(summary);
 mount.appendChild(wrap);
 renderTextItemsSection(wrap,r,textItems);
 const consent: any=consentRow.querySelector('input');
 const setSummary=(html: string)=>{summary.hidden=false;summary.innerHTML=html};
 consent.addEventListener('change',()=>{if(consent.checked){consentHint.hidden=true;consentRow.classList.remove('lekta-repair-panel__deep--alert')}});
 function getCheckedItems(): any[]{
  const checked: any[]=[];
  list.querySelectorAll('input[type="checkbox"]').forEach((input: any)=>{if(input.checked)checked.push(items[Number(input.dataset.idx)])});
  return checked;
 }
 // RE-37: uspjesan popravak TRAJNO zakljucava gumb (umjesto povratka na identican CTA), da drugi
 // klik ne posalje drugi upload/potrosi drugi slot jer korisnik misli da se nista nije dogodilo.
 let lockButton=false;
 // RE-20: in-flight cuvar dijeljen izmedju glavnog gumba i "Nastavi svejedno" (koji zove isti go()):
 // disable-first, PRIJE ijednog awaita, da dvostruki klik ne posalje dva uploada/potrosi dva slota.
 let inFlight=false;
 async function go(confirmedMismatch: boolean){
  if(inFlight)return;
  inFlight=true;
  const orig=btn.textContent;
  btn.disabled=true;
  try{
  // Velicina se provjerava PRIJE prijave i uploada: server bi isti dokument odbio tek nakon punog
  // prijenosa (413), a to je na studentskom uplinku minuta cekanja za poruku koju znamo unaprijed.
  if(file&&Number(file.size)>REPAIR_MAX_UPLOAD_BYTES){setSummary(`<strong>Dokument je prevelik za automatski popravak.</strong> Granica je ${Math.round(REPAIR_MAX_UPLOAD_BYTES/1024/1024)} MB, a ova datoteka ima ${(Number(file.size)/1024/1024).toFixed(1)} MB. Najčešći razlog su slike u punoj rezoluciji; smanji ih u Wordu (Format slike, Komprimiraj slike) pa pokušaj ponovno.`);return}
  const chosenItems=getCheckedItems();
  if(!chosenItems.length){setSummary('<strong>Odaberi barem jednu stavku za popravak.</strong>');return}
  // Bez trenja: anonimna sesija se otvara tiho. Pad na e-mail prijavu samo ako anonimne nisu ukljucene.
  const token: any=await ensureAccessToken();
  if(authConfigured()&&!token){openAuth(()=>go(confirmedMismatch));return}
  btn.textContent='Šaljem na server…';
  try{
   // Zahvat u tekst ide SAMO ako je korisnik za tu stavku izricito kvacnuo "Primijeni".
   const okTextIds=new Set(Array.from(wrap.querySelectorAll('[data-text-apply]')).filter((c: any)=>c.checked).map((c: any)=>c.value));
   const deep=deepToggle?.checked===true;
   const chosen=[...chosenItems,...textItems.filter((it: any)=>okTextIds.has(it.ruleId))];
   const requests=chosen.map((it: any)=>({fixerId:it.fixerId,ruleId:it.ruleId,params:(deep&&_SERVER_DEEP_FIXERS.has(it.fixerId))?{...it.params,deep:true}:it.params}));
   const refsForCorpus=repairReferencesFrom(r);
   const {buildRepairMeta,uploadRepair}=await loadRepairClient();
   // Provjera izvora KRECE PRIJE uploada i tece usporedno s njim: ovisi samo o naslovima literature,
   // koje vec imamo iz lokalne analize. Dok je bila dio odgovora popravka, korisnik je gledao
   // spinner i nakon sto je dokument bio gotov. Namjerno BEZ await: `checkSources` ne baca (svaki
   // neuspjeh je {kind:'unavailable'}), pa promise ne moze zavrsiti kao neuhvacena greska.
   const scCfg=sourceCheckConfig();
   const sourceCheckSeparate=!!scCfg.endpoint&&refsForCorpus.length>0;
   const sourceCheckPromise: Promise<any>|null=sourceCheckSeparate
    ?loadSourceCheckClient().then(({checkSources})=>checkSources(scCfg,token||'',refsForCorpus.map((x: any)=>({title:x.title,year:x.year}))))
     .catch((e: any)=>({kind:'unavailable',reason:e instanceof Error?e.message:'greska'}))
    :null;
   // Kad provjeru vodi zaseban poziv, popis literature se uz dokument ne salje i server ju preskace.
   const meta=buildRepairMeta({references:refsForCorpus.map((x: any)=>({title:x.title,year:x.year})),sourceCheckSeparate,workType:toReportWorkType(r.settings?.workType||r.selection?.workType||'final'),requests,words:r.stats?.officialWords||r.stats?.words||null,titleMarker:r.details?.titlePageWorkType||null,profileStatus:r.profileStatus||null,profileRef:r.details?.profileDefinitionId||null,fileName:r.file?.name||file.name||'rad.docx',confirmedMismatch});
   const bytes=new Uint8Array(await file.arrayBuffer());
   // Krajnji rok: bez njega zaglavljen zahtjev drzi gumb u "Saljem" bez izlaza. Prekid se u
   // repair-clientu prevodi u citljivu poruku, ne u "mreznu gresku".
   const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),REPAIR_TIMEOUT_MS);
   let out: any;
   // Koliko je korisnik STVARNO cekao (upload + serverska obrada + preuzimanje odgovora). Bez ove
   // brojke je svaka optimizacija toka nagadjanje; ide uz repair_server_done.
   const tUpload=performance.now();
   try{out=await uploadRepair(repairConfig(),token||'',bytes,meta,fetch,{signal:ac.signal})}finally{clearTimeout(timer)}
   const uploadMs=Math.round(performance.now()-tUpload);
   if(out.kind==='ok'&&out.changelog.length===0){
    // RE-32: server namjerno NIJE trosio slot/kvotu ni pohranio posao kad nema stvarnih izmjena
    // (vidi repair-docx/index.ts korak 7a); gumb NIJE zakljucan (lockButton ostaje false) jer
    // korisnik moze smisleno pokusati ponovno s drugim odabirom stavki.
    const skippedLabels=out.skipped.map((s: string)=>[...items,...textItems].find((i: any)=>i.ruleId===s)?.label||s);
    setSummary(`<strong>Nije bilo potrebnih izmjena.</strong> Odabrane stavke su već usklađene ili ih nismo mogli automatski primijeniti na ovom dokumentu.${skippedLabels.length?` <p>Nije primijenjeno: ${skippedLabels.map(escapeHtml).join(', ')}.</p>`:''}${unknownFixerNote(out)}`);
   } else if(out.kind==='ok'){
    lockButton=true;
    // Preuzimanje NE krece automatski: a.click() nakon await-a preglednik cesto blokira (nema
    // korisnicke geste iza sebe), pa je preuzimanje IZRICIT gumb; klik je gesta koju preglednik postuje.
    const DOCX_MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const dl=`<p><button type="button" class="btn btn-primary" data-repair-download>Preuzmi popravljeni dokument</button></p>`;
    // Pohrana je fail-open: server vraca 200 s jobId:null i kad Storage ili baza zakazu. Panel je
    // obecao "Moji popravci", pa se ta razlika MORA reci, inace korisnik izgubi jedini primjerak.
    //
    // storagePending: pohrana se od 2026-07-27 dovrsava u POZADINI (odgovor ne ceka Storage), pa u
    // trenutku pisanja ishod jos nije poznat. Tvrdnja "spremljeno je" tada ne bi bila dokazana, a
    // tvrdnja "nije spremljeno" bila bi lazna uzbuna. Zato treci, istinit tekst: sprema se, a
    // preuzimanje je ono sto sigurno imas.
    const stored=out.storagePending
     ?`<p>Kopija se sprema u <strong>Moji popravci</strong> (bit će ondje za koji trenutak). Preuzmi datoteku odmah, to je primjerak koji sigurno imaš.</p>`
     :out.jobId
     ?`<p>Datoteka je spremljena u <strong>Moji popravci</strong>, možeš je preuzeti i kasnije.</p>`
     :`<p><strong>Popravak nije spremljen u Moji popravci</strong> (privremena greška na serveru). Preuzmi datoteku i sačuvaj je, ovdje je više neće biti.</p>`;
    // RE-31: skipped nosi sirove ruleId slugove; mapiraj na citljivu labelu (isto kao lokalni panel).
    const skippedLabels=out.skipped.map((s: string)=>[...items,...textItems].find((i: any)=>i.ruleId===s)?.label||s);
    setSummary(`<strong>Popravljeno na serveru (${_plIzmjena(out.changelog.length)}).</strong>${dl}${stored}${skippedLabels.length?`<p>Nije primijenjeno: ${skippedLabels.map(escapeHtml).join(', ')}.</p>`:''}${unknownFixerNote(out)}`);
    const dlBtn: any=summary.querySelector('[data-repair-download]');
    if(dlBtn)dlBtn.onclick=()=>downloadBlob(out.docxBytes,DOCX_MIME,out.fileName);
    trackEvent('repair_server_done',{profileId:r.details?.profileDefinitionId||'',changes:out.changelog.length,stored:out.jobId?1:0,ms:uploadMs});
    // K4: provjera izvora je DODATAK uz popravak. Kad je izostala (stari server, ugasena zastavica,
    // greska), buildSourceCheckHtml vrati prazan string pa sekcije naprosto nema. Nikad ne javlja
    // "nije pronadjeno" jer korpus ne moze dokazati nepostojanje.
    // Od ove tocke se sazetku sadrzaj DODAJE cvorovima, nikad preko innerHTML +=: to bi ponovno
    // parsiralo cijeli sazetak i pobrisalo vec ozicene rukovatelje (npr. "Preuzmi ponovno").
    const addHtml=(html: string)=>{const d=document.createElement('div');d.innerHTML=html;summary.appendChild(d);return d};
    if(sourceCheckPromise){
     // Usporedni put: dokument je vec tu, provjera izvora jos moze trajati. Mjesto joj se rezervira
     // ODMAH i uredno oznaci da traje, inace bi sekcija iskrsnula niotkuda (ili je korisnik uopce
     // ne bi docekao jer je vec preuzeo datoteku i otisao).
     const scBox=addHtml('<p class="muted">Provjeravam navedene izvore u hrvatskom korpusu…</p>');
     void sourceCheckPromise.then((res: any)=>{
      const result=res&&res.kind==='ok'?res.result:null;
      try{
       const html=buildSourceCheckHtml(result,refsForCorpus);
       // Bez rezultata sekcija NESTAJE umjesto da tvrdi bilo sto: nedostupna provjera nije nalaz.
       if(html){scBox.innerHTML=html;if(result)void trackEvent('repair_source_check',{found:result.found.length,checked:result.checked,total:result.total})}
       else scBox.remove();
      }catch(e: any){console.error('Provjera izvora:',e);scBox.remove()}
     });
    } else {
     // Naslijedjeni put (stari server ili nema referenci): sourceCheck je stigao uz popravak. Kad je
     // izostao, buildSourceCheckHtml vrati prazan string pa sekcije naprosto nema.
     try{const sc=buildSourceCheckHtml(out.sourceCheck,refsForCorpus);if(sc){addHtml(sc);if(out.sourceCheck)void trackEvent('repair_source_check',{found:out.sourceCheck.found.length,checked:out.sourceCheck.checked,total:out.sourceCheck.total})}}catch(e: any){console.error('Provjera izvora:',e)}
    }
    // Ponovna analiza traje nekoliko sekundi, pa mora imati vidljiv status: bez njega se rezultat
    // i gumb za usporedbu pojave niotkuda, a pri gresci korisnik nikad ne sazna da usporedba postoji.
    const recheck=addHtml('<p class="muted">Provjeravam popravljeni dokument…</p>');
    try{const f=new File([out.docxBytes as Uint8Array<ArrayBuffer>],out.fileName,{type:DOCX_MIME});const res: any=await analyzeDocxOffThread(f,analyzedProfile,r.settings,()=>{},{skipFinalDelay:true});
     if(res&&res.score!=null&&r.score!=null){
      const d=res.score-r.score;
      // RE-40: "Popravljeno" gore govori o PRIMIJENJENIM izmjenama (cinjenica); ovdje se posebno
      // priznaje kad se ocjena NIJE poboljsala, umjesto da tihi (0)/negativan broj ostane bez rijeci.
      const scoreLine=`<p><strong>Spremnost: ${r.score} → ${res.score}${d>0?` (+${d})`:d<0?` (${d})`:''}</strong></p>`;
      const flatNote=d<=0?'<p class="muted">Bodovna ocjena se nije poboljšala. Popravljene su prepoznate stavke oblikovanja; preostale provjere traže ručnu izmjenu (upute iznad).</p>':'';
      // Regresija: provjera koja je prije prolazila, a sada ne prolazi. U ukupnom score-u se ne
      // vidi (+6 na marginama i -3 na fusnotama izgleda kao cist +3), pa dobiva vlastiti blok.
      //
      // Na serverskom putu preuzimanje ionako trazi klik (popup blocker, vidi gore), pa se dokument
      // ne ponistava nego se PREMJESTA prioritet: izvornik postaje glavni gumb, a popravljeni pada
      // na sporedni (zicanje odmah ispod). Prije je popravljeni ostajao vizualno glavni CTA i kad
      // je ponovna analiza upravo dokazala da je nesto srusio.
      // Ustajalo TOC polje nije steta: Word ga regenerira pri otvaranju (dropStaleFieldRegressions).
      const regressions=(r.checks&&res.checks)?dropStaleFieldRegressions(detectPassRegressions(r.checks,res.checks),res):[];
      // ISHOD: koliko je od CILJANOG stvarno razrijeseno. Isti izracun koji koristi lokalni panel
      // (src/repair/repair-outcome.ts); prije je serverski put znao samo broj izmjena i deltu
      // ocjene, pa je dokument s dvije od sest razrijesenih ciljanih provjera izgledao dovrseno.
      const outcome=(r.checks&&res.checks)?summarizeRepairOutcome({before:r.checks,after:res.checks,selected:chosen}):null;
      const outcomeHtml=_ishodHtml(outcome);
      const regressionHtml=regressions.length?`<div class="lekta-repair-panel__regression"><p><strong>Pozor: ${regressions.length===1?'jedna provjera koja je prije prolazila sada ne prolazi':`${regressions.length} provjere koje su prije prolazile sada ne prolaze`}.</strong></p><ul>${regressions.map((x: any)=>`<li>${escapeHtml(x.title)}${x.after?` (sada: ${escapeHtml(x.after)})`:' (provjere više nema u rezultatu)'}</li>`).join('')}</ul><p>Preporučujemo izvorni dokument dok to ne razriješiš.</p><button type="button" class="btn btn-primary" data-repair-original>Preuzmi izvorni dokument</button></div>`:'';
      // Strop: isti izracun i isti uvjeti kao lokalni panel (buildRepairCeilingNote). Do sada je
      // objasnjenje "zasto 97 nije nedovrsen posao" postojalo SAMO na besplatnom putu.
      const ceiling=res.checks?repairCeiling(res.checks):null;
      const ceilingHtml=(res.score<100&&ceiling&&ceiling.hasManualGap&&res.score===ceiling.maxScore)?`<div class="lekta-repair-panel__ceiling"><p><strong>${res.score}/100 je maksimalna ocjena koju automatski popravak može jamčiti</strong> za ovaj profil. Preostale stavke traže tvoju sadržajnu provjeru - alat ih namjerno ne smije mijenjati bez tebe:</p><ul>${ceiling.items.map((x: any)=>`<li>${escapeHtml(x.title)} (−${x.lostPoints})</li>`).join('')}</ul></div>`:'';
      recheck.innerHTML=scoreLine+outcomeHtml+regressionHtml+ceilingHtml+flatNote;
      // Zicanje TEK nakon zadnjeg innerHTML pisanja u ovaj element (inace se handler izgubi).
      const origBtn=recheck.querySelector<HTMLButtonElement>('[data-repair-original]');
      if(origBtn)origBtn.onclick=()=>downloadBlob(bytes,DOCX_MIME,r.file?.name||file.name||'rad.docx');
      // Demotiraj popravljeni na sporedni izbor cim je regresija dokazana. Gumb OSTAJE (dokument
      // se nikad ne zarobljava), ali prestaje biti ono sto sucelje preporucuje.
      if(regressions.length){
       const fixedBtn=summary.querySelector<HTMLButtonElement>('[data-repair-download]');
       if(fixedBtn){fixedBtn.className='btn btn-secondary btn-sm';fixedBtn.textContent='Ipak preuzmi popravljeni dokument';}
      }
     }else{recheck.remove()}
     /* "Pokaži što je popravljeno": faksimil prije/poslije. Radi SAMO kad oba modela postoje;
        inace se gumb ne prikazuje umjesto da otvori prazan prozor. Wordove revizije namjerno NE
        koristimo: popravak najvise mijenja styles.xml, a to OOXML ne moze prikazati kao reviziju. */
     if(res?.preview&&r.preview){
      const b=document.createElement('button');b.type='button';b.className='btn btn-secondary btn-sm';b.textContent='Pokaži što je popravljeno';
      b.onclick=async()=>{const {openRepairDiff}=await import('./repair-diff');openRepairDiff({before:r.preview,after:res.preview,changelog:out.changelog,fileName:out.fileName});void trackEvent('repair_diff_opened',{changes:out.changelog.length})};
      summary.appendChild(b);
     }}catch(e: any){console.error('Provjera popravljenog dokumenta:',e);recheck.innerHTML='<p class="muted">Popravljeni dokument je preuzet, ali ga nije bilo moguće ponovno provjeriti na ovom uređaju, pa usporedba prije/poslije nije dostupna.</p>'}
    // RE-37: uvijek ponudi nacin da se GLAVNI izvjestaj (ne samo redak ispod) osvjezi na popravljeni
    // dokument, umjesto da korisnik zakljuci "nista se nije dogodilo" jer ocjena gore ostaje stara.
    const reloadBtn=document.createElement('button');
    reloadBtn.type='button';reloadBtn.className='btn btn-secondary btn-sm';
    reloadBtn.textContent='Učitaj popravljeni dokument za novu analizu';
    reloadBtn.onclick=()=>{const f=new File([out.docxBytes as Uint8Array<ArrayBuffer>],out.fileName,{type:DOCX_MIME});resetAnalyzer();setFile(f)};
    summary.appendChild(reloadBtn);
    btn.textContent='Popravak preuzet ✓';
   } else if(out.kind==='tier_mismatch'){
    const sug=out.suggestedWorkType,lbl=(tierFor(sug)?.label||sug);
    setSummary(`<strong>Dokument izgleda kao ${escapeHtml(String(lbl))}.</strong> Odabrana vrsta rada je niža od stvarne. Kupi ispravnu vrstu rada, ili nastavi svejedno ovim popravkom.<div style="margin-top:8px"><button type="button" class="btn btn-secondary btn-sm" data-repair-confirm>Nastavi svejedno</button></div>`);
    const cb=summary.querySelector<HTMLButtonElement>('[data-repair-confirm]');if(cb)cb.onclick=()=>go(true);
   } else if(out.kind==='paywall'){
    // Goli toast je bio slijepa ulica: korisnik sazna da treba kupiti, ali nema odakle. Ista lock
    // ploca kao drugdje u izvjestaju nosi cijenu i put do placanja.
    setSummary(`<p>Za popravak je potrebna kupnja odgovarajuće vrste rada.</p>${paywallLockHtml('Automatski popravak dokumenta')}`);wireLockCtas();
   }
   else if(out.kind==='unauthorized'){openAuth(()=>go(confirmedMismatch))}
   // RE-33: razlog razlikuje placeni dnevni strop (uopce ne spominje "besplatno") od besplatne
   // kvote (po korisniku ili po dijeljenom IP-u, gdje korisnik OSOBNO nije nuzno nista potrosio).
   else if(out.kind==='rate_limited'){setSummary(out.reason==='paid_daily'?'<strong>Dnevni limit zahtjeva je iskorišten.</strong> Prozor je 24 sata, pa pokušaj ponovno sutra.':out.reason==='free_ip'?'<strong>Dnevni limit besplatnih popravaka za ovu mrežu/uređaj je iskorišten.</strong> Prozor je 24 sata; pokušaj ponovno sutra ili s drugog uređaja.':'<strong>Dnevni limit besplatnih popravaka je iskorišten.</strong> Prozor je 24 sata, pa pokušaj ponovno sutra. Ručne upute iznad i dalje vrijede.')}
   else if(out.kind==='too_large'){setSummary(`<strong>Dokument je prevelik za automatski popravak na serveru.</strong> Granica je ${Math.round(REPAIR_MAX_UPLOAD_BYTES/1024/1024)} MB. Najčešći razlog su slike u punoj rezoluciji; smanji ih u Wordu pa pokušaj ponovno.`)}
   // Ova dva ishoda su RAZLICITA: invalid_docx govori o dokumentu, no_live_fixers o serverskoj
   // konfiguraciji. Spojeni su krivo optuzivali korisnikov rad za nase gasenje fixera.
   else if(out.kind==='invalid_docx'){setSummary('Automatski popravak nije uspio na ovom dokumentu. Ručne upute iznad i dalje vrijede.')}
   else if(out.kind==='no_live_fixers'){setSummary('Traženi popravci trenutačno su isključeni na serveru. Pokušaj kasnije; ručne upute iznad i dalje vrijede.')}
   // Vrata integriteta (applyFixers.detectIntegrityFailure): popravak je zaustavljen jer izlazni
   // paket ne bi bio ispravan. Kao i no_live_fixers, ovo je NASA greska - poruka to mora reci
   // umjesto da posudi tekst od invalid_docx i optuzi korisnikov rad. Nista nije naplaceno.
   else if(out.kind==='integrity_failed'){setSummary(`<strong>Popravak nije isporučen jer rezultat nije prošao provjeru ispravnosti.</strong><p>Tvoj dokument nije mijenjan i ništa nije naplaćeno.${out.preexisting?' Neispravan dio postojao je već u učitanoj datoteci, pa za rezultat popravka ne možemo jamčiti. Pokušaj dokument prvo otvoriti i ponovno spremiti u Wordu.':' Ovo je greška na našoj strani, ne u tvom radu.'}</p><p class="muted">Tehnički detalj: ${escapeHtml(out.part)} - ${escapeHtml(out.problem)}</p><p>Ručne upute iznad i dalje vrijede.</p>`)}
   // Poruke iz repair-clienta (istekli uvjeti, prekid, mrezna greska, 500) nose konkretan tekst;
   // ranije su sve zavrsavale u genericnom toastu i korisnik nije imao sto uciniti.
   else if(out.kind==='error'){setSummary(escapeHtml(out.message||'Popravak trenutačno nije dostupan.'))}
   else{setSummary('Popravak trenutačno nije dostupan. Pokušaj ponovno za koji trenutak.')}
  }catch(e: any){console.error('Server repair:',e);setSummary('Greška pri popravku na serveru. Ručne upute iznad i dalje vrijede.')}
  }finally{
   inFlight=false;
   if(!lockButton){btn.disabled=false;btn.textContent=orig}
  }
 }
 // RE-19: prikazi potvrdni korak PRIJE poziva go() kad je odabrana stavka koja trazi potvrdu
 // lokacije (K6 section-insert); go() se poziva tek iz "Potvrdi i popravi" (isti obrazac kao
 // lokalni panel). "Nastavi svejedno" (data-repair-confirm, tier_mismatch) zove go(true) izravno:
 // do te tocke je lokacija vec jednom potvrdjena u prvom pokusaju iste serije odabira.
 btn.onclick=()=>{
  if(!consent.checked){
   consentHint.hidden=false;
   consentRow.classList.add('lekta-repair-panel__deep--alert');
   consent.focus();
   consentRow.scrollIntoView({behavior:'smooth',block:'center'});
   return;
  }
  const needsConfirm=getCheckedItems().filter((it: any)=>it.requiresConfirmation);
  if(needsConfirm.length){
   renderConfirmation(confirmBox,needsConfirm,()=>{confirmBox.hidden=true;confirmBox.innerHTML='';void go(false)});
   return;
  }
  void go(false);
 };
}

// Provjera prije predaje: cloud forenzika izvornosti. Sekcija (i tab) postoje
// SAMO kad je endpoint konfiguriran (za razliku od Repaira, bez servera funkcija
// ne postoji). Tijekom soft-launcha je puna i besplatna; teaser rez se pali sam
// kad naplata krene (server-side depth). Panel je stateful i vlastiti run se NE
// smije srusiti pri re-renderu (npr. handleUnlockReport ponovno zove renderResult).
function preflightConfigured(){return!!String(productionConfig?.preflightStartEndpoint||'').trim()&&!!String(productionConfig?.preflightResultEndpoint||'').trim()}
function preflightCitationClass(r: any): string{const s=String(r?.settings?.citationStyle||r?.details?.recommendedCitation||'').toLowerCase();if(/vancouver|ieee|numeric|brojc/.test(s))return'vancouver';if(/apa|harvard|chicago-author|author-year|mla/.test(s))return'author-year';return'unknown'}
async function renderPreflightSection(r: any){
 const tabBtn=$('#tabbtn-preflight'),mount=$('#preflightMount');
 if(!tabBtn||!mount)return;
 if(!preflightConfigured()){tabBtn.classList.add('hidden');if(preflightPanel){preflightPanel.dispose();preflightPanel=null;preflightPanelForResult=null}return}
 tabBtn.classList.remove('hidden');
 // Demo (javni uzorak) nikad ne uploada stvaran dokument; zastarjeli rezultat isto.
 if(r!==currentResult||r.demo){mount.innerHTML=`<div class="pf-card"><p class="pf-note">${r.demo?'Provjera prije predaje dostupna je nakon analize stvarnog dokumenta.':'Ponovno pokreni analizu za provjeru prije predaje.'}</p></div>`;if(preflightPanel){preflightPanel.dispose();preflightPanel=null}preflightPanelForResult=null;return}
 // Aktivni run istog rezultata: ne diraj (panel.render() no-op tijekom progressa).
 if(preflightPanel&&preflightPanelForResult===r){preflightPanel.render();return}
 if(preflightPanel){preflightPanel.dispose()}
 const capturedFile=selectedDocx;
 const {PreflightPanel}=await import('../preflight/preflight-panel');
 if(r!==currentResult)return;
 preflightPanel=new PreflightPanel(mount,{
  config:{startEndpoint:String(productionConfig.preflightStartEndpoint).trim(),resultEndpoint:String(productionConfig.preflightResultEndpoint).trim()},
  resolveToken:resolveAccessToken,
  openAuth:(cb: any)=>openAuth(cb),
  getFile:async()=>capturedFile||selectedDocx||null,
  referenceCount:Number(r.stats?.references||0),
  citationStyle:preflightCitationClass(r),
  workType:String(r.settings?.workType||r.selection?.workType||'final'),
  lang:String(r.settings?.language||'hr'),
  termsVersion:TERMS_VERSION,
  maxUploadMb:Number(productionConfig.preflightMaxUploadMb||30),
 });
 preflightPanelForResult=r;
 preflightPanel.render();
}

function renderCheckTable(id: any,items: any){const el=$('#'+id);if(!el)return;if(paywallGateActive()){const pass=items.filter((c: any)=>c.max>0&&c.status==='pass').length,warn=items.filter((c: any)=>c.max>0&&c.status==='warn').length,fail=items.filter((c: any)=>c.max>0&&c.status==='fail').length,info=items.filter((c: any)=>c.max===0&&c.status!=='unmeasurable').length,unmeasured=items.filter((c: any)=>c.status==='unmeasurable').length;el.innerHTML=`<div class="teaser-check-summary"><span class="status pass"><i data-lucide="check-circle"></i> U redu: ${pass}</span><span class="status warn"><i data-lucide="alert-triangle"></i> Provjeri: ${warn}</span><span class="status fail"><i data-lucide="alert-circle"></i> Važno: ${fail}</span><span class="status pass"><i data-lucide="info"></i> Informativno: ${info}</span>${unmeasured?`<span class="status unmeasurable"><i data-lucide="help-circle"></i> Nije provjerljivo: ${unmeasured}</span>`:''}</div>${paywallLockHtml('Detaljna tablica provjera s bodovima i obrazloženjima')}`;wireLockCtas();return}el.innerHTML=`<div style="overflow:auto"><table class="check-table"><thead><tr><th>Provjera</th><th>Status</th><th>Rezultat</th><th>Bodovi</th></tr></thead><tbody>${items.map((c: any)=>`<tr><td><strong>${escapeHtml(c.title)}</strong></td><td><span class="status ${c.status==='unmeasurable'?'unmeasurable':c.max===0?'pass':c.status}">${c.status==='unmeasurable'?'<i data-lucide="help-circle"></i> Nije provjerljivo':c.max===0?'<i data-lucide="info"></i> Informativno':c.status==='pass'?'<i data-lucide="check-circle"></i> U redu':c.status==='fail'?'<i data-lucide="alert-circle"></i> Važno':'<i data-lucide="alert-triangle"></i> Provjeri'}</span></td><td>${escapeHtml(diagText(c.detail))}</td><td>${c.max===0?'?':Math.round(c.earned*10)/10+'/'+c.max}</td></tr>`).join('')}</tbody></table></div>`}
// Otkrij drugi red tabova (iza "Više detalja") bez zatvaranja; koristi ga i klik na kategorijsku karticu.
function revealDetails(){const d=$('#tabDetails');if(d&&d.hasAttribute('hidden')){d.removeAttribute('hidden');$('#detailsToggle')?.classList.add('open');$('#detailsToggle')?.setAttribute('aria-expanded','true')}}
function openTab(id: any){$$('.tab').forEach(b=>{const on=b.dataset.tab===id;b.classList.toggle('active',on);b.setAttribute('aria-selected',on?'true':'false');b.setAttribute('tabindex',on?'0':'-1')});$$('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===`tab-${id}`))}
function resetAnalyzer(){currentResult=null;analyzedProfile=null;if(preflightPanel){preflightPanel.dispose();preflightPanel=null;preflightPanelForResult=null}resetUnlockButton();withViewTransition(()=>{renderView('dokument')});setFile(null);setAuxFile('pdf',null);setAuxFile('metadata',null);setAuxFile('av',null);progress(0,'Pripremam analizu');document.querySelector('#analyzer')?.scrollIntoView({behavior:'smooth'})}
function downloadResult(){if(!currentResult)return;if(paywallGateActive()){const t=buildTeaser(currentResult,{sampleSize:TEASER_SAMPLE});downloadBlob(JSON.stringify({watermark:true,note:'Besplatni sažetak s vodenim žigom. Puni podaci su dio serverski potvrđenog izvještaja.',file:currentResult.file,profile:currentResult.profile,generatedAt:currentResult.generatedAt,appVersion:currentResult.appVersion,teaser:t},null,2),'application/json',`Lekta-sazetak-${currentResult.file.name.replace(/\.docx$/i,'')}.json`);trackEvent('report_downloaded',{source:'json-teaser',profileId:currentResult.details?.profileDefinitionId||''});return}const exportResult=structuredClone(currentResult);delete exportResult.preview;exportResult.submission=submissionAssessment(currentResult);exportResult.details.pdfPreflight=currentPdfAudit;exportResult.details.metadataDocument=currentMetadataAudit;if(!recipeUnlocked())stripRecipeForExport(exportResult);downloadBlob(JSON.stringify(exportResult,null,2),'application/json',`Lekta-izvjestaj-${currentResult.file.name.replace(/\.docx$/i,'')}.json`);trackEvent('report_downloaded',{source:'json',profileId:currentResult.details?.profileDefinitionId||''})}
function openOrder(id='format',brief?: any){if(!paidOffersLive()){toast('Ručno uređivanje bit će uskoro dostupno. Za rani upit: '+(productionConfig.contactEmail||'kontakt uskoro'));return}$$('input[name="package"]').forEach(r=>r.checked=r.value===id);clearOrderStatus();$('#orderConsent').checked=false;renderProductionState();updateOrderFileMeta();const _notes=$('#orderNotes');if(brief&&_notes&&!_notes.value.trim())_notes.value=brief;$('#orderModal').classList.remove('hidden');trapModal($('#orderModal'));trackEvent('order_opened',{package:id,provider:productionConfig.paymentProvider});setTimeout(()=>$('#orderName').focus(),50)}function closeOrder(){$('#orderModal').classList.add('hidden');releaseModal($('#orderModal'))}
async function submitOrder(){const name=$('#orderName').value.trim(),email=$('#orderEmail').value.trim(),pkg=$('input[name="package"]:checked')?.value,file=selectedOrderFile(),consent=$('#orderConsent').checked;if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){toast('Upiši ime i valjanu e-mail adresu.');return}if(!consent){toast('Za slanje narudžbe potrebno je prihvatiti uvjete i obavijest o privatnosti.');return}if(file&&(!file.name.toLowerCase().endsWith('.docx')||file.size>productionConfig.uploadMaxBytes)){setOrderStatus('error',`Dokument mora biti .docx i ne smije biti veći od ${Math.round(productionConfig.uploadMaxBytes/1024/1024)} MB. Narudžbu možeš poslati bez datoteke i naknadno dogovoriti drugi siguran kanal.`);return}await ensureRulesForCurrentSelection(currentDefinitionId,ensureProfileRules);const orderId=makeOrderId(),profile=currentProfile().p,order={orderId,createdAt:new Date().toISOString(),customer:{name,email},package:PACKAGES.find(p=>p.id===pkg),deadline:$('#orderDeadline').value||null,notes:$('#orderNotes').value.trim(),marketingConsent:$('#orderMarketing').checked,termsVersion:TERMS_VERSION,document:file?{name:file.name,size:file.size,type:file.type}:null,analysis:currentResult?{file:currentResult.file.name,score:currentResult.score,profile:currentResult.profile,profileStatus:currentResult.profileStatus,fingerprint:currentResult.profileFingerprint||null,selection:currentResult.selection}:null,requestedProfile:profile.selection,status:'PENDING'};trackEvent('order_submit_attempt',{package:pkg,profileId:profile.definitionId||profile.id,workType:profile.selection.workType,provider:productionConfig.paymentProvider});const button=$('#submitOrder');button.disabled=true;button.textContent='Šaljem…';setOrderStatus('pending','Pripremam sigurnu predaju narudžbe…');try{if(!productionStatus().active){order.status='LOCAL_DRAFT';downloadBlob(JSON.stringify(order,null,2),'application/json',`Lekta-narudzba-${orderId}.json`);saveOrderReceipt(order);setOrderStatus('success',`<strong>Testni zapis je izrađen.</strong> Narudžba ${escapeHtml(orderId)} nije poslana niti je dokument prenesen. Preuzeta je lokalna JSON datoteka za provjeru integracije.`);toast('Testna narudžba spremljena je lokalno.');return}const fd=new FormData();fd.append('form-name','lekta-orders');fd.append('order_id',orderId);fd.append('name',name);fd.append('email',email);fd.append('package',pkg);fd.append('deadline',order.deadline||'');fd.append('notes',order.notes);fd.append('profile',JSON.stringify(order.requestedProfile));fd.append('fingerprint',order.analysis?.fingerprint||'');fd.append('marketing_consent',String(order.marketingConsent));fd.append('terms_version',TERMS_VERSION);if(file)fd.append('document',file,file.name);const response=await fetch(productionConfig.orderEndpoint,{method:'POST',body:fd,headers:{Accept:'application/json, text/plain, */*'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);order.status='RECEIVED';saveOrderReceipt(order);const payBase=productionConfig.paymentLinks?.[pkg]||'',payUrl=buildPaymentUrl(payBase,email,orderId,pkg),payment=payUrl?`<div class="payment-action"><a class="btn btn-primary btn-sm" id="paymentContinue" href="${escapeHtml(safeHref(payUrl))}" target="_blank" rel="noopener">Nastavi na sigurno plaćanje →</a></div>`:`<div class="payment-action"><strong>Plaćanje još nije povezano.</strong> Potvrda i upute bit će poslane na navedeni e-mail.</div>`;setOrderStatus('success',`<strong>Narudžba ${escapeHtml(orderId)} je zaprimljena.</strong> ${file?'Dokument je uključen u sigurnu predaju.':'Narudžba je zaprimljena bez dokumenta.'}${payment}`);trackEvent('order_submitted',{package:pkg,profileId:profile.definitionId||profile.id,provider:productionConfig.paymentProvider});setTimeout(()=>{const a=$('#paymentContinue');if(a)a.onclick=()=>trackEvent('payment_redirect',{package:pkg,provider:productionConfig.paymentProvider})},0)}catch(err: any){order.status='FAILED';setOrderStatus('error',`Narudžbu nije bilo moguće poslati (${escapeHtml(err.message||'mrežna pogreška')}). Dokument nije označen kao zaprimljen. Pokušaj ponovno ili kontaktiraj ${escapeHtml(productionConfig.contactEmail||'podršku nakon konfiguracije kontakta')}.`)}finally{button.disabled=false;button.textContent='Pošalji narudžbu'}}
/**
 * KORIJEN RADNE POVRSINE. Dok je ozicenje bezuvjetno dohvacalo pet korijena zatecene stranice,
 * montaza je smjela krenuti samo kad su SVI prisutni; na stranici s dijelom njih bacilo bi na
 * prvom koji nedostaje. Otkad ozicenje ide kroz `ctl`, uvjet je ono sto montaza doista treba.
 *
 * `#dropzone` stoji uz `#analyzer` namjerno: `#analyzer` je omotac i moze postojati na stranici
 * koja radnu povrsinu tek najavljuje, a bez `#dropzone` nema sto montirati.
 */
function hasLegacyPage(doc: Document): boolean{return !!(doc.getElementById('analyzer')&&doc.getElementById('dropzone'))}

/**
 * ULAZ. Idempotentan po dokumentu i podnosi tocno jedan aktivni Document.
 *
 * OTROVANA REGISTRACIJA: modul se ucitava PRIJE nego ruta ispise svoj DOM, pa poziv nad
 * stranicom bez korijena ne smije potrositi mjesto u registru. Da ga potrosi, kasniji izricit
 * poziv tiho bi izasao na idempotentnom returnu i ruta bi ostala bez ijednog ozicenja, bez
 * greske i bez traga. Zato se registrira SAMO stvarno obavljena montaza.
 */
export function initAnalyzerApp(doc: Document=document): void{
 if(_mountedDocuments.has(doc))return;
 if(_runtimeDocument&&_runtimeDocument!==doc)throw new Error('Analizator podrzava samo jedan aktivni Document.');
 if(!hasLegacyPage(doc))return;
 const previousDocument=_runtimeDocument;
 // AbortController se uzima iz PROSLIJEDJENOG dokumenta (odvojeno stablo ili iframe ima svoj),
 // uz globalni fallback za dokument bez pogleda (document.implementation.createHTMLDocument).
 const Controller=doc.defaultView?.AbortController??globalThis.AbortController;
 const controller=new Controller();
 _runtimeDocument=doc;
 _mountAbortControllers.set(doc,controller);
 try{
  initLegacy(doc,controller.signal);
  _analyzerMounted=true;
  _mountedDocuments.add(doc);
 }catch(error){
  // Neuspjela montaza ne smije ostaviti pola stanja: sljedeci poziv mora moci pokusati ponovno.
  controller.abort();
  _mountAbortControllers.delete(doc);
  _analyzerMounted=false;_runtimeDocument=previousDocument;
  throw error;
 }
}

/**
 * IZLAZ. Prekida signal montaze i oslobadja registar, pa se isti dokument moze montirati ponovno.
 *
 * OPSEG JE OGRANICEN I TO SE OVDJE KAZE NAGLAS: `bind()` svoje slusace jos registrira BEZ
 * signala, pa ih ovaj poziv ne skida. Prekid signala danas gasi samo ono sto je na njega vezano
 * (odgodjeni demo). Vezanje ostalih slusaca ide uz razlaganje `bind()`, kad `/rad/` postoji da
 * to zatrazi. Gard koji tu granicu mjeri: `tests/analyzer-boundary.test.ts`.
 */
export function disposeAnalyzerApp(doc: Document=document): void{
 const controller=_mountAbortControllers.get(doc);
 if(!controller)return;
 controller.abort();
 _mountAbortControllers.delete(doc);
 _mountedDocuments.delete(doc);
 if(_runtimeDocument===doc){_runtimeDocument=null;_analyzerMounted=false}
}

if (typeof document !== 'undefined' && document.getElementById('analyzer')) initAnalyzerApp(document);
