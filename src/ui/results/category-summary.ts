import type { VisualCategoryModel } from './visual-result-model';
import { escapeHtml } from '../../utils/helpers';

export function categorySummaryHtml(categories: readonly VisualCategoryModel[]): string {
  if (!categories.length) return '';
  return [
    '<section class="cockpit-categories" aria-labelledby="cockpitCategoriesTitle">',
    '<div class="cockpit-section-heading"><span class="cockpit-kicker">Sekundarni pregled</span><h2 id="cockpitCategoriesTitle">Sažetak kategorija</h2></div>',
    '<div class="cockpit-category-grid">',
    categories.map((category) => [
      '<article class="cockpit-category" data-cockpit-category="', escapeHtml(category.id), '">',
      '<div class="cockpit-category__head"><strong>', escapeHtml(category.label), '</strong><span>', String(category.percentage), '%</span></div>',
      '<div class="cockpit-category__bar" role="progressbar" aria-label="', escapeHtml(category.label), '" aria-valuenow="', String(category.percentage), '" aria-valuemin="0" aria-valuemax="100"><span style="width:', String(category.percentage), '%"></span></div>',
      '<small>', String(category.earned), ' / ', String(category.max), ' bodova</small>',
      '</article>',
    ].join('')).join(''),
    '</div></section>',
  ].join('');
}
