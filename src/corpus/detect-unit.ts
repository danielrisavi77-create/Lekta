/**
 * Ustanova (jedinica) s naslovnice stvarnog rada pri ulazu u korpus, iz KATALOGA (`data/catalog`), ne iz rucnog
 * popisa. Dodano 2026-09-05: rucni popis u `detect-profile.ts` znao je 25 zagrebackih sastavnica, pa je 28 od
 * 32 radova s ustanova koje korpus nema (HKS 17, Zdravstveno veleuciliste 8, Libertas 3, Hrvatski studiji 3, GRF 1)
 * u vlasnikovom Downloads prolazilo kao "bez ustanove". Katalog ima 44 institucije i 134 jedinice, sto pokriva
 * svih 131 jedinicu registra.
 *
 * Dvije zamke koje rucni popis nije imao:
 *
 *  1. GENERICKA IMENA se ponavljaju medju sveucilistima: Ekonomski fakultet postoji u Zagrebu, Rijeci, Splitu i
 *     Osijeku, Filozofski u cetiri grada, Pravni u tri. Razrjesava ih ime sveucilista u istom tekstu ("Sveuciliste
 *     u Rijeci"). Kad sveucilista nema a ime je genericko, ostaje ZAGREB kao zatecena pretpostavka rucnog popisa
 *     (svih 210 naslovnica u Downloads koje imenuju sveuciliste imenuju Zagreb), izricito i testirano, da se
 *     ponasanje nad 175 vec prepoznatih radova ne promijeni.
 *  2. Imena s gradom u sufiksu ("Ekonomski fakultet u Rijeci", "Fakultet dentalne medicine Rijeka") na naslovnici
 *     cesto stoje BEZ grada, u zasebnom retku ispod sveucilista. Zato svaka jedinica ima i genericki oblik bez grada.
 */
import katalog from '../../data/catalog/zagreb-catalog.json';

interface KatalogInstitucija {
  id: string;
  name: string;
  units?: Array<{ id: string; name: string }>;
}

const INSTITUCIJE = katalog as unknown as KatalogInstitucija[];

/** Fraze koje imenuju sveuciliste (normalizirane), za razrjesavanje generickih imena fakulteta. */
const SVEUCILISTA: ReadonlyArray<readonly [RegExp, string]> = [
  [/sveucilist[ea] u zagrebu/, 'unizg'],
  [/sveucilist[ea] u rijeci/, 'uniri'],
  [/sveucilist[ea] u splitu/, 'unist'],
  [/josipa jurja strossmayera|sveucilist[ea] u osijeku/, 'unios'],
  [/sveucilist[ea] u zadru/, 'unizd'],
  [/jurja dobrile|sveucilist[ea] u puli/, 'unipu'],
  [/sveucilist[ea] u dubrovniku/, 'unidu'],
  [/sveucilist[ea] sjever/, 'unin'],
  [/sveucilist[ea] u slavonskom brodu/, 'unisb'],
];

const GRAD_SUFIKS = /(?:\s+u\s+(?:zagrebu|rijeci|splitu|osijeku|zadru|puli|dubrovniku|varazdinu|sisku|koprivnici|cakovcu|karlovcu|sibeniku|pozegi|kninu|virovitici|vukovaru|krizevcima|gospicu|slavonskom brodu)|,?\s+(?:zagreb|rijeka|split|osijek|zadar|pula|dubrovnik|varazdin|sisak|koprivnica|cakovec|karlovac|sibenik|pozega|knin|virovitica|vukovar|krizevci|gospic))$/;

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Needle {
  needle: string;
  unitId: string;
  institutionId: string;
  /** Genericki oblik (bez grada) koji dijeli vise institucija. */
  generic: boolean;
}

