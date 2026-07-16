/**
 * Sinteticki golden korpus (CLAUDE.md golden harness, trajni regresijski net).
 *
 * Ovaj projekt NIKAD nece imati prave studentske .docx (nema ih i nece ih biti), pa
 * golden zastita pociva na DETERMINISTICKOM sintetickom korpusu: kontrolirani .docx
 * gradeni u memoriji (helpers/docx-builder), provuceni kroz pravi analyzeFixture, pa
 * snimljen stabilan projekt rezultata (helpers/golden-normalize) kao snapshot.
 *
 * Svrha je ista kao kod realnih fixtura: PRIJE refaktora enginea (faza B porta) snimi
 * baseline; refaktor je gotov tek kad se snapshoti NE mijenjaju (inace regresija).
 *
 * Pokrivenost: docx-builder sada emitira word/footnotes.xml, pa je Legal Citation Engine
 * (fusnote, op. cit., Ibid., propisi, sudska praksa, bibliografija) POKRIVEN case-om
 * "pravo-integrirani-fusnote" (pravoLegalSpec ispod). Njegov snapshot je baseline koji
 * cuva engine: refaktor legal-citation koda koji promijeni izlaz obara ovaj test.
 *
 * Sinteticki dokumenti nisu pravi radovi ni izvor pravila (CLAUDE.md).
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec, type DocSpec } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { normalizeResult } from './helpers/golden-normalize';

const TNR = 'Times New Roman';

/** Ispravno oblikovano tijelo teksta zeljene grube duljine u rijecima. */
function body(words: number): ParaSpec[] {
  const sentence = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. '; // 10 rijeci
  const out: ParaSpec[] = [];
  for (let count = 0; count < words; count += 60) {
    out.push({ text: sentence.repeat(6), font: TNR, sizePt: 12, jc: 'both', spacing15: true });
  }
  return out;
}

const head = (text: string): ParaSpec => ({ text, font: TNR, sizePt: 12, styleId: 'Heading1' });
const line = (text: string): ParaSpec => ({ text, font: TNR, sizePt: 12, jc: 'both' });

/** FPZG struktura zavrsnog/diplomskog rada zadane duljine. */
function fpzgWork(words: number): ParaSpec[] {
  return [
    head('Sažetak'),
    line('Ovo je sažetak rada u jednom odlomku, bez citatnica.'),
    line('Ključne riječi: politologija, analiza, metoda'),
    head('Sadržaj'),
    head('1. Uvod'),
    ...body(Math.round(words * 0.15)),
    head('2. Razrada'),
    ...body(Math.round(words * 0.7)),
    head('3. Zaključak'),
    ...body(Math.round(words * 0.15)),
    head('Literatura'),
    line('Kasapović, M. (2014). Politološki pojmovi. Zagreb: Fakultet političkih znanosti.'),
  ];
}

/** Pravo integrirani diplomski: struktura s izjavom o izvornosti i pravnom bibliografijom. */
function pravoWork(): ParaSpec[] {
  return [
    head('Izjava o izvornosti'),
    line('Izjavljujem da je ovaj rad rezultat mojega samostalnog rada.'),
    head('Sadržaj'),
    head('1. Uvod'),
    ...body(700),
    head('2. Razrada'),
    ...body(2400),
    head('3. Zaključak'),
    ...body(500),
    head('Izvori i literatura'),
    line('Horvat, M., Rimsko pravo, Pravni fakultet Sveučilišta u Zagrebu, Zagreb, 1998.'),
    line('Zakon o obveznim odnosima, Narodne novine, br. 35/05, 41/08, 125/11.'),
  ];
}

