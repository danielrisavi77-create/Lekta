/**
 * Auditi strukture (naslovi, razmaci odlomaka, prva stranica, TOC) izvuceni iz monolita,
 * korak 4 porta enginea. Tijela prepisana 1:1 iz monolita pa golden snapshoti ostaju
 * nepromijenjeni.
 *
 * Tipizirano na granici (`: any` za OOXML cvorove i inline callbacke), bez promjene
 * ponasanja; golden snapshoti ostaju nepromijenjeni.
 */
import { normalize, sectionName } from '../utils/helpers';
import { makeCheck, issue } from '../scoring/checks';
import { runMetrics, headingNumberInfo, isUppercaseText, isFrontMatterHeading, near } from './metrics';

export function auditHeadingRules(headings: any, rules: any): any{const candidates=headings.filter((h: any)=>h.headingLevel&&h.headingLevel<=Number(rules.maxLevel||9)&&!isFrontMatterHeading(h.text));if(!candidates.length)return[makeCheck('structure','Oblikovanje naslova po razinama','warn',0,0,'Nema dovoljno Heading/Naslov odlomaka za detaljnu provjeru')];const formatBad=[],numberBad=[],alignBad=[];for(const h of candidates){const expected=(rules.levels||{})[String(h.headingLevel)]||{},meta=runMetrics(h.runs),num=headingNumberInfo(h.text),autoNumber=!!h.pProps.num;const sizeOk=!rules.size||!meta.size||near(meta.size,rules.size,.15),upperOk=!expected.uppercase||isUppercaseText(h.text),boldOk=!expected.bold||meta.boldShare>=.65,italicOk=!expected.italic||meta.italicShare>=.65;if(!(sizeOk&&upperOk&&boldOk&&italicOk))formatBad.push({h,meta,expected});const numberExists=!rules.numberRequired||!!num||autoNumber,depthOk=!num||num.depth===h.headingLevel||(num.roman&&h.headingLevel===1&&rules.romanLevelOneAllowed),romanOk=!num||!num.roman||h.headingLevel===1&&rules.romanLevelOneAllowed,dotOk=!rules.trailingDot||!num||num.trailingDot;if(!(numberExists&&depthOk&&romanOk&&dotOk))numberBad.push(h);const a=h.pProps.align;if(a&&!['left','start'].includes(a))alignBad.push(h)}const fOk=!formatBad.length,nOk=!numberBad.length,aOk=!alignBad.length;return[makeCheck('structure','Oblikovanje naslova po razinama',fOk?'pass':'warn',fOk?6:Math.max(1,6-formatBad.length),6,fOk?`${candidates.length} naslova odgovara profilnim pravilima veličine i isticanja`:`${formatBad.length} od ${candidates.length} naslova odstupa od očekivanog velikog slova/bold/italic obrasca`,fOk?null:issue('warning','structure','Naslovi ne prate profil razina',formatBad.slice(0,7).map((x: any)=>`odlomak ${x.h.index}: ${x.h.text.slice(0,70)}`).join('; '),'Naslovi')),makeCheck('structure','Numeriranje naslova',nOk?'pass':'warn',nOk?4:Math.max(1,4-numberBad.length),4,nOk?'Prepoznato je dosljedno numeriranje u skladu s razinom naslova':`${numberBad.length} naslova nema odgovarajuću oznaku razine ili završnu točku`,nOk?null:issue('warning','structure','Numeriranje naslova nije dosljedno',numberBad.slice(0,7).map((h: any)=>`odlomak ${h.index}: ${h.text.slice(0,70)}`).join('; '),'Naslovi')),makeCheck('structure','Poravnanje naslova slijeva',aOk?'pass':'warn',aOk?3:1,3,aOk?'Nisu pronađeni naslovi izričito poravnani drugačije od lijevog ruba':`${alignBad.length} naslova izričito je poravnano drugačije`,aOk?null:issue('warning','structure','Naslovi nisu poravnani slijeva',alignBad.slice(0,7).map((h: any)=>`odlomak ${h.index}: ${h.text.slice(0,55)}`).join('; '),'Naslovi'))]}
export function auditZeroParagraphSpacing(paragraphs: any, label: any, category: any='formatting'): any{const candidates=paragraphs.filter((p: any)=>p.text&&p.text.length>15&&!p.headingLevel&&!/^(?:toc|sadrzaj)\s*\d*/i.test(p.styleName||'')),known=candidates.filter((p: any)=>p.pProps.before!=null||p.pProps.after!=null),bad=known.filter((p: any)=>Math.abs(Number(p.pProps.before||0))>.6||Math.abs(Number(p.pProps.after||0))>.6);if(!known.length)return makeCheck(category,label,'pass',3,3,'Razmak prije/poslije nije izričito zapisan u analiziranim stilovima; nema bodovnog kažnjavanja');const ok=!bad.length,share=known.length?Math.round(bad.length/known.length*100):0;return makeCheck(category,label,ok?'pass':'warn',ok?3:Math.max(1,3-bad.length/5),3,ok?`${known.length} provjerljivih odlomaka ima razmak 0 prije i poslije`:`${bad.length} od ${known.length} provjerljivih odlomaka odstupa (${share}%)`,ok?null:issue('warning',category,`${label} nije postavljen na 0`,bad.slice(0,8).map((p: any)=>`odlomak ${p.index||'fusnota'}: prije ${p.pProps.before??'?'} pt / poslije ${p.pProps.after??'?'} pt`).join('; '),label))}
export function firstPageParagraphs(paragraphs: any): any{const out: any=[];let nonempty=0,confident=false;for(const p of paragraphs){out.push(p);if(p.text)nonempty++;if(p.pageBreakAfter&&nonempty>=2){confident=true;break}if(out.length>=55)break}out.confident=confident;return out}
export function tocEntryParagraphs(paragraphs: any): any{const styled=paragraphs.filter((p: any)=>/^(?:toc|sadrzaj)\s*[1-9]$/i.test(String(p.styleName||'').trim())||/^(?:toc|sadrzaj)[1-9]$/i.test(normalize(p.styleName||'')));if(styled.length)return styled;const start=paragraphs.findIndex((p: any)=>['sadrzaj','contents','tableofcontents'].includes(sectionName(p.text)));if(start<0)return[];const out=[];for(let i=start+1;i<Math.min(paragraphs.length,start+100);i++){const p=paragraphs[i];if(p.headingLevel&&!/^(?:toc|sadrzaj)/i.test(p.styleName||''))break;if(p.text&&(/\t\s*\d+\s*$/.test(p.text)||/\s\d+\s*$/.test(p.text))&&p.text.length<250)out.push(p)}return out}

