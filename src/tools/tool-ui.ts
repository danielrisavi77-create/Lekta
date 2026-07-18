// Zajednicki DOM helperi za besplatne alate: preuzimanje datoteke i copy-gumb s
// potvrdom i fallbackom. Uklanjaju 4-5x dupliciran objectURL/copy obrazac po glue-u
// i rjesavaju dvije UX greske (dvoklik zaglavi gumb; kopiranje tiho zakaze bez Clipboard API-ja).

/** Stvarno pocetno stanje <select> elementa (iz HTML 'selected' atributa), ne uvijek prva
 *  opcija: npr. "Vrsta rada" ima 'Diplomski rad' selected (treca opcija), pa bi selectedIndex=0
 *  u 'Ocisti' vratio pogresan default. hasAttribute('selected') cita izravno HTML atribut
 *  (za razliku od .defaultSelected, koji neki testni DOM-ovi ne implementiraju). */
export function defaultSelectedIndex(select: any): number {
  const opts: any[] = Array.from(select?.options || []);
  const idx = opts.findIndex((o) => o.hasAttribute && o.hasAttribute('selected'));
  return idx >= 0 ? idx : 0;
}

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

interface DownloadButtonOptions {
  failLabel?: string;
  holdMs?: number;
  statusEl?: any;      // opcionalni aria-live/hint element: neuspjeh se ondje ispisuje kao tekst
  failStatus?: string;
}

/**
 * Vezi gumb za preuzimanje: na klik pozove buildBlob() (koji smije baciti, npr. docx generator)
 * i preuzme rezultat. buildBlob() koji vrati null/undefined (npr. nema sadrzaja) tiho ne radi
 * nista, isto kao dosadasnji rani return. Kad generiranje ili preuzimanje baci, gumb NE ostaje
 * nijem: privremeno pokazuje failLabel (analogno bindCopyButton), uz opcionalnu aria-live poruku,
 * pa primarni CTA nikad ne izgleda kao da klik nije napravio nista.
 */
export function bindDownloadButton(
  btn: any,
  buildBlob: () => Blob | null | undefined,
  filename: string,
  opts: DownloadButtonOptions = {},
): void {
  if (!btn) return;
  const failLabel = opts.failLabel ?? 'Preuzimanje nije uspjelo';
  const holdMs = opts.holdMs ?? 2200;
  const original = btn.textContent;
  let timer = 0;
  btn.addEventListener('click', () => {
    try {
      const blob = buildBlob();
      if (!blob) return;
      downloadBlob(blob, filename);
    } catch {
      if (timer) clearTimeout(timer);
      btn.textContent = failLabel;
      if (opts.statusEl && opts.failStatus) {
        opts.statusEl.className = 'out-hint warn';
        opts.statusEl.textContent = opts.failStatus;
      }
      timer = window.setTimeout(() => {
        btn.textContent = original;
        timer = 0;
      }, holdMs);
    }
  });
}

interface CopyButtonOptions {
  failLabel?: string;
  failStatus?: string; // override zadane fallback poruke kad stranica nema vidljiv blok za rucno oznacavanje
  holdMs?: number;
  statusEl?: any;       // opcionalni aria-live element: ishod se najavljuje citacu ekrana (WCAG 4.1.3)
}

// Dodirni uredjaji nemaju fizicku Ctrl tipku, pa zadana poruka o neuspjeloj kopiji ne smije
// pretpostaviti tipkovnicku kombinaciju na njima (i tamo je fallback selekcija cesce nepouzdana,
// npr. 'readonly' textarea ometa selekciju na iOS Safariju, pa je bas taj put vjerojatniji ondje).
function isCoarsePointer(): boolean {
  try {
    return !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
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
  const okLabel = 'Kopirano ✓';
  const coarse = isCoarsePointer();
  const failLabel = opts.failLabel ?? (coarse ? 'Odaberi i kopiraj ručno' : 'Označi pa Ctrl+C');
  const holdMs = opts.holdMs ?? 1600;
  const okStatus = 'Sažetak kopiran u međuspremnik.';
  const failStatus = opts.failStatus
    ?? (coarse ? 'Kopiranje nije uspjelo, odaberi tekst i kopiraj ga ručno.' : 'Kopiranje nije uspjelo, označi tekst pa Ctrl+C.');
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
