/**
 * LOKALNI provider pravila profila (faza B, prijelazna dvojna putanja).
 *
 * Kad DEV okruzenje nema backend (npm run dev bez env varijabli, Playwright UX
 * suite), pravila se citaju iz istog AI-auditiranog artefakta kao i produkcija.
 * FAZA B3 (tvrdi rez):
 * wiring u app.ts gata granu s import.meta.env.DEV, pa je u produkcijskom buildu
 * cijeli ovaj modul i privatni profile-rules artefakt TREE-SHAKEANI iz dista;
 * bundleSizeGuard sada PADA ako se ti chunkovi ipak pojave.
 *
 * Testovi i skripte ga ne trebaju: oni idu kroz drafts-runtime/golden-entry
 * (eager merge) ili izravno citaju izvorne verifikacijske projekcije.
 */
import { setProfileRulesProvider } from './profile-registry';
import type { ProfileRulesServerArtifact } from './profile-rules-contract';

export function installLocalRulesProvider(): void {
  setProfileRulesProvider(async (profileId) => {
    const mod = await import('../../data/generated/profile-rules-server.json');
    const artifact = ((mod as { default?: unknown }).default ?? mod) as ProfileRulesServerArtifact;
    const served = artifact.profiles[profileId];
    if (!served) return { kind: 'failed', reason: 'nepoznat profil u lokalnom profile-rules artefaktu' };
    return {
      kind: 'ok',
      profile: served.profile,
      repairEntries: served.repairEntries,
      evidenceEntries: served.evidenceEntries,
    };
  });
}
