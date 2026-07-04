/**
 * Instalacija @xmldom/xmldom kao globalnog DOMParsera; jedan izvor istine za oba potrosaca:
 *
 *  - testni setup (tests/setup/xml-dom.ts) FORCE podmece implementaciju preko happy-doma,
 *    jer happy-dom ne radi pravi XML namespace parsing (vidi komentar u setupu); golden
 *    snapshoti su snimljeni upravo ovom implementacijom;
 *  - Web Worker analize (src/analysis/analyze-docx.worker.ts) je instalira jer worker
 *    okruzenje uopce nema DOMParser. Time je parsiranje u workeru IDENTICNO testnom
 *    okruzenju, pa golden korpus pokriva produkcijsku worker putanju.
 */
import { DOMParser as XmlDomParser } from '@xmldom/xmldom';

export function installXmlDomParser(force = false): void {
  const g = globalThis as unknown as { DOMParser?: unknown };
  if (force || typeof g.DOMParser === 'undefined') g.DOMParser = XmlDomParser;
}
