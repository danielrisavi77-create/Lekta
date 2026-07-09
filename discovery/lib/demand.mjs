/**
 * Ciste funkcije za signal potraznje (WAITLIST_NEPOKRIVENI_FAKULTETI.md sekcija 7).
 *
 * Ulaz je agregat faculty_request_counts (po celiji: faculty+program+worktype). Rang je
 * strukturni prioritet za discovery: koje nepokrivene fakultete/celije korisnici najvise traze.
 * Bez mreze i bez I/O, pa je testabilno i deterministicno za dani ulaz.
 */

const num = (v) => Number(v) || 0;

/** Citljiv naziv celije: naziv fakulteta ako postoji, inace id, inace oznaka nepoznatog. */
function facultyLabel(row) {
  return String(row.faculty_name_raw || row.faculty_id || '(nepoznat fakultet)').trim();
}

/** Normaliziraj i rangiraj celije po potraznji: prvo jedinstveni trazitelji, pa ukupno, pa svjezina. */
export function rankCells(rows) {
  return rows
    .map((r) => ({
      facultyId: r.faculty_id ?? null,
      facultyName: r.faculty_name_raw ?? null,
      label: facultyLabel(r),
      inCatalog: r.faculty_id != null, // izvan kataloga (stanje C) => faculty_id je null
      programId: r.program_id ?? null,
      workType: r.work_type ?? null,
      totalRequests: num(r.total_requests),
      uniqueRequesters: num(r.unique_requesters),
      withEmail: num(r.with_email),
      firstSeen: r.first_seen ?? null,
      lastSeen: r.last_seen ?? null,
    }))
    .sort(
      (a, b) =>
        b.uniqueRequesters - a.uniqueRequesters ||
        b.totalRequests - a.totalRequests ||
        String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')) ||
        a.label.localeCompare(b.label),
    );
}

/**
 * Rollup po fakultetu. uniqueRequesters se NE zbraja preko celija (ista osoba moze traziti vise
 * celija) pa je faculty-level potraznja predstavljena ukupnim brojem zahtjeva i brojem celija.
 */
export function rollupByFaculty(rankedCells) {
  const byKey = new Map();
  for (const c of rankedCells) {
    const key = c.facultyId ?? `raw:${c.facultyName ?? ''}`;
    const agg = byKey.get(key) || {
      key,
      facultyId: c.facultyId,
      label: c.label,
      inCatalog: c.inCatalog,
      cellCount: 0,
      totalRequests: 0,
      withEmail: 0,
      firstSeen: c.firstSeen,
      lastSeen: c.lastSeen,
    };
    agg.cellCount += 1;
    agg.totalRequests += c.totalRequests;
    agg.withEmail += c.withEmail;
    if (String(c.firstSeen || '') && String(c.firstSeen || '') < String(agg.firstSeen || '9999')) agg.firstSeen = c.firstSeen;
    if (String(c.lastSeen || '') > String(agg.lastSeen || '')) agg.lastSeen = c.lastSeen;
    byKey.set(key, agg);
  }
  return [...byKey.values()].sort(
    (a, b) => b.totalRequests - a.totalRequests || b.cellCount - a.cellCount || a.label.localeCompare(b.label),
  );
}

/** Sazetak za zaglavlje izvjestaja. */
export function summarizeDemand(rankedCells, faculties) {
  return {
    cells: rankedCells.length,
    faculties: faculties.length,
    totalRequests: rankedCells.reduce((s, c) => s + c.totalRequests, 0),
    withEmail: rankedCells.reduce((s, c) => s + c.withEmail, 0),
    outsideCatalog: faculties.filter((f) => !f.inCatalog).length,
  };
}

/** Markdown izvjestaj potraznje (bez crtica u tekstu, hrvatski). */
export function renderDemandMarkdown(rankedCells, faculties, summary, generatedAt) {
  const L = [];
  L.push('# Signal potraznje (waitlist nepokriveni fakulteti)');
  L.push('');
  L.push(`Generirano: ${generatedAt}. Izvor: faculty_request_counts (zivi agregat).`);
  L.push('');
  L.push(
    `Sazetak: ${summary.faculties} fakulteta, ${summary.cells} celija, ${summary.totalRequests} zahtjeva ` +
      `(${summary.withEmail} s e-mailom), ${summary.outsideCatalog} fakulteta izvan kataloga.`,
  );
  L.push('');
  L.push('## Fakulteti po potraznji');
  L.push('');
  if (!faculties.length) L.push('Nema zahtjeva.');
  else {
    L.push('| # | Fakultet | U katalogu | Celije | Zahtjevi | S e-mailom | Zadnji |');
    L.push('|--:|----------|:----------:|-------:|---------:|-----------:|--------|');
    faculties.forEach((f, i) => {
      const when = String(f.lastSeen || '').slice(0, 10);
      L.push(
        `| ${i + 1} | ${f.label} | ${f.inCatalog ? 'da' : 'ne'} | ${f.cellCount} | ${f.totalRequests} | ${f.withEmail} | ${when} |`,
      );
    });
  }
  L.push('');
  L.push('## Celije po potraznji (top 50)');
  L.push('');
  if (!rankedCells.length) L.push('Nema zahtjeva.');
  else {
    L.push('| # | Fakultet | Program | Vrsta | Jedinstveni | Ukupno | S e-mailom |');
    L.push('|--:|----------|---------|-------|------------:|-------:|-----------:|');
    rankedCells.slice(0, 50).forEach((c, i) => {
      L.push(
        `| ${i + 1} | ${c.label} | ${c.programId || '-'} | ${c.workType || '-'} | ${c.uniqueRequesters} | ${c.totalRequests} | ${c.withEmail} |`,
      );
    });
  }
  L.push('');
  return L.join('\n') + '\n';
}
