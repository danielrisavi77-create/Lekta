import { describe, expect, it } from 'vitest';
import { allProgrammesQuery, compareHarvests, latestReportPaths, validateHarvest } from '../src/programs/upisnik-resync';
import { UPISNIK_VRSTE, type UpisnikRow } from '../src/programs/upisnik-parse';

const row = (code = '3', patch: Partial<UpisnikRow> = {}): UpisnikRow => ({
  sifraUpisnik: code, sifraZapisa: '2939', naziv: 'Elektrotehnika', nameMarker: '1',
  nositelj: 'Sveučilište u Rijeci', izvoditelj: 'Sveučilište u Rijeci, Tehnički fakultet',
  vrsta: UPISNIK_VRSTE[0], mjesto: 'Rijeka', ...patch,
});

describe('resync Upisnika: upit bez neobveznih filtara', () => {
  it('cuva sentinele padajucih izbornika i Spring markere', () => {
    const query = new URLSearchParams(allProgrammesQuery());
    expect(query.get('strucniNaziv')).toBe('-1');
    expect(query.get('nositelj')).toBe('0');
    expect(query.get('izvodac')).toBe('0');
    for (const key of ['vrsta', 'jednopredmetni', 'nacinIzvodenja', 'nacinImplementacije']) {
      expect(query.get(`_${key}`)).toBe('on');
      expect(query.has(key)).toBe(false);
    }
  });
  it('negativna kontrola: izbor svih poznatih vrijednosti ipak je filtar', () => {
    const query = new URLSearchParams(allProgrammesQuery());
    query.append('jednopredmetni', 'J');
    query.append('jednopredmetni', 'D');
    expect(query.getAll('jednopredmetni')).not.toEqual(new URLSearchParams(allProgrammesQuery()).getAll('jednopredmetni'));
  });
});

describe('resync Upisnika: kvaliteta prije prihvacanja snapshota', () => {
  it('prihvaca valjani redak', () => {
    expect(validateHarvest({ rows: [row()], skipped: [] }, UPISNIK_VRSTE)).toEqual([]);
  });
  it('ne prihvaca prazan rezultat kao prazan hrvatski sustav', () => {
    expect(validateHarvest({ rows: [], skipped: [] }, UPISNIK_VRSTE)).toContain('EMPTY_RESULT');
  });
  it('ne presucuje djelomicno parsiranje', () => {
    expect(validateHarvest({ rows: [row()], skipped: ['bad row'] }, UPISNIK_VRSTE)).toContain('SKIPPED_ROWS: 1');
  });
  it('trazi sluzbenu sifru', () => {
    expect(validateHarvest({ rows: [row('')], skipped: [] }, UPISNIK_VRSTE)).toContain('INVALID_CODE: ');
  });
  it('trazi sifru zapisa', () => {
    expect(validateHarvest({ rows: [row('3', { sifraZapisa: '' })], skipped: [] }, UPISNIK_VRSTE)).toContain('INVALID_RECORD: 3');
  });
  it('ne spaja vise zapisa iste programske sifre', () => {
    const rows = [row(), row('3', { sifraZapisa: '999' })];
    expect(validateHarvest({ rows, skipped: [] }, UPISNIK_VRSTE)).toContain('DUPLICATE_CODE: 3');
    expect(rows).toHaveLength(2);
  });
  it('otkriva dupliciranu sifru zapisa', () => {
    expect(validateHarvest({ rows: [row(), row('4')], skipped: [] }, UPISNIK_VRSTE)).toContain('DUPLICATE_RECORD: 2939');
  });
  it('ne prihvaca novi tip studija bez pregleda', () => {
    expect(validateHarvest({ rows: [row('3', { vrsta: 'novi tip' })], skipped: [] }, UPISNIK_VRSTE)).toContain('UNKNOWN_TYPE: 3: novi tip');
  });
  it.each(['naziv', 'nositelj', 'izvoditelj'] as const)('trazi polje %s', (field) => {
    expect(validateHarvest({ rows: [row('3', { [field]: ' ' })], skipped: [] }, UPISNIK_VRSTE)).toContain(`MISSING_FIELD: 3: ${field}`);
  });
});

