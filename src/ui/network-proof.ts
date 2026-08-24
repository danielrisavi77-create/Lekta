/**
 * Dokaziva privatnost (Faza 4 briefa): tijekom analize mjeri stvarne mrezne zahtjeve preglednika
 * (PerformanceObserver nad resource entries) i posteno prijavi koliko ih je otislo prema VANJSKIM
 * posluziteljima. Cilj: tvrdnja "dokument ne napusta uredaj" postaje mjerljiva, ne samo copy.
 *
 * POSTENJE (tvrdo pravilo iz briefa): NIKAD ne hardkodiramo nulu. Brojimo sve resource zapise u
 * prozoru analize; ako je opt-in analitika nesto poslala (cross-origin na Supabase), to se vidi.
 * Ako PerformanceObserver nije dostupan, brojka nije pouzdana pa se komponenta NE prikazuje.
 *
 * Same-origin zapisi (app chunkovi, worker) NISU odljev podatka (to je sama aplikacija), pa je
 * kljucna brojka `external` (cross-origin). Prikaz uvijek navodi i total radi pune transparentnosti.
 */

export interface ResourceLike {
  name?: string;
  startTime?: number;
}

export interface NetworkSummary {
  /** Svi mrezni (http/https) zapisi u prozoru. */
  total: number;
  /** Zapisi prema drugom originu (potencijalni odljev). */
  external: number;
  /** Jedinstveni vanjski hostovi (za posten prikaz sto je poslano). */
  externalHosts: string[];
  /** Je li mjerenje pouzdano (PerformanceObserver dostupan). */
  supported: boolean;
}

/** Cista agregacija: klasificira resource zapise na total/external prema danom originu. */
export function summarizeResourceEntries(entries: ResourceLike[], origin: string): Omit<NetworkSummary, 'supported'> {
  let total = 0;
  let external = 0;
  const hosts = new Set<string>();
  for (const e of entries || []) {
    const name = String(e?.name || '');
    if (!/^https?:/i.test(name)) continue; // preskoci data:, blob:, prazno
    total++;
    try {
      const u = new URL(name);
      if (u.origin !== origin) {
        external++;
        hosts.add(u.host);
      }
    } catch {
      /* neispravan URL: broji se u total, ne u external */
    }
  }
  return { total, external, externalHosts: [...hosts] };
}

export interface NetworkProbe {
  /** Zaustavi mjerenje i vrati sazetak. */
  stop(): NetworkSummary;
}

/**
 * Pokreni mjerenje mreznih zahtjeva. Vraca probe s `stop()` ili null kad mjerenje nije pouzdano
 * (nema PerformanceObserver/performance). Skuplja resource zapise ciji je startTime unutar prozora.
 */
export function startNetworkProbe(): NetworkProbe | null {
  try {
    if (typeof PerformanceObserver !== 'function' || typeof performance === 'undefined' || typeof location === 'undefined') return null;
    const start = performance.now();
    const collected: ResourceLike[] = [];
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if ((e as any).startTime >= start) collected.push(e as any);
    });
    obs.observe({ type: 'resource', buffered: false });
    return {
      stop(): NetworkSummary {
        try {
          // Ukljuci i zapise koje observer jos nije dostavio (buffered dohvat na kraju prozora).
          const all = typeof performance.getEntriesByType === 'function' ? performance.getEntriesByType('resource') : [];
          const seen = new Set(collected.map((e) => `${e.name}|${e.startTime}`));
          for (const e of all as any[]) {
            if (e.startTime >= start && !seen.has(`${e.name}|${e.startTime}`)) collected.push(e);
          }
          obs.disconnect();
        } catch {
          /* ignoriraj */
        }
        return { ...summarizeResourceEntries(collected, location.origin), supported: true };
      },
    };
  } catch {
    return null;
  }
}

export interface NetworkProofMessage {
  safe: boolean;
  text: string;
  hint: string;
}

/**
 * Sazetak -> poruka na hrvatskom (bez HTML-a). null kad mjerenje nije pouzdano (ne prikazuj).
 * opts.rulesFetchedFromServer: od faze B pravila odabranog profila dolaze s Lektinog
 * posluzitelja PRIJE mjernog prozora analize (runAnalysis: await ensureProfileRules ide
 * prije startNetworkProbe). Taj zahtjev ne nosi nista iz dokumenta, ali POSTENJE trazi
 * da ga poruka izrijekom imenuje umjesto da ga presuti.
 */
export function networkProofMessage(
  s: NetworkSummary | null | undefined,
  opts: { rulesFetchedFromServer?: boolean } = {},
): NetworkProofMessage | null {
  if (!s || !s.supported) return null;
  const hint = 'Provjeri sam: otvori DevTools → Network.';
  const rulesNote = opts.rulesFetchedFromServer
    ? ' Pravila odabranog profila dohvaćena su s Lektinog poslužitelja prije analize; taj zahtjev sadrži samo identifikator profila, ništa iz dokumenta.'
    : '';
  if (s.external === 0) {
    return {
      safe: true,
      text: `Tijekom analize tvoj dokument nije poslan nijednom vanjskom poslužitelju (0 vanjskih mrežnih zahtjeva).${rulesNote}`,
      hint,
    };
  }
  const n = s.external;
  const zahtjev = n === 1 ? 'zahtjev' : n < 5 ? 'zahtjeva' : 'zahtjeva';
  return {
    safe: false,
    text: `Tijekom analize zabilježeno je ${n} vanjskih mrežnih ${zahtjev} (${s.externalHosts.join(', ')}). Sadržaj rada se ne šalje; ovo su npr. dopuštene usluge kojima si dao privolu.`,
    hint,
  };
}