/**
 * Odlomci koji su STVARNE stavke popisa slika/tablica ispod zadanog naslova.
 *
 * Postoji jer je provjera "Popisi slika i tablica" dosad trazila SAMO naslov, pa je prazan
 * "Popis slika" nosio pune bodove. To nije bila teorijska rupa: do 2026-08-09 ju je proizvodio
 * i sam Repair Engine, ciji je popis bio Wordovo `TOC \c` polje nad natpisima koji namjerno
 * nemaju SEQ oznake, pa je nakon Fields.Update() pisalo "No table of contents entries found."
 *
 * Stavkom se smatra redak koji pocinje oznakom elementa i brojem ("Tablica 1...", "Slika 2..."),
 * ili redak koji zavrsava brojem stranice, kakav proizvodi Wordov generirani popis. Skeniranje
 * staje na prvom sljedecem naslovu, isto kao tocEntryParagraphs.
 */
export function elementListEntryParagraphs(paragraphs: any, headingNames: string[]): any[] {
  const start = paragraphs.findIndex((p: any) => headingNames.includes(sectionName(p.text)));
  if (start < 0) return [];
  const out: any[] = [];
  for (let i = start + 1; i < Math.min(paragraphs.length, start + 200); i++) {
    const p = paragraphs[i];
    if (p.headingLevel) break;
    const text = String(p.text || '').trim();
    if (!text) continue;
    const caption = /^(?:tablica|tabela|table|slika|figure|grafikon|chart)\s*\d/i.test(text);
    const pageNumbered = /\t\s*\d+\s*$/.test(text) || /\s\d+\s*$/.test(text);
    if (caption || pageNumbered) out.push(p);
  }
  return out;
}
