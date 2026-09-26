// PRIVREMENI wrapper za lokalni pregled worktreea (nije dio proizvoda, obrisi nakon pregleda).
// node_modules worktreea je junction na glavno stablo, pa Vite fontove razrjesava na realnu
// putanju izvan roota i vraca 403; ovdje se glavno stablo dodaje u allow-listu.
import { mergeConfig, type ConfigEnv, type UserConfig } from 'vite';
import base from './vite.config';

export default async (env: ConfigEnv): Promise<UserConfig> => {
  const resolved = typeof base === 'function' ? await (base as (e: ConfigEnv) => UserConfig | Promise<UserConfig>)(env) : (base as UserConfig);
  return mergeConfig(resolved, { server: { fs: { allow: ['C:/Users/PC/Desktop/Lekta', 'C:/Users/PC/Desktop/Lekta/.claude/worktrees/put-do-100'] } } });
};
