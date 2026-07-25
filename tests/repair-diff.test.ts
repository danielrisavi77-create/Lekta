// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { openRepairDiff, locateChanges } from '../src/ui/repair-diff';
import type { PreviewModel, PreviewParagraph } from '../src/preview/preview-anchors';

function para(index: number, text: string, extra: Partial<PreviewParagraph> = {}): PreviewParagraph {
  return { index, text, headingLevel: null, ...extra };
}
function model(paragraphs: PreviewParagraph[]): PreviewModel {
  return { paragraphs, truncated: false };
}

beforeEach(() => {
  document.body.innerHTML = '';
  // happy-dom nema scrollIntoView; skok na promjenu ga zove.
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

describe('locateChanges (re-export, ispravna semantika)', () => {
  it('obrisan odlomak je brisanje (after je null), ne lazna promjena na sljedecem', () => {
    const out = locateChanges(model([para(1, 'a'), para(2, ''), para(3, 'b')]), model([para(1, 'a'), para(2, 'b')]));
    expect(out).toHaveLength(1);
    expect(out[0].before).toBe(2);
    expect(out[0].after).toBeNull();
  });
});

describe('openRepairDiff', () => {
  const before = model([para(1, 'Uvod', { headingLevel: 1 }), para(2, 'tekst tijela'), para(3, '')]);
  const after = model([para(1, 'UVOD', { headingLevel: 1 }), para(2, 'tekst tijela')]);
  const changelog = [{ ruleId: 'font', beforeLabel: 'Arial 11', afterLabel: 'Times New Roman 12' }];

  it('otvara modal, prikazuje oblikovni changelog i prebacivac nacina', () => {
    openRepairDiff({ before, after, changelog });
    const modal = document.getElementById('repairDiff');
    expect(modal).not.toBeNull();
    expect(modal!.querySelector('.diff-changelog')).not.toBeNull();
    expect(modal!.textContent).toContain('Times New Roman 12');
    const tabs = modal!.querySelectorAll('.lekta-diff-modes .pv-mode');
    expect(tabs.length).toBe(2);
  });

  it('POPIS: promijenjeni naslov ima crveno "Uvod" (uklonjeno) i zeleno "UVOD" (dodano)', () => {
    openRepairDiff({ before, after, changelog });
    const modal = document.getElementById('repairDiff')!;
    (modal.querySelectorAll('.lekta-diff-modes .pv-mode')[0] as HTMLButtonElement).click(); // Popis
    const del = modal.querySelector('.lekta-diff-w--del');
    const ins = modal.querySelector('.lekta-diff-w--ins');
    expect(del?.textContent).toBe('Uvod');
    expect(ins?.textContent).toBe('UVOD');
    // Obrisani prazni odlomak je zaseban redak "Uklonjeno".
    expect(modal.textContent).toContain('Uklonjeno');
  });

  it('USPOREDBA: lijevi faksimil crveno oznacava staru rijec, desni zeleno novu, prazni odlomak crveno', () => {
    openRepairDiff({ before, after, changelog });
    const modal = document.getElementById('repairDiff')!;
    (modal.querySelectorAll('.lekta-diff-modes .pv-mode')[1] as HTMLButtonElement).click(); // Usporedba
    const panes = modal.querySelectorAll('.diff-pane');
    expect(panes.length).toBe(2);
    const beforePane = panes[0];
    const afterPane = panes[1];

    const beforeHeading = beforePane.querySelector('[data-p-index="1"]') as HTMLElement;
    expect(beforeHeading.classList.contains('lekta-diff-p--chg-del')).toBe(true);
    expect(beforeHeading.querySelector('.lekta-diff-w--del')?.textContent).toBe('Uvod');

    const afterHeading = afterPane.querySelector('[data-p-index="1"]') as HTMLElement;
    expect(afterHeading.classList.contains('lekta-diff-p--chg-ins')).toBe(true);
    expect(afterHeading.querySelector('.lekta-diff-w--ins')?.textContent).toBe('UVOD');

    // Obrisani prazni odlomak (index 3) postoji SAMO u lijevom faksimilu i oznacen je crveno.
    const deletedPara = beforePane.querySelector('[data-p-index="3"]') as HTMLElement;
    expect(deletedPara.classList.contains('lekta-diff-p--del')).toBe(true);
    expect(afterPane.querySelector('[data-p-index="3"]')).toBeNull();
  });

  it('ne mijenja ulazne modele (preuzeti dokument ostaje netaknut)', () => {
    openRepairDiff({ before, after, changelog });
    // Oznake su samo u pregledu; izvorni tekst odlomaka se ne dira.
    expect(before.paragraphs[0].text).toBe('Uvod');
    expect(after.paragraphs[0].text).toBe('UVOD');
  });

  it('bez promjena u tekstu (samo oblikovanje) jasno to kaze', () => {
    const same = model([para(1, 'Naslov', { headingLevel: 1 }), para(2, 'isti tekst')]);
    const same2 = model([para(1, 'Naslov', { headingLevel: 1 }), para(2, 'isti tekst')]);
    openRepairDiff({ before: same, after: same2, changelog });
    const modal = document.getElementById('repairDiff')!;
    expect(modal.textContent).toContain('oblikovne');
  });
});
