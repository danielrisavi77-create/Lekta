/**
 * Promo video ispod ulaza. HTML nosi `controls`, pa bez JS-a radi kao obican video; ovdje se
 * kontrole skriju iza jednog gumba preko postera i vrate cim gledanje krene. Nista se ne
 * skida prije klika (`preload="none"` u HTML-u), a autoplay ne postoji.
 */
export function mountPromoVideo(root: ParentNode = document): void {
  const video = root.querySelector<HTMLVideoElement>('[data-promo-video]');
  const play = root.querySelector<HTMLButtonElement>('[data-promo-play]');
  if (!video || !play) return;

  video.controls = false;
  play.hidden = false;

  play.addEventListener('click', () => {
    play.hidden = true;
    video.controls = true;
    video.focus();
    // Odbijen play (npr. politika preglednika) ostavlja vidljive kontrole, pa korisnik moze sam.
    void video.play().catch(() => undefined);
  });
}
