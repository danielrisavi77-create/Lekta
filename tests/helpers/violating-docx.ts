/**
 * Generator dokumenta koji NAMJERNO krsi pravila konkretnog profila (P4-1 u
 * docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Zasto: closed-loop harness (`runClosedLoopCase`) je zreo i ima 29 slucajeva, ali svi rucno grade
 * svoj dokument, pa pokrivaju TOCNO DVA profila od 410. Da bi se petlja provrtjela kroz katalog,
 * pokvareni dokument mora nastati IZ PROFILA, a ne iz ruke.
 *
 * Nacelo: vrijednosti se INVERTIRAJU iz onoga sto profil stvarno propisuje (`paramsForCheck` je
 * jedini izvor ciljane vrijednosti, isti koji koristi i sucelje). Nista se ne pogadja: os koju
 * profil ne propisuje se NE krsi, jer bi popravak tada mijenjao ispravan rad.
 *
 * Granica: SEST osi profilne grane popravka (font, velicina, prored, poravnanje, margine, format
 * papira) uvijek, plus STRUKTURNE osi koje se ukljucuju izricito (`structural: true`).
 *
 * Zasto su strukturne osi opt-in, a ne uvijek ukljucene: dodavanje odlomka "Sadrzaj" ili praznog
 * odlomka mijenja dokument za SVAKI profil, pa bi jednim potezom pomaknulo rezultat closed-loopa
 * na svih 407 profila. Ukljucuju se svjesno, uz ponovno mjerenje, a ne kao nuspojava.
 *
 * Zasto strukturne osi uopce trebaju postojati: mjerenje 2026-08-29 pokazuje da closed-loop javlja
 * FPZG kao 12/13 `pass`, dok 74 stvarna FPZG rada daju 2/74, i da razlika NIJE slucajna. Sest osi
 * iznad su jedine koje sintetički dokument uopce krsi, a stvarni radovi padaju na jedanaest drugih
 * fixera. Dok generator te osi ne proizvodi, matrica pokrivenosti o njima ne moze imati dokaz:
 * izmjereno je 10.553 celije (profil x fixer) sa statusom `univerzalna-higijena-bez-dokaza`.
 *
 * NE ukljucuju se ovdje `consistency` ni `required-section`: izmjereno je da im je `params`
 * prazan po konstrukciji, pa bi ih closed-loop prijavio kao neuspjeh popravka, a rijec je o
 * stavci koja po ugovoru ceka ljudsku potvrdu. Vidi
 * `docs/superpowers/specs/2026-08-29-prazni-asistirani-fixeri.md`.
 */
import { buildDocx, type DocSpec, type ParaSpec } from './docx-builder';
import { paramsForCheck } from '../../src/ui/repair-items';

/** Osi koje profilna grana popravka pokriva; sve ostalo ovaj generator namjerno ne dira. */
export const VIOLATABLE_CHECK_IDS = ['font', 'font-size', 'line-spacing', 'justify', 'margins', 'paper-size'] as const;
export type ViolatableCheckId = (typeof VIOLATABLE_CHECK_IDS)[number];

/**
 * Strukturne osi (opt-in). Nisu `checkId`-jevi koje `paramsForCheck` poznaje, nego stanja
 * dokumenta koja aktiviraju univerzalne fixere:
 *
 * - `toc-field`       odlomak "Sadrzaj" postoji, ali NIJE zivo Word polje -> `toc-field-fixer`.
 *                     Trazi `profile.requireToc === true` (11 od 13 FPZG profila to ima).
 * - `empty-paragraphs` prazni odlomci (`<w:p/>`, Wordov goli Enter) -> `empty-paragraph-fixer`.
 *                     Univerzalna higijena, ne trazi nijedno pravilo profila.
 * - `croatian-typography` dvostruki razmaci i izostao razmak iza recenicnog znaka ->
 *                     `croatian-typography-fixer`. Univerzalna, i dokazano ziva: promijenila je 57
 *                     od 74 stvarna FPZG rada.
 * - `link-doi`        goli DOI bez kanonskog oblika i bez hiperveze -> `link-doi-fixer`.
 *                     Univerzalna; na stvarnim FPZG radovima promijenila 14 od 74.
 * - `heading-style`   odlomci koji IZGLEDAJU kao naslovi (numeriran prefiks, podebljano, veci
 *                     font) ali nemaju Word Heading stil -> `heading-style-fixer`. Univerzalna.
 *
 * Zasto bas univerzalne: izmjereno je da su PROFILNE strukturne osi tanke (`footnoteFont` ima 50
 * profila od 407, `headingRules` 21, ostale 4 do 12), dok univerzalni fixer vrijedi za svih 407,
 * pa jedna os zatvara 407 celija matrice umjesto desetak.
 */
