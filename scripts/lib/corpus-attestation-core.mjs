// scripts/lib/corpus-attestation-core.mjs
//
// Cista pravila ovjere realnog korpusa: otisak skupa, otisak sadrzaja ovjere, smije li se postojeci
// potpis prenijeti i smije li se mjerenje uopce ovjeriti.
//
// ZASTO VERZIJA OTISKA (T83). Otisak v1 bio je sha256 nad SORTIRANIM id-ovima s ponavljanjem. Mjerenje
// koje je isti rad brojalo dvaput (docx-local i LEKTA_CORPUS_SOURCE dijele 102 bajt-identicna rada)
// dalo je otisak 8e5bd529..., isti kao potpisana ovjera a74d93d5. Otisak v2 racuna se nad JEDINSTVENIM
// id-ovima i nosi oznaku verzije u ulazu, pa se v1 i v2 nikad ne podudaraju slucajno.
//
// ZASTO JE POTPIS VEZAN UZ SADRZAJ CIJELE OVJERE. Stara skripta prenosila je potpis kad god je otisak
// skupa bio isti, pa bi vlasnikov potpis od 12. 9. tiho presao na ponovljeno mjerenje od 27. 9. Ni
// "isti otisak i isto mjerenje" nije dovoljno (Codex #185, T83-05, runda 2): ista ovjera ponovljena s
// `--holdout-confirmed` ima isti otisak, vrijeme i commit, a drugaciji opseg dokaza i druge brojke po
// skupini. Potpis zato pokriva kanonski otisak SADRZAJA ovjere (sve osim samih polja potpisa); svaka
// promjena sadrzaja trazi novi potpis.
import crypto from 'node:crypto';

export const FINGERPRINT_VERSION = 2;

/** Otisak v2: sha256 nad oznakom verzije i sortiranim JEDINSTVENIM documentId-ovima, prvih 32 znaka. */
export function corpusFingerprintV2(documentIds) {
  const unique = [...new Set(documentIds.map(String))].sort();
  return crypto.createHash('sha256')
    .update(`lekta-corpus-fingerprint/v${FINGERPRINT_VERSION}\n${unique.join('\n')}`)
    .digest('hex')
    .slice(0, 32);
}

const POLJA_POTPISA = new Set(['signedBy', 'signedAt', 'signatureNote', 'signedContentDigest']);

