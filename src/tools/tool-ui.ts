// Zajednicki DOM helperi za besplatne alate: preuzimanje datoteke i copy-gumb s
// potvrdom i fallbackom. Uklanjaju 4-5x dupliciran objectURL/copy obrazac po glue-u
// i rjesavaju dvije UX greske (dvoklik zaglavi gumb; kopiranje tiho zakaze bez Clipboard API-ja).

/** Preuzmi Blob pod danim imenom; objectURL se uredno revoka. */
export function downloadBlob(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Kopiraj tekst: prvo Clipboard API, pa execCommand fallback (file:// / ne-HTTPS). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Clipboard API odbijen (npr. bez fokusa/HTTPS-a): padamo na execCommand */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

interface CopyButtonOptions {
  okLabel?: string;
  failLabel?: string;
  holdMs?: number;
  statusEl?: any;       // opcionalni aria-live element: ishod se najavljuje citacu ekrana (WCAG 4.1.3)
  okStatus?: string;
  failStatus?: string;
}

/**
 * Vezi copy gumb: na klik kopira getText() u clipboard, kratko pokaze potvrdu, pa vrati
 * ORIGINALNI label. Original se cuva jednom (pri vezanju) i prethodni timeout se cisti, pa
 * brzi dvoklik NE zaglavi gumb na privremenom tekstu. Bez Clipboard API-ja pokazuje uputu
 * (failLabel). Prazan getText() ne radi nista (gumb je i inace onemogucen kad nema sadrzaja).
 */
export function bindCopyButton(
  btn: any,
  getText: () => string,
  opts: CopyButtonOptions = {},
): void {
  if (!btn) return;
  const okLabel = opts.okLabel ?? 'Kopirano ✓';
  const failLabel = opts.failLabel ?? 'Označi pa Ctrl+C';
  const holdMs = opts.holdMs ?? 1600;
  const okStatus = opts.okStatus ?? 'Sažetak kopiran u međuspremnik.';
  const failStatus = opts.failStatus ?? 'Kopiranje nije uspjelo, označite tekst pa Ctrl+C.';
  const original = btn.textContent;
  let timer = 0;
  btn.addEventListener('click', async () => {
    const text = getText();
    if (!text) return;
    const ok = await copyText(text);
    if (timer) clearTimeout(timer);
    btn.textContent = ok ? okLabel : failLabel;
    // Vizualna potvrda je na gumbu; citac ekrana je dobiva preko aria-live statusa kad je predan.
    if (opts.statusEl) opts.statusEl.textContent = ok ? okStatus : failStatus;
    timer = window.setTimeout(() => {
      btn.textContent = original;
      timer = 0;
    }, holdMs);
  });
}
