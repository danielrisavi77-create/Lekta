// scripts/lib/corpus-attestation-core.mjs
//
// Cista pravila ovjere realnog korpusa: otisak skupa i smije li se postojeci potpis prenijeti.
//
// ZASTO VERZIJA OTISKA (T83). Otisak v1 bio je sha256 nad SORTIRANIM id-ovima s ponavljanjem. Mjerenje
// koje je isti rad brojalo dvaput (docx-local i LEKTA_CORPUS_SOURCE dijele 102 bajt-identicna rada)
// dalo je otisak 8e5bd529..., isti kao potpisana ovjera a74d93d5. Otisak v2 racuna se nad JEDINSTVENIM
// id-ovima i nosi oznaku verzije u ulazu, pa se v1 i v2 nikad ne podudaraju slucajno.
//
// ZASTO SE POTPIS NE NASLJEDJUJE PREKO NOVOG MJERENJA. Stara skripta prenosila je potpis kad god je
// otisak bio isti. Ponovljeno mjerenje istog skupa 27. 9. dalo je isti v1 otisak, pa bi vlasnikov
// potpis od 12. 9. tiho presao na mjerenje od 27. 9. Potpis se smije zadrzati samo kad ovjera opisuje
// ISTO mjerenje koje je potpisano: ista verzija i vrijednost otiska, a potpis nije stariji od mjerenja.
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
 * Potpis postojece ovjere koji smije ostati uz novu ovjeru, ili null. Uvjeti, svi:
 * ista `fingerprintVersion` (v2), isti `corpusFingerprint` i potpis NIJE stariji od novog mjerenja.
 */
export function inheritedSignature(existing, next) {
  if (!existing || !existing.signedBy || !existing.signedAt) return null;
  if (existing.fingerprintVersion !== FINGERPRINT_VERSION || next.fingerprintVersion !== FINGERPRINT_VERSION) return null;
  if (existing.corpusFingerprint !== next.corpusFingerprint) return null;
  const signed = Date.parse(existing.signedAt);
  const measured = Date.parse(next.measuredAt);
  if (!Number.isFinite(signed) || !Number.isFinite(measured) || signed < measured) return null;
  return { signedBy: existing.signedBy, signedAt: existing.signedAt, signatureNote: existing.signatureNote ?? null };
}
