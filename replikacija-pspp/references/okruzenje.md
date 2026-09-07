# Okruženje

## Što treba instalirati

```bash
apt-get install -y pspp                                   # izračun i sučelje
apt-get install -y xvfb openbox xdotool wmctrl imagemagick x11-utils
pip install --break-system-packages python-docx pillow
```

`pspp` donosi i `psppire`, grafičko sučelje. Sve dolazi iz standardnog
repozitorija, pa postupak prolazi i ondje gdje je mreža zatvorena.

Zahtjevi na sustav: 2 GB memorije, 500 MB diska. Virtualni zaslon se u skripti
pokreće u veličini 1600 × 1900, jer prozori s dužim ispisom moraju stati na
njega prije snimanja.

## Četiri zamke koje traju sat vremena ako se ne znaju

**Dijakritici izlaze kao upitnici.** `Građan. dim.` se u sučelju ispisuje kao
`Gra??an. dim.`, a u datoteci je ispravno. Uzrok nije font nego lokalizacija:
baza spremljena bez UTF-8 postavke nosi zapis o kodiranju koji sučelje krivo
čita. Rješenje je `LANG=C.UTF-8` **u trenutku kad se baza sprema**, ne samo pri
snimanju. Skripta to postavlja sama.

**Sučelje se ne pokrene i ne javi grešku.** Ako proces nema `DISPLAY`, tiho
odustane. Skripta postavlja `DISPLAY` sama; ako se pokreće ručno, treba ga
izvesti.

**Prozor je pun bijelog prostora.** Ispis zauzme trećinu prozora, a snimka nosi
punu visinu. Skripta zato snima dvaput: prvi put mjeri dokle seže sadržaj, pa
prozor skrati i snimi ponovno. Pri mjerenju se donjih desetak redaka
izostavlja, jer je ondje rub prozora, koji je taman i inače bi se čitao kao
sadržaj.

**Nazivi u zaglavljima su odsječeni.** Sučelje stupac širi prema podatku, ne
prema nazivu, pa se `Etatistička orijentacija` prikaže kao `tatisticka orij.`
Širenje prozora ne pomaže. Pomaže samo kraća oznaka: svaka **riječ** u oznaci
varijable mora imati najviše sedam znakova.

## Ako se PSPP ne može instalirati

Provjeri je li stvar u vatrozidu ili u posredničkom poslužitelju. Otvoren port
443 ne znači ništa ako proxy odbija tunel:

```bash
python3 -c "import urllib.request; print(urllib.request.urlopen('https://archive.ubuntu.com/ubuntu/dists/noble/Release',timeout=15).status)"
```

Ako to prolazi, `apt` radi i PSPP se može instalirati. Ako ne prolazi, treba
propustiti `archive.ubuntu.com`. Za jamovi bi trebalo propustiti i
`flathub.org` s `dl.flathub.org`, a za R-ov paket `jmv` još i
`cloud.r-project.org` — to je razlog zašto je PSPP zadani izbor.

## Provjera da okruženje radi

```bash
pspp --version
python3 -c "import docx, PIL; print('knjižnice u redu')"
Xvfb :99 -screen 0 1600x1900x24 -nolisten tcp & sleep 3
DISPLAY=:99 psppire --help >/dev/null && echo "sučelje se pokreće"
```
