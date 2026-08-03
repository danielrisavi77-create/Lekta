/**
 * Testovi sloja predlozaka izjave o izvornosti (data/declarations + src/declarations).
 * Tri uloge: (1) faithfulness loadera, (2) ponasanje izbora (BEZ cross-level reuse-a,
 * za razliku od naslovnice - vidi README), (3) VALIDACIJSKI GATE koji sprecava da "guidance"
 * (znamo da fakultet propisuje svoju formulaciju, ali nemamo tekst) tiho postane neprovjereno
 * "official" (izmisljen tekst). Radi i nad praznim declarations.json (danasnje, posteno stanje).
 */
import { describe, it, expect } from 'vitest';

import manifest from '../data/manifest.json';
import rawDeclarations from '../data/declarations/declarations.json';
import rawSourceRegistry from '../data/sources/source-registry.json';

import {
  DECLARATION_TEMPLATES,
  resolveDeclaration,
  selectDeclaration,
} from '../src/declarations/declaration-loader';
import type { DeclarationTemplate } from '../src/declarations/declaration-schema';
import { findUnit } from '../src/catalog/catalog-loader';
import { WORK_TYPE_LABELS } from '../src/config/config-loader';

describe('declaration-loader: faithfulness i manifest', () => {
  it('DECLARATION_TEMPLATES = raw JSON', () => {
    expect(DECLARATION_TEMPLATES).toEqual(rawDeclarations);
  });
  it('broj zapisa se slaze s manifestom (danas 0: jos nema prikupljenih obrazaca)', () => {
    const row = manifest.find((m) => m.name === 'DECLARATION_TEMPLATES');
    expect(row).toBeDefined();
    expect(DECLARATION_TEMPLATES).toHaveLength(row!.entries);
  });
});

describe('declaration-loader: izbor (bez cross-level reuse-a)', () => {
  const t = (id: string, unitId: string, level: string | null, status: 'official' | 'guidance' = 'official'): DeclarationTemplate => ({
    id,
    unitId,
    level: level as DeclarationTemplate['level'],
    provenance: status === 'official'
      ? { status: 'official', sourceIds: ['pravo-upute-oblikovanje-2024'] }
      : { status: 'guidance' },
    status: 'draft',
    wording: status === 'official' ? 'Formalni tekst izjave.' : undefined,
  });
  const synthetic = [
    t('fpzg-graduate', 'fpzg', 'graduate'),
    t('fpzg', 'fpzg', null, 'guidance'),
    t('pravo-final', 'pravo', 'final'),
  ];

  it('tocna razina ima prednost pred level=null zapisom', () => {
    expect(resolveDeclaration(synthetic, 'fpzg', 'graduate')?.id).toBe('fpzg-graduate');
  });
  it('bez tocne razine pada na level=null zapis jedinice', () => {
    expect(resolveDeclaration(synthetic, 'fpzg', 'doctoral')?.id).toBe('fpzg');
  });
  it('BEZ level=null zapisa NE preuzima predlozak druge razine (za razliku od naslovnice)', () => {
    // pravo ima samo 'final'; naslovnica bi ovdje preuzela taj zapis (REUSE_ORDER), izjava ne smije.
    expect(resolveDeclaration(synthetic, 'pravo', 'graduate')).toBeNull();
  });
  it('nepoznata jedinica daje null', () => {
    expect(resolveDeclaration(synthetic, 'nepoznato', 'graduate')).toBeNull();
  });
  it('selectDeclaration mapira null/nepoznat unit i nepostojeci zapis na "generic"', () => {
    expect(selectDeclaration(undefined, 'graduate')).toEqual({ template: null, provenance: 'generic' });
    expect(selectDeclaration('', 'graduate')).toEqual({ template: null, provenance: 'generic' });
    expect(selectDeclaration('pravo', 'graduate').provenance).toBe('generic');
  });
  it('resolveDeclaration daje zapis ciji provenance.status selectDeclaration izravno prenosi', () => {
    // selectDeclaration cita iz zivog DECLARATION_TEMPLATES (danas prazan), pa se prenosenje
    // statusa dokazuje nad resolveDeclaration(synthetic, ...); trivijalni "wrap" u
    // selectDeclaration je vec pokriven testovima ispod (generic/nepoznato/zivi registar).
    expect(resolveDeclaration(synthetic, 'fpzg', 'graduate')?.provenance.status).toBe('official');
    expect(resolveDeclaration(synthetic, 'fpzg', 'doctoral')?.provenance.status).toBe('guidance');
  });
  it('findanje nad zivim (trenutno praznim) registrom ne baca', () => {
    expect(resolveDeclaration(DECLARATION_TEMPLATES, 'sigurno-ne-postoji', 'graduate')).toBeNull();
  });
});

