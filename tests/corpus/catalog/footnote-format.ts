/**
 * FOOTNOTE-FORMAT atomski korpus (faza 4, "footnote-format builder" enabler): cetiri bodovane
 * provjere oblikovanja koje se emitiraju samo za pravni profil s footnote-gate-ovima
 * (`pravo-integrirani-diplomski`: legalFootnoteProfile + checkFootnoteParagraphSpacingZero +
 * checkFootnoteMarkerPosition + checkParagraphSpacingZero). Do sada ih builder nije mogao okinuti
 * jer fusnote nisu nosile oblik ni markere; sada `docx-builder` ADITIVNO podrzava:
 *   - FootnoteSpec (font/velicina/prored/razmaci/poravnanje na fusnotnim odlomcima),
 *   - ParaSpec.before/after (razmak prije/poslije odlomka), te
 *   - <w:footnoteReference> markere u tijelu preko `raw` escape-hatcha.
 * Prosirenje je dokazano BAJT-IDENTICNO za postojece specove (golden nepromijenjen).
 *
 * Baza je `legalBaselineSpec` (ista koju koristi legal klaster, prolazna pod istim profilom).
 * Svaki slucaj: cleanBuild s ISPRAVNIM oblikom prolazi ciljanu provjeru, a jedna mutacija je rusi.
 */
import type { DocSpec, FootnoteSpec } from '../../helpers/docx-builder';
import { cloneSpec } from '../builder/baseline';
import { legalBaselineSpec, LEGAL_FOOTNOTES, LEGAL_PROFILE_ID } from '../builder/legal-baseline';
import type { ErrorCase } from '../error-case';

const PID = LEGAL_PROFILE_ID;

/** Legal baza sa svim fusnotama pretvorenim u FootnoteSpec s danim oblikom. */
function withFnFmt(over: Partial<FootnoteSpec>): DocSpec {
  const s = cloneSpec(legalBaselineSpec());
  s.footnotes = LEGAL_FOOTNOTES.map((t) => ({ text: t, ...over }));
  return s;
}

/** Legal baza s razmakom prije/poslije (u tockama) na svim odlomcima tijela (text > 15, ne-naslov). */
function withBodySpacing(pt: number): DocSpec {
  const s = cloneSpec(legalBaselineSpec());
  s.paragraphs = s.paragraphs.map((p) =>
    !p.styleId && !p.raw && !p.empty && p.text.length > 15 ? { ...p, before: pt, after: pt } : p,
  );
  return s;
}

/** Legal baza s umetnutom oznakom fusnote (w:footnoteReference) u tijelu; italic po zelji. */
function withMarker(italic: boolean): DocSpec {
  const s = cloneSpec(legalBaselineSpec());
  const rpr = italic ? '<w:rPr><w:i/></w:rPr>' : '';
  const raw =
    `<w:p><w:r><w:t xml:space="preserve">Prema navedenom pravnom izvoru</w:t></w:r>` +
    `<w:r>${rpr}<w:footnoteReference w:id="1"/></w:r>` +
    `<w:r><w:t xml:space="preserve"> tekst se nastavlja u istom odlomku dalje.</w:t></w:r></w:p>`;
  const i = s.paragraphs.findIndex((p) => p.styleId && /1\. Uvod/.test(p.text));
  s.paragraphs.splice(i + 1, 0, { text: '', raw });
  return s;
}

export const FOOTNOTE_ATOMIC_CASES: ErrorCase[] = [
  {
    id: 'atomic.footnote.format',
    title: 'Fusnote nisu u profilnom fontu (Arial umjesto TNR 10)',
    category: 'formatting', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    // Cista: TNR 10, obostrano (faOk jer profil trazi footnoteJustify). Mutacija: samo font -> Arial.
    cleanBuild: () => withFnFmt({ font: 'Times New Roman', sizePt: 10, jc: 'both' }),
    build: () => withFnFmt({ font: 'Arial', sizePt: 10, jc: 'both' }),
    expect: { checkId: 'footnote.format', title: 'Oblikovanje fusnota', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.footnote.spacing',
    title: 'Fusnote imaju razmak prije/poslije umjesto nule',
    category: 'formatting', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    cleanBuild: () => withFnFmt({ before: 0, after: 0 }),
    build: () => withFnFmt({ before: 6, after: 6 }),
    expect: { checkId: 'footnote.spacing', title: 'Razmak prije i poslije fusnota', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.footnote.marker',
    title: 'Oznaka fusnote u tijelu je ukošena',
    category: 'formatting', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    cleanBuild: () => withMarker(false),
    build: () => withMarker(true),
    expect: { checkId: 'footnote.marker', title: 'Položaj i stil oznaka fusnota', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.format.spacing.paragraph',
    title: 'Odlomci tijela imaju razmak prije/poslije umjesto nule',
    category: 'formatting', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    cleanBuild: () => withBodySpacing(0),
    build: () => withBodySpacing(6),
    expect: { checkId: 'format.spacing.paragraph', title: 'Razmak prije i poslije odlomka', kind: 'status', outcome: 'not-pass' },
  },
];
