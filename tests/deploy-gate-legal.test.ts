// @vitest-environment node
/**
 * Deploy gate nad pravnim identitetom pruzatelja: DVA praga, ne jedan.
 *
 * Gate je dugo tvrdo padao samo uz `LEKTA_COMMERCE_LIVE=1`, uz obrazlozenje "za BESPLATNU
 * analizu je prazan identitet podnosljiv". To je vrijedilo dok je besplatni sloj bio 100%
 * lokalna analiza. Besplatna beta popravka (`REPAIR_FREE_MODE=true`) uploada i POHRANJUJE
 * dokument, sto GO_LIVE_REPAIR.md sam zove privatnosnim zaokretom, pa GDPR cl. 13 trazi
 * imenovanog voditelja obrade neovisno o naplati.
 *
 * `verify-deploy-dist.mjs` se izvodi tek na kraju Netlify build lanca i trazi pravi `dist/`, pa se cijeli
 * skript ne pokrece u Vitestu. Pravilo registracije izvuceno je u izvrsivi helper; AST provjera
 * potvrduje da skript njegovu gresku spaja s fatalnim deploy padom.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import {
  COMMERCE_PROVIDER_REGISTRATION_REQUIRED,
  enforceCommerceProviderRegistration,
} from '../scripts/deploy-gate-provider.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'scripts/verify-deploy-dist.mjs'), 'utf8');
const provider = JSON.parse(readFileSync(path.join(ROOT, 'data/legal/provider.json'), 'utf8'));

/** Tijelo objektnog literala imenovane konstante (od `= {` do prvog `};`). */
function objectBody(name: string): string {
  const start = src.indexOf(`const ${name} = {`);
  expect(start, `${name} ne postoji u verify-deploy-dist.mjs`).toBeGreaterThan(-1);
  const end = src.indexOf('};', start);
  expect(end, `${name} nema zatvaranje`).toBeGreaterThan(start);
  return src.slice(start, end);
}

/** Tijelo `if (...) { ... }` grane, omedjeno stvarnim parom viticastih zagrada. */
function branchBody(marker: string): string {
  const at = src.indexOf(marker);
  expect(at, `grana ne postoji: ${marker}`).toBeGreaterThan(-1);
  const open = src.indexOf('{', at);
  expect(open).toBeGreaterThan(at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`grana nije zatvorena: ${marker}`);
}

type AstNode = { type: string; [key: string]: unknown };

function astNodes(value: unknown): AstNode[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter(
    (entry): entry is AstNode => typeof entry === 'object' && entry !== null && 'type' in entry && typeof (entry as { type?: unknown }).type === 'string',
  );
}

function callName(node: AstNode): string | null {
  const callee = astNodes(node.callee)[0];
  return callee?.type === 'Identifier' && typeof callee.name === 'string' ? callee.name : null;
}

function containsCall(node: AstNode, name: string): boolean {
  if (node.type === 'CallExpression' && callName(node) === name) return true;
  return Object.values(node).some((value) => astNodes(value).some((child) => containsCall(child, name)));
}

