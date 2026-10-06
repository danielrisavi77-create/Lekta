# Mistral CLI Wrapper

Ovo je kolekcija wrapper skripti koje omogucuju integraciju Mistral AI providera s Lekta autonomnim sustavom.

## Sadrzaj

- `mistral-cli-wrapper.sh` - Bash implementacija za Linux/macOS
- `mistral-cli-wrapper.py` - Python implementacija (univerzalna)
- `mistral-cli-wrapper.bat` - Batch implementacija za Windows

## Preduvjeti

### API Kljuc

Mistral CLI wrapper zahtjeva `MISTRAL_API_KEY` environment varijablu:

```bash
# Linux/macOS
export MISTRAL_API_KEY="tvoj-api-kljuc"

# Windows (Command Prompt)
set MISTRAL_API_KEY=tvoj-api-kljuc

# Windows (PowerShell)
$env:MISTRAL_API_KEY="tvoj-api-kljuc"
```

Dohvati API kljuc: https://console.mistral.ai/api-keys

### Ovisnosti

- **curl** - za HTTP zahtjeve (obavezno)
- **jq** - za JSON procesiranje (opcionalno, za bash verziju)
- **Python requests** - za Python wrapper (opcionalno)

#### Instalacija ovisnosti

```bash
# Ubuntu/Debian
sudo apt-get install curl jq

# macOS (Homebrew)
brew install curl jq

# Python
pip install requests
```

## Instalacija

### Linux/macOS

```bash
# Kopiraj wrapper u PATH
cp scripts/mistral-cli-wrapper.sh /usr/local/bin/mistral
chmod +x /usr/local/bin/mistral

# Provjeri instalaciju
mistral --version
```

### Windows

```batch
:: Kopiraj wrapper u PATH
copy scripts\mistral-cli-wrapper.bat %LOCALAPPDATA%\mistral.cmd

:: Provjeri instalaciju
mistral --version
```

Ili koristite Python verziju:

```batch
:: Kreiraj batch datoteku koja poziva Python
@echo off
python "%~dp0scripts\mistral-cli-wrapper.py" %*
```

## Upotreba

### Osnovne naredbe

```bash
# Ispis verzije
mistral --version

# Provjera login statusa
mistral auth status

# Prijava (testira API kljuc)
mistral auth login

# Popis dostupnih modela
mistral models
```

### Pokretanje modela

```bash
# Jednostavan prompt
mistral "Objasni mi kako radi AI"

# Sa odabranim modelom
mistral --model mistral-large-latest "Objasni mi AI"

# Sa dodatnim opcijama
mistral --model mistral-large-latest --temperature 0.9 --max-tokens 2048 "Napiši kreativnu priču"

# Stream odgovor
mistral --model mistral-large-latest --stream "Objasni polako"

# JSON izlaz
mistral --model mistral-large-latest --json "Objasni u JSON formatu"
```

### Podrzani modeli

- `mistral-large-latest` - Najjaci model (zadano)
- `mistral-small-latest` - Brzi i efikasan model
- `mixtral-8x7b-latest` - Mixture of Experts
- `mixtral-8x22b-latest` - Veci Mixture of Experts
- `codestral-latest` - Code specijaliziran model

## Integracija s Lektom

### Konfiguracija

Da bi Mistral radio s Lekta autonomnim sustavom, potrebno je:

1. **Instalirati wrapper** (vidi gore)
2. **Postaviti environment varijablu** `MISTRAL_API_KEY`
3. **Aktivirati Mistral u konfiguraciji**

### Konfiguracijske datoteke

#### `config/agent-providers.json`

```json
{
  "agents": {
    "mistral-large": { "command": "mistral", "model": "mistral-large-latest", "role": "coordinator" },
    "mistral-small": { "command": "mistral", "model": "mistral-small-latest", "role": "implementer" },
    "mixtral": { "command": "mistral", "model": "mixtral-8x7b-latest", "role": "implementer" }
  }
}
```

#### `config/agent-routing.json`

Dodaj Mistral u `providers` i `models` sekcije.

#### `config/autonomy.example.json`

```json
{
  "mistralEnabled": true
}
```

### Sigurnosne provjere

Sustav automatski blokira pozive ako:

1. `MISTRAL_API_KEY` postoji u okolini (zabrana API naplate)
2. CLI nije dostupan (`which mistral` vraca prazno)
3. Model nije podrzan

## Testiranje

```bash
# Provjeri da li wrapper radi
mistral --version

# Provjeri autentikaciju
MISTRAL_API_KEY=tvoj-kljuc mistral auth status

# Testiraj chat
MISTRAL_API_KEY=tvoj-kljuc mistral "Zdravo, kako si?"
```

## Rjesavanje problema

### "mistral: command not found"

Wrapper nije instaliran ili nije u PATH-u:

```bash
# Provjeri da li je wrapper u PATH-u
which mistral

# Ako nije, dodaj u PATH
cp scripts/mistral-cli-wrapper.sh /usr/local/bin/mistral
chmod +x /usr/local/bin/mistral
```

### "MISTRAL_API_KEY not set"

Environment varijabla nije postavljena:

```bash
export MISTRAL_API_KEY="tvoj-api-kljuc"
```

### "curl: command not found"

curl nije instaliran:

```bash
# Ubuntu/Debian
sudo apt-get install curl

# macOS
brew install curl
```

### "No module named 'requests'"

Python requests library nije instaliran:

```bash
pip install requests
```

## Doprinos

Ako zelis doprinijeti:

1. Forkaj repozitorij
2. Kreiraj novu granu (`git checkout -b feature/mistral-improvements`)
3. Commitaj promjene (`git commit -am 'Dodaj nova poboljsanja'`)
4. Pushaj granu (`git push origin feature/mistral-improvements`)
5. Otvori Pull Request

## Licenca

Ova skripta je dio Lekta projekta i koristi istu licencu.

## Kontakt

Za pitanja i podrsku: support@lekta.hr