describe('declarations.json: validacijski gate za pipeline output', () => {
  const sourceIds = new Set((rawSourceRegistry as Array<{ id: string }>).map((s) => s.id));
  const workTypeKeys = new Set(Object.keys(WORK_TYPE_LABELS));

  // Ista pravila primjenjena i na stvarne podatke (danas prazno, prolazi vakuozno) i na
  // sintetičke fixture (dokazuje da svako pravilo STVARNO puca kad je prekrseno).
  function errorsFor(t: DeclarationTemplate): string[] {
    const errs: string[] = [];
    const ctx = `predlozak ${t.id}`;
    if (!findUnit(t.unitId)) errs.push(`${ctx}: unitId "${t.unitId}" ne postoji u katalogu`);
    if (t.level !== null && !workTypeKeys.has(t.level)) errs.push(`${ctx}: nepoznata razina "${t.level}"`);
    if (!['official', 'guidance'].includes(t.provenance.status)) errs.push(`${ctx}: nepoznat provenance.status`);
    if (!['draft', 'verified'].includes(t.status)) errs.push(`${ctx}: nepoznat status`);
    if (t.provenance.status === 'official') {
      if (!t.provenance.sourceIds?.length) errs.push(`${ctx}: official bez sourceIds`);
      for (const sid of t.provenance.sourceIds || []) {
        if (!sourceIds.has(sid)) errs.push(`${ctx}: sourceId "${sid}" nije u source-registry`);
      }
      if (!t.wording?.trim()) errs.push(`${ctx}: official bez wording`);
    }
    if (t.provenance.status === 'guidance' && t.wording?.trim()) {
      errs.push(`${ctx}: guidance NE SMIJE nositi wording (izmisljen tekst bez pravog izvora)`);
    }
    if (t.provenance.sourcePage != null && t.provenance.sourcePage <= 0) {
      errs.push(`${ctx}: sourcePage mora biti pozitivan ili null`);
    }
    return errs;
  }

  it('id i (unitId, level) selektori su jedinstveni (nad stvarnim podacima)', () => {
    const ids = DECLARATION_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const selectors = DECLARATION_TEMPLATES.map((t) => `${t.unitId}::${t.level}`);
    expect(new Set(selectors).size).toBe(selectors.length);
  });

  it('svaki stvarni predlozak je strukturno valjan (danas prazno, prolazi vakuozno)', () => {
    for (const t of DECLARATION_TEMPLATES) expect(errorsFor(t), t.id).toEqual([]);
  });

  it('sintetika: ispravan official zapis prolazi bez gresaka', () => {
    const ok: DeclarationTemplate = {
      id: 'fpzg', unitId: 'fpzg', level: null,
      provenance: { status: 'official', sourceIds: ['pravo-upute-oblikovanje-2024'] },
      status: 'draft', wording: 'Formalni tekst.',
    };
    expect(errorsFor(ok)).toEqual([]);
  });

  it('sintetika: ispravan guidance zapis (bez wording) prolazi bez gresaka', () => {
    const ok: DeclarationTemplate = {
      id: 'fpzg', unitId: 'fpzg', level: null,
      provenance: { status: 'guidance', sourceNote: 'Opce upute spominju vlastiti obrazac' },
      status: 'draft',
    };
    expect(errorsFor(ok)).toEqual([]);
  });

  it('sintetika: unitId koji ne postoji u katalogu pada', () => {
    const bad: DeclarationTemplate = {
      id: 'x', unitId: 'ne-postoji-u-katalogu', level: null,
      provenance: { status: 'guidance' }, status: 'draft',
    };
    expect(errorsFor(bad).some((e) => e.includes('ne postoji u katalogu'))).toBe(true);
  });

  it('sintetika: official BEZ sourceIds pada', () => {
    const bad: DeclarationTemplate = {
      id: 'fpzg', unitId: 'fpzg', level: null,
      provenance: { status: 'official' }, status: 'draft', wording: 'Tekst.',
    };
    expect(errorsFor(bad).some((e) => e.includes('bez sourceIds'))).toBe(true);
  });

  it('sintetika: official BEZ wording pada', () => {
    const bad: DeclarationTemplate = {
      id: 'fpzg', unitId: 'fpzg', level: null,
      provenance: { status: 'official', sourceIds: ['pravo-upute-oblikovanje-2024'] }, status: 'draft',
    };
    expect(errorsFor(bad).some((e) => e.includes('bez wording'))).toBe(true);
  });

  it('sintetika: official sa sourceId koji ne postoji u source-registry pada', () => {
    const bad: DeclarationTemplate = {
      id: 'fpzg', unitId: 'fpzg', level: null,
      provenance: { status: 'official', sourceIds: ['ovaj-ne-postoji'] }, status: 'draft', wording: 'Tekst.',
    };
    expect(errorsFor(bad).some((e) => e.includes('nije u source-registry'))).toBe(true);
  });

  it('KLJUCNO: guidance SA wording pada (sprijeceno tiho "guidance" -> izmisljen "official" tekst)', () => {
    const bad: DeclarationTemplate = {
      id: 'fpzg', unitId: 'fpzg', level: null,
      provenance: { status: 'guidance' }, status: 'draft', wording: 'Izmisljen tekst bez pravog izvora.',
    };
    expect(errorsFor(bad).some((e) => e.includes('NE SMIJE nositi wording'))).toBe(true);
  });

  it('sintetika: negativan sourcePage pada, null prolazi', () => {
    const bad: DeclarationTemplate = {
      id: 'fpzg', unitId: 'fpzg', level: null,
      provenance: { status: 'guidance', sourcePage: -1 }, status: 'draft',
    };
    expect(errorsFor(bad).some((e) => e.includes('sourcePage'))).toBe(true);

    const ok: DeclarationTemplate = {
      id: 'fpzg', unitId: 'fpzg', level: null,
      provenance: { status: 'guidance', sourcePage: null }, status: 'draft',
    };
    expect(errorsFor(ok)).toEqual([]);
  });
});
