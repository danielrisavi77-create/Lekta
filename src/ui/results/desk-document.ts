/**
 * DOKUMENT NA KOREKTORSKOM STOLU: montaza faksimila u lijevi pano.
 *
 * Izdvojeno iz `app.ts` 2026-09-08, iz DVA razloga odjednom.
 *
 * 1. UKLAPANJE PO SIRINI NIJE UKRAS NEGO CITLJIVOST. Faksimil je pravi A4, dakle 21 cm, a pano
 *    stola je uzi. Bez skaliranja stranica se REZE po desnom rubu i rijeci se lome nasred retka
 *    ("...akademskog tel"), pa dokument prestaje biti citljiv upravo u alatu koji sluzi citanju.
 *    Modal pregleda to vec radi (`renderPreviewMode` zove `fitWidth`); stol je u prvoj izvedbi
 *    ozicenja to ispustio.
 *
 *    KAKO JE OTKRIVENO, jer je to poanta: nijedan test nije pao. Faksimil JEST bio vidljiv, omjer
 *    stupaca JEST bio tocan, i oba su se mjerila. Rez se vidio tek na SNIMCI ekrana. Tvrdnja o
 *    postojanju elementa ne mjeri je li sadrzaj upotrebljiv, i to je granica koju ovaj modul
 *    zatvara tako da uklapanje bude dio montaze, a ne nesto sto pozivatelj mora zapamtiti.
 *
 * 2. `app.ts` je na svom budzetu. Ovo je selidba, ne dizanje: zatvorenje koje je zivjelo unutar
 *    poziva kokpita seli ovamo, pa `app.ts` predaje jedan izraz.
 *
 * OBA TESKA MODULA SE UCITAVAJU LIJENO. Renderer faksimila i zoom nisu u grafu ekrana rezultata;
 * dovlace se tek kad je pano stvarno vidljiv, sto ljuska provjerava prije poziva.
 */

/** Ono sto stol treba natrag: mjesta koja se mogu oznaciti. */
export interface DeskDocumentMount {
  readonly flagTargets: ReadonlyMap<number, HTMLElement>;
}

type PreviewModel = Parameters<typeof import('../../preview/render-facsimile')['renderFacsimile']>[0];
type PreviewFlags = Parameters<typeof import('../../preview/render-facsimile')['renderFacsimile']>[1];

export async function mountFacsimileInto(
  host: HTMLElement,
  preview: PreviewModel,
  flags: PreviewFlags,
): Promise<DeskDocumentMount | null> {
  const { renderFacsimile } = await import('../../preview/render-facsimile');
  const iscrtano = renderFacsimile(preview, flags);
  host.textContent = '';
  host.appendChild(iscrtano.root);

  try {
    const { attachFacsimileZoom } = await import('../../preview/facsimile-zoom');
    const zoom = attachFacsimileZoom(host, iscrtano.root);
    zoom.remeasure();
    zoom.fitWidth();
  } catch (e) {
    // Uklapanje je POBOLJSANJE, ne uvjet: bez njega dokument je sirok i trazi vodoravni skrol,
    // ali i dalje postoji i oznake i dalje rade. Pad ovdje ne smije odnijeti cijeli stol.
    console.warn('Uklapanje faksimila po sirini nije uspjelo; dokument ostaje u punoj velicini.', e);
  }

  return { flagTargets: iscrtano.flagTargets };
}
