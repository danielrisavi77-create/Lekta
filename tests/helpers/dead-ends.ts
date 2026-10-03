/**
 * Gard T87: iskljucen ili zauzet endpoint ne smije voditi u slijepu ulicu.
 *
 * Cita izvore tri modula i provjerava da je svaka grana ozicena: klijent prepoznaje razlog 503, politika
 * oporavka ga veze uz status 503 i daje ispravnu akciju, a render polja daje uputu umjesto "Render nije
 * uspio (503)". Ponasanje drze testovi u `tests/t87-slijepe-ulice.test.ts`; mutacije izvora su u
 * `tests/gate-mutations.test.ts`.
 */
import { normalizeLf } from './naplata-env';

export interface DeadEndSources {
  repairClient: string;
  recoveryPolicy: string;
  fieldRender: string;
}

/** Tekst od `start` do `end` iza njega; prazno kad nema. */
function block(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  if (a === -1) return '';
  const b = src.indexOf(end, a + start.length);
  return b === -1 ? '' : src.slice(a, b);
}

export function deadEndWiringProblems(sources: DeadEndSources): string[] {
  const out: string[] = [];
  const client = normalizeLf(sources.repairClient);
  const policy = normalizeLf(sources.recoveryPolicy);
  const render = normalizeLf(sources.fieldRender);

  const c503 = block(client, 'if (res.status === 503) {', '\n  }\n');
  if (!c503) out.push('repair-client: nema grane za 503');
  else {
    if (!/data\?\.error === 'disabled'\) \{\s*return \{[^}]*code: 'disabled'/.test(c503)) out.push('repair-client: 503 disabled nije prepoznat');
    if (!/data\?\.error === 'busy'\) \{\s*return \{[^}]*code: 'busy'/.test(c503)) out.push('repair-client: 503 busy nije prepoznat');
  }

  const pDisabled = block(policy, "outcome.code === 'disabled') {", '\n  }\n');
  if (!/outcome\.status === 503 && outcome\.code === 'disabled'\)/.test(policy)) out.push("recovery-policy: grana disabled nije vezana uz status 503");
  if (!/action: 'none'/.test(pDisabled) || !/retryAllowed: false/.test(pDisabled)) out.push('recovery-policy: disabled ne zavrsava bez ponovnog pokusaja');
  const pBusy = block(policy, "outcome.code === 'busy') {", '\n  }\n');
  if (!/outcome\.status === 503 && outcome\.code === 'busy'\)/.test(policy)) out.push('recovery-policy: grana busy nije vezana uz status 503');
  if (!/action: 'retry', retryAllowed: true/.test(pBusy)) out.push('recovery-policy: busy ne dopusta ponovni pokusaj');

  const rDisabled = block(render, "response.status === 503 && body.error === 'disabled') {", '\n  }\n');
  if (!rDisabled) out.push('field-render: 503 disabled nije prepoznat');
  else if (!rDisabled.includes('warnings: [FIELD_RENDER_DISABLED_MESSAGE]')) out.push('field-render: 503 disabled ne daje uputu');
  return out;
}
