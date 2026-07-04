// Formatiranje ISO datuma (YYYY-MM-DD iz <input type="date">) u hrvatski oblik
// "3. srpnja 2026." Deterministicno (vlastita tablica mjeseci u genitivu), bez ovisnosti
// o ICU/Intl. Cista funkcija, testabilna.

const MJESECI_GENITIV = [
  'siječnja', 'veljače', 'ožujka', 'travnja', 'svibnja', 'lipnja',
  'srpnja', 'kolovoza', 'rujna', 'listopada', 'studenoga', 'prosinca',
];

/** "2026-07-03" -> "3. srpnja 2026."; prazno za neispravan ulaz. */
export function formatCroatianDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  if (!m) return '';
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${day}. ${MJESECI_GENITIV[month - 1]} ${year}.`;
}
