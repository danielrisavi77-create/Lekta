/**
 * Sluzbeni identitet studijskog programa (P1-1 u docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Zasto postoji: do sada je jedini zapis o programima bio
 * `data/coverage/institutional-coverage-matrix.json` - 35 programa nad TOCNO DVIJE jedinice
 * (fpzg, pravo) od 131 u katalogu, i to bez ijednog citatelja u kodu. Iz njega se nije moglo
 * odgovoriti na pitanje "postoji li program koji uopce nismo evidentirali", jer je i sam bio
 * uzorak, ne registar. Bez toga se ne moze tvrditi pokrivenost "svakog rada u Hrvatskoj": ne
 * moze se dokazati odsutnost rupe koju nikad nismo popisali.
 *
 * DISCIPLINA (ista kao za `ruleEntries`): nepoznata vrijednost je `null`, nikad nagadjanje.
 * `provenance.kind` govori ODAKLE zapis dolazi i zato je najvazniji podatak u shemi:
 *   - `upisnik`      : sluzbeni Upisnik studijskih programa. Jedini koji smije nositi
 *                      `officialProgramCode` i jedini koji ledger smije oznaciti `official`.
 *   - `faculty-page` : stranica studija ili pravilnik fakulteta. Vjerodostojno, ali NIJE
 *                      nacionalni registar; ledger to vodi kao `derived`.
 *   - `inferred`     : izvedeno iz naseg vlastitog profila. Najslabije; sluzi samo da rupa bude
 *                      vidljiva dok se ne potvrdi iz jednog od gornja dva izvora.
 */

/** Razina studija kako je pisu hrvatske ustanove (ne prevodimo u ECTS ni u strane nazive). */
export type ProgramLevel =
  | 'prijediplomski'
  | 'diplomski'
  | 'integrirani'
  | 'specijalistički'
  | 'doktorski'
  | 'združeni'
  | 'stručni prijediplomski'
  | 'stručni diplomski';

/** Klasicni, online ili mjesoviti nacin izvodjenja. `null` dok nije potvrdjeno. */
export type DeliveryMode = 'klasicni' | 'online' | 'mjesoviti';

/** Jednopredmetni ili dvopredmetni studij; kod dvopredmetnih pravila znaju se razlikovati. */
export type SubjectCount = 'jednopredmetni' | 'dvopredmetni';

/** Zivotni ciklus programa. Ugasen program smije ostati u registru, ali ne trazi profil. */
export type ProgramStatus = 'active' | 'phasing-out' | 'discontinued';

/**
 * Zasto program NEMA profil, kad ga nema. Zatvoren skup NAMJERNO: slobodan tekst bi dopustio
 * da se "nismo stigli" zapise kao da je odluka. Svaka vrijednost osim `pending-port` znaci da
 * profil nikad nece ni trebati, pa program ne ulazi u ratchet.
 */
export type UnsupportedReason =
  | 'external-institution'
  | 'no-written-thesis'
  | 'rules-not-published'
  | 'program-discontinued'
  | 'pending-port';

export interface ProgramProvenance {
  kind: 'upisnik' | 'faculty-page' | 'inferred';
  /** Id iz `data/sources/source-registry.json`, kad izvor tamo postoji. */
  sourceId?: string | null;
  sourceUrl?: string | null;
  /** Lokator u snapshotu; nepotvrdjen ostaje `null`, isto pravilo kao `ruleEntries.sourcePage`. */
  sourcePage?: string | null;
  snapshotHash?: string | null;
  verifiedAt?: string | null;
  note?: string;
}

export interface ProgramRecord {
  /** Stabilan interni id, npr. `fpzg-ba-politologija`. */
  id: string;
  /** Ustanova (sveuciliste/veleuciliste) i sastavnica (fakultet/odjel), oboje po nasem katalogu. */
  officialInstitutionId: string | null;
  componentId: string;
  /** Sifra iz Upisnika. Smije biti ne-null SAMO uz `provenance.kind === 'upisnik'`. */
  officialProgramCode: string | null;
  name: string;
  level: ProgramLevel | null;
  /** Smjer ili modul unutar programa; `null` kad program nema smjerove. */
  track: string | null;
  /** Jezik izvodjenja (ISO 639-1), npr. `hr`, `en`. */
  language: string | null;
  deliveryMode: DeliveryMode | null;
  /** Naziv partnera kod zdruzenih i partnerskih studija; `null` kod samostalnih. */
  jointPartner: string | null;
  subjectCount: SubjectCount | null;
  /** Akademska godina na koju se zapis odnosi, npr. `2025/2026`. */
  academicYear: string | null;
  /** Verzija pravila koja za taj program vrijedi; mijenja se kad fakultet izda nove upute. */
  ruleVersion: string | null;
  status: ProgramStatus;
  /** Vrste rada koje program stvarno trazi. */
  expectedWorkTypes: string[];
  /** Profili koji taj program pokrivaju; prazno je legitimno SAMO uz `unsupportedReason`. */
  expectedProfileIds: string[];
  unsupportedReason: UnsupportedReason | null;
  provenance: ProgramProvenance;
}

export interface ProgramRegistry {
  schemaVersion: number;
  /**
   * Je li registar SINKRONIZIRAN sa sluzbenim Upisnikom. Dok je `false`, nijedan zapis ne smije
   * nositi `officialProgramCode` ni `provenance.kind === 'upisnik'`, a ledger ne smije nijedan
   * program oznaciti kao `official`.
   */
  upisnikSynced: boolean;
  programs: ProgramRecord[];
}

/** Program smije biti bez profila samo ako je razlog izricit. */
export function programNeedsProfile(program: ProgramRecord): boolean {
  return program.status !== 'discontinued' && program.unsupportedReason == null;
}

/**
 * Strukturne greske registra. Vraca prazno polje za ispravan registar; svaka poruka imenuje
 * zapis i pravilo koje krsi (isti obrazac kao `profile-validator.ts`).
 */
export function validateProgramRegistry(registry: ProgramRegistry): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const program of registry.programs) {
    const at = `program "${program.id}"`;
    if (seen.has(program.id)) errors.push(`${at}: duplicirani id`);
    seen.add(program.id);

    if (!program.componentId) errors.push(`${at}: nema componentId (sastavnicu)`);
    if (!program.name) errors.push(`${at}: nema naziv`);

    // Sifra iz Upisnika je jedini podatak koji dokazuje sluzbeni identitet; ne smije doci
    // ni iz jednog slabijeg izvora, inace bi `official` postao stvar formatiranja, ne dokaza.
    if (program.officialProgramCode != null && program.provenance.kind !== 'upisnik') {
      errors.push(`${at}: officialProgramCode postoji, ali provenance nije 'upisnik'`);
    }
    if (program.provenance.kind === 'upisnik' && !registry.upisnikSynced) {
      errors.push(`${at}: provenance 'upisnik' dok registar nije sinkroniziran (upisnikSynced=false)`);
    }
    if (!program.expectedProfileIds.length && programNeedsProfile(program)) {
      errors.push(`${at}: nema nijedan profil ni razlog (unsupportedReason)`);
    }
    if (program.expectedProfileIds.length && program.unsupportedReason != null) {
      errors.push(`${at}: ima profile, a oznacen je kao ${program.unsupportedReason}`);
    }
  }

  return errors;
}
