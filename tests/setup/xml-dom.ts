/**
 * Test setup: podmetni pravi XML DOMParser (@xmldom/xmldom) kao globalni DOMParser.
 *
 * Zasto: happy-dom ne radi pravi XML namespace parsing (childNodes daju nodeName
 * "W:PPR" / localName "w:ppr"), pa direct() i parseStyles u src/main.ts pucaju, a
 * u pravom pregledniku rade (nodeName "w:pPr" / localName "pPr"). @xmldom/xmldom se
 * ponasa kao preglednik, pa OOXML parser daje vjerne rezultate. Engine se ne mijenja.
 */
import { DOMParser as XmlDomParser } from '@xmldom/xmldom';

(globalThis as unknown as { DOMParser: unknown }).DOMParser = XmlDomParser;
