/**
 * Ciste strukturne evaluacije BEZ teksta (faza D, sav 2): brojevi stranica, opseg u
 * stranicama, prazni odlomci. Sve troše SAMO mjerenja (sekcije + strukturni otisak +
 * brojaci), nikad odlomke ni tekst rada, pa mogu zivjeti u Deno Edge funkciji.
 *
 * Tijela su PRESELJENA BAJT-IDENTICNO iz src/analysis/analyze-docx.ts (blokovi Brojevi
 * stranica :249, Opseg u stranicama :255, Prazni odlomci :283). Jedine zamjene izraza:
 *   _pageFields.some(...)                          -> m.structure.pageFieldInBody
 *   firstPageParagraphs(paragraphs).at(-1).index   -> m.structure.firstPageEndIndex
 *   paragraphs.find(...sectionName(p.text)...)      -> m.structure.introParagraphIndex
 *   empty / paragraphs.length                       -> m.structure.emptyParagraphs / m.counts.paragraphs
 *   storedPages                                     -> m.counts.storedPages
 * Golden (checks+issues) dokazuje bajt-identicnost; tests/evaluate-structure.test.ts
 * dokazuje ekvivalenciju s pipelineom i cistocu (deep-freeze).
 *
 * REDOSLIJED: svaka funkcija emitira checkove tocno onim redom kojim ih je jezgra
 * pushala; pozivatelj ih ubacuje na ISTOJ poziciji (insertion order je ugovor goldena).
 */
// Eksplicitne .ts ekstenzije: Deno-dijeljen modul (vidi formatting.ts).
import { makeCheck, issue } from '../checks.ts';
import type { StructureEvalMeasurements } from './measurements.ts';

/** Blok "Brojevi stranica" + poravnanje + naslovnica bez broja + numeriranje od Uvoda. */
export function evaluatePageNumbers(m: StructureEvalMeasurements, profile: any): any[] {
 const checks: any[]=[];
 const sections=m.sections as any[];
 const pageNums=m.structure.pageFieldInBody;const pageOk=!profile.requirePageNumbers||pageNums;const pnScored=!!profile.requirePageNumbers;checks.push(makeCheck('structure','Brojevi stranica',pageOk?'pass':'fail',profile.requirePageNumbers?(pageOk?4:0):0,profile.requirePageNumbers?4:0,pageNums?'Pronađeno Word PAGE polje':'PAGE polje nije pronađeno',pageOk?null:issue('error','structure','Nisu pronađeni automatski brojevi stranica','Provjeri zaglavlja i podnožja te umetni Word PAGE polje.')));if(profile.pageNumberAlignment&&pageNums){const aligns=sections.flatMap(x=>Object.values(x.pageAlignments||{})).filter(Boolean),detectable=aligns.length>0,bad=aligns.filter((a: any)=>!['right','end'].includes(a)),ok=detectable&&!bad.length;checks.push(makeCheck('structure','Položaj broja stranice',ok?'pass':'warn',detectable&&pnScored?(ok?3:1):0,detectable&&pnScored?3:0,detectable?(ok?'Prepoznati brojevi stranica poravnani su desno':`Prepoznato poravnanje: ${[...new Set(aligns)].join(', ')}`):'Poravnanje PAGE polja nije moguće pouzdano očitati',ok?null:issue('warning','structure','Broj stranice nije postavljen desno','Profil traži broj stranice u donjem desnom dijelu stranice.','Numeriranje stranica')))}if(profile.checkTitlePageNumberSuppression&&pageNums){const frontEnd=m.structure.firstPageEndIndex,firstSection=sections[0],secondSection=sections[1],detectable=!!(firstSection?.titlePageDifferent||(secondSection&&firstSection?.paragraphIndex<=frontEnd+2)),titleSuppressed=!!(firstSection?.titlePageDifferent&&!firstSection.pageFields.first)||!!(secondSection&&firstSection.paragraphIndex<=frontEnd+2&&!firstSection.hasAnyPageField&&secondSection.hasAnyPageField);checks.push(makeCheck('structure','Naslovnica bez broja stranice',titleSuppressed?'pass':'warn',detectable&&pnScored?(titleSuppressed?3:1):0,detectable&&pnScored?3:0,titleSuppressed?'Word sekcije upućuju na skriven broj na prvoj stranici':detectable?'Nije potvrđeno posebno podnožje ili nenumerirana prva sekcija':'Word ne sprema dovoljno podataka za automatsku potvrdu; provjeri ručno',titleSuppressed?null:issue('warning','structure','Provjeri je li naslovnica bez broja stranice','Broj stranice treba biti automatski umetnut na svim stranicama osim naslovnice.','Numeriranje stranica')))}if(profile.checkPageNumberStartAtIntro&&pageNums){const introIdx=m.structure.introParagraphIndex,before=sections.filter(x=>introIdx!=null&&x.paragraphIndex<introIdx).at(-1),after=before?sections[sections.indexOf(before)+1]:sections.find(x=>x.pageNumbering?.start===1),detectable=introIdx!=null&&!!before&&!!after,startOk=!!after?.hasAnyPageField&&(after.pageNumbering?.start===1||!before.hasAnyPageField);checks.push(makeCheck('structure','Numeriranje od prve stranice Uvoda',startOk?'pass':'warn',detectable&&pnScored?(startOk?4:2):0,detectable&&pnScored?4:0,startOk?'Prepoznata je sekcija s numeriranjem glavnog teksta od 1':detectable?'Sekcije postoje, ali početak numeriranja na Uvodu nije potvrđen':'Word ne sprema dovoljno podataka za automatsku potvrdu; provjeri ručno',startOk?null:issue('warning','structure','Provjeri početak numeriranja na Uvodu','Prednji listovi trebaju biti bez vidljive oznake, a prva brojčana oznaka treba biti na prvoj stranici Uvoda.','Numeriranje stranica')))}
 return checks;
}