/** Pravo integrirani s pravnim fusnotama: tjera Legal Citation Engine (op. cit., Ibid., propisi, sudska praksa, bibliografija). */
function pravoLegalSpec(): DocSpec {
  return {
    paragraphs: [
      head('Izjava o izvornosti'),
      line('Izjavljujem da je ovaj rad rezultat mojega samostalnog rada.'),
      head('Sadržaj'),
      head('1. Uvod'),
      ...body(500),
      head('2. Razrada'),
      ...body(1800),
      head('3. Zaključak'),
      ...body(400),
      head('Izvori i literatura'),
      line('Horvat, M., Rimsko pravo, Pravni fakultet Sveučilišta u Zagrebu, Zagreb, 1998.'),
      line('Apostolova Maršavelski, M., O problemu porijekla rimske hipoteke, Zbornik Pravnog fakulteta u Zagrebu, vol. 24, br. 1, 1974., str. 345-361.'),
      line('Zakon o obveznim odnosima, Narodne novine, br. 35/05, 41/08, 125/11.'),
    ],
    footnotes: [
      'Horvat, M., Rimsko pravo, Pravni fakultet Sveučilišta u Zagrebu, Zagreb, 1998., str. 55.',
      'Ibid., str. 74.',
      'Horvat, M., op. cit. u bilj. 1, str. 65.',
      'Zakon o obveznim odnosima (dalje u tekstu: ZOO), Narodne novine, br. 35/05, 41/08.',
      'Čl. 15. ZOO-a.',
      'Apostolova Maršavelski, M., O problemu porijekla rimske hipoteke, Zbornik Pravnog fakulteta u Zagrebu, vol. 24, br. 1, 1974., str. 351.',
      'VSRH, Rev 876/2006-2 od 10. siječnja 2007.',
    ],
  };
}

interface CorpusItem {
  name: string;
  profileId: string;
  spec: DocSpec;
}

/** Deterministicki korpus: FPZG zavrsni/diplomski/doktorski + Pravo, uskladjeni i jedan ne. */
const CORPUS: CorpusItem[] = [
  {
    name: 'fpzg-zavrsni-uskladjen',
    profileId: 'fpzg-politologija-zavrsni',
    spec: { paragraphs: fpzgWork(5700) },
  },
  {
    name: 'fpzg-zavrsni-neuskladjen',
    profileId: 'fpzg-politologija-zavrsni',
    spec: {
      paragraphs: [
        { text: 'Naslov rada bez ostalih dijelova', font: 'Arial', sizePt: 14, jc: 'left' },
        ...Array.from({ length: 4 }, () => ({
          text: 'Kratak tekst koji nije akademski strukturiran niti dovoljno dug.',
          font: 'Arial',
          sizePt: 14,
          jc: 'left' as const,
        })),
      ],
      pageCm: { w: 14.8, h: 21.0 },
      marginsCm: { top: 4, right: 4, bottom: 4, left: 4 },
    },
  },
  {
    name: 'fpzg-diplomski-uskladjen',
    profileId: 'fpzg-politologija-diplomski',
    spec: { paragraphs: fpzgWork(11000) },
  },
  {
    name: 'fpzg-doktorski-margine',
    profileId: 'fpzg-doktorski-politologija',
    spec: {
      paragraphs: [...fpzgWork(2000), head('Životopis'), line('Autor je objavio nekoliko radova.')],
      marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
    },
  },
  {
    name: 'pravo-integrirani-struktura',
    profileId: 'pravo-integrirani-diplomski',
    spec: { paragraphs: pravoWork() },
  },
  {
    name: 'pravo-integrirani-fusnote',
    profileId: 'pravo-integrirani-diplomski',
    spec: pravoLegalSpec(),
  },
];

describe('Sinteticki golden korpus (stabilan rezultat enginea)', () => {
  for (const item of CORPUS) {
    it(`stabilan rezultat: ${item.name}`, async () => {
      const file = buildDocxFile(item.spec, `${item.name}.docx`);
      const result = await analyzeFixture(file, { profileId: item.profileId });
      expect(normalizeResult(result)).toMatchSnapshot();
    });
  }
});
