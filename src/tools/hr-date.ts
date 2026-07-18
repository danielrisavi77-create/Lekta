// Formatiranje ISO datuma (YYYY-MM-DD iz <input type="date">) u hrvatski oblik
// "3. srpnja 2026." preko Intl.DateTimeFormat('hr-HR', ...) - isti izlaz (provjereno za
// svih 12 mjeseci) kao deadline-reminder-toggle.ts, koji vec formatira hrvatske datume
// preko Intl. Godina/mjesec/dan idu kroz new Date(y, m-1, d) (LOKALNE komponente), ne
// new Date(isoString) (koji bi se parsirao kao UTC ponoc i mogao pomaknuti dan kod
// formatiranja u lokalnom vremenu izvan srednjoeuropske zone).
const CROATIAN_DATE = new Intl.DateTimeFormat('hr-HR', { day: 'numeric', month: 'long', year: 'numeric' });

/** "2026-07-03" -> "3. srpnja 2026."; prazno za neispravan ulaz. */
export function formatCroatianDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  if (!m) return '';
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const date = new Date(year, month - 1, day);
  // Date auto-rolla neispravne dane u sljedeci mjesec (npr. 31.4. -> 1.5.), pa mjesec/dan
  // provjeravamo POSLIJE round-tripa: ako se ne poklapaju s ulazom, kalendarski je neispravan
  // (30. veljace, 31. travnja, 29.2. u neprijestupnoj godini).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return CROATIAN_DATE.format(date);
}
