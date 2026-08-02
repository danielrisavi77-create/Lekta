/**
 * Web Worker za cross-check protiv izvorne gradje (source-cross-check.ts): ekstrakcija teksta
 * izvornih datoteka (source-material-text.ts) + n-gram preklapanje + provjera tvrdnji rade izvan
 * glavne niti, isti razlog kao analyze-docx.worker.ts (S2) - vise izvornih datoteka odjednom moze
 * potrajati. Zaseban worker (ne dijeli analyze-docx.worker.ts) da glavni analiza-bundle ne raste
 * za korisnike koji ovaj (placeni, opt-in) feature nikad ne pokrenu.
 *
 * Protokol: ulaz {thesisParagraphs, sourceFiles: File[], options?}; izlaz {type:'result',result}
 * ili {type:'error', name, message}.
 */
import { extractSourceMaterialText } from './source-material-text';
import { analyzeSourceCrossCheck } from './source-cross-check';

const port = self as unknown as Worker;

port.onmessage = async (ev: MessageEvent) => {
  const { thesisParagraphs, sourceFiles, options } = ev.data || {};
  try {
    const sourceDocs = await Promise.all((sourceFiles || []).map((f: File) => extractSourceMaterialText(f)));
    const result = analyzeSourceCrossCheck({ thesisParagraphs: thesisParagraphs || [], sourceDocs, options });
    port.postMessage({ type: 'result', result });
  } catch (e: any) {
    port.postMessage({ type: 'error', name: (e && e.name) || 'Error', message: e && e.message ? String(e.message) : String(e) });
  }
};
