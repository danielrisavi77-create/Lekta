/**
 * evaluateFormatting (faza D, sav 1): CISTA evaluacija oblikovanja
 * (measurements, profile, strict) -> { checks, issues }. Bez DOM-a, bez zip-a, bez
 * awaita: sutra moze zivjeti u Deno Edge funkciji uz src/scoring/** i audits/metrics.
 *
 * Tijela grana su PRESELJENA IZ src/analysis/analyze-docx.ts (blok Dominantni font ..
 * Polozaj i stil oznaka fusnota) BAJT-IDENTICNO: template literali se ne prepravljaju,
 * lokalna imena se destrukturiraju na ista imena koja je blok koristio. Jedine zamjene
 * izraza: footnotes.length -> footnoteCount, auditZeroParagraphSpacing(odlomci) ->
 * evaluateZeroParagraphSpacing(mjerenje). Golden (checks+issues+stats) dokazuje
 * bajt-identicnost emitiranog; tests/evaluate-formatting.test.ts dokazuje ekvivalenciju
 * i cistocu (deep-freeze ulaza).
 *
 * REDOSLIJED JE UGOVOR: checks se emitiraju tocno onim redom kojim ih je blok pushao
 * (categoryTotals i golden snapshot ovise o insertion orderu); issues nose samo
 * marginske direktne pushe, na istoj relativnoj poziciji kao prije.
 */
// Eksplicitne .ts ekstenzije: modul se dijeli s Deno Edge okruzenjem (Academic Core),
// a Deno ih u relativnim importima zahtijeva (ista konvencija kao src/report za repair-docx).
import { makeCheck, unmeasurableCheck, issue } from '../checks.ts';
import { near } from '../../audits/metrics.ts';
import { normalize } from '../../utils/helpers.ts';
import { evaluateZeroParagraphSpacing } from '../../audits/structure.ts';
import type { FormattingMeasurements } from './measurements.ts';

/**
 * Koliko odlomaka smije obuhvatiti PRVA sekcija da bi se jos smatrala naslovnicom.
 *
 * Provjera margina prolazi kroz SVAKU zivu sekciju i oduzima 1,5 boda po odstupajucoj strani.
 * Naslovnica s vlastitim `w:sectPr` i drugacijim marginama time je obarala cijelu provjeru sa 6/6
 * na 0/6, jer odstupaju sve cetiri strane odjednom (izmjereno, vidi
 * `tests/margins-title-page-section.test.ts`). To nije rubni slucaj: `grf-doktorski`,
 * `fhs-doktorski` i `agr-doktorski` u istoj recenici iz koje je pravilo preuzeto izricito kazu
 * "Naslovnica ima drugacije margine", pa je rad koji tocno slijedi svoju uputu gubio svih 6 bodova.
 * Ucinak nije bio vezan uz profil: pada i `efzg-specijalisticki`, koji o naslovnici ne govori nista.
 *
 * Odstupanje prve sekcije zato je UPOZORENJE (jedna odbitnica), ne pad. Prag postoji da se pod
 * "naslovnicu" ne bi moglo sakriti pola rada: sekcija dulja od ovoga boduje se normalno.
 */
const TITLE_PAGE_MAX_PARAGRAPHS = 5;

