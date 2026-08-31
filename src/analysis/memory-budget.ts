/**
 * Memorijski proracun analize (BL-P0-05-7: OOM na slabom mobitelu). DOCX se cita cijeli u
 * memoriju, document.xml se inflira do desetaka ili stotina MB, a DOM parse je jos nekoliko
 * puta veci; na uredaju s malo RAM-a to moze TIHO srusiti karticu (pravi OOM se ne moze uhvatiti
 * try/catchem). Zato radimo preventivno: manja gornja granica uploada i nizi dekompresijski
 * budzet na slabom uredaju daju RANIJE, jasno odbijanje umjesto tihog pada.
 *
 * Ciste funkcije bez DOM-a: navigator.deviceMemory i matchMedia('(pointer:coarse)') citaju
 * pozivatelji (src/ui/app.ts) i prosljedjuju vrijednosti ovamo, pa je logika jedinicno testabilna.
 */

const MB = 1024 * 1024;

/**
 * `uploadCapBytes` VISE NE ZIVI OVDJE nego u `src/repair/docx-budget.ts`, uz zajednicku tvrdu
 * granicu `DOCX_MAX_UPLOAD_BYTES`. Razlog je granica bundlea, ne stil: minimalni intake put mora
 * moci odbiti prevelik dokument bez povlacenja cijelog analitickog grafa. Re-export cuva
 * postojeci API analizatora (`src/ui/app.ts` i dalje uvozi odavde), pa nijedan pozivatelj ne
 * mora znati za selidbu.
 */
export { uploadCapBytes } from '../repair/docx-budget';

/**
 * Dekompresijski budzet PO ZAPISU koji se salje ZipReaderu na slabom uredaju:
 *  - deviceMemory <= 2 GB: 100 MB,
 *  - deviceMemory <= 4 GB: 150 MB,
 *  - coarse pointer bez deviceMemory (iOS Safari, mobilni Firefox): 150 MB,
 *  - jaci uredaj: null (ZipReader koristi puni MAX_DECOMPRESSED_BYTES = 200 MB).
 * Vracanjem null-a na jacem uredaju ponasanje ostaje identicno golden korpusu, koji ZipReaderu
 * NE salje budzet; time se OOM-guard aktivira samo tamo gdje je stvarno potreban.
 *
 * coarsePointer se MORA uzeti u obzir (AUD-03): iOS Safari i svi Firefox ne izlazu
 * navigator.deviceMemory, pa bi bez toga dodirni uredaji dobili puni 200 MB budzet koji ih
 * ovaj guard treba stegnuti (uploadCapBytes vec tretira coarsePointer kao mobitel).
 */
export function decompressionBudgetBytes(opts: { deviceMemory?: number | null; coarsePointer?: boolean } = {}): number | null {
  const dm = typeof opts.deviceMemory === 'number' && opts.deviceMemory > 0 ? opts.deviceMemory : null;
  if (dm !== null && dm <= 2) return 100 * MB;
  if (dm !== null && dm <= 4) return 150 * MB;
  if (opts.coarsePointer) return 150 * MB;
  return null;
}
