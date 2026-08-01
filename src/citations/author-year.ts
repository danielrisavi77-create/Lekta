/**
 * Autor-godina citatni engine izvucen iz monolita (src/main.ts), korak 6 porta enginea.
 *
 * Ekstrakcija autor-godina citatnica i popisa literature (bibliografije). Tijela prepisana
 * 1:1 pa golden snapshoti (FPZG autor-godina dokumenti) ostaju nepromijenjeni.
 *
 * Tipizirano na granici (`: any` za dinamicne citatne strukture i inline callbacke),
 * bez promjene ponasanja; golden snapshoti ostaju nepromijenjeni.
 */
import { normalize, sectionName } from '../utils/helpers';

function citationAuthor(raw: any){
 let a=String(raw||'').replace(/^[\s,;:]+|[\s,;:]+$/g,'').replace(/^(?:vidi|usp\.?|prema|navedeno\s+u)\s+/i,'').trim();
 a=a.replace(/\bet\s+al\.?\b/gi,'').replace(/\bi\s+dr\.?\b/gi,'').trim();if(!a)return'';
 if(a.includes(','))a=a.split(',')[0].trim();const joined=a.split(/\s+(?:i|and|&)\s+/i);if(joined.length>1)a=joined[0].trim();
 return a.replace(/^[^\p{L}]+|[^\p{L}.'’\-\s]+$/gu,'').trim()
}
function citationAuthorFromPrefix(raw: any){
 let p=String(raw||'').replace(/[,:;\s]+$/g,'').trim();if(!p)return'';
 const matches=[...p.matchAll(/([\p{Lu}][\p{L}.'’\-]*(?:\s+(?:[\p{L}.'’\-]+)){0,7})$/gu)];if(!matches.length)return'';
 return citationAuthor(matches[matches.length-1][1])
}
function extractCitations(paragraphs: any){
 const found: any[]=[];const yearRe=/\b(?:18|19|20)\d{2}[a-z]?\b/giu;
 paragraphs.forEach((p: any,idx: any)=>{const t=p.text;if(!t)return;
  // Dopusti jednu razinu ugnijezdenih zagrada (npr. "(Markovic, 2019 (vidi tablicu 3))") tako da
  // trailing/umetnuta zagrada ne obori citat; godina mora ostati na vrhu. Determinizam po prvom
  // znaku (`[^()]` ILI `\(...\)`) drzi match linearnim (bez katastrofalnog backtrackinga).
  const par=/\(((?:[^()]|\([^()]*\)){0,360}\b(?:18|19|20)\d{2}[a-z]?(?:[^()]|\([^()]*\)){0,220})\)/giu;let m;
  while((m=par.exec(t))){let inner: any=m[1];if(/\bprema\b/i.test(inner))inner=inner.split(/\bprema\b/i).pop();let inherited='';
   for(const rawPart of inner.split(';')){const part=rawPart.trim();const years=[...part.matchAll(yearRe)].map((x: any)=>({value:x[0].toLowerCase(),index:x.index||0,length:x[0].length}));if(!years.length)continue;let prevEnd=0;
    for(const y of years){const prefix=part.slice(prevEnd,y.index);const a=citationAuthorFromPrefix(prefix);if(a&&/^\p{Lu}/u.test(a))inherited=a;else if(/[\p{L}]/u.test(prefix)&&!a){prevEnd=y.index+y.length;continue}
     if(inherited&&!/^\s*\d{1,4}\s*[\/.-]\s*$/.test(prefix))found.push({author:inherited,year:y.value,raw:m[0],p:idx+1,kind:'parenthetical'});prevEnd=y.index+y.length
    }
   }
  }
  // Vodeca granica je Unicode-svjesna (lookbehind), NE ASCII \b: prezime koje pocinje
  // dijakritikom (C/C/S/Z/Dj) nema ASCII granicu ispred sebe pa ga \b nikad ne uhvati.
  const narr=/(?<![\p{L}\p{N}])([\p{Lu}][\p{L}'’\-]{2,})(?:\s+(?:i|and|&)\s+[\p{Lu}][\p{L}'’\-]{2,})?\s*\(((?:18|19|20)\d{2}[a-z]?)\)/gu;
  while((m=narr.exec(t))){const before=t.slice(Math.max(0,m.index-40),m.index);if(/[\p{Lu}][\p{L}'’\-]{2,}\s+$/u.test(before))continue;found.push({author:citationAuthor(m[1]),year:m[2].toLowerCase(),raw:m[0],p:idx+1,kind:'narrative'})}
 });
 const unique: any[]=[];const seen=new Set();for(const c of found){if(!c.author)continue;const k=`${normalize(c.author)}|${c.year}|${c.p}|${c.kind}`;if(!seen.has(k)){seen.add(k);unique.push(c)}}return unique
}
function bibliographySubheading(n: any){return /(?:izvori|sources|dokumenti|documents|bibliografija|literatura)$/.test(n)||['elektronskiizvori','elektronickiizvori','mrezniizvori','mrezniimedijskiizvori','medijskiizvori','internetskiizvori','onlinesources','websources','ostalizvori','arhivskiizvori','pravniizvori','sluzbenidokumenti','novinskiizvori','znanstveniliteratura','knjigeiclanci'].includes(n)}
function referenceAuthor(before: any){
 let a=String(before||'').replace(/^\s*\d+[.)]?\s*/,'').replace(/^[\s,;:]+|[\s,;:]+$/g,'').trim();if(!a)return'';
 if(a.includes('/'))a=a.split('/')[0].trim();a=a.replace(/\s*\([^)]*$/,'').trim();
 if(a.includes(','))return a.split(',')[0].trim();const joined=a.split(/\s+(?:i|and|&)\s+/i);if(joined.length>1&&joined[0].trim().split(/\s+/).length<=3)return joined[0].trim();
 return a.replace(/[.(\[]+$/,'').trim()
}
function extractReferences(paragraphs: any,lang: any){
 const heads=lang==='en'?['references','bibliography']:['literatura','bibliografija','izvoriiliteratura','popisliterature'];let start=-1;
 for(let i=0;i<paragraphs.length;i++)if(heads.includes(sectionName(paragraphs[i].text))){start=i+1;break}if(start<0)return{start,entries:[]};
 const stopTerms=lang==='en'?['appendix','appendices','abstract','summary']:['prilozi','prilog','sazetak','summary','abstract','kljucnerijeci','keywords'];
 const entries: any[]=[];let current: any=null;
 for(let i=start;i<paragraphs.length;i++){const t=paragraphs[i].text.trim();if(!t)continue;const n=sectionName(t);if(stopTerms.some((x: any)=>n===x||n.startsWith(x)))break;
  if(bibliographySubheading(n)){current=null;continue}
  if(paragraphs[i].headingLevel&&entries.length)break;
  const noDate=t.match(/\((?:b\.g\.|n\.d\.|bez\s+godine)\)/i),ym=noDate?noDate:t.match(/\b((?:18|19|20)\d{2}[a-z]?|\?)\b/i);const numbered=/^\s*\d+[.)]\s+/.test(t);const urlOnly=/^(?:https?:\/\/|www\.|doi:|pristupljen|pristupljeno|accessed|retrieved)/i.test(t);
  const before=ym?t.slice(0,ym.index):t.slice(0,100);const author=ym?referenceAuthor(before):'';const startsNew=!!ym&&!!author&&!urlOnly;
  if(startsNew||numbered){current={text:t,author,year:ym&&!noDate&&/^\d{4}/.test(ym[1])?ym[1].toLowerCase():'',p:i+1};entries.push(current)}
  else if(current){current.text+=' '+t}
  else if(t.length>20){current={text:t,author:'',year:'',p:i+1};entries.push(current)}
 }
 return{start,entries}
}

export interface CitationOccurrenceDetail {
  paragraphIndex: number;
  start: number;
  end: number;
  rawText: string;
  author: string;
  year: string;
  suffix?: string;
  locator?: { label: string; value: string };
  form: 'parenthetical' | 'narrative';
  directQuote: boolean;
}

function citationLocator(raw: string, yearEnd: number): { label: string; value: string } | undefined {
  const tail = raw.slice(yearEnd);
  const match = tail.match(/\b(str\.?|pp?\.?|pages?)\s*([0-9]+(?:\s*[-–]\s*[0-9]+)?)/i);
  return match ? { label: match[1].replace(/\.$/, ''), value: match[2].replace(/\s+/g, '') } : undefined;
}

function quoteBefore(text: string, start: number): boolean {
  const before = text.slice(Math.max(0, start - 300), start);
  return /[„“"](?:[^„“"]{8,300})[”"“]\s*[,;:]?\s*[([{]?\s*$/u.test(before);
}

function detailedCitationAuthor(prefix: string): string {
  return prefix
    .replace(/^\s*(?:vidi|usp\.?|prema|navedeno\s+u)\s+/i, '')
    .replace(/[\s,;:]+$/g, '')
    .trim();
}

/** Detaljna, kompatibilna varijanta extractCitations s rasponima za asistirani repair. */
export function extractCitationOccurrences(paragraphs: Array<{ index?: number; text: string; cell?: unknown }>): CitationOccurrenceDetail[] {
  const found: CitationOccurrenceDetail[] = [];
  const parenthetical = /\(((?:[^()]|\([^()]*\)){0,360}\b(?:18|19|20)\d{2}[a-z]?(?:[^()]|\([^()]*\)){0,220})\)/giu;
  const yearRe = /\b((?:18|19|20)\d{2})([a-z]?)\b/giu;
  for (const [fallbackIndex, paragraph] of paragraphs.entries()) {
    if (!paragraph || paragraph.cell || !paragraph.text) continue;
    const text = paragraph.text;
    const paragraphIndex = Number(paragraph.index) || fallbackIndex + 1;
    let match: RegExpExecArray | null;
    while ((match = parenthetical.exec(text))) {
      const inner = match[1];
      let offset = 0;
      for (const part of inner.split(';')) {
        const trimmed = part.trim();
        if (!trimmed) { offset += part.length + 1; continue; }
        const leading = part.indexOf(trimmed);
        const years = [...trimmed.matchAll(yearRe)];
        for (const yearMatch of years) {
          const yearOffset = yearMatch.index ?? 0;
          const prefix = trimmed.slice(0, yearOffset);
          const author = citationAuthor(detailedCitationAuthor(prefix));
          if (!author) continue;
          const rawText = trimmed;
          const start = match.index + 1 + offset + leading;
          const yearEnd = yearOffset + yearMatch[0].length;
          const locator = citationLocator(rawText, yearEnd);
          const suffix = yearMatch[2]?.toLowerCase() || undefined;
          found.push({
            paragraphIndex,
            start,
            end: start + rawText.length,
            rawText,
            author,
            year: `${yearMatch[1]}${suffix || ''}`.toLowerCase(),
            ...(suffix ? { suffix } : {}),
            ...(locator ? { locator } : {}),
            form: 'parenthetical',
            directQuote: quoteBefore(text, start),
          });
          break;
        }
        offset += part.length + 1;
      }
    }

    const narrative = /(?<![\p{L}\p{N}])([\p{Lu}][\p{L}'’\-]{2,}(?:\s+(?:i|and|&)\s+[\p{Lu}][\p{L}'’\-]{2,})?)\s*\(((?:18|19|20)\d{2})([a-z]?)\)/gu;
    while ((match = narrative.exec(text))) {
      const author = citationAuthor(detailedCitationAuthor(match[1]));
      if (!author) continue;
      const suffix = match[3]?.toLowerCase() || undefined;
      const rawText = match[0];
      found.push({
        paragraphIndex,
        start: match.index,
        end: match.index + rawText.length,
        rawText,
        author,
        year: `${match[2]}${suffix || ''}`.toLowerCase(),
        ...(suffix ? { suffix } : {}),
        form: 'narrative',
        directQuote: quoteBefore(text, match.index),
      });
    }
  }
  const seen = new Set<string>();
  return found.filter((citation) => {
    const key = `${citation.paragraphIndex}|${citation.start}|${citation.end}|${citation.rawText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.paragraphIndex - b.paragraphIndex || a.start - b.start || a.end - b.end);
}

export { extractCitations, extractReferences };