export const STRUCTURAL_VIOLATION_IDS = [
  'toc-field',
  'empty-paragraphs',
  'croatian-typography',
  'link-doi',
  'heading-style',
] as const;
export type StructuralViolationId = (typeof STRUCTURAL_VIOLATION_IDS)[number];

export type AnyViolationId = ViolatableCheckId | StructuralViolationId;

export interface ViolationOptions {
  /**
   * Ukljuci strukturne osi. `false` (default) drzi postojeci closed-loop bajt-identicnim, `true`
   * ukljucuje sve, a POPIS ukljucuje samo navedene.
   *
   * Popis nije udobnost nego uvjet ispravnog mjerenja: kad sve osi idu zajedno, dokument nosi i
   * prazne odlomke, pa se indeksi odlomaka pomicu i pad jedne osi se ne moze pripisati njoj samoj.
   * Izmjereno: `link-doi` na punom skupu vraca `unsupported-structure`, a treba znati je li uzrok
   * sam DOI ili susjedstvo.
   */
  structural?: boolean | readonly StructuralViolationId[];
}

/** Je li os ukljucena za ovaj poziv? */
function wants(option: ViolationOptions['structural'], id: StructuralViolationId): boolean {
  if (option === true) return true;
  if (!option) return false;
  return option.includes(id);
}

export interface ViolationResult {
  bytes: Uint8Array;
  /** Osi koje dokument doista krsi; prazno znaci da profil nema nijedno takvo pravilo. */
  violated: AnyViolationId[];
  /** Ciljane vrijednosti profila, radi citljivih poruka u testu. */
  targets: Partial<Record<ViolatableCheckId, Record<string, unknown>>>;
}

/** Font razlicit od ciljanog; dvije opcije da izbor nikad ne bude jednak cilju. */
function otherFont(target: string): string {
  return /times/i.test(target) ? 'Arial' : 'Times New Roman';
}

/**
 * Velicina razlicita od ciljane, ali UNUTAR tolerancije deep ciscenja (+-3 polutocke).
 *
 * Ovo NIJE proizvoljno: `stripDirectFormatting` namjerno CUVA izravnu velicinu koja je izvan
 * tolerancije, jer 10 pt uz cilj 12 pt vjerojatnije je potpis ispod slike nego greska
 * (src/repair/run-level.test.ts: "namjerno sitniji tekst ... ostaje"). Prvi generator je birao
 * cilj minus 2 pt i time modelirao tocno taj cuvan slucaj, pa je izgledalo kao da popravak ne radi.
 * Jedan pt razlike je stvarna pogreska oblikovanja i unutar je tolerancije.
 */
function otherSizePt(target: number): number {
  return target + 1;
}

function otherSpacing(target: number): number {
  // 240-tine tocke: 1,0 = 240. Biramo prored koji sigurno nije ciljani.
  return Math.abs(target - 1.5) < 0.01 ? 240 : 360;
}

function otherAlign(target: string): ParaSpec['jc'] {
  return target === 'both' ? 'left' : 'both';
}

/**
 * Gradi dokument koji krsi svaku os koju profil propisuje.
 *
 * Vraca i popis prekrsenih osi: bez njega test ne moze razlikovati "popravak nije uspio" od
 * "profil to pravilo nema", sto je razlika izmedju kvara i urednog stanja.
 */