export function evaluateFormatting(m: FormattingMeasurements, profile: any, strict: number): { checks: any[]; issues: any[] } {
 const checks: any[]=[];const issues: any[]=[];
 const dominantFont=m.body.font,dominantSize=m.body.size,dominantSpacing=m.body.spacing,dominantAlign=m.body.align;
 const sections=m.sections as any[];
 const footnoteCount=m.footnotes.count,endnoteCount=m.footnotes.endnoteCount,footnoteMarkers=m.footnotes.markers;
 const dominantFootnoteFont=m.footnotes.dominants.font,dominantFootnoteSize=m.footnotes.dominants.size,dominantFootnoteSpacing=m.footnotes.dominants.spacing,dominantFootnoteAlign=m.footnotes.dominants.align;
 const fontOk=profile.checkFont===false||profile.font.some((x: any)=>normalize(x)===normalize(dominantFont.value));checks.push(profile.checkFont!==false&&!dominantFont.value?unmeasurableCheck('formatting','Dominantni font','Word nije zapisao font ni u jednom runu, stilu ni temi, pa dominantni font nije moguće očitati.'):makeCheck('formatting','Dominantni font',profile.checkFont===false?'pass':fontOk?'pass':'fail',profile.checkFont===false?0:(fontOk?8:1),profile.checkFont===false?0:8,profile.checkFont===false?'Informativno: font nije potvrđen kao obvezno pravilo za ovaj profil':`${dominantFont.value} (${Math.round(dominantFont.share*100)}% analiziranog teksta)`,fontOk?null:issue('error','formatting','Dominantni font ne odgovara profilu',`Pronađen je ${dominantFont.value}, a profil očekuje ${profile.font.join(' ili ')}.`)));
 let sizeOk=profile.checkSize===false||profile.size.some((x: any)=>near(Number(dominantSize.value),x,.1));checks.push(profile.checkSize!==false&&!dominantSize.value?unmeasurableCheck('formatting','Veličina osnovnog teksta','Word nije zapisao veličinu ni u jednom runu, stilu ni temi.'):makeCheck('formatting','Veličina osnovnog teksta',profile.checkSize===false?'pass':sizeOk?'pass':'fail',profile.checkSize===false?0:(sizeOk?6:1),profile.checkSize===false?0:6,profile.checkSize===false?'Informativno: veličina nije potvrđena kao obvezno pravilo za ovaj profil':`${dominantSize.value} pt`,sizeOk?null:issue('error','formatting','Veličina osnovnog teksta odstupa',`Dominantna veličina je ${dominantSize.value} pt; očekivano: ${profile.size.join(' ili ')} pt.`)));
 const spVal=Number(dominantSpacing.value),spOk=profile.checkSpacing===false||near(spVal,profile.spacing,strict);checks.push(profile.checkSpacing!==false&&!dominantSpacing.value?unmeasurableCheck('formatting','Prored osnovnog teksta','Word ne zapisuje prored kad je ostavljen na zadanoj vrijednosti, pa ga nije moguće izmjeriti.'):makeCheck('formatting','Prored osnovnog teksta',profile.checkSpacing===false?'pass':spOk?'pass':'fail',profile.checkSpacing===false?0:(spOk?6:1),profile.checkSpacing===false?0:6,profile.checkSpacing===false?'Informativno: prored nije potvrđen kao obvezno pravilo za ovaj profil':`${spVal.toFixed(2)}`,spOk?null:issue('error','formatting','Prored nije usklađen s profilom',`Dominantni prored je ${spVal.toFixed(2)}, a očekuje se ${profile.spacing}.`)));
 const _marginMeasured=(sections as any[]).filter((s: any)=>s&&s.margins).length;let marginEarn=6,marginDetail=profile.checkMargins===false?'Službena uputa ne navodi brojčane margine ? bez bodovnog kažnjavanja':'Margine nisu pronađene';if(profile.checkMargins!==false&&sections.length){const bad: any[]=[],coverBad: any[]=[];/* Izvor koji trazi "rubovi moraju biti siroki NAJMANJE 2,5 cm" ne kaznjava sira polja. Bez ovoga je rad s 3 cm sa svih strana, dakle uskladjen, padao na 0/6 jer je near() trazio TOCNU vrijednost uz toleranciju 0,36 cm. Izmjereno na forenzika-diplomski. */const _marginAtLeast=profile.marginsMinimum===true,_marginOk=(got: any,want: any)=>_marginAtLeast?Number(got)>=Number(want)-strict*3:near(got,want,strict*3);const _coverLenient=sections.length>1&&sections[0]&&sections[0].margins&&(sections[0].paragraphIndex==null||sections[0].paragraphIndex<=TITLE_PAGE_MAX_PARAGRAPHS);sections.forEach((s,i)=>{if(!s.margins)return;for(const side of ['top','right','bottom','left'])if(s.margins[side]!=null&&!_marginOk(s.margins[side],profile.margins[side]))(i===0&&_coverLenient?coverBad:bad).push(`${i+1}. sekcija: ${side} ${s.margins[side].toFixed(2)} cm`)});marginEarn=bad.length?Math.max(0,6-bad.length*1.5):(coverBad.length?5:6);marginDetail=bad.length?bad.slice(0,4).join(' · '):(coverBad.length?`Naslovnica (1. sekcija) ima druge margine: ${coverBad.slice(0,4).join(' · ')}. Tijelo rada odgovara profilu.`:`Sve izmjerene sekcije (${_marginMeasured}) ${_marginAtLeast?'nisu manje od profilom propisanog najmanjeg ruba':'približno odgovaraju profilu'}`);if(bad.length)issues.push(issue('warning','formatting',(_marginAtLeast?'Margine su uže od najmanjih dopuštenih':'Margine nisu jednake očekivanim postavkama'),bad.slice(0,8).join('; '),'Postavke stranice'));else if(coverBad.length)issues.push(issue('warning','formatting','Naslovnica ima druge margine od tijela rada',coverBad.slice(0,8).join('; ')+' · mnoge upute naslovnicu izuzimaju, pa ovo nije pad nego napomena','Postavke stranice'))}checks.push(profile.checkMargins!==false&&!_marginMeasured?unmeasurableCheck('formatting','Margine dokumenta','Nijedna sekcija dokumenta nema zapisane margine (w:pgMar), pa ih nije moguće usporediti s profilom.'):makeCheck('formatting','Margine dokumenta',profile.checkMargins===false?'pass':marginEarn===6?'pass':marginEarn>=3?'warn':'fail',profile.checkMargins===false?0:marginEarn,profile.checkMargins===false?0:6,profile.checkMargins===false?'Informativno: brojčane margine nisu potvrđene kao obvezno pravilo za ovaj profil':marginDetail));
 const justified=['both','distribute'].includes(dominantAlign.value as any),alignOk=profile.checkJustify===false||!profile.justify||justified;checks.push(profile.checkJustify!==false&&profile.justify&&!dominantAlign.value?unmeasurableCheck('formatting','Poravnanje osnovnog teksta','Word nije zapisao poravnanje ni u jednom odlomku ni stilu, pa ga nije moguće izmjeriti.'):makeCheck('formatting','Poravnanje osnovnog teksta',profile.checkJustify===false?'pass':alignOk?'pass':'warn',profile.checkJustify===false?0:(alignOk?4:2),profile.checkJustify===false?0:4,profile.checkJustify===false?'Informativno: poravnanje nije potvrđeno kao obvezno pravilo za ovaj profil':dominantAlign.value as any,alignOk?null:issue('warning','formatting','Osnovni tekst nije dominantno obostrano poravnat','Odabrani profil očekuje obostrano poravnanje odlomaka.')));
 if(profile.paperSizes&&profile.paperSizes.length){const PS: any={A4:[21,29.7],A3:[29.7,42],A2:[42,59.4],A1:[59.4,84.1],A0:[84.1,118.8]};const allow=profile.paperSizes.map((n: any)=>PS[n]).filter(Boolean);const psMeasured=sections.filter(s=>s.page&&s.page.w!=null&&s.page.h!=null);const psBad=psMeasured.filter(s=>!allow.some(([w,h]: any)=>(near(s.page.w,w,.6)&&near(s.page.h,h,.8))||(near(s.page.h,w,.6)&&near(s.page.w,h,.8))));const psOk=!psBad.length;const psLbl=profile.paperSizes.join('/');checks.push(!psMeasured.length?unmeasurableCheck('formatting',`Format stranice (${psLbl})`,'Nijedna sekcija nema zapisanu veličinu stranice (w:pgSz).'):makeCheck('formatting',`Format stranice (${psLbl})`,psOk?'pass':'warn',psOk?3:1,3,psOk?`Sve izmjerene sekcije (${psMeasured.length}) koriste ${profile.paperSizes.join(' ili ')}`:`${psBad.length} sekcija odstupa od formata ${psLbl}`,psOk?null:issue('warning','formatting','Format stranice ne odgovara profilu',`Profil očekuje ${profile.paperSizes.join(' ili ')}.`)))}else if(profile.requireA4){const a4Measured=sections.filter(s=>s.page&&s.page.w!=null&&s.page.h!=null);const badSize=a4Measured.filter(s=>!((near(s.page.w,21,.35)&&near(s.page.h,29.7,.35))||(near(s.page.h,21,.35)&&near(s.page.w,29.7,.35))));const a4Ok=!badSize.length;checks.push(!a4Measured.length?unmeasurableCheck('formatting','Format stranice A4','Nijedna sekcija nema zapisanu veličinu stranice (w:pgSz).'):makeCheck('formatting','Format stranice A4',a4Ok?'pass':'warn',a4Ok?3:1,3,a4Ok?`Sve izmjerene sekcije (${a4Measured.length}) koriste A4`:`${badSize.length} sekcija odstupa od A4`,a4Ok?null:issue('warning','formatting','Format stranice možda nije A4','Provjeri Page Size / Veličina papira u Wordu.')))}else if(profile.advisoryDimensions&&profile.advisoryDimensions.includes('paper-size')){checks.push(makeCheck('formatting','Format stranice A4','pass',0,0,'Format A4 je preporuka odabranog profila',null))}
/**
 * FUSNOTE: dvije provjere, dvije razlicite kapije, i to je ispravak iz 2026-09-12.
 *
 * `Automatske fusnote` ne mjeri oblikovanje nego TRAZI da fusnote uopce postoje. To je pravni
 * zahtjev ("Pravni profil ocekuje bibliografske i pravne izvore u numeriranim Word fusnotama"), pa
 * ostaje iskljucivo profilu s `legalFootnoteProfile`: seminarski rad nije duzan imati nijednu
 * fusnotu i pao bi na zahtjevu koji mu nitko nije postavio.
 *
 * `Oblikovanje fusnota` mjeri font, velicinu, prored i poravnanje PREMA PROFILU, pa se racuna
 * svakom profilu koji ijednu od tih dimenzija propisuje. Do ovog ispravka je i ona visjela o
 * `legalFootnoteProfile`, pa je 48 profila koji fusnote oblikovno propisuju ostajalo nemjereno,
 * dok im je `footnote-typography-fixer` bio PONUDJEN. Posljedica nije bila samo rupa u mjerenju:
 * `violated` je ostajao `false` zauvijek, `buildDefaultRepairRequests` predodabire
 * `violated !== false`, pa stavka nikad nije bila predodabrana, a `matchKeys` je gadjao naslov
 * provjere koje u rezultatu nema.
 */
 if(profile.legalFootnoteProfile){const hasNotes=footnoteCount>0;checks.push(makeCheck('formatting','Automatske fusnote',hasNotes?'pass':'fail',hasNotes?4:0,4,hasNotes?`${footnoteCount} Word fusnota`:(endnoteCount?`Pronađeno je ${endnoteCount} endnota (bilježaka na kraju dokumenta), a profil traži fusnote na dnu stranice`:'Nije pronađena nijedna Word fusnota'),hasNotes?null:issue('error','citations',endnoteCount?'Bilješke su na kraju dokumenta, a ne u fusnotama':'Nisu pronađene automatske fusnote',endnoteCount?`Rad koristi ${endnoteCount} endnota. Pravni profil očekuje iste izvore u numeriranim Word fusnotama na dnu stranice (Reference, Umetni fusnotu).`:'Pravni profil očekuje bibliografske i pravne izvore u numeriranim Word fusnotama.','Fusnote')))}
 /**
  * SVAKA PODPROVJERA MORA BITI PRAZNO ISTINITA KAD JU PROFIL NE PROPISUJE.
  *
  * Zatecena formula je to imala naopako: `ffOk=!dom.font||(profile.footnoteFont||[]).some(...)`.
  * Profilu bez `footnoteFont` je `[].some()` uvijek `false`, pa bi `ffOk` pao cim je font u
  * dokumentu izmjeren, i profil koji propisuje SAMO velicinu gubio bi bodove na fontu koji nikad
  * nije propisao. Prored je nosio jaci oblik istog: `near(fsp,profile.footnoteSpacing||1,.12)` tiho
  * podmece 1 kao propis.
  *
  * Za zatecene profile to NE MIJENJA NISTA, i to je izmjereno, ne pretpostavljeno: svih pet profila
  * s `legalFootnoteProfile` propisuje sve tri dimenzije (font, velicina, prored), pa su nove ograde
  * ondje no-op.
  */
 const _fnFont=(Array.isArray(profile.footnoteFont)?profile.footnoteFont:[]).filter((x: any)=>typeof x==='string'&&x);
 const _fnSize=(Array.isArray(profile.footnoteSize)?profile.footnoteSize:[profile.footnoteSize]).filter((x: any)=>Number.isFinite(Number(x))&&Number(x)>0);
 const _fnSpacingTrazen=Number(profile.footnoteSpacing),_fnImaSpacing=Number.isFinite(_fnSpacingTrazen)&&_fnSpacingTrazen>0,_fnImaJustify=profile.footnoteJustify===true;
 const _fnPropisuje=_fnFont.length>0||_fnSize.length>0||_fnImaSpacing||_fnImaJustify;
 if(_fnPropisuje){
  /**
   * NEMJERLJIVO SE RACUNA SAMO NAD PROPISANIM DIMENZIJAMA.
   *
   * Zatecena verzija je brojala sve cetiri dominante bez obzira propisuje li ih profil. Kad bi se
   * provjera prosirila na profile koji propisuju samo velicinu, dokument koji velicinu NE zapisuje
   * a zapisuje poravnanje prosao bi s punih 6/6: sve podprovjere su prazno istinite, a `_fnMeasured`
   * je razlicit od nule. To je vakuumsko zeleno, isti razred kao hijerarhija naslova iz 2026-08-17.
   * Zato se broje samo dimenzije koje profil TRAZI i dokument ZAPISUJE.
   */
  const _fnMjereno=[_fnFont.length?dominantFootnoteFont.value:null,_fnSize.length?dominantFootnoteSize.value:null,_fnImaSpacing?dominantFootnoteSpacing.value:null,_fnImaJustify?dominantFootnoteAlign.value:null].filter(Boolean).length;
  const ffOk=!_fnFont.length||!dominantFootnoteFont.value||_fnFont.some((x: any)=>normalize(x)===normalize(dominantFootnoteFont.value)),fsOk=!_fnSize.length||!dominantFootnoteSize.value||_fnSize.some((x: any)=>near(Number(dominantFootnoteSize.value),Number(x),.1)),fsp=Number(dominantFootnoteSpacing.value),fspOk=!_fnImaSpacing||!dominantFootnoteSpacing.value||near(fsp,_fnSpacingTrazen,.12),fJust=['both','distribute'].includes(dominantFootnoteAlign.value as any),faOk=!_fnImaJustify||fJust||!dominantFootnoteAlign.value;
  const footFmtOk=ffOk&&fsOk&&fspOk&&faOk;
  // Ocekivanje se IZVODI iz profila, ne prepisuje. Zatecen tekst je doslovno glasio "Ocekuje se
  // Times New Roman 10, prored 1 ...", sto je za 48 novih profila bila tvrdnja o pravilu koje oni
  // nemaju.
  const _fnOcekivano=[_fnFont.length?_fnFont.join(' ili '):null,_fnSize.length?`${_fnSize.join(' ili ')} pt`:null,_fnImaSpacing?`prored ${_fnSpacingTrazen}`:null,_fnImaJustify?'obostrano poravnanje':null].filter(Boolean).join(', ');
  checks.push(!_fnMjereno?unmeasurableCheck('formatting','Oblikovanje fusnota',`Nijedna dimenzija koju profil propisuje (${_fnOcekivano}) nije zapisana u dokumentu.`):makeCheck('formatting','Oblikovanje fusnota',footFmtOk?'pass':'warn',footFmtOk?6:2,6,`font ${dominantFootnoteFont.value||'nije očitan'} · ${dominantFootnoteSize.value||'?'} pt · prored ${dominantFootnoteSpacing.value?fsp.toFixed(2):'?'} · poravnanje ${dominantFootnoteAlign.value||'?'}`,footFmtOk?null:issue('warning','formatting','Fusnote odstupaju od pravila profila',`Profil za fusnote propisuje: ${_fnOcekivano}.`,'Fusnote')));
 }
 if(profile.checkParagraphSpacingZero)checks.push(evaluateZeroParagraphSpacing(m.paragraphSpacing,'Razmak prije i poslije odlomka'));
 if(profile.checkFootnoteParagraphSpacingZero)checks.push(evaluateZeroParagraphSpacing(m.footnoteParagraphSpacing,'Razmak prije i poslije fusnota'));
 if(profile.checkFootnoteMarkerPosition){const italic=footnoteMarkers.filter(x=>x.italic),misplaced=footnoteMarkers.filter(x=>x.before===','||x.after==='.');const ok=!italic.length&&!misplaced.length;checks.push(makeCheck('formatting','Položaj i stil oznaka fusnota',ok?'pass':'warn',ok?4:Math.max(1,4-italic.length-misplaced.length),4,`${footnoteMarkers.length} oznaka · ${italic.length} ukošenih · ${misplaced.length} uz pogrešnu stranu zareza/točke`,ok?null:issue('warning','formatting','Oznake fusnota nisu pravilno postavljene',[...italic.map(x=>`bilj. ${x.id} je ukošena`),...misplaced.map(x=>`bilj. ${x.id} uz ${x.before||'∅'}|${x.after||'∅'}`)].slice(0,10).join('; '),'Oznake fusnota')))}
 return{checks,issues};
}