function commercePolicyWiring(source: string): { properties: string[]; failureCallbackCallsFail: boolean }[] {
  const ast = parse(source, { sourceType: 'module', plugins: ['topLevelAwait'] }) as unknown as AstNode;
  const wirings: { properties: string[]; failureCallbackCallsFail: boolean }[] = [];
  const visit = (node: AstNode): void => {
    if (node.type === 'CallExpression' && callName(node) === 'enforceCommerceProviderRegistration') {
      const options = astNodes(node.arguments)[0];
      if (options?.type === 'ObjectExpression') {
        const properties = astNodes(options.properties);
        const propertyName = (property: AstNode): string => {
          const key = astNodes(property.key)[0];
          return key?.type === 'Identifier' && typeof key.name === 'string' ? key.name : '';
        };
        const failure = properties.find((property) => propertyName(property) === 'fail');
        const initializer = failure ? astNodes(failure.value)[0] : undefined;
        const failureCallbackCallsFail = initializer?.type === 'ArrowFunctionExpression' && containsCall(initializer, 'fail');
        wirings.push({ properties: properties.map(propertyName), failureCallbackCallsFail });
      }
    }
    Object.values(node).forEach((value) => astNodes(value).forEach(visit));
  };
  visit(ast);
  return wirings;
}
describe('deploy gate: pravni identitet pruzatelja', () => {
  it('gard protiv vakuumskog prolaza: gate i dalje cita data/legal/provider.json', () => {
    expect(src).toContain("'data', 'legal', 'provider.json'");
    // Ako se ovo promijeni, ostatak testa mjeri mrtav kod.
    expect(src).toContain('const provider = JSON.parse(');
  });

  it('prag OBRADE trazi voditelja i sjediste, a NE trazi podatke trgovca', () => {
    const processing = objectBody('REQUIRED_FOR_PROCESSING');
    expect(processing).toContain('privacyController');
    expect(processing).toContain('address');
    // OIB i telefon su ZZP predugovorne informacije trgovca, ne GDPR cl. 13; ne smiju blokirati
    // betu popravka, inace se prag obrade ne moze zadovoljiti bez registriranog trgovca.
    expect(processing).not.toContain('oib');
    expect(processing).not.toContain('phone');
  });

  it('prag NAPLATE nasljeduje prag obrade i dodaje OIB i telefon', () => {
    const commerce = objectBody('REQUIRED_FOR_COMMERCE');
    expect(commerce).toContain('...REQUIRED_FOR_PROCESSING');
    expect(commerce).toContain('oib');
    expect(commerce).toContain('phone');
  });

  it('LEKTA_REPAIR_LIVE je vezan uz fail(), ne samo uz upozorenje', () => {
    expect(src).toContain("process.env.LEKTA_REPAIR_LIVE === '1'");
    // Tijelo grane, omedjeno zagradama: prozor fiksne duljine bi procurio u sljedeci blok
    // i test bi mjerio tudji `console.warn`.
    const body = branchBody('if (repairLive && missingForProcessing.length)');
    expect(body).toContain('fail(');
    expect(body).not.toContain('console.warn');
  });

  it('LEKTA_COMMERCE_LIVE ostaje tvrd (regresija na postojece ponasanje)', () => {
    expect(src).toContain("process.env.LEKTA_COMMERCE_LIVE === '1'");
    const body = branchBody('if (commerceLive && missingForCommerce.length)');
    expect(body).toContain('fail(');
    expect(body).not.toContain('console.warn');
  });

  it('naplata prolazi samo kad je isključena ili pružatelj izričito registriran', () => {
    expect(provider.providerRegistered).toBe(false);
    expect(String(provider.oib ?? '').trim()).not.toBe('');
    expect(String(provider.phone ?? '').trim()).not.toBe('');

    const run = (commerceLive: boolean, providerRegistered: unknown) => {
      const failures: string[] = [];
      enforceCommerceProviderRegistration({
        commerceLive,
        provider: { ...provider, providerRegistered },
        fail: (message) => failures.push(message),
      });
      return failures;
    };

    expect(run(true, false)).toEqual([COMMERCE_PROVIDER_REGISTRATION_REQUIRED]);
    expect(run(true, null)).toEqual([COMMERCE_PROVIDER_REGISTRATION_REQUIRED]);
    expect(run(true, true)).toEqual([]);
    expect(run(false, false)).toEqual([]);
  });

  it('verify-deploy-dist wires the executed policy to its fatal deploy failure', () => {
    expect(commercePolicyWiring(src)).toEqual([{
      properties: ['commerceLive', 'provider', 'fail'],
      failureCallbackCallsFail: true,
    }]);
  });

  it('okidac praga obrade se izvodi iz ISPORUCENOG bundlea, ne samo iz zastavice', () => {
    // Prva verzija je visjela SAMO o LEKTA_REPAIR_LIVE=1, a tu varijablu ne postavlja nista u
    // lancu deploya, dok DEFAULT_PRODUCTION_CONFIG odavno salje zivi repair-docx. Gate je time
    // bio inertan tocno u stanju za koje je pisan.
    expect(src).toContain('shippedCapabilities');
    expect(src).toMatch(/repairLive\s*=\s*process\.env\.LEKTA_REPAIR_LIVE === '1' \|\| shipped\.repair/);
    // OBA praga, ne samo obrada: naplata bez registriranog subjekta je isti kvar, drugi zakon.
    expect(src).toMatch(/commerceLive\s*=\s*process\.env\.LEKTA_COMMERCE_LIVE === '1' \|\| shipped\.commerce/);
    // Sama detekcija (prazan literal vs zivi poziv, spread oblik paymentLinks) dokazuje se
    // sintetickim bundleom u tests/deploy-gate-shipped-config.test.ts, jer pravi dist danas ima
    // naplatu ugasenu pa bi nad njim isao dokazati samo negativan smjer.
    expect(src).toContain('deploy-gate-shipped-config.mjs');
  });

  it('upozorenje o pragu naplate ne utihne kad popravak ozivi', () => {
    // Prije je uvjet glasio `!commerceLive && !repairLive`, pa bi cim popravak postane ziv
    // nedostajuci oib/phone nestali iz ispisa sve do tvrdog pada na naplati.
    expect(src).toContain('if (!commerceLive && missingForCommerce.length)');
    expect(src).not.toContain('if (!commerceLive && !repairLive && missingForCommerce.length)');
  });

  it('javni podaci voditelja su potpuni, a registracija ima neovisno eksplicitno stanje', () => {
    const controller = String(provider.privacyController ?? '').trim();
    const address = String(provider.address ?? '').trim();
    const oib = String(provider.oib ?? '').trim();
    const phone = String(provider.phone ?? '').trim();

    expect(controller).not.toBe('');
    expect(address).not.toBe('');
    expect(oib).not.toBe('');
    expect(phone).not.toBe('');
    expect(provider.providerRegistered).toBe(false);
  });
});