/** "Opseg u stranicama" (informativno, 0/0): spremljeni broj stranica vs profil. */
export function evaluateScopePages(m: StructureEvalMeasurements, profile: any): any[] {
 const checks: any[]=[];
 const storedPages=m.counts.storedPages;
 if(profile.pageMin||profile.pageMax||profile.pageTarget){const expected=profile.pageTarget?`oko ${profile.pageTarget}`:`${profile.pageMin||'?'}-${profile.pageMax||'?'}`;const detail=storedPages?`Word svojstvo dokumenta navodi ${storedPages} stranica; profil: ${expected}. Broj može biti zastario i uključivati prednje stranice ili priloge.`:`Word nije spremio pouzdan broj stranica; profil: ${expected}. Provjeri broj u otvorenom dokumentu.`;checks.push(makeCheck('structure','Opseg u stranicama','pass',0,0,detail,storedPages&&profile.pageMin&&profile.pageMax&&(storedPages<profile.pageMin||storedPages>profile.pageMax)?issue('info','structure','Spremljeni broj stranica je izvan profilnog raspona',detail,'Svojstva dokumenta'):null))}
 return checks;
}

/**
 * "Hijerarhija naslova" (do 6 bodova): preskakanje razine izmedju uzastopnih naslova.
 * Preseljeno bajt-identicno iz jezgre; `headings[i].text.slice(0,55)` -> `excerpt.slice(0,55)`
 * (excerpt je vec max 70, slice na 55 daje identican niz kao izvorni slice nad tekstom).
 */
export function evaluateHeadingHierarchy(m: StructureEvalMeasurements, profile: any): any[] {
 const headings=m.structure.headings;
 // PRVI naslov nije izuzet: razina prije njega je 0. Do 2026-08-24 je petlja kretala od i=1, pa
 // prvi naslov nije prolazio nikakvu provjeru, a posljedica nije bila teorijska: rad iz stvarnog
 // korpusa sa 14 naslova, SVI razine 3, nije imao nijedan uzastopni skok i dobivao je punih 6
 // bodova za hijerarhiju koje nema. Pravilo se ne mijenja, samo se prestaje preskakati prvi clan.
 let jumps: any[]=[],prevLevel=0;for(const h of headings){if(h.level>prevLevel+1)jumps.push(h);prevLevel=h.level}const styledHeadingCount=headings.length;
 // BEZ IJEDNOG NASLOVA provjera ne moze nista tvrditi, pa ne smije ni dati bodove: dotad je
 // dokument bez ijednog Heading odlomka dobivao 6/6 za hijerarhiju. Nula od nule je isti oblik
 // koji `auditHeadingRules` vec koristi ("Nema dovoljno Heading/Naslov odlomaka"), i ne kaznjava:
 // vadi provjeru i iz brojnika i iz nazivnika.
 if(!styledHeadingCount)return[makeCheck('structure','Hijerarhija naslova','warn',0,0,'Nema odlomaka u stilu Heading/Naslov, pa se hijerarhija ne moze provjeriti')];
 return[makeCheck('structure','Hijerarhija naslova',profile.scoreStructure===false?'pass':jumps.length?'warn':'pass',profile.scoreStructure===false?0:(jumps.length?Math.max(1,6-jumps.length):6),profile.scoreStructure===false?0:6,jumps.length?`${jumps.length} moguća preskakanja razine`:`${styledHeadingCount} naslova prepoznato`,jumps.length?issue('warning','structure','Naslovi preskaču razinu hijerarhije',jumps.slice(0,5).map(p=>`odlomak ${p.index}: ${p.excerpt.slice(0,55)}`).join('; ')):null)];
}