export async function buildViolatingDocx(
  profile: unknown,
  options: ViolationOptions = {},
): Promise<ViolationResult> {
  const targets: ViolationResult['targets'] = {};
  for (const checkId of VIOLATABLE_CHECK_IDS) {
    const params = paramsForCheck(checkId, profile);
    if (params) targets[checkId] = params;
  }

  const fontTarget = targets['font']?.fontName as string | undefined;
  const sizeTarget = targets['font-size']?.fontSizePt as number | undefined;
  const spacingTarget = targets['line-spacing']?.multiplier as number | undefined;
  const alignTarget = targets['justify']?.val as string | undefined;
  const marginsTarget = targets['margins'] as { top: number; right: number; bottom: number; left: number } | undefined;
  const paperTarget = targets['paper-size'] as { w: number; h: number } | undefined;

  const violated: AnyViolationId[] = [];
  const para: ParaSpec = {
    text:
      'Ovaj odlomak postoji da bi analiza imala tijelo rada nad kojim mjeri oblikovanje. ' +
      'Tekst se popravkom ne smije promijeniti, pa sluzi i kao kontrola ocuvanja sadrzaja.',
  };

  if (fontTarget) {
    para.font = otherFont(fontTarget);
    violated.push('font');
  }
  if (sizeTarget != null) {
    para.sizePt = otherSizePt(sizeTarget);
    violated.push('font-size');
  }
  if (spacingTarget != null) {
    para.spacingLine = otherSpacing(spacingTarget);
    violated.push('line-spacing');
  }
  if (alignTarget) {
    para.jc = otherAlign(alignTarget);
    violated.push('justify');
  }

  /**
   * Stilovi nose CILJANE vrijednosti profila, a odlomci ih krse IZRAVNIM oblikovanjem.
   *
   * To nije proizvoljan izbor nego jedini realan: Word upravo tako pise dokumente (predlozak u
   * stilu, autorovo formatiranje izravno preko njega), i tocno na to cilja "deep" preklopnik, koji
   * je u sucelju ukljucen po zadanom. Bez backstopa u stilu deep ciscenje NE SMIJE ukloniti izravno
   * oblikovanje, jer bi promijenilo izgled u nesto neodredjeno - izmjereno: bez `Normal` stila s
   * proredom i poravnanjem, prored i poravnanje ostaju neprimijenjeni koliko god puta popravak
   * izvrtio.
   */
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const normalPPr: string[] = [];
  if (spacingTarget != null) normalPPr.push(`<w:spacing w:line="${Math.round(spacingTarget * 240)}" w:lineRule="auto"/>`);
  if (alignTarget) normalPPr.push(`<w:jc w:val="${alignTarget}"/>`);
  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:styles ${W}>` +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    `<w:rFonts w:ascii="${fontTarget ?? 'Times New Roman'}" w:hAnsi="${fontTarget ?? 'Times New Roman'}"/>` +
    `<w:sz w:val="${Math.round((sizeTarget ?? 12) * 2)}"/>` +
    '</w:rPr></w:rPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
    (normalPPr.length ? `<w:pPr>${normalPPr.join('')}</w:pPr>` : '') +
    '</w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>' +
    '</w:styles>';

  const paragraphs: ParaSpec[] = [
    { text: 'Uvod', styleId: 'Heading1' },
    para,
    { ...para, text: 'Drugi odlomak tijela rada, istog pogresnog oblikovanja kao prvi.' },
  ];

  const structural = options.structural;
  if (structural) {
    /**
     * `toc-field`: odlomak "Sadrzaj" mora biti na indeksu >= 1 (`tocFieldItem` odbija indeks 0),
     * i dokument ne smije imati zivo TOC polje. Zato ide IZA naslovnickog odlomka, a stavke
     * sadrzaja se NE upisuju: upravo njihov izostanak je stanje koje `toc-field-fixer` popravlja.
     * Naslov "Uvod" ispod njega daje polju sto indeksirati.
     */
    if (wants(structural, 'toc-field') && (profile as { requireToc?: unknown } | null)?.requireToc === true) {
      paragraphs.unshift({ text: 'Naslov rada' }, { text: 'Sadrzaj', styleId: 'Heading1' });
      violated.push('toc-field');
    }

    /**
     * `empty-paragraphs`: `{ empty: true }` emitira childless `<w:p/>`, dakle tocno ono sto Word
     * zapise na goli Enter. Dva uzastopna, jer jedan prazan odlomak izmedju odlomaka nije nalaz
     * nego uobicajen razmak; nalaz je nakupina.
     */
    /**
     * `empty-paragraphs`: dva NIZA praznih odlomaka usred pristojno dugog tijela rada.
     *
     * Oblik nije proizvoljan, nego izveden iz dva ugovora koja se sudaraju:
     *
     *   nalaz opali tek kad prazni odlomci cine >=18% dokumenta,
     *   a `empty-paragraph-fixer` NAMJERNO zadrzava po jedan razmak iz svakog niza.
     *
     * IZMJERENO 2026-08-30 na prijasnjem obliku (dva prazna odlomka, tijelo od cetiri): prije
     * popravka 2 od 6 (33%), poslije 1 od 5 (20%), dakle i dalje iznad praga, pa se petlja nikad
     * nije zatvarala. Uz sve osi je bilo jos gore: 2 od 12 (17%) znaci da se fixer ne bi ni
     * ponudio, pa je test prolazio samo dok je dokument slucajno bio prave velicine.
     *
     * Tijelo se zato produljuje: jedan zaostao razmak u dovoljno dugom radu pada ispod praga, sto
     * je i realnije od cetiri odlomka. Prag se NE mijenja; mijenja se dokument, jer je prag bio
     * tocan a dokument nereprezentativan.
     */
    if (wants(structural, 'empty-paragraphs')) {
      for (let i = 1; i <= 6; i += 1) {
        paragraphs.push({ ...para, text: `Odlomak tijela rada broj ${i}, dovoljne duljine da dokument bude reprezentativan.` });
      }
      paragraphs.push({ empty: true }, { empty: true }, { empty: true });
      paragraphs.push({ ...para, text: 'Odlomak izmedju dva niza praznih odlomaka.' });
      paragraphs.push({ empty: true }, { empty: true }, { empty: true });
      paragraphs.push({ ...para, text: 'Zakljucni odlomak tijela rada.' });
      violated.push('empty-paragraphs');
    }

    /**
     * `croatian-typography`: dva nalaza visoke pouzdanosti, koja se zato PREDODABIRU i cine
     * `params` nepraznima (za razliku od `consistency`, gdje su svi odabiri tvrdo `false`).
     * Dvostruki razmak i izostao razmak iza tocke su mehanika sloga, ne sadrzaj, pa ovaj zahvat
     * ostaje unutar tvrdog pravila o nediranju argumentacije.
     */
    if (wants(structural, 'croatian-typography')) {
      paragraphs.push({
        ...para,
        text: 'Ovaj  odlomak ima dvostruki razmak i recenicu bez razmaka iza tocke.Sljedeca recenica pocinje odmah.',
      });
      violated.push('croatian-typography');
    }

    /**
     * `link-doi`: goli DOI u tekstu, bez kanonskog `https://doi.org/` oblika i bez hiperveze.
     * Kanonizacija DOI-ja je jedan od cetiri popravka koji SMIJU mijenjati vidljiv tekst, i to
     * je namjerno: DOI je identifikator, ne autorova recenica.
     */
    if (wants(structural, 'link-doi')) {
      paragraphs.push({ ...para, text: 'Izvor je dostupan pod doi:10.1234/lekta.2026.001 u repozitoriju.' });
      violated.push('link-doi');
    }

    /**
     * `heading-style`: rucno oblikovan naslov bez Word Heading stila.
     *
     * Bodovanje kandidata (`src/analysis/heading-structure.ts`) trazi 7 bodova za `high`, a `high`
     * je uvjet za `selectedByDefault`. Ovdje se skuplja 11: numeriran prefiks (+5), kratak odlomak
     * (+2), vecina teksta podebljana (+2) i font veci od dominantnog (+2). Rezerva je namjerna, da
     * os ne postane osjetljiva na sitnu promjenu praga.
     *
     * Naslov NE dobiva `styleId`, jer je upravo izostanak Heading stila ono sto se krsi: takav
     * odlomak Word ne vidi kao naslov, pa ne ulazi ni u sadrzaj ni u navigaciju.
     */
    if (wants(structural, 'heading-style')) {
      paragraphs.push({
        ...para,
        text: '3. Rezultati istrazivanja',
        bold: true,
        sizePt: (sizeTarget ?? 12) + 2,
      });
      paragraphs.push({ ...para, text: 'Odlomak tijela ispod rucno oblikovanog naslova.' });
      violated.push('heading-style');
    }
  }

  const spec: DocSpec = { stylesXml, paragraphs };

  if (marginsTarget) {
    // Margine pomaknute za 1 cm od ciljanih, u smjeru koji nikad ne izlazi iz razumnog raspona.
    spec.marginsCm = {
      top: marginsTarget.top + 1,
      right: marginsTarget.right + 1,
      bottom: marginsTarget.bottom + 1,
      left: marginsTarget.left + 1,
    };
    violated.push('margins');
  }
  if (paperTarget) {
    // Letter umjesto ciljanog formata (ili A5 ako je cilj bas Letter-ove dimenzije).
    const isLetter = Math.abs(paperTarget.w - 21.59) < 0.1;
    spec.pageCm = isLetter ? { w: 14.8, h: 21.0 } : { w: 21.59, h: 27.94 };
    violated.push('paper-size');
  }

  return { bytes: await buildDocx(spec), violated, targets };
}