describe('resync Upisnika: razlike po sluzbenoj sifri', () => {
  it('novi naziv postojece sifre ne stvara novi program', () => {
    const result = compareHarvests([row()], [row('3', { naziv: 'Novi naziv' })]);
    expect(result.added).toEqual([]);
    expect(result.changed).toEqual([{ sifraUpisnik: '3', fields: ['naziv'] }]);
    expect(result.requiresReview).toBe(true);
  });
  it('novu sifru vodi kao dodatak', () => {
    expect(compareHarvests([row()], [row(), row('4', { sifraZapisa: '999' })]).added).toEqual(['4']);
  });
  it('nestali redak ostaje za provjeru, ne za brisanje', () => {
    const result = compareHarvests([row(), row('4', { sifraZapisa: '999' })], [row()]);
    expect(result.missingFromLatest).toEqual(['4']);
    expect(result.requiresReview).toBe(true);
  });
  it('promjena izvoditelja trazi ponovnu provjeru odluka', () => {
    expect(compareHarvests([row()], [row('3', { izvoditelj: 'Drugi izvoditelj' })]).changed)
      .toEqual([{ sifraUpisnik: '3', fields: ['izvoditelj'] }]);
  });
  it('redoslijed redaka ne mijenja rezultat', () => {
    const second = row('4', { sifraZapisa: '999' });
    expect(compareHarvests([row(), second], [second, row()]))
      .toEqual({ added: [], missingFromLatest: [], changed: [], unchanged: 2, requiresReview: false });
  });
  it('ne dopusta Map prepisivanje dupliciranog identiteta', () => {
    expect(() => compareHarvests([row(), row()], [row()])).toThrow('DUPLICATE_CODE');
    expect(() => compareHarvests([row()], [row(), row()])).toThrow('DUPLICATE_CODE');
  });
  it('ne mijenja ulazne objekte', () => {
    const before = [row()]; const after = [row('3', { naziv: 'Novi naziv' })];
    const snapshot = JSON.stringify([before, after]);
    compareHarvests(before, after);
    expect(JSON.stringify([before, after])).toBe(snapshot);
  });
});


describe('latest-report: tocne relativne putanje dokaza', () => {
  const run = 'a'.repeat(20) + '-abc123';
  it('kopija izvjestaja iz root mape vodi do dokaza bas tog runa', () => {
    const paths = { recordsPath: 'records-upisnik.json', reviewPath: 'identity-review.json', candidatePath: null };
    const before = JSON.stringify(paths);
    const latest = latestReportPaths(paths, run);
    expect(latest).toEqual({
      recordsPath: run + '/records-upisnik.json',
      reviewPath: run + '/identity-review.json',
      candidatePath: null,
    });
    expect(JSON.stringify(paths)).toBe(before);
  });
  it('candidate path se cuva samo ako kandidat smije postojati', () => {
    const latest = latestReportPaths({
      recordsPath: 'records-upisnik.json', reviewPath: null, candidatePath: 'candidate-upisnik.json',
    }, run);
    expect(latest.candidatePath).toBe(run + '/candidate-upisnik.json');
    expect(latest.reviewPath).toBeNull();
  });
  it('odbija izlazak iz izoliranog run direktorija', () => {
    expect(() => latestReportPaths({ recordsPath: 'records-upisnik.json', reviewPath: null, candidatePath: null }, '../other'))
      .toThrow('INVALID_RUN_DIRECTORY');
    expect(() => latestReportPaths({ recordsPath: '../secret.json', reviewPath: null, candidatePath: null }, run))
      .toThrow('INVALID_ARTIFACT_FILENAME');
  });
});