/**
 * "Dubina decimalnog numeriranja" (do 3 boda). Odluka tooDeep (regex nad tekstom +
 * numberingMap) donesena je PRI MJERENJU; ovdje se trosi samo gotov popis.
 */
export function evaluateHeadingDepth(m: StructureEvalMeasurements, profile: any): any[] {
 const checks: any[]=[];
 if(profile.maxDecimalLevels){const tooDeep=m.structure.tooDeepParagraphs;const depthOk=!tooDeep.length;checks.push(makeCheck('structure','Dubina decimalnog numeriranja',profile.scoreStructure===false?'pass':depthOk?'pass':'warn',profile.scoreStructure===false?0:(depthOk?3:1),profile.scoreStructure===false?0:3,depthOk?`Nisu pronađeni naslovi dublji od ${profile.maxDecimalLevels} razine`:`${tooDeep.length} naslova ima više od ${profile.maxDecimalLevels} razine`,depthOk?null:issue('warning','structure','Previše razina numeriranja naslova',tooDeep.slice(0,5).map(p=>`odlomak ${p.index}: ${p.excerpt.slice(0,70)}`).join('; '),'Naslovi')))}
 return checks;
}

/**
 * "Sadrzaj dokumenta" (do 5 bodova): TOC polje ili rucno utipkan sadrzaj. Vraca i
 * `toc` gate jer jezgra nakon njega odlucuje o auditDetailedToc (koji OSTAJE u jezgri:
 * treba runs i tekst stavki, tekst-lokalno zauvijek). Bajt-identicno preseljeno.
 */
export function evaluateTocPresent(m: StructureEvalMeasurements, profile: any): { checks: any[]; toc: boolean } {
 const _tocField=m.structure.tocFieldPresent,_manualTocEntries=m.structure.manualTocEntryCount;
 const toc=_tocField||_manualTocEntries>0;const tocOk=!profile.requireToc||toc;
 const checks=[makeCheck('structure','Sadržaj dokumenta',tocOk?'pass':'fail',profile.requireToc?(tocOk?5:0):0,profile.requireToc?5:0,_tocField?'Pronađeno je Word TOC polje':(_manualTocEntries?`Sadržaj je utipkan ručno (${_manualTocEntries} stavki), bez Word TOC polja: Word ga neće ažurirati pri promjeni stranica`:'Sadržaj nije pronađen'),tocOk?null:issue('error','structure','Nije pronađen sadržaj','Dodaj automatski sadržaj u Wordu i ažuriraj ga prije predaje.'))];
 return{checks,toc};
}

/** "Prazni odlomci" (informativno, 0/0): udio praznih odlomaka. */
export function evaluateEmptyParagraphs(m: StructureEvalMeasurements): any[] {
 const empty=m.structure.emptyParagraphs,paragraphsLen=m.counts.paragraphs;
 const emptyRatio=paragraphsLen?empty/paragraphsLen:0,emptyOk=emptyRatio<.18;
 return[makeCheck('elements','Prazni odlomci','pass',0,0,`${empty} praznih odlomaka (${Math.round(emptyRatio*100)}%)`,emptyOk?null:issue('info','elements','Dokument sadrži mnogo praznih odlomaka','Za razmake koristi postavke odlomka umjesto višestrukog pritiskanja tipke Enter.'))];
}
