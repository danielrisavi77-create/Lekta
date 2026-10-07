# T86/T102: Google prijava u pravnim tekstovima

Status: interna tehnicka biljeska, nije pravno odobrenje. Googleova prijava ostaje iskljucena
zadano; ova promjena sama ne ukljucuje providera ni u Supabaseu ni u Netlifyju.

## Kanonski tekst

Pravni tekst vec postoji u src/legal/legal-content.ts: odjeljak 1g politike privatnosti i pripadni
navod Googlea u popisu primatelja. Taj tekst je jedini izvor istine. Ne kopirati stari prijedlog iz
ovog dokumenta: imao je razlicite podatke o profilu i primateljima te bi mogao razici tekst u modalu
i statickim stranicama.

T102 sada povezuje postojeci tekst s istom zastavicom koja upravlja gumbom za Google prijavu:

- modal pravnih informacija koristi VITE_AUTH_GOOGLE_ENABLED preko googleAuthEnabled();
- skripta za staticke pravne stranice ucitava Viteovo production okruzenje i prihvaca iste opt-in vrijednosti
  zastavice;
- prazna, false ili 0 vrijednost skriva Google odlomak; true ili 1 ukljucuje odjeljak 1g i Googlea
  u popisu primatelja u oba prikaza;
- TERMS_VERSION se mijenja kad se mijenja kanonski pravni sadrzaj; prije buduceg ukljucivanja
  providera vlasnik treba potvrditi verziju pristanka i pravne tvrdnje.

## Tehnicke cinjenice iz T102 koda

- OAuth 2.0 s PKCE: preglednik navigira na Supabase /auth/v1/authorize?provider=google; Supabase
  provodi povrat i razmjenu koda.
- Preglednik cuva jednokratni verifier i fragment otvorene sesije u lekta.oauth.pkce. Verifier
  vrijedi 10 minuta i trosi se na povratku; ako korisnik ne vrati na stranicu, uklanja se pri
  sljedecem otvaranju /rad/ nakon isteka.
- Sesija ostaje u istom obliku kao pri prijavi e-mailom. Anonimna sesija se ne zamjenjuje i Google
  gumb se anonimnom korisniku ne prikazuje.
- Googleove skripte ne ucitavaju se na Lekta stranicama; prijava pocinje navigacijom na Supabase.
- Supabase Auth dijeli se s Katedrom, pa vlasnik prije aktivacije uskladjuje konfiguraciju i
  redirect allow list.

Prije bilo kakvog buduceg ukljucivanja vlasnik treba provjeriti trenutne podatke koje Supabase prima
i prosljedjuje, kategorije primatelja, prijenose i ostale pravne tvrdnje s odgovarajucom strucnom
osobom. Ova biljeska ne odobrava pravnu osnovu ni objavu.