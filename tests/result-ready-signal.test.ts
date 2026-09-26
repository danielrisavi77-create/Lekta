import { describe, it, expect, beforeEach } from 'vitest';
import {
  RESULT_READY_ATTR,
  beginResultRender,
  settleResultRender,
  resultRenderSettled,
  settleResultRenderAfter,
} from '../src/ui/result-ready-signal';

/**
 * SIGNAL SPREMNOSTI EKRANA REZULTATA.
 *
 * Ugovor koji se ovdje mjeri je jedina stvar zbog koje signal postoji: `data-result-ready="1"`
 * smije se pojaviti TEK kad je zadnji korak crtanja gotov, i to samo za crtanje koje je jos
 * aktualno. Bez druge tvrdnje bi prva bila vakuumska, jer bi je zadovoljio i kod koji atribut
 * postavi odmah.
 *
 * MUTACIJE (izvedene, ne opisane):
 *  1. u `settleResultRender` maknuta provjera `zeton !== _zadnjiZeton` -> pada tvrdnja da
 *     zastarjelo crtanje ne objavljuje spremnost;
 *  2. u `beginResultRender` maknuto gasenje atributa -> pada tvrdnja da drugo crtanje vraca
 *     ekran u stanje "nije spremno".
 */
function postaviEkran(): Document {
  document.body.innerHTML = '<div id="resultView"></div>';
  return document;
}

describe('signal spremnosti ekrana rezultata', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('pocetak crtanja gasi signal, a zavrsetak ga pali', () => {
    const doc = postaviEkran();
    const zeton = beginResultRender(doc);
    expect(doc.getElementById('resultView')?.getAttribute(RESULT_READY_ATTR)).toBe('0');
    expect(resultRenderSettled(doc), 'ekran ne smije biti spreman dok crtanje traje').toBe(false);

    expect(settleResultRender(doc, zeton)).toBe(true);
    expect(doc.getElementById('resultView')?.getAttribute(RESULT_READY_ATTR)).toBe('1');
    expect(resultRenderSettled(doc)).toBe(true);
  });

  it('zavrsetak ZASTARJELOG crtanja ne objavljuje spremnost', () => {
    const doc = postaviEkran();
    const stari = beginResultRender(doc);
    const novi = beginResultRender(doc);
    expect(novi).not.toBe(stari);

    // Sentinel: drugo crtanje je stvarno vratilo ekran u "nije spremno"; bez toga bi tvrdnja
    // ispod prolazila i nad ekranom koji nikad nije ni bio oznacen kao spreman.
    expect(doc.getElementById('resultView')?.getAttribute(RESULT_READY_ATTR)).toBe('0');

    expect(settleResultRender(doc, stari), 'zastarjelo crtanje ne smije objaviti spremnost').toBe(false);
    expect(resultRenderSettled(doc)).toBe(false);

    expect(settleResultRender(doc, novi)).toBe(true);
    expect(resultRenderSettled(doc)).toBe(true);
  });

  it('bez #resultView ne tvrdi nista', () => {
    document.body.innerHTML = '<div id="nesto-drugo"></div>';
    const zeton = beginResultRender(document);
    expect(settleResultRender(document, zeton)).toBe(false);
    expect(resultRenderSettled(document)).toBe(false);
  });

  it('nevaljan zeton ne pali signal', () => {
    const doc = postaviEkran();
    beginResultRender(doc);
    expect(settleResultRender(doc, 0)).toBe(false);
    expect(settleResultRender(doc, -1)).toBe(false);
    expect(resultRenderSettled(doc)).toBe(false);
  });
});

/**
 * `settleResultRenderAfter`: kraj `renderSubmissionChecklist` u `app.ts` (izdvojeno radi ratcheta).
 *
 * MUTACIJE (izvedene 2026-09-26, svaka je srusila barem jednu tvrdnju ispod):
 *  3. objava odmah umjesto u `.finally` lanca -> pada "ne objavljuje prije kraja lanca";
 *  4. zeton se cita u `.finally` umjesto prije pokretanja lanca -> pada "zastarjeli lanac";
 *  5. grana bez lanca ne objavljuje -> pada "preskok gradnje je zavrsetak crtanja";
 *  6. dokument se cita pri pozivu umjesto pri objavi -> pada "dokument se cita pri objavi".
 */
function odgodjeno(): { obecanje: Promise<void>; razrijesi: () => void } {
  let razrijesi: () => void = () => {};
  const obecanje = new Promise<void>((r) => { razrijesi = r; });
  return { obecanje, razrijesi };
}

async function isprazniMikrozadatke(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('settleResultRenderAfter: objava na kraju repair lanca', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('preskok gradnje (bez lanca) je zavrsetak crtanja i objavljuje odmah', () => {
    const doc = postaviEkran();
    beginResultRender(doc);
    expect(resultRenderSettled(doc), 'sentinel: prije objave ekran nije spreman').toBe(false);
    settleResultRenderAfter(() => doc, null);
    expect(resultRenderSettled(doc)).toBe(true);
  });

  it('ne objavljuje prije kraja lanca, a objavljuje cim lanac zavrsi', async () => {
    const doc = postaviEkran();
    beginResultRender(doc);
    const d = odgodjeno();
    let pokrenut = 0;
    settleResultRenderAfter(() => doc, () => { pokrenut += 1; return d.obecanje; });
    expect(pokrenut, 'lanac se pokrece tocno jednom i odmah').toBe(1);
    await isprazniMikrozadatke();
    expect(resultRenderSettled(doc), 'lanac jos traje, ekran ne smije biti spreman').toBe(false);
    d.razrijesi();
    await isprazniMikrozadatke();
    expect(resultRenderSettled(doc)).toBe(true);
  });

  it('zastarjeli lanac ne objavljuje spremnost novog crtanja', async () => {
    const doc = postaviEkran();
    beginResultRender(doc);
    const stari = odgodjeno();
    settleResultRenderAfter(() => doc, () => stari.obecanje);
    beginResultRender(doc);
    stari.razrijesi();
    await isprazniMikrozadatke();
    expect(resultRenderSettled(doc), 'stari lanac je zavrsio nakon novog pocetka crtanja').toBe(false);

    // Sentinel: novo crtanje i dalje moze objaviti, dakle gornja tvrdnja nije vakuumska.
    settleResultRenderAfter(() => doc, null);
    expect(resultRenderSettled(doc)).toBe(true);
  });

  it('dokument se cita pri objavi, ne pri pozivu', async () => {
    const prvi = postaviEkran();
    const drugi = document.implementation.createHTMLDocument('drugi');
    drugi.body.innerHTML = '<div id="resultView"></div>';
    beginResultRender(prvi);
    let trenutni: Document = prvi;
    const d = odgodjeno();
    settleResultRenderAfter(() => trenutni, () => d.obecanje);
    trenutni = drugi;
    d.razrijesi();
    await isprazniMikrozadatke();
    expect(resultRenderSettled(drugi)).toBe(true);
    expect(resultRenderSettled(prvi)).toBe(false);
  });
});
