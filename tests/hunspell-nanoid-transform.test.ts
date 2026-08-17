import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fixHunspellNanoid } from '../vite.config';

function transformedCode(result: { code: string; map: null } | null): string {
  expect(result).not.toBeNull();
  if (!result) throw new Error('Hunspell transform nije primijenjen.');
  expect(result.map).toBeNull();
  return result.code;
}

describe('lekta-fix-hunspell-nanoid', () => {
  const plugin = fixHunspellNanoid();

  it('stvarni Hunspell ESM runtime prebacuje na pozivljivi browser default import', () => {
    const id = resolve(process.cwd(), 'node_modules/hunspell-asm/dist/esm/loadModule.js');
    const source = readFileSync(id, 'utf8');
    const code = transformedCode(plugin.transform(source, id));
    expect(code).toContain("import runtime from './lib/browser/hunspell'");
    expect(code).not.toContain("import * as runtime from './lib/node/hunspell'");
  });

  it('stvarni loader uklanja nanoid import, zadržava nanoid(45) i generira 45 znakova', () => {
    const id = resolve(process.cwd(), 'node_modules/emscripten-wasm-loader/dist/esm/path/mountBuffer.js');
    const source = readFileSync(id, 'utf8');
    const code = transformedCode(plugin.transform(source, id));
    expect(code).not.toMatch(/from ['"]nanoid['"]/);
    expect(code).toContain('nanoid(45)');

    const declaration = code.match(/const nanoid=\(n=21\)=>\{[^\n]+return s\};/)?.[0];
    expect(declaration).toBeTruthy();
    const generated = Function(`${declaration}; return nanoid(45);`)() as string;
    expect(generated).toHaveLength(45);
    expect(generated).toMatch(/^[A-Za-z0-9_-]{45}$/);
  });

  it('ne dira nepovezane module', () => {
    expect(plugin.transform("import nanoid from 'nanoid'", resolve(process.cwd(), 'src/example.ts'))).toBeNull();
  });
});
