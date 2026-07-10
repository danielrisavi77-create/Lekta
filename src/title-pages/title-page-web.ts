/**
 * Entry za esbuild IIFE bundle (globalName LektaTitlePage) koji build-time generator
 * SEO stranica naslovnice (scripts/generate-title-page-tools.mjs) inlinea u statické
 * stranice u dist/alati/naslovnica/. Samo re-export postojecih motora, bez DOM-a.
 */
export { buildTitlePage, titlePageText } from '../tools/title-page';
export type { TitlePageInput, TitlePageModel } from '../tools/title-page';
export { titlePageDoc, docxBlob, buildDocxBytes, DOCX_MIME } from '../docx/docx-writer';
export {
  TITLE_PAGE_TEMPLATES,
  findTitlePageTemplate,
  resolveTemplate,
  selectTemplate,
  LEVEL_SLUGS,
  workTypeFromSlug,
} from './template-loader';
