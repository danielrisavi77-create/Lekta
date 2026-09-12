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
 * NE ukljucuje se ovdje `consistency`: izmjereno je da mu je `params` prazan po konstrukciji, pa
 * bi ga closed-loop prijavio kao neuspjeh popravka, a rijec je o stavci koja po ugovoru ceka
 * ljudsku potvrdu. Vidi `docs/superpowers/specs/2026-08-29-prazni-asistirani-fixeri.md`.
 *
 * `required-section` je 2026-08-30 UKLJUCEN, jer je razlog iskljucenja bio kvar koji je u
 * medjuvremenu popravljen: predodabir je trazio `confidence === 'high'`, a analiza nedostajucem
 * dijelu po konstrukciji daje `medium`, pa je uvjet bio neispunjiv i `params` uvijek prazan.
 * Uz to je fixer u punom lancu padao na `stale-anchor`. Oboje je popravljeno i izmjereno; njegova
 * provjera `structure.sections.profile` je BODOVANA (max 7), pa os moze nositi dokaz `resolved`,
 * a ne samo `applied`.
 */
import { buildDocx, type DocSpec, type ParaSpec } from './docx-builder';
import { paramsForCheck } from '../../src/ui/repair-items';
import { isHeadingParagraph, missingRequiredSectionLabels, type RequiredSectionProfileEntry, type RequiredSectionRules } from '../../src/analysis/required-sections-structure';

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
 * - `required-section` obvezni dio koji profil propisuje, a dokument ga NEMA ->
 *                     `required-section-fixer`. Jedina os koja se krsi IZOSTANKOM: generator ne
 *                     dodaje nista, nego imenuje ono cega nema. Zato se deklarira samo kad je
 *                     provjereno da profil taj dio doista propisuje i da ga generirani dokument
 *                     ne sadrzi.
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
  'revision-metadata',
  'element-caption',
  'field-integrity',
  'heading-format',
  'bibliography',
  'paragraph-spacing',
  'footnote-spacing',
  /** Krsi se SAMO u paginiranoj inacici (`pageNumberFooter`), nikad u zadanoj. */
  'page-number-alignment',
] as const;
export type StructuralViolationId = (typeof STRUCTURAL_VIOLATION_IDS)[number];

export type AnyViolationId = ViolatableCheckId | StructuralViolationId;

