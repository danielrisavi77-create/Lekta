/**
 * Mjerni i naslovni pomocnici izvuceni iz monolita (src/main.ts), korak 4 porta enginea.
 *
 * Ciste funkcije; tijela prepisana 1:1 (dodani su samo `: any` tipovi na granici), pa golden
 * snapshoti ostaju nepromijenjeni. Koriste ih auditi (audits/structure) i analyzeDocx.
 */
import { sectionName } from '../utils/helpers';

export function modeWeighted(map: any): any{let best=null,max=-1,total=0;for(const[k,v]of map){total+=v;if(v>max){best=k;max=v}}return{value:best,weight:max,total,share:total?max/total:0}}
export function addWeight(map: any, key: any, w: any): any{if(key==null||key===''||!w)return;map.set(String(key),(map.get(String(key))||0)+w)}
export function near(a: any, b: any, t: any=.12): any{return Math.abs(Number(a)-Number(b))<=t}
export function runMetrics(runs: any=[]): any{const fontMap=new Map(),sizeMap=new Map();let total=0,bold=0,italic=0;for(const r of runs){const w=Math.max(1,String(r.text||'').trim().length);if(!String(r.text||'').trim())continue;total+=w;addWeight(fontMap,r.font,w);addWeight(sizeMap,r.size,w);if(r.bold)bold+=w;if(r.italic)italic+=w}return{font:modeWeighted(fontMap).value,size:Number(modeWeighted(sizeMap).value)||null,boldShare:total?bold/total:0,italicShare:total?italic/total:0,total}}
export function lettersOnly(s: any): any{return(String(s||'').match(/\p{L}+/gu)||[]).join('')}
export function isUppercaseText(s: any): any{const x=lettersOnly(String(s||'').replace(/^\s*(?:(?:[IVXLCDM]+)|(?:\d+(?:\.\d+)*))\.?\s+/i,''));return x.length>1&&x===x.toLocaleUpperCase('hr-HR')}
export function headingNumberInfo(text: any): any{const m=String(text||'').match(/^\s*((?:[IVXLCDM]+)|(?:\d+(?:\.\d+)*))(\.)?\s+/i);if(!m)return null;const roman=/^[IVXLCDM]+$/i.test(m[1]);return{raw:m[1],roman,depth:roman?1:m[1].split('.').length,trailingDot:!!m[2]}}
export function isFrontMatterHeading(text: any): any{const n=sectionName(text);return['sadrzaj','contents','tableofcontents','sazetak','abstract','kljucnerijeci','keywords','izjavaoizvornosti','izjavaoautorstvu','popistablica','popisslika','popispriloga','literatura','bibliografija','izvoriiliteratura','popisliterature','references'].some(x=>n===x||n.startsWith(x))}