/** JSON s kljucevima sortiranim na svakoj razini: isti sadrzaj daje iste bajtove bez obzira na redoslijed. */
function kanonski(value) {
  if (Array.isArray(value)) return `[${value.map(kanonski).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${kanonski(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** sha256 kanonskog JSON-a ovjere BEZ polja potpisa: ono sto potpis pokriva. */
export function attestationContentDigest(attestation) {
  const sadrzaj = Object.fromEntries(Object.entries(attestation).filter(([k]) => !POLJA_POTPISA.has(k)));
  return crypto.createHash('sha256').update(kanonski(sadrzaj)).digest('hex');
}

/**
 * Potpis postojece ovjere koji smije ostati uz novu ovjeru `next` (bez polja potpisa), ili null.
 * Uvjeti, svi: postojeca je v2 i potpisana, njen `signedContentDigest` je otisak sadrzaja koji je
 * potpisan i jednak je otisku sadrzaja nove ovjere, a potpis nije stariji od mjerenja.
 */
export function inheritedSignature(existing, next) {
  if (!existing || !existing.signedBy || !existing.signedAt || !existing.signedContentDigest) return null;
  if (existing.fingerprintVersion !== FINGERPRINT_VERSION || next.fingerprintVersion !== FINGERPRINT_VERSION) return null;
  if (existing.signedContentDigest !== attestationContentDigest(existing)) return null;
  if (existing.signedContentDigest !== attestationContentDigest(next)) return null;
  const signed = Date.parse(existing.signedAt);
  const measured = Date.parse(next.measuredAt);
  if (!Number.isFinite(signed) || !Number.isFinite(measured) || signed < measured) return null;
  return {
    signedBy: existing.signedBy,
    signedAt: existing.signedAt,
    signatureNote: existing.signatureNote ?? null,
    signedContentDigest: existing.signedContentDigest,
  };
}

// >>> GARD:attestationRefusals (mutacijski test cita ovaj blok kao izvor)
const DOPUSTENI_ISHODI = new Set(['pass', 'review', 'no-op']);
/**
 * Razlozi zbog kojih se mjerenje NE SMIJE ovjeriti; prazno znaci da smije.
 *
 * Svaki dokument mora zavrsiti dopustenim ishodom (`pass`, `review`, `no-op`), bez greske i bez
 * ostecenog paketa (Codex #185, T83-03). Do T83 se pali dokument samo nije brojao u `cleanCount`, pa je
 * skupina s jednim cistim i jednim palim radom ostajala dokaziva; a rezultat s `error` i ishodom
 * `review` nije nigdje odbijen.
 */
export function attestationRefusals(results) {
  const out = [];
  const nedopusteni = results.filter((r) => !DOPUSTENI_ISHODI.has(r.outcome)).length;
  const sGreskom = results.filter((r) => r.error !== null && r.error !== undefined && String(r.error).trim() !== '').length;
  const osteceni = results.filter((r) => r.integrityFailure).length;
  if (nedopusteni) out.push(`${nedopusteni} dokumenata nema dopusten ishod (pass, review, no-op)`);
  if (sGreskom) out.push(`${sGreskom} dokumenata ima gresku mjerenja (error)`);
  if (osteceni) out.push(`${osteceni} dokumenata ima ostecen paket (integrityFailure)`);
  const dvostruki = results.length - new Set(results.map((r) => r.documentId)).size;
  if (dvostruki > 0) out.push(`mjerenje ima ${dvostruki} dvostrukih documentId; ponovi mjerenje harnessom s dedupeManifest`);
  return out;
}
// <<< GARD:attestationRefusals

// >>> GARD:sourceKindRefusals (mutacijski test cita ovaj blok kao izvor)
const VRSTE_IZVORA_REZULTATA = new Set(['source-docx', 'public-pdf-converted']);
/**
 * Razlozi zbog kojih mjerenje NE SMIJE u ovjeru zadane vrste (`--source-kind`); prazno znaci da smije.
 *
 * Vrsta svakog rezultata dolazi iz sidecara (corpus-ingest --source-kind, repair-real-corpus je prenosi).
 * PDF ovjera (razina A-pdf) trazi da SVAKI rezultat nosi `public-pdf-converted`: rezultat bez vrste je
 * commitana fixture, izvorni DOCX ili PDF koji je zaobisao ingest, i nijedan od njih nije dokaz A-pdf.
 * Ovjera izvornog DOCX-a odbija svaki rezultat pretvoren iz PDF-a, jer bi inace podigao pravi A
 * (odluka vlasnika 2026-09-28). Nepoznata vrsta se odbija u oba smjera: zatvoren skup, kao u citacu ovjere.
 */
export function sourceKindRefusals(results, kind) {
  const out = [];
  const vrsta = (r) => (r.sourceKind === undefined ? null : r.sourceKind);
  if (!VRSTE_IZVORA_REZULTATA.has(kind)) return [`nepoznata vrsta ovjere ${String(kind)}`];
  const nepoznate = results.filter((r) => vrsta(r) !== null && !VRSTE_IZVORA_REZULTATA.has(vrsta(r))).length;
  if (nepoznate) out.push(`${nepoznate} rezultata nosi nepoznat sourceKind`);
  if (kind === 'public-pdf-converted') {
    const bezPdf = results.filter((r) => vrsta(r) !== 'public-pdf-converted').length;
    if (bezPdf) {
      out.push(
        `${bezPdf} rezultata nema sourceKind public-pdf-converted iz sidecara; PDF ovjera mjeri samo izlaz ` +
          'corpus-ingest --source-kind public-pdf-converted (repair-real-corpus --only-root)',
      );
    }
  } else {
    const pdf = results.filter((r) => vrsta(r) === 'public-pdf-converted').length;
    if (pdf) out.push(`${pdf} rezultata nosi sourceKind public-pdf-converted; rad pretvoren iz PDF-a ne smije u ovjeru izvornog DOCX-a`);
  }
  return out;
}
// <<< GARD:sourceKindRefusals

// >>> GARD:ingestSourceKindProblem (mutacijski test cita ovaj blok kao izvor)
/**
 * Problem vrste izvora za scripts/corpus-ingest.mts, ili null. `--source-kind` je obavezan i iz zatvorenog
 * skupa; izvor koji nosi oznaku `.lekta-corpus-kind` (pise je scripts/pdf-corpus/harvest_pdf_corpus.py) mora se
 * s njom slagati, a `public-pdf-converted` bez oznake se odbija, jer
 * rucno sastavljena mapa ne postaje PDF korpus (Codex #229, nalaz 02).
 */
export function ingestSourceKindProblem(kind, marker) {
  if (!kind || !['source-docx', 'public-pdf-converted'].includes(kind)) {
    return `obavezno --source-kind source-docx|public-pdf-converted (dobiveno: ${String(kind)})`;
  }
  if (marker !== null && marker !== kind) return `izvor se oznakom .lekta-corpus-kind izjasnjava kao "${marker}", a zadano je --source-kind ${kind}`;
  if (kind === 'public-pdf-converted' && marker !== kind) {
    return '--source-kind public-pdf-converted trazi izvor s oznakom .lekta-corpus-kind (staging mapa iz harvest_pdf_corpus.py)';
  }
  return null;
}
// <<< GARD:ingestSourceKindProblem
