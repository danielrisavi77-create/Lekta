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
 * Ovjera SVAKE vrste trazi da SVAKI rezultat nosi upravo tu vrstu: rezultat bez vrste je commitana fixture,
 * rad koji je zaobisao ingest ili pretvoreni PDF kojem je netko uklonio oznaku staging mape, i nijedan od
 * njih nije dokaz ni A-pdf ni pravog A (Codex #229 nalaz 02, runda 3). Posljedica: lokalni korpus ingestiran
 * prije `--source-kind` (sidecar bez vrste) mora se ponovno provuci kroz corpus-ingest --source-kind
 * source-docx (docs/quality/real-corpus-protocol.md). Ovjera izvornog DOCX-a posebno imenuje rezultat
 * pretvoren iz PDF-a, jer bi inace podigao pravi A (odluka vlasnika 2026-09-28). Nepoznata vrsta se odbija u
 * oba smjera: zatvoren skup, kao u citacu ovjere.
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
    const bezVrste = results.filter((r) => vrsta(r) === null).length;
    if (bezVrste) {
      out.push(
        `${bezVrste} rezultata nema sourceKind source-docx iz sidecara; ovjera izvornog DOCX-a mjeri samo izlaz ` +
          'corpus-ingest --source-kind source-docx (repair-real-corpus --only-root), stari ingest treba ponoviti',
      );
    }
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
 *
 * `source-docx` odbija mapu koja nosi BILO KOJI trag harvesta: oznaku ili manifest `.lekta-harvest-manifest.json`
 * (runda 3). Uklonjena oznaka uz zaostali manifest tako ne pretvara staging mapu u izvorni DOCX. Covjek koji
 * namjerno ukloni sve tragove i dalje moze lagati, isto kao i potpisom; zato `--harvest-manifest` uz to
 * odbija svaki DOCX ciji je sha256 harvest zapisao (harvestedDocxProblem).
 */
export function ingestSourceKindProblem(kind, marker, manifestPresent = false) {
  if (!kind || !['source-docx', 'public-pdf-converted'].includes(kind)) {
    return `obavezno --source-kind source-docx|public-pdf-converted (dobiveno: ${String(kind)})`;
  }
  if (marker !== null && marker !== kind) return `izvor se oznakom .lekta-corpus-kind izjasnjava kao "${marker}", a zadano je --source-kind ${kind}`;
  if (kind === 'source-docx' && (marker !== null || manifestPresent)) {
    return '--source-kind source-docx ne prima mapu s tragom harvesta (.lekta-corpus-kind ili .lekta-harvest-manifest.json): to je staging pretvorenih PDF-ova';
  }
  if (kind === 'public-pdf-converted' && marker !== kind) {
    return '--source-kind public-pdf-converted trazi izvor s oznakom .lekta-corpus-kind (staging mapa iz harvest_pdf_corpus.py)';
  }
  return null;
}
// <<< GARD:ingestSourceKindProblem

// >>> GARD:harvestManifestShas (mutacijski test cita ovaj blok kao izvor)
/**
 * Manifest harvesta (`.lekta-harvest-manifest.json`, pise ga harvest_pdf_corpus.py u staging): popis sha256
 * pretvorenih DOCX-ova, bez PID-a i URL-a. Vraca skup otisaka ili baca gresku za neispravan oblik.
 */
export function harvestManifestShas(json) {
  const shas = json && typeof json === 'object' && !Array.isArray(json) ? json.docxSha256 : undefined;
  if (json?.kind !== 'lekta-pdf-harvest-manifest' || !Array.isArray(shas) || !shas.every((s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s))) {
    throw new Error('manifest harvesta nije oblika {kind: "lekta-pdf-harvest-manifest", docxSha256: [64 hex]}');
  }
  return new Set(shas);
}
// <<< GARD:harvestManifestShas

// >>> GARD:harvestedDocxProblem (mutacijski test cita ovaj blok kao izvor)
/** Problem dokumenta koji je harvest pretvorio iz PDF-a, a ingestira se kao izvorni DOCX; inace null. */
export function harvestedDocxProblem(kind, sha, manifestShas) {
  if (kind === 'source-docx' && manifestShas && manifestShas.has(sha)) {
    return 'sha256 dokumenta je u manifestu harvesta: rad pretvoren iz PDF-a ne smije u source-docx';
  }
  return null;
}
// <<< GARD:harvestedDocxProblem

// >>> GARD:pdfPackagePrivacyProblems (mutacijski test cita ovaj blok kao izvor)
/**
 * Dijelovi paketa koje DOCX pretvoren iz PDF-a smije nositi (isti popis kao ALLOWED_PARTS u
 * scripts/pdf-corpus/harvest_pdf_corpus.py). Sve izvan toga (docProps/thumbnail, comments, people, customXml,
 * header, footer, custom.xml) moze nositi ime koje pseudonimizacija ne vidi (binarna slicica, tekst zaglavlja
 * bez oznake uloge), pa se ne isporucuje nego odbija.
 */
const PDF_DOPUSTENI_DIJELOVI = [
  /^\[Content_Types\]\.xml$/,
  /^_rels\/\.rels$/,
  /^docProps\/(?:core|app)\.xml$/,
  /^word\/document\.xml$/,
  /^word\/_rels\/document\.xml\.rels$/,
  /^word\/(?:styles|stylesWithEffects|numbering|settings|fontTable|webSettings)\.xml$/,
  /^word\/theme\/theme[0-9]+\.xml$/,
  /^word\/media\/[A-Za-z0-9_-]+\.(?:png|jpe?g|gif|bmp|tiff?)$/i,
];
/**
 * Razlozi zbog kojih ingest NE MOZE potvrditi privatnost DOCX-a pretvorenog iz PDF-a; prazno znaci da moze.
 * `entries` su dijelovi NAKON pseudonimizacije, `terms` pojmovi iz rjecnika. Odbija se: dio izvan dopustenog
 * skupa, docProps s ikakvim tekstom (harvest ih prazni), prazan rjecnik (tvrdnja "0 procurjelih pojmova" bila
 * bi vakuumska) i binarni dio u kojem stoji pojam iz rjecnika (UTF-8 ili UTF-16LE). Slika u kojoj je ime
 * nacrtano pikselima ostaje izvan dosega: to se ne moze provjeriti usporedbom bajtova.
 */
export function pdfPackagePrivacyProblems(entries, terms) {
  const out = [];
  const izvan = entries.filter((e) => !PDF_DOPUSTENI_DIJELOVI.some((re) => re.test(e.name))).map((e) => e.name);
  if (izvan.length) out.push(`dijelovi izvan dopustenog skupa za PDF vrstu: ${izvan.sort().join(', ')}`);
  const dekodiraj = (data) => new TextDecoder().decode(data);
  const punDocProps = entries.filter((e) => /^docProps\//.test(e.name) && />[^<]*\S[^<]*</.test(dekodiraj(e.data))).map((e) => e.name);
  if (punDocProps.length) out.push(`docProps nisu prazni: ${punDocProps.join(', ')}`);
  if (terms.length === 0) out.push('prazan rjecnik pojmova: privatnost se ne moze potvrditi (dodaj --terms ili odbaci rad)');
  const sadrzi = (data, igla) => Buffer.from(data).includes(igla);
  const binarni = entries.filter((e) => !/\.(?:xml|rels)$/i.test(e.name) &&
    terms.some((t) => sadrzi(e.data, Buffer.from(t, 'utf8')) || sadrzi(e.data, Buffer.from(t, 'utf16le')))).map((e) => e.name);
  if (binarni.length) out.push(`binarni dijelovi nose pojam iz rjecnika: ${binarni.join(', ')}`);
  return out;
}
// <<< GARD:pdfPackagePrivacyProblems

// >>> GARD:attestInvocationProblems (mutacijski test cita ovaj blok kao izvor)
/**
 * Pozivi ovjere bez `--source-kind` u npm skriptama i protokolu (Codex #229, krug popravka). Ovjera od #225
 * ODBIJA pisati bez vrste izvora, pa bi `npm run attest-corpus` ili prepisana naredba iz protokola uvijek pala.
 * Vraca po jedan problem za svaki redak `node scripts/attest-real-corpus.mjs` bez vrste iz zatvorenog skupa.
 */
export function attestInvocationProblems(text, source) {
  const out = [];
  String(text).replace(/\r/g, '').split('\n').forEach((line, i) => {
    const poziv = /\bnode\s+scripts\/attest-real-corpus\.mjs\b(.*)$/.exec(line);
    if (!poziv) return;
    const imaVrstu = /--source-kind\s+(source-docx|public-pdf-converted)(?![\w-])/.test(poziv[1]);
    if (!imaVrstu) out.push(`${source}:${i + 1}: poziv ovjere bez --source-kind source-docx|public-pdf-converted`);
  });
  return out;
}
// <<< GARD:attestInvocationProblems
