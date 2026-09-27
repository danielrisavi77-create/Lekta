// scripts/lib/corpus-attestation-core.mjs
//
// Cista pravila ovjere realnog korpusa: otisak skupa, smije li se postojeci potpis prenijeti i smije
// li se mjerenje uopce ovjeriti.
//
// ZASTO VERZIJA OTISKA (T83). Otisak v1 bio je sha256 nad SORTIRANIM id-ovima s ponavljanjem. Mjerenje
// koje je isti rad brojalo dvaput (docx-local i LEKTA_CORPUS_SOURCE dijele 102 bajt-identicna rada)
// dalo je otisak 8e5bd529..., isti kao potpisana ovjera a74d93d5. Otisak v2 racuna se nad JEDINSTVENIM
// id-ovima i nosi oznaku verzije u ulazu, pa se v1 i v2 nikad ne podudaraju slucajno.
//
// ZASTO JE POTPIS VEZAN UZ IDENTITET MJERENJA. Stara skripta prenosila je potpis kad god je otisak
// bio isti, pa bi vlasnikov potpis od 12. 9. tiho presao na ponovljeno mjerenje od 27. 9. Ni uvjet
// "potpis nije stariji od mjerenja" nije dovoljan (Codex #185, T83-05): mjerenje u 09:00, potpis u
// 10:00 i novo mjerenje istog skupa u 09:30 zadovoljavaju ga, a potpis pokriva drugo mjerenje. Potpis
// zato ostaje samo uz ISTO mjerenje: isti trenutak mjerenja i isti commit, uz istu verziju i otisak.
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

/**
 * Potpis postojece ovjere koji smije ostati uz novu ovjeru, ili null. Uvjeti, svi: ista
 * `fingerprintVersion` (v2) i `corpusFingerprint`, ISTO mjerenje (`measuredAt` i `measuredFromCommit`)
 * i potpis nije stariji od tog mjerenja.
 */
export function inheritedSignature(existing, next) {
  if (!existing || !existing.signedBy || !existing.signedAt) return null;
  if (existing.fingerprintVersion !== FINGERPRINT_VERSION || next.fingerprintVersion !== FINGERPRINT_VERSION) return null;
  if (existing.corpusFingerprint !== next.corpusFingerprint) return null;
  if (!existing.measuredAt || existing.measuredAt !== next.measuredAt) return null;
  if (!existing.measuredFromCommit || existing.measuredFromCommit !== next.measuredFromCommit) return null;
  const signed = Date.parse(existing.signedAt);
  const measured = Date.parse(next.measuredAt);
  if (!Number.isFinite(signed) || !Number.isFinite(measured) || signed < measured) return null;
  return { signedBy: existing.signedBy, signedAt: existing.signedAt, signatureNote: existing.signatureNote ?? null };
}

/**
 * Razlozi zbog kojih se mjerenje NE SMIJE ovjeriti; prazno znaci da smije.
 *
 * Pad isporuke (`outcome: 'fail'`) ili ostecen paket (`integrityFailure`) na bilo kojem dokumentu
 * rusi ovjeru cijelog mjerenja (Codex #185, T83-03). Do T83 se takav dokument samo nije brojao u
 * `cleanCount`, pa je skupina s jednim cistim i jednim palim radom ostajala dokaziva.
 */
export function attestationRefusals(results) {
  const out = [];
  const pali = results.filter((r) => r.outcome === 'fail').map((r) => r.documentId);
  const osteceni = results.filter((r) => r.integrityFailure).map((r) => r.documentId);
  if (pali.length) out.push(`${pali.length} dokumenata ima pad isporuke (outcome fail)`);
  if (osteceni.length) out.push(`${osteceni.length} dokumenata ima ostecen paket (integrityFailure)`);
  const dvostruki = results.length - new Set(results.map((r) => r.documentId)).size;
  if (dvostruki > 0) out.push(`mjerenje ima ${dvostruki} dvostrukih documentId; ponovi mjerenje harnessom s dedupeManifest`);
  return out;
}