/** Oblik `headingRules` koliko ovom generatoru treba; profil ih nosi u naslijedjenom `rules`. */
interface HeadingRulesShape {
  size?: unknown;
  align?: string;
  maxLevel?: unknown;
  levels?: Record<string, { uppercase?: boolean; bold?: boolean; italic?: boolean } | undefined>;
}

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
  /**
   * DRUGA INACICA dokumenta: paginiran primjerak s podnozjem i brojem stranice.
   *
   * Zasto zasebna inacica, a ne jos jedna os. Pravila o broju stranice se po konstrukciji ne mogu
   * mjeriti na dokumentu koji broj stranice nema: `page.numbers.position` i `page.numbers.start` na
   * takvom dokumentu dolaze kao `max 0`, dakle nebodovane, pa im `isViolated` vraca `false` i
   * `page-numbering-fixer` se nikad ni ne ponudi.
   *
   * A podnozje se NE SMIJE dodati u zadani primjerak: `sectionInsertFixer` namjerno odbija dokument
   * koji vec ima podnozje, zaglavlje ili `titlePg` (`fixers.ts`, da umetanje markera ne ostavi
   * `titlePg` na glavnoj sekciji). Izmjereno 2026-09-09: uvijek-podnozje zamijeni 3 dokazane celije
   * `section-insert-fixera` za 3 nove, dakle nula.
   *
   * Zato dvije inacice istog profila: nepaginirana (zadana) i paginirana (ova). Poravnanje je KRIVO
   * kad ga profil propisuje, inace sredina.
   */
  pageNumberFooter?: boolean;
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
  const footnotes: NonNullable<DocSpec['footnotes']> = [];
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
  /**
   * Definicije naslovnih stilova; os `heading-format` ih PRESLOZI, pa se grade nize.
   *
   * Zadano ostaje tocno ono sto je ovdje stajalo prije: samo `Heading1`, bez oblikovanja. Time je
   * izlaz bez te osi bajt-identican starome.
   */
  let headingStyles = '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>';
  /**
   * Stil `FootnoteText` s KRIVIM razmakom; prazno kad se os ne krsi, pa je izlaz bajt-identican.
   *
   * Krsi se u DEFINICIJI STILA, ne izravnim oblikovanjem, jer `patchFootnoteTextSpacing` pise tocno
   * ondje (`patchNormalParagraphProps(stylesXml, 'FootnoteText', ...)`) i izricito NE izmislja stil
   * kojeg dokument nema. Izmjereno: uz izravno oblikovanje se stavka gradi, ulazi u zahtjeve i fixer
   * se pozove, a changelog ostane prazan. Isti razred kao os `heading-format`, gdje je prva izvedba
   * krsila izravno dok fixer pise u stil.
   */
  let footnoteStyle = '';

  const buildStyles = () =>
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:styles ${W}>` +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    `<w:rFonts w:ascii="${fontTarget ?? 'Times New Roman'}" w:hAnsi="${fontTarget ?? 'Times New Roman'}"/>` +
    `<w:sz w:val="${Math.round((sizeTarget ?? 12) * 2)}"/>` +
    '</w:rPr></w:rPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
    (normalPPr.length ? `<w:pPr>${normalPPr.join('')}</w:pPr>` : '') +
    '</w:style>' +
    headingStyles +
    footnoteStyle +
    '</w:styles>';

  const paragraphs: ParaSpec[] = [
    { text: 'Uvod', styleId: 'Heading1' },
    para,
    { ...para, text: 'Drugi odlomak tijela rada, istog pogresnog oblikovanja kao prvi.' },
  ];

  /** Mjesta na koja idu nizovi praznih odlomaka; broj se racuna tek kad je dokument gotov. */
  let emptyBurstAt: number[] | null = null;

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
      /**
       * NIZOVI PRAZNIH ODLOMAKA SE UMECU NA KRAJU, prema duljini gotovog dokumenta.
       *
       * Do 2026-09-09 su ovdje stajala dva fiksna niza po tri prazna odlomka, izracunata za tadasnju
       * duljinu. Prag nalaza je RAZMJERAN (>=18 posto dokumenta), pa je svaka nova os koja doda
       * odlomke razrjedjivala udio i gasila `empty-paragraph-fixer`. Izmjereno pri uvodjenju osi
       * `heading-format`: sest dodanih odlomaka srusilo je pokrivenost na 21 profilu, tri dodana na
       * sedam. Fiksan broj je time bio zajednicki resurs kojim raspolazu sve osi, a nitko ga nije
       * vodio.
       *
       * Zato se ovdje pamte samo MJESTA, a broj se racuna kad su svi ostali odlomci vec dodani.
       * Ostale osi umecu iskljucivo na kraj, pa zapamceni indeksi ostaju valjani.
       */
      emptyBurstAt = [paragraphs.length];
      paragraphs.push({ ...para, text: 'Odlomak izmedju dva niza praznih odlomaka.' });
      emptyBurstAt.push(paragraphs.length);
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
    /**
     * `paragraph-spacing`: odlomci tijela nose razmak PRIJE i POSLIJE, a profil trazi nulu.
     *
     * UVJETNA os: krsi se samo kad profil ima `checkParagraphSpacingZero === true`. Bez tog uvjeta
     * bi se `paragraph-spacing-fixer` nudio profilima koji razmak ne propisuju, sto je izmisljeno
     * pravilo, a upravo to tvrdo pravilo ovog repozitorija zabranjuje.
     *
     * ZASTO OS POSTOJI. Izmjereno 2026-09-09 nad `coverage-cells.json`: `paragraph-spacing-fixer`
     * je imao tri celije bez ijednog dokaza (`pravo-integrirani-diplomski`,
     * `pravo-javna-uprava-prijediplomski`, `pravo-javna-uprava-diplomski`). Uzrok nije bio kvar
     * fixera ni ugasena zastavica: `paragraphSpacingRepairableItem` stavku GRADI (zastavica je
     * `true` i u sirovom i u zivom profilu), ali joj upise `violated: false`, pa je
     * `buildAllRepairableItems` odbaci prije nego dodje do zahtjeva. Generator tu os nikad nije
     * krsio.
     *
     * Razmak se pise IZRAVNIM oblikovanjem, kao i ostale formatne osi: Word tako i pise dokumente,
     * a `deep` preklopnik cilja bas na to.
     */
    if (wants(structural, 'paragraph-spacing') && (profile as { checkParagraphSpacingZero?: unknown } | null)?.checkParagraphSpacingZero === true) {
      paragraphs.push({
        ...para,
        before: 6,
        after: 12,
        text:
          'Ovaj odlomak nosi razmak prije i poslije, iako fakultet trazi nulu. ' +
          'Popravak smije promijeniti razmak, ali ne i ovu recenicu.',
      });
      violated.push('paragraph-spacing');
    }

    /**
     * `footnote-spacing`: fusnota nosi razmak PRIJE i POSLIJE, a profil trazi nulu.
     *
     * UVJETNA os: krsi se samo uz `checkFootnoteParagraphSpacingZero === true` (izmjereno: 4 profila,
     * svi Pravo). Bez tog uvjeta bi se `footnote-spacing-fixer` nudio profilima koji razmak fusnote ne
     * propisuju, dakle po izmisljenom pravilu.
     *
     * FUSNOTA ODGOVARA PROFILU U SVEMU OSTALOM, i to je nuzno a ne uljudno: ta cetiri profila nose
     * `legalFootnoteProfile`, `footnoteFont`, `footnoteSize`, `footnoteSpacing`, `footnoteJustify` i
     * `footnoteEndPeriod`. Fusnota koja krsi vise od jedne osi pomijesala bi uzroke, a taj razred
     * sudara je u ovom generatoru vec dvaput oborio pokrivenost (prazni odlomci, naslovi).
     *
     * Oznaka fusnote ide u TIJELO (`w:footnoteReference`), jer bez nje analiza vidi datoteku fusnota
     * bez ijedne oznake, sto nije rad nego paket.
     */
    const fnSpacing = (profile as { checkFootnoteParagraphSpacingZero?: unknown } | null)?.checkFootnoteParagraphSpacingZero;
    if (wants(structural, 'footnote-spacing') && fnSpacing === true) {
      const fnFont = ((profile as { footnoteFont?: unknown[] } | null)?.footnoteFont ?? [])[0];
      const fnSize = ((profile as { footnoteSize?: unknown[] } | null)?.footnoteSize ?? [])[0];
      paragraphs.push({
        raw:
          // Oznaka ide IZA recenicnog znaka: profil to propisuje, a izmjereno je i obrnuto
          // ("1 uz pogresnu stranu zareza/tocke" kad je ispred), pa bi dokument krsio i tu os.
          '<w:p><w:r><w:t xml:space="preserve">Tvrdnja koja se potkrepljuje biljeskom.</w:t></w:r>' +
          '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/><w:vertAlign w:val="superscript"/></w:rPr>' +
          '<w:footnoteReference w:id="1"/></w:r></w:p>',
      });
      // Razmak ide u STIL (fixer pise ondje), ostalo u fusnotu, da se krsi TOCNO jedna os.
      footnoteStyle =
        '<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/>' +
        '<w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr></w:style>' +
        // Znakovni stil oznake: Word ga upise u svaki dokument s fusnotama, pa bez njega dokument
        // krsi i os polozaja oznake, a htjeli smo krsiti TOCNO jednu.
        '<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/>' +
        '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>';
      footnotes.push({
        text: 'Izvor uz tvrdnju iz tijela rada.',
        styleId: 'FootnoteText',
        ...(typeof fnFont === 'string' ? { font: fnFont } : {}),
        ...(typeof fnSize === 'number' ? { sizePt: fnSize } : {}),
        spacingLine: 240,
        jc: 'both',
      });
      violated.push('footnote-spacing');
    }

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
    /**
     * `revision-metadata`: Wordovi revizijski identifikatori (`w:rsid*`).
     *
     * Word ih pise u gotovo svaki odlomak, a generirani dokument ih dotad nije imao nijedan, pa
     * `final-document-inspector-fixer` na sintetickom dokumentu NIKAD nije imao sto raditi, iako je
     * na 74 od 74 stvarna FPZG rada promijenio dokument. Bez ove osi je matrica za njega imala 400
     * celija bez ijednog dokaza.
     *
     * Ide kroz `raw`, jer su rsid-ovi ATRIBUTI odlomka, a `ParaSpec` ih ne modelira. Detektor
     * (`src/analysis/final-document-inspector.ts`) trazi `\bw:rsid[A-Za-z]+=` i nalaz oznacava
     * `defaultSelected: true`, pa jedan odlomak dostaje kao dokaz.
     *
     * Uklanjanje rsid-ova NE dira vidljivi tekst: to je cista mehanika ispod, kao i polja i sidra.
     */
    if (wants(structural, 'revision-metadata')) {
      paragraphs.push({
        raw:
          '<w:p w:rsidR="00AB12CD" w:rsidRDefault="00AB12CD" w:rsidP="00AB12CD">' +
          '<w:r w:rsidR="00AB12CD"><w:t xml:space="preserve">Odlomak s Wordovim revizijskim oznakama.</w:t></w:r>' +
          '</w:p>',
      });
      violated.push('revision-metadata');
    }

    /**
     * `required-section`: krsi se IZOSTANKOM, pa generator ne dodaje nista.
     *
     * Deklarira se samo kad profil taj dio doista propisuje I kad ga ovaj dokument nema. Bez oba
     * uvjeta bila bi to tvrdnja bez pokrica: os koja se uvijek javi kao prekrsena je isti razred
     * kao dokaz koji se ne moze ne dogoditi.
     */
    if (wants(structural, 'required-section')) {
      /**
       * Ista logika koju izvodi ANALIZA (`missingRequiredSectionLabels`), a ne vlastita usporedba.
       *
       * Do 2026-08-31 je ovdje stajala doslovna jednakost cijelog odlomka, pa je os prijavljivala
       * prekrsaj i kad dio postoji: nije se filtriralo `required: false`, oznaka se nije mapirala u
       * `kind`, zanemarivali su se `terms`/`aliases` i oznaka pregazena preko `rules.labels`.
       * Jedan izvor istine uklanja sva cetiri smjera razilazenja odjednom.
       */
      const rules = (profile as { effectiveRules?: { requiredSections?: unknown; requiredSectionRules?: unknown }; requiredSections?: unknown; requiredSectionRules?: unknown } | null);
      const required = (rules?.effectiveRules?.requiredSections ?? rules?.requiredSections) as RequiredSectionProfileEntry[] | undefined;
      const sectionRules = (rules?.effectiveRules?.requiredSectionRules ?? rules?.requiredSectionRules) as RequiredSectionRules | undefined;
      // ISTA populacija koju gleda analiza: ona filtrira kroz `isHeading`, pa i ovdje idu samo
      // odlomci koji se po tekstu mogu smatrati naslovom. Bez toga su dva pozivatelja iste
      // funkcije davala suprotne presude nad istim dokumentom.
      /**
       * SVE TRI grane koje analiza koristi, ne samo tekstualna.
       *
       * `isHeading` je disjunkcija (razina naslova ILI stil naslova ILI tekstualna heuristika).
       * Prva izvedba je zrcalila samo trecu, pa je naslov sa stilom `Heading1` koji je dug ili
       * zavrsava tockom analiza brojala kao postojeci, a generator kao nedostajuci.
       */
      const headingTexts = paragraphs
        .filter((item) => isHeadingParagraph({
          text: String((item as { text?: unknown }).text ?? ''),
          styleId: (item as { styleId?: string }).styleId,
        }))
        .map((item) => String((item as { text?: unknown }).text ?? ''));
      if (missingRequiredSectionLabels(headingTexts, required, sectionRules).length) violated.push('required-section');
    }

    /**
     * `element-caption`: tablica s RUCNO prepisanim natpisom i unakrsnom uputom.
     *
     * Aktivira DVA fixera koji su dotad bili nedostizni: `element-caption-fixer` (natpis se veze na
     * element umjesto da broj bude prepisan rukom) i `table-figure-rescue-fixer` (geometrija
     * tablice). Oba su TRAJNE preporuke, jer `element-caption-rules` i `table-figure-rescue-rules`
     * nema nijedan od 407 profila, pa se dokaz za njih dobiva samo kroz prolaz preporuka.
     *
     * IZMJERENO 2026-08-31 zasto bas ovakav dokument: sama tablica daje
     * `elementCaptionRepairableItem` odgovor `no-target`; treba joj natpis koji ima sto pretvoriti u
     * polje. S natpisom oba fixera vracaju changelog 1.
     *
     * Ide kroz `raw`, jer `ParaSpec` ne modelira tablicu. Zahvati su geometrijski i vezni, pa
     * prolaze test vidljivog teksta: broj u natpisu ostaje isti, mijenja se to sto ga generira Word.
     */
    if (wants(structural, 'element-caption')) {
      const cell = (text: string) =>
        `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
      paragraphs.push({
        raw:
          '<w:tbl><w:tblPr><w:tblW w:w="4000" w:type="dxa"/></w:tblPr>' +
          `<w:tr>${cell('Godina')}${cell('Udio')}</w:tr>` +
          `<w:tr>${cell('2020')}${cell('12%')}</w:tr></w:tbl>`,
      });
      paragraphs.push({ ...para, text: 'Tablica 1. Udio po godinama' });
      paragraphs.push({ ...para, text: 'Kao sto pokazuje Tablica 1, udio raste.' });
      violated.push('element-caption');
    }

    /**
     * `field-integrity`: Wordovo polje (PAGE) u tijelu rada.
     *
     * `field-integrity-fixer` na stvarnim radovima mijenja 46 od 54 dokumenta, a na generiranom
     * nije mogao NISTA, jer generator nije pisao polja. Uz polje mu `analyzeFieldIntegrity` daje
     * metu i fixer joj upise `w:dirty="true"`, cime Word polje osvjezi pri otvaranju.
     *
     * OVA OS TRAZI I `settings: true` NA SPECU, i to nije kozmetika: fixer na kraju zahvata trazi
     * `word/settings.xml` da upise `w:updateFields`, a bez njega vraca `no-target` za CIJELI
     * zahtjev, ukljucujuci polja koja je vec uspjesno oznacio. Izmjereno A/B na istom dokumentu:
     * bez `settings.xml` changelog 0 uz `no-target`, s njim changelog 1.
     */
    if (wants(structural, 'field-integrity')) {
      paragraphs.push({
        raw:
          '<w:p><w:r><w:t xml:space="preserve">Stranica </w:t></w:r>' +
          '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>',
      });
      violated.push('field-integrity');
    }

    if (wants(structural, 'heading-style')) {
      /**
       * Oblik ovog naslova PRATI pravila profila kad ih profil ima, i to je ispravak iz 2026-09-09.
       *
       * Os krsi TOCNO JEDNU stvar: izostanak Word Heading stila. Do sada je uz to nosila i podebljanje
       * i vecu velicinu, sto na profilima s `headingRules` nije bilo nevino: `heading-style-fixer`
       * odlomak promakne u naslov, promaknuti naslov zadrzi svoje IZRAVNO oblikovanje, a ono nadjaca
       * stil koji je `heading-format-fixer` u istom prolazu ispravio. Izmjereno na
       * `vuka-poslovni-zavrsni`: 4 od 4 naslova odstupa prije, 1 od 5 poslije, pa je provjera ostala
       * pala i tri su profila pala iz `pass` u `partial`.
       *
       * To NIJE bio kvar popravka nego dvije osi koje se sudaraju, sto je upravo razlog zbog kojeg su
       * osi u ovom generatoru odvojene. Bodovanje kandidata i dalje prolazi: numeriran prefiks (+5),
       * kratak odlomak (+2) i podebljanje (+2) daju devet, uz prag sedam, i kad velicina odgovara
       * tijelu umjesto da je veca.
       */
      const hrStyle = (profile as { headingRules?: HeadingRulesShape } | null)?.headingRules;
      const razina3 = hrStyle?.levels?.['3'] ?? {};
      const velicina3 = (razina3 as { size?: unknown }).size ?? hrStyle?.size;
      paragraphs.push({
        ...para,
        text: '3. Rezultati istrazivanja',
        // Podebljanje ostaje: bez njega kandidat gubi dva boda, a profili ga ionako traze na 3. razini.
        bold: true,
        ...(hrStyle && razina3.italic === true ? { italic: true } : {}),
        sizePt: hrStyle && velicina3 != null ? Number(velicina3) : (sizeTarget ?? 12) + 2,
      });
      paragraphs.push({ ...para, text: 'Odlomak tijela ispod rucno oblikovanog naslova.' });
      violated.push('heading-style');
    }

    /**
     * `heading-format`: naslov IMA Word stil, ali mu oblikovanje proturjeci `headingRules` profila.
     *
     * Razlika prema `heading-style` je cijela poanta: ondje naslov nema stil, ovdje ga ima, pa je
     * jedini nalaz nesklad s propisanim oblikom. Zato se i ne mogu spojiti u jednu os.
     *
     * ZASTO OS POSTOJI. Izmjereno 2026-09-09 nad `coverage-cells.json`: `heading-format-fixer` nema
     * dokaza na 21 profilu, a `heading-case-fixer` na 12, i to su TOCNO svi profili koji
     * `headingRules` imaju, odnosno svi kojima neka razina trazi velika slova. Uzrok nije bio kvar
     * fixera nego to sto generator tu os nikad nije krsio; oba popravka vise o istoj provjeri
     * (`structure.heading.format`, vidi `heading-format-universal` i `heading-case-universal` u
     * `src/ui/repair-items.ts`), pa jedna os zatvara obje.
     *
     * Krsi se SAMO ono sto profil propisuje, i to po razinama: velika slova, podebljanje, kurziv,
     * velicina i poravnanje. Numeracija se drzi ISPRAVNOM (broj s tockom), jer je ona zasebna
     * provjera (`structure.heading.numbering`) i njezino bi krsenje pomijesalo dva nalaza.
     */
    /**
     * `bibliography`: popis literature s higijenskim nedostacima -> `bibliography-repair-fixer`.
     *
     * ZASTO OS POSTOJI. Izmjereno 2026-09-09: 20 celija tog fixera nema dokaza, i to na profilima
     * koji `bibliography-rules` DOISTA imaju. Uzrok nije kvar nego to sto generator nikad nije
     * proizveo popis literature: graditelj stavke trazi `bibliographyStructure.entries` neprazan, a
     * bez naslova "Literatura" i zapisa ispod njega analiza taj popis ne prepoznaje.
     *
     * Zapisi su namjerno u autor-godina obliku, jedan s golim DOI-jem koji treba kanonizirati i dva
     * koja se razlikuju samo sufiksom godine, jer su to higijenske promjene koje se predodabiru.
     * Tekst je izmisljen i nije ni iz jednog stvarnog rada.
     */
    if (wants(structural, 'bibliography')) {
      paragraphs.push({ text: 'Literatura', styleId: 'Heading1' });
      /**
       * REDOSLIJED JE NAMJERNO POKVAREN, i to je izmjereno, ne ukras.
       *
       * Prva izvedba je zapise nizala abecedno. Na `fpzg-politologija-zavrsni` je popravak svejedno
       * radio, jer tamosnje pravilo trazi i sufikse godina (`authorYearSuffixes`), pa je imao sto
       * ispraviti; na `unizd-turizam-zavrsni`, cije pravilo ima samo `sort`, nije bilo NIJEDNOG
       * zahtjeva, jer uredan popis nema sto popraviti. Os koja radi samo na dijelu profila je
       * poluprazna os.
       *
       * Sada popis krsi oboje: nije abecedan i ima dva zapisa istog autora i godine bez sufiksa.
       */
      for (const zapis of [
        'Cvitanic, P. (2019). Uvod u analizu dokumenata. Split: Naklada Treca.',
        'Babic, L. (2021). Oblikovanje akademskog teksta. Zagreb: Naklada Druga. doi:10.1234/lekta.2021.002',
        'Anic, M. (2020). Metodologija drustvenih istrazivanja. Zagreb: Naklada Prva.',
        'Babic, L. (2021). Norme i praksa citiranja. Zagreb: Naklada Druga.',
      ]) {
        paragraphs.push({ ...para, text: zapis });
      }
      violated.push('bibliography');
    }

    if (wants(structural, 'heading-format')) {
      const hr = (profile as { headingRules?: HeadingRulesShape } | null)?.headingRules;
      if (hr) {
        const razine = Math.min(Number(hr.maxLevel ?? 3) || 3, 3);
        /**
         * KRSI SE STIL, NE IZRAVNO OBLIKOVANJE, i to je izmjereno, ne izabrano.
         *
         * Prva izvedba je odstupanje pisala kao izravno oblikovanje odlomka. Popravak je uredno
         * radio i changelog je bio neprazan, ali se provjera nije vracala u prolaz: 4 od 4 naslova
         * odstupa prije, 3 od 4 poslije. Uzrok je bio dvostruk i oba su dijela bila MOJA:
         *
         *   1. `styles.xml` je definirao samo `Heading1`, a odlomci su nosili `Heading2`/`Heading3`,
         *      dakle stilove kojih u dokumentu nema;
         *   2. `heading-format-fixer` upisuje ciljani oblik U STIL, pa ga izravno oblikovanje
         *      odlomka nadjacava i nalaz ostaje.
         *
         * Stvarni dokument izgleda upravo ovako: predlozak nosi oblik naslova, autor ga ne dira
         * rucno. Zato odstupanje ide u definiciju stila, a odlomci ostaju bez izravnog oblikovanja.
         */
        const rPr: string[] = [];
        if (hr.size != null) rPr.push(`<w:sz w:val="${Math.round((Number(hr.size) + 2) * 2)}"/>`);
        const styles: string[] = [];
        for (let level = 1; level <= razine; level += 1) {
          const pravilo = hr.levels?.[String(level)] ?? {};
          // Podebljanje i kurziv se IZOSTAVLJAJU tocno ondje gdje ih profil trazi.
          const runPr = [...rPr].join('');
          const parPr = hr.align ? `<w:pPr><w:jc w:val="${hr.align === 'center' ? 'left' : 'center'}"/></w:pPr>` : '';
          styles.push(
            `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/>` +
              parPr +
              (runPr ? `<w:rPr>${runPr}</w:rPr>` : '') +
              '</w:style>',
          );
          void pravilo;
          paragraphs.push({
            // Numeracija ostaje ISPRAVNA; krsi se oblik, ne brojenje, jer je numeracija zasebna
            // provjera (`structure.heading.numbering`) i mijesanje bi dalo dva nalaza umjesto jednog.
            // Tekst je malim slovima, sto krsi `uppercase` ondje gdje ga profil trazi.
            text: `${level}. Naslov ${level}. razine`,
            styleId: `Heading${level}`,
          });
          /**
           * ODLOMAK TIJELA SE NE DODAJE, i to je izmjereno, ne stedljivost.
           *
           * Prva izvedba je uz svaki naslov dodavala i odlomak, dakle sest odlomaka ukupno. Time je
           * dokument narastao toliko da je udio praznih odlomaka pao ispod praga od 18 posto, pa
           * `empty-paragraph-fixer` vise nije ni opalio: matrica je IZGUBILA 21 pokrivenu celiju,
           * tocno na 21 profilu koji `headingRules` ima. Isti prag opisuje i os `empty-paragraphs`
           * nekoliko desetaka redaka iznad; ovo je druga strana istog kvara.
           *
           * Nova os zato dodaje samo naslove: provjera oblika naslova broji naslove, a tijelo joj
           * ne treba. Svaka buduca os koja dodaje odlomke mora ovo premjeriti, jer je prag zajednicki
           * resurs kojim raspolazu sve osi zajedno.
           */
        }
        headingStyles = styles.join('');
        violated.push('heading-format');
      }
    }
  }

  /**
   * `settings: true` ide uz strukturne osi, jer ga `field-integrity-fixer` trazi (vidi os
   * `field-integrity`). Word ga pise u svaki dokument, pa je i realnije; ostaje OPT-IN da izlaz
   * bez strukturnih osi ostane bajt-identican.
   */
  /**
   * Nizovi praznih odlomaka, dimenzionirani prema GOTOVOM dokumentu.
   *
   * Cilj je oko cetvrtine dokumenta, dakle udobno iznad praga od 18 posto, a nakon popravka ostaju
   * dva prazna odlomka (fixer namjerno cuva po jedan iz svakog niza), sto je kod ovako dugog tijela
   * daleko ispod praga. Umece se OD KRAJA prema pocetku, da prvi splice ne pomakne drugo mjesto.
   */
  if (emptyBurstAt) {
    const tijelo = paragraphs.length;
    const poNizu = Math.max(3, Math.ceil(tijelo / 6));
    for (const at of [...emptyBurstAt].sort((a, b) => b - a)) {
      paragraphs.splice(at, 0, ...Array.from({ length: poNizu }, () => ({ empty: true as const })));
    }
  }

  const spec: DocSpec = {
    stylesXml: buildStyles(),
    paragraphs,
    ...(footnotes.length ? { footnotes } : {}),
    ...(structural ? { settings: true as const } : {}),
  };

  /**
   * Paginirana inacica: podnozje s PAGE poljem. Poravnanje je krivo kad ga profil propisuje, pa os
   * polozaja broja stranice ima sto rijesiti; inace sredina, pa provjere postanu mjerljive a da se
   * nista ne krsi bez pravila.
   */
  if (options.pageNumberFooter) {
    const trazeno = (profile as { pageNumberAlignment?: unknown } | null)?.pageNumberAlignment;
    const align: 'left' | 'center' | 'right' =
      typeof trazeno === 'string' && trazeno ? (trazeno === 'right' ? 'left' : 'right') : 'center';
    spec.footer = { page: true, align };
    if (typeof trazeno === 'string' && trazeno) violated.push('page-number-alignment');
  }

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
