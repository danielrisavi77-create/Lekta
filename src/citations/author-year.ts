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
 paragraphs.forEach((p: any,idx: any)=>{const t=p.text;if(!t)return;const par=/\(([^()]{0,360}\b(?:18|19|20)\d{2}[a-z]?[^()]{0,220})\)/giu;let m;
  while((m=par.exec(t))){let inner: any=m[1];if(/\bprema\b/i.test(inner))inner=inner.split(/\bprema\b/i).pop();let inherited='';
   for(const rawPart of inner.split(';')){const part=rawPart.trim();const years=[...part.matchAll(yearRe)].map((x: any)=>({value:x[0].toLowerCase(),index:x.index||0,length:x[0].length}));if(!years.length)continue;let prevEnd=0;
    for(const y of years){const prefix=part.slice(prevEnd,y.index);const a=citationAuthorFromPrefix(prefix);if(a&&/^\p{Lu}/u.test(a))inherited=a;else if(/[\p{L}]/u.test(prefix)&&!a){prevEnd=y.index+y.length;continue}
     if(inherited&&!/^\s*\d{1,4}\s*[\/.-]\s*$/.test(prefix))found.push({author:inherited,year:y.value,raw:m[0],p:idx+1,kind:'parenthetical'});prevEnd=y.index+y.length
    }
   }
  }
  const narr=/\b([\p{Lu}][\p{L}'’\-]{2,})(?:\s+(?:i|and|&)\s+[\p{Lu}][\p{L}'’\-]{2,})?\s*\(((?:18|19|20)\d{2}[a-z]?)\)/gu;
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

export { extractCitations, extractReferences };
