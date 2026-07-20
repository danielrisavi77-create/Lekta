/**
 * Web Worker analize: analyzeDocx se izvrsava izvan glavne niti (S2, pravi lijek za
 * freeze na velikom ili zlonamjernom dokumentu; postojeci capovi ostaju prva obrana).
 * Worker nema DOMParser pa se instalira @xmldom/xmldom, ista implementacija kojom je
 * snimljen golden korpus (vidi src/docx/xml-dom-install.ts).
 *
 * Protokol: ulaz {file, profile, settings, options?}; izlaz {type:'progress',pct,msg} tijekom rada,
 * zatim {type:'result',result} ili {type:'error',name,message}. Greska analize putuje kao
 * PORUKA (analysisErrorMessage u UI-ju mapira po tekstu poruke, ne po instanceof).
 */
import { installXmlDomParser } from '../docx/xml-dom-install';
import { analyzeDocx } from './analyze-docx';

installXmlDomParser();

const port = self as unknown as Worker;

port.onmessage = async (ev: MessageEvent) => {
  const { file, profile, settings, options } = ev.data || {};
  try {
    const result = await analyzeDocx(file, profile, settings, (pct: number, msg: string) => {
      port.postMessage({ type: 'progress', pct, msg });
    }, options);
    port.postMessage({ type: 'result', result });
  } catch (e: any) {
    port.postMessage({ type: 'error', name: (e && e.name) || 'Error', message: e && e.message ? String(e.message) : String(e) });
  }
};
