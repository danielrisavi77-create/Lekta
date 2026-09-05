import { VERIFIED_PROFILE_REGISTRY } from '../profiles/profile-registry';
import { ZAGREB_CATALOG } from '../catalog/catalog-loader';
import { CORPUS_STATS } from './coverage-loader';

/**
 * Formula brojki za traku, IZDVOJENA da je generator i test dijele s bivsim zivim prikazom
 * (`renderHeroCoverage` u app.ts racunao je isto): broj verificiranih profila, broj ustanova iz
 * kataloga s barem jednom jedinicom koja ima verificiran profil, i broj javnih radova iz M4 korpusa.
 *
 * NE UVOZI SE U ULAZ `/`: ovaj modul vuce registar profila i katalog. Ulaz cita pecen JSON.
 */
export interface SiteStats {
  profiles: number;
  institutions: number;
  works: number;
}

export function computeSiteStats(): SiteStats {
  const profiles = VERIFIED_PROFILE_REGISTRY;
  const units = new Set(profiles.map((p) => (p as { unitId?: string }).unitId));
  const institutions = (ZAGREB_CATALOG as Array<{ units?: Array<{ id: string }> }>)
    .filter((group) => (group.units || []).some((u) => units.has(u.id))).length;
  return { profiles: profiles.length, institutions, works: CORPUS_STATS.works };
}