const NEEDLES: Needle[] = (() => {
  const raw: Needle[] = [];
  for (const inst of INSTITUCIJE) {
    const units = inst.units ?? [];
    for (const u of units) {
      const full = normalizeForMatch(u.name);
      raw.push({ needle: full, unitId: u.id, institutionId: inst.id, generic: false });
      const bezGrada = full.replace(GRAD_SUFIKS, '');
      if (bezGrada !== full && bezGrada.length >= 8) raw.push({ needle: bezGrada, unitId: u.id, institutionId: inst.id, generic: false });
      // Institucija s jednom jedinicom (veleucilista, privatna sveucilista): i ime institucije je oznaka jedinice.
      if (units.length === 1) {
        const instName = normalizeForMatch(inst.name);
        if (instName !== full) raw.push({ needle: instName, unitId: u.id, institutionId: inst.id, generic: false });
      }
    }
  }
  // Isti needle kod vise institucija -> genericki.
  const count = new Map<string, number>();
  for (const n of raw) count.set(n.needle, (count.get(n.needle) ?? 0) + 1);
  for (const n of raw) if ((count.get(n.needle) ?? 0) > 1) n.generic = true;
  // Preskoci needle koji su same rijeci sveucilista ("sveuciliste"), preopce da bi nesto znacile.
  return raw.filter((n) => n.needle.length >= 10 && !/^sveucilist[ea]$/.test(n.needle));
})();

export interface DetectedUnit {
  unitId: string;
  institutionId: string;
  /** Kako je razrijeseno: jedinstveno ime, ime + sveuciliste, ili genericko ime uz zatecenu pretpostavku Zagreba. */
  resolvedBy: 'unique' | 'university' | 'zagreb-default';
}

/**
 * Jedinica iz teksta naslovnice. `null` kad nijedno ime iz kataloga ne stoji u tekstu; genericko ime bez
 * sveucilista pada na Zagreb (vidi zaglavlje), ali SAMO ako Zagreb ima jedinicu tog imena.
 */
export function detectUnitFromCatalog(front: string): DetectedUnit | null {
  const f = normalizeForMatch(front);
  if (!f) return null;
  const university = SVEUCILISTA.find(([re]) => re.test(f))?.[1] ?? null;
  const hits = NEEDLES.map((n) => ({ ...n, at: f.indexOf(n.needle) })).filter((n) => n.at >= 0);
  if (!hits.length) return null;
  // NAJRANIJE ime pobjedjuje: na naslovnici maticna ustanova stoji na vrhu, a druge se spominju kasnije
  // (mentor s drugog fakulteta, suradna ustanova). Izmjereno 2026-09-05: "najdulje ime pobjedjuje" je na jednom
  // FPZG radu izabralo FKIT spomenut na poziciji 748, dok je FPZG stajao na poziciji 22. Kod istog pocetka
  // (preklapajuce inacice, "ekonomski fakultet" i "ekonomski fakultet u rijeci") dulje ime je preciznije.
  hits.sort((a, b) => a.at - b.at || b.needle.length - a.needle.length);
  const first = hits[0];
  const top = hits.filter((h) => h.needle === first.needle);
  const distinctUnits = new Set(top.map((h) => h.unitId));
  if (distinctUnits.size === 1) {
    const h = top[0];
    // Jedinstveno ime, ali ako tekst imenuje DRUGO sveuciliste, ime je vjerojatno spomen, ne pripadnost.
    if (university && h.institutionId !== university && h.generic === false && INSTITUCIJE.some((i) => i.id === university)) {
      // Pokusaj isti genericki oblik unutar imenovanog sveucilista.
      const alt = hits.find((x) => x.institutionId === university);
      if (alt) return { unitId: alt.unitId, institutionId: alt.institutionId, resolvedBy: 'university' };
    }
    return { unitId: h.unitId, institutionId: h.institutionId, resolvedBy: university ? 'university' : 'unique' };
  }
  if (university) {
    const inUni = top.find((h) => h.institutionId === university);
    if (inUni) return { unitId: inUni.unitId, institutionId: inUni.institutionId, resolvedBy: 'university' };
  }
  const zagreb = top.find((h) => h.institutionId === 'unizg');
  if (zagreb) return { unitId: zagreb.unitId, institutionId: 'unizg', resolvedBy: 'zagreb-default' };
  return null;
}
