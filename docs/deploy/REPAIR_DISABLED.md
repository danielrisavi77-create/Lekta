# Hitno isključivanje automatskog popravka

Ovaj postupak isključuje endpoint repair-docx putem Supabase Edge Function secreta REPAIR_DISABLED. Ne mijenja klijentski build i ne isključuje lokalnu analizu.

## Isključi

1. Potvrdi u Supabase Dashboardu da je odabran produkcijski projekt. Ne oslanjaj se samo na spremljenu CLI vezu.
2. U Edge Functions → Secrets postavi REPAIR_DISABLED na točan tekst true. Provjeri projekt prije spremanja. U PowerShellu se može koristiti i CLI s izričito provjerenim project refom:

    $ProductionProjectRef = '<provjereni-produkcijski-project-ref>'
    npx supabase secrets set REPAIR_DISABLED=true --project-ref $ProductionProjectRef

3. Pričekaj da se promjena vidi u runtimeu i provjeri endpoint na dogovoren način. Staging pokus od 27. rujna vratio je HTTP 503 i error disabled nakon postavljanja zastavice. U produkciji ne smatraj gašenje potvrđenim dok sonda ne pokaže taj ishod.
4. Zapiši vrijeme, objavljeni SHA, rezultat sonde i razlog gašenja. Ne zapisuj secret vrijednosti osim točne zastavice true; ne objavljuj anon ključ u zapisu.

Supabase navodi da se novi Edge Function secret može koristiti bez redeploya, ali rezultat se svejedno potvrđuje sondom: [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets).

## Vrati nakon odobrenja

1. Nakon što vlasnik potvrdi da je uzrok otklonjen, ukloni REPAIR_DISABLED iz istog produkcijskog projekta:

    npx supabase secrets unset REPAIR_DISABLED --project-ref '<provjereni-produkcijski-project-ref>'

   U nadzornoj ploči ukloni taj secret ako se postupak vodi kroz UI.
2. Ponovi istu sondu. Povijesni staging dokaz vratio je HTTP 401 unauthorized kad je zastavica uklonjena, što znači da je zahtjev stigao do provjere prijave. Ne tumači sam HTTP 401 kao dokaz da popravak radi za prijavljene korisnike.
3. Zabilježi rezultat i vrijeme. Ako sonda i dalje vraća 503, tretiraj uslugu kao isključenu. Ako je ishod neočekivan ili mrežno nedostupan, stanje je nepoznato; ne proglašavaj popravak uključenim.

## Važno

- Vrijednost mora biti točno true; kod ne tumači proizvoljne vrijednosti kao isključeno.
- Nemoj mijenjati REPAIR_FREE_MODE da bi ugasio popravak. Ta zastavica određuje besplatni/naplatni način, ne kill switch.
- Ova zastavica odnosi se na repair-docx; ne potvrđuje stanje drugih endpointa.
- Staging dokaz od 27. rujna i produkcijsko očitanje od 28. rujna su povijesni. Za aktualni incident provjeri trenutačni projekt i rezultat sonde.
- Postupak je samo dokumentacija; ovaj zapis ne znači da je produkcijski secret mijenjan.
