/**
 * Izvorni dokaz: javni runner endpointi su zadano ISKLJUCENI.
 *
 * Nalaz iz adversarijalnog pregleda (2026-09-23, krug 3): tvrdnja "integracija je sigurno
 * iskljucena" bila je dokazana samo za `repair-docx` i za klijenta. `repair-local-claim` i
 * `repair-local-status` su u `supabase/deploy-manifest.json` deklarirani s `verifyJwt: false`,
 * dakle javno dohvatljivi bez Supabase JWT-a, a gasio ih je samo `REPAIR_LOCAL_DISABLED === 'true'`.
 * Ta se varijabla na lansiranju ne postavlja (postupak iz `docs/LOCAL_REPAIR_RELEASE.md` koji je
 * postavlja kao prvu mutaciju se ne izvodi jer se tok ne ukljucuje), pa su obje funkcije bile zive
 * javne povrsine iskljucene znacajke.
 *
 * Posljedica nije bila izdavanje launcha (bez `repair-docx` nema redaka u `repair_local_jobs`), ali
 * jest neautenticirana povrsina prema DB RPC-u i Storageu. Obje sada citaju istu
 * `localRepairFlagEnabled` kao `repair-docx`, dakle fail-closed.
 *
 * Ponasanje kad je znacajka UKLJUCENA je nepromijenjeno: release zavrsava s
 * `REPAIR_LOCAL_ENABLED=true` (korak 10) pa `REPAIR_LOCAL_DISABLED=false` (korak 11), sto daje
 * tocno isti ishod kao stari izraz `REPAIR_LOCAL_DISABLED !== 'true'`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { localRepairFlagEnabled } from '../src/repair/local-runner/feature-flag.ts';
import { localRepairPublicEndpointProblems } from './helpers/local-repair-flag-guard.ts';

const FUNCTIONS = join(import.meta.dirname, '..', 'supabase', 'functions');
const ENDPOINTS = ['repair-local-claim', 'repair-local-status'] as const;

/** CR se normalizira: usporedbe nize su tekstualne, a radno stablo je na Windowsu CRLF. */
function endpointSource(name: string): string {
  return readFileSync(join(FUNCTIONS, name, 'index.ts'), 'utf8').split('\r\n').join('\n');
}

describe('javni runner endpointi: zadano iskljuceni', () => {
  it.each(ENDPOINTS)('%s: stvaran izvor nema nijedan problem', (name) => {
    expect(localRepairPublicEndpointProblems(endpointSource(name))).toEqual([]);
  });

  it.each(ENDPOINTS)('%s: straza je `if (!LOCAL_REPAIR_ENABLED)` prije Supabase klijenta', (name) => {
    const source = endpointSource(name);
    expect(source).toMatch(/import \{ localRepairFlagEnabled \} from '\.\.\/\.\.\/\.\.\/src\/repair\/local-runner\/feature-flag\.ts';/);
    expect(source.indexOf('if (!LOCAL_REPAIR_ENABLED) {')).toBeGreaterThan(-1);
    expect(source.indexOf('if (!LOCAL_REPAIR_ENABLED) {')).toBeLessThan(source.indexOf('createClient(SUPABASE_URL'));
  });

  /**
   * Ovo je tvrdnja o ISKLJUCENOSTI, a ne o postojanju straze: bez postavljene varijable
   * `REPAIR_LOCAL_ENABLED` (stanje na lansiranju) zastavica je false, dakle endpoint vraca 503.
   * Bez ovoga bi gornje tvrdnje zadovoljila i straza koja propusta.
   */
  it('bez postavljenog REPAIR_LOCAL_ENABLED zastavica je false, kao i uz stari kill switch', () => {
    expect(localRepairFlagEnabled({})).toBe(false);
    expect(localRepairFlagEnabled({ REPAIR_LOCAL_DISABLED: 'true' })).toBe(false);
    // Stanje nakon koraka 11 iz release postupka: ponasanje mora ostati identicno starom izrazu.
    expect(localRepairFlagEnabled({ REPAIR_LOCAL_ENABLED: 'true', REPAIR_LOCAL_DISABLED: 'false' })).toBe(true);
  });

  /**
   * Negativne kontrole: mutira se SAMO kopija u memoriji. Bez njih gard koji uvijek vraca prazan
   * popis prolazi jednako dobro kao i onaj koji stvarno mjeri.
   */
  describe('negativne kontrole', () => {
    it.each(ENDPOINTS)('%s: povratak na fail-open kill switch je problem', (name) => {
      const mutated = endpointSource(name)
        .replace(
          /const LOCAL_REPAIR_ENABLED = localRepairFlagEnabled\(\{[\s\S]*?\}\);/,
          "const LOCAL_REPAIR_DISABLED = Deno.env.get('REPAIR_LOCAL_DISABLED') === 'true';",
        )
        .replace('if (!LOCAL_REPAIR_ENABLED) {', 'if (LOCAL_REPAIR_DISABLED) {');
      expect(mutated).not.toEqual(endpointSource(name));
      const problems = localRepairPublicEndpointProblems(mutated);
      expect(problems).toContain('LOCAL_REPAIR_ENABLED se ne racuna pozivom localRepairFlagEnabled(...)');
      expect(problems).toContain(
        "varijabla okoline REPAIR_LOCAL_DISABLED se cita izvan poziva localRepairFlagEnabled(...)",
      );
    });

    it.each(ENDPOINTS)('%s: uklonjena straza je problem', (name) => {
      const mutated = endpointSource(name).replace('if (!LOCAL_REPAIR_ENABLED) {', 'if (false) {');
      expect(mutated).not.toEqual(endpointSource(name));
      expect(localRepairPublicEndpointProblems(mutated)).toContain(
        'nema tocno jedne straze `if (!LOCAL_REPAIR_ENABLED) {` koja gasi javni endpoint',
      );
    });

    it.each(ENDPOINTS)('%s: zasjenjena zastavica je problem', (name) => {
      const mutated = endpointSource(name).replace(
        'if (!LOCAL_REPAIR_ENABLED) {',
        'const LOCAL_REPAIR_ENABLED = true;\n  if (!LOCAL_REPAIR_ENABLED) {',
      );
      expect(mutated).not.toEqual(endpointSource(name));
      expect(localRepairPublicEndpointProblems(mutated)).toContain(
        'LOCAL_REPAIR_ENABLED se deklarira vise od jednom; lokalno zasjenjenje ponistava modul-konstantu',
      );
    });

    /**
     * Straza koja postoji, ali tek NAKON `createClient`, nije fail-closed: klijent s punim
     * service-role ovlastima je vec stvoren. Blok se vadi iz stvarnog izvora (ne prepisuje rucno)
     * pa mutacija ne moze tiho promasiti oblik.
     */
    it.each(ENDPOINTS)('%s: straza pomaknuta iza Supabase klijenta je problem', (name) => {
      const source = endpointSource(name);
      const from = source.indexOf('  if (!LOCAL_REPAIR_ENABLED) {');
      const to = source.indexOf('\n  }\n', from) + '\n  }\n'.length;
      expect(from).toBeGreaterThan(-1);
      expect(to).toBeGreaterThan(from);
      const guard = source.slice(from, to);
      expect(guard).toContain("status: 503");

      // Kontrola same mutacije: ista straza premjestena ISPRED klijenta ostaje ispravna.
      const withoutGuard = source.slice(0, from) + source.slice(to);
      const clientAt = withoutGuard.indexOf('  const admin = createClient(SUPABASE_URL');
      expect(clientAt).toBeGreaterThan(-1);
      const beforeClient = withoutGuard.slice(0, clientAt) + guard + withoutGuard.slice(clientAt);
      expect(beforeClient).not.toEqual(source);
      expect(localRepairPublicEndpointProblems(beforeClient)).toEqual([]);

      const clientEnd = withoutGuard.indexOf('});', clientAt) + '});\n'.length;
      const afterClient = withoutGuard.slice(0, clientEnd) + guard + withoutGuard.slice(clientEnd);
      expect(afterClient).not.toEqual(source);
      expect(localRepairPublicEndpointProblems(afterClient)).toContain(
        'straza zastavice dolazi nakon stvaranja Supabase klijenta, dakle posao je vec krenuo',
      );
    });
  });

  /**
   * TRECI ADVERSARIJALNI PREGLED (2026-09-23, krug 4): gard je mjerio POSTOJANJE i POLOZAJ glave
   * `if (!LOCAL_REPAIR_ENABLED) {`, ali ne i da blok PREKIDA obradu. Sva tri oblika nize su
   * reproducirana nad kopijom stvarnog izvora i sva su tada vracala PRAZAN popis, iako prvi i treci
   * puste izvrsavanje dalje u `createClient` i RPC, a drugi javno vrati 200.
   */
  describe('tijelo straze mora prekinuti obradu', () => {
    const NOT_INTERRUPTING = 'blok straze javnog endpointa ne pocinje s `return new Response(`, pa ne prekida obradu';

    /** Granice bloka iz STVARNOG izvora, da mutacija ne moze tiho promasiti oblik. */
    function guardSpan(source: string): { from: number; to: number; body: string } {
      const from = source.indexOf('  if (!LOCAL_REPAIR_ENABLED) {');
      const to = source.indexOf('\n  }\n', from) + '\n  }\n'.length;
      expect(from).toBeGreaterThan(-1);
      expect(to).toBeGreaterThan(from);
      const body = source.slice(from, to);
      expect(body).toContain('return new Response(');
      expect(body).toContain('status: 503');
      return { from, to, body };
    }

    it.each(ENDPOINTS)('%s: uklonjen `return` ispred new Response je problem', (name) => {
      const source = endpointSource(name);
      const { from, to, body } = guardSpan(source);
      const mutated = source.slice(0, from) + body.replace('return new Response(', 'new Response(') + source.slice(to);
      expect(mutated).not.toEqual(source);
      expect(mutated).toContain('    new Response(');
      expect(localRepairPublicEndpointProblems(mutated)).toContain(NOT_INTERRUPTING);
    });

    it.each(ENDPOINTS)('%s: status 200 umjesto 503 u strazi je problem', (name) => {
      const source = endpointSource(name);
      const { from, to, body } = guardSpan(source);
      const mutated = source.slice(0, from) + body.replace('status: 503', 'status: 200') + source.slice(to);
      expect(mutated).not.toEqual(source);
      expect(localRepairPublicEndpointProblems(mutated)).toContain('odgovor straze javnog endpointa nema status: 503');
    });

    it.each(ENDPOINTS)('%s: prazan blok straze je problem', (name) => {
      const source = endpointSource(name);
      const { from, to } = guardSpan(source);
      const mutated = `${source.slice(0, from)}  if (!LOCAL_REPAIR_ENABLED) {\n  }\n${source.slice(to)}`;
      expect(mutated).not.toEqual(source);
      expect(localRepairPublicEndpointProblems(mutated)).toContain(NOT_INTERRUPTING);
    });

    /**
     * Kontrola same mjere: log ispred returna je i dalje koda prije prekida, pa je problem; ali
     * ispravan blok s dodatnim zaglavljima u ISTOM `new Response(...)` mora ostati cist.
     */
    it.each(ENDPOINTS)('%s: iskaz prije returna u strazi je problem', (name) => {
      const source = endpointSource(name);
      const { from, to, body } = guardSpan(source);
      const mutated = source.slice(0, from)
        + body.replace('    return new Response(', "    await audit(request);\n    return new Response(")
        + source.slice(to);
      expect(mutated).not.toEqual(source);
      expect(localRepairPublicEndpointProblems(mutated)).toContain(NOT_INTERRUPTING);
    });

    it.each(ENDPOINTS)('%s: dodatno zaglavlje u istom odgovoru NE rusi gard', (name) => {
      const source = endpointSource(name);
      const { from, to, body } = guardSpan(source);
      const mutated = source.slice(0, from)
        + body.replace('      headers: NO_STORE_JSON,', "      headers: { ...NO_STORE_JSON, 'retry-after': '3600' },")
        + source.slice(to);
      expect(mutated).not.toEqual(source);
      expect(localRepairPublicEndpointProblems(mutated)).toEqual([]);
    });

    /** Zavrsetak retka ne smije mijenjati ishod: radna kopija je CRLF, CI je LF. */
    it.each(ENDPOINTS)('%s: gard daje isti popis nad CRLF i LF ulazom', (name) => {
      const lf = endpointSource(name);
      const crlf = lf.replace(/\n/g, '\r\n');
      expect(crlf).not.toEqual(lf);
      expect(localRepairPublicEndpointProblems(lf)).toEqual([]);
      expect(localRepairPublicEndpointProblems(crlf)).toEqual([]);

      const { from, to, body } = guardSpan(lf);
      const mutatedLf = lf.slice(0, from) + body.replace('return new Response(', 'new Response(') + lf.slice(to);
      expect(localRepairPublicEndpointProblems(mutatedLf)).toContain(NOT_INTERRUPTING);
      expect(localRepairPublicEndpointProblems(mutatedLf.replace(/\n/g, '\r\n')))
        .toEqual(localRepairPublicEndpointProblems(mutatedLf));
    });
  });

  /**
   * CETVRTI ADVERSARIJALNI PREGLED (2026-09-23, krug 5): gard je dokazivao da blok straze vraca 503,
   * ali ne i da se straza uopce IZVRSAVA. Oba oblika nize su reproducirana nad kopijom stvarnog
   * izvora i oba su tada vracala PRAZAN popis, a javni neautenticirani endpoint (verifyJwt: false)
   * je ostajao ziv: prvi za svaku metodu osim one u vanjskom uvjetu, drugi za svaki zahtjev jer je
   * cijela zastita mrtav kod.
   */
  describe('straza se mora izvrsiti na svakom zahtjevu', () => {
    const NESTED = 'straza zastavice je ugnijezdena u drugi blok umjesto na prvoj razini Deno.serve(...) handlera, pa se ne izvrsava na svakom zahtjevu';
    const OUTSIDE = 'straza zastavice je izvan tijela Deno.serve(...) handlera, pa se ne izvrsava na zahtjev';

    /** Granice bloka iz STVARNOG izvora, isto kao gore, da mutacija ne moze tiho promasiti oblik. */
    function guardSpan(source: string): { from: number; to: number; body: string } {
      const from = source.indexOf('  if (!LOCAL_REPAIR_ENABLED) {');
      const to = source.indexOf('\n  }\n', from) + '\n  }\n'.length;
      expect(from).toBeGreaterThan(-1);
      expect(to).toBeGreaterThan(from);
      const body = source.slice(from, to);
      expect(body).toContain('return new Response(');
      expect(body).toContain('status: 503');
      return { from, to, body };
    }

    it.each(ENDPOINTS)('%s: straza uvucena u drugi uvjet je problem', (name) => {
      const source = endpointSource(name);
      const { from, to, body } = guardSpan(source);
      const mutated = `${source.slice(0, from)}  if (request.method === 'POST') {\n${body}  }\n${source.slice(to)}`;
      expect(mutated).not.toEqual(source);
      // Generator stvarno proizvodi ciljanu klasu: straza je i dalje doslovno ista, samo ugnijezdena.
      expect(mutated).toContain("if (request.method === 'POST') {\n  if (!LOCAL_REPAIR_ENABLED) {");
      expect(mutated).toContain('status: 503');
      expect(localRepairPublicEndpointProblems(mutated)).toContain(NESTED);
    });

    it.each(ENDPOINTS)('%s: straza preseljena u pomocnu strelicu koja se ne zove je problem', (name) => {
      const source = endpointSource(name);
      const { from, to, body } = guardSpan(source);
      const withoutGuard = source.slice(0, from) + source.slice(to);
      const serveAt = withoutGuard.indexOf('Deno.serve(');
      expect(serveAt).toBeGreaterThan(-1);
      const helper = `const disabledResponse = (): Response | null => {\n${body}  return null;\n};\n\n`;
      const mutated = withoutGuard.slice(0, serveAt) + helper + withoutGuard.slice(serveAt);
      expect(mutated).not.toEqual(source);
      // Generator dokazuje klasu ulaza: straza je cijela sacuvana, ali izvan tijela handlera.
      expect(mutated).toContain('const disabledResponse = (): Response | null => {');
      expect(mutated).toContain('  if (!LOCAL_REPAIR_ENABLED) {');
      expect(mutated).toContain('status: 503');
      expect(localRepairPublicEndpointProblems(mutated)).toContain(OUTSIDE);
    });

    it.each(ENDPOINTS)('%s: straza u pomocnoj strelici UNUTAR handlera je problem', (name) => {
      const source = endpointSource(name);
      const { from, to, body } = guardSpan(source);
      const helper = `  const disabledResponse = (): Response | null => {\n${body}    return null;\n  };\n`;
      const mutated = source.slice(0, from) + helper + source.slice(to);
      expect(mutated).not.toEqual(source);
      expect(mutated).toContain('  const disabledResponse = (): Response | null => {');
      expect(localRepairPublicEndpointProblems(mutated)).toContain(NESTED);
    });

    /**
     * Kontrola same mjere: straza pomaknuta NIZE unutar istog tijela handlera (jos uvijek prva
     * razina, jos uvijek prije Supabase klijenta) mora ostati cista. Bez ove kontrole nova provjera
     * bi mogla biti zelena samo zato sto odbija svaki pomak.
     */
    it.each(ENDPOINTS)('%s: straza nize u istom tijelu handlera NE rusi gard', (name) => {
      const source = endpointSource(name);
      const { from, to, body } = guardSpan(source);
      const withoutGuard = source.slice(0, from) + source.slice(to);
      const clientAt = withoutGuard.indexOf('  const admin = createClient(SUPABASE_URL');
      expect(clientAt).toBeGreaterThan(-1);
      const mutated = withoutGuard.slice(0, clientAt) + body + withoutGuard.slice(clientAt);
      expect(mutated).not.toEqual(source);
      expect(localRepairPublicEndpointProblems(mutated)).toEqual([]);
    });

    it.each(ENDPOINTS)('%s: dosezljivost se mjeri isto nad CRLF i LF ulazom', (name) => {
      const lf = endpointSource(name);
      const { from, to, body } = guardSpan(lf);
      const mutatedLf = `${lf.slice(0, from)}  if (request.method === 'POST') {\n${body}  }\n${lf.slice(to)}`;
      const mutatedCrlf = mutatedLf.replace(/\n/g, '\r\n');
      expect(mutatedCrlf).not.toEqual(mutatedLf);
      expect(localRepairPublicEndpointProblems(mutatedLf)).toContain(NESTED);
      expect(localRepairPublicEndpointProblems(mutatedCrlf))
        .toEqual(localRepairPublicEndpointProblems(mutatedLf));
    });
  });
});
