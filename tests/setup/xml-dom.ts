/**
 * Test setup: podmetni pravi XML DOMParser (@xmldom/xmldom) kao globalni DOMParser.
 *
 * Zasto: happy-dom ne radi pravi XML namespace parsing (childNodes daju nodeName
 * "W:PPR" / localName "w:ppr"), pa direct() i parseStyles pucaju, a u pravom
 * pregledniku rade (nodeName "w:pPr" / localName "pPr"). @xmldom/xmldom se ponasa
 * kao preglednik, pa OOXML parser daje vjerne rezultate. Engine se ne mijenja.
 * Ista implementacija instalira se i u produkcijskom Web Workeru analize
 * (src/docx/xml-dom-install.ts), pa golden korpus pokriva worker putanju.
 */
import { installXmlDomParser } from '../../src/docx/xml-dom-install';

installXmlDomParser(true);
