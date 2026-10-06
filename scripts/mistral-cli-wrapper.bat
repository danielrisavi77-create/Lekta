@echo off
REM Mistral CLI Wrapper for Windows
REM Omogucuje integraciju s Lekta autonomnim sustavom
REM
REM Upotreba:
REM   mistral --version          - Ispis verzije
REM   mistral auth status        - Provjera login statusa
REM   mistral [model] [prompt]   - Pokretanje modela
REM
REM Zahtjevi:
REM   - MISTRAL_API_KEY mora biti postavljen u okolini
REM   - curl mora biti dostupan
REM
REM Instalacija:
REM   copy scripts\mistral-cli-wrapper.bat %LOCALAPPDATA%\mistral.cmd

@setlocal enabledelayedexpansion

REM --- Konfiguracija ---
set MISTRAL_API_URL=%MISTRAL_API_URL%||set MISTRAL_API_URL=https://api.mistral.ai/v1
set TIMEOUT_SECONDS=%MISTRAL_TIMEOUT%||set TIMEOUT_SECONDS=120

REM --- Provjera argumenata ---
if "%~1"=="" (
    goto :usage
)

REM Prvi argument
set "first_arg=%~1"

if "%first_arg%"=="--version" (
    goto :cmd_version
) else if "%first_arg%"=="--help" (
    goto :usage
) else if "%first_arg%"=="auth" (
    goto :auth_command
) else (
    goto :chat_request
)

goto :eof

:usage
@echo off
echo Upotreba: mistral [OPCIJE] [NAREDBA]
echo.
echo Naredbe:
echo   --version           Ispis verzije
echo   auth status         Provjeri login status
echo   auth login          Prijava
echo   [MODEL] [PROMPT]    Pokreni model
echo.
echo Opcije:
echo   --help              Prikazi ovu pomoc
echo   --model MODEL      Odaberi model (zadano: mistral-large-latest)
echo   --json              Izlaz u JSON formatu
echo   --stream            Stream odgovor
echo   --temperature T    Temperatura (0.0-1.0)
echo   --max-tokens N     Maksimalan broj tokena
echo.
echo Podrzani modeli:
echo   mistral-large-latest
echo   mistral-small-latest
echo   mixtral-8x7b-latest
echo   codestral-latest
echo.
echo Primjeri:
echo   mistral --version
echo   mistral auth status
echo   mistral mistral-large-latest "Objasni mi AI"
goto :eof

:cmd_version
echo mistral-cli-wrapper 1.0.0
echo Mistral AI CLI wrapper for Lekta autonomy system
goto :eof

:auth_command
shift
set "subcommand=%~1"

if "%subcommand%"=="status" (
    goto :auth_status
) else if "%subcommand%"=="login" (
    goto :auth_login
) else (
    echo ERROR: Unknown auth subcommand: %subcommand%
    echo Use 'auth status' or 'auth login'.
    exit /b 1
)

goto :eof

:auth_status
call :check_api_key

REM Provjeri da li API kljuc radi
for /f "delims=" %%a in ('curl -s -o NUL -w "%%{http_code}" -H "Authorization: Bearer %MISTRAL_API_KEY%" "%MISTRAL_API_URL%/models" 2^>NUL') do set "response=%%a"

if "%response%"=="200" (
    echo {"logged_in": true, "method": "api_key", "authMethod": "mistral.ai", "subscriptionType": "paid"}
) else (
    echo {"logged_in": false, "method": "unknown", "detail": "API key verification failed"}
)

goto :eof

:auth_login
call :check_api_key

REM Testiraj API kljuc
for /f "delims=" %%a in ('curl -s -o NUL -w "%%{http_code}" -H "Authorization: Bearer %MISTRAL_API_KEY%" "%MISTRAL_API_URL%/models" 2^>NUL') do set "response=%%a"

if "%response%"=="200" (
    echo Successfully authenticated with Mistral API
    echo Provider: mistral.ai
    echo Authentication method: API key
) else (
    echo ERROR: Authentication failed. Please check your MISTRAL_API_KEY.
    exit /b 1
)

goto :eof

:chat_request
REM Parsiraj argumente
set "model=mistral-large-latest"
set "prompt="
set "temperature=0.7"
set "max_tokens=4096"
set "stream=false"
set "json_output=false"

:parse_args
if "%~1"=="" goto :send_request

set "arg=%~1"

if "%arg%"=="--model" (
    shift
    set "model=%~1"
    shift
    goto :parse_args
) else if "%arg%"=="--temperature" (
    shift
    set "temperature=%~1"
    shift
    goto :parse_args
) else if "%arg%"=="--max-tokens" (
    shift
    set "max_tokens=%~1"
    shift
    goto :parse_args
) else if "%arg%"=="--stream" (
    set "stream=true"
    shift
    goto :parse_args
) else if "%arg%"=="--json" (
    set "json_output=true"
    shift
    goto :parse_args
) else if "%arg%"=="--version" (
    goto :cmd_version
) else if "%arg%"=="--help" (
    goto :usage
) else (
    REM Prvi ne-opcijski argument
    if "%model%"=="mistral-large-latest" (
        echo %arg% | findstr /r "mistral-.* mixtral-.* codestral-.*" > NUL
        if %errorlevel% equ 0 (
            set "model=%arg%"
            shift
            goto :parse_args
        ) else (
            set "prompt=%arg%"
            shift
            goto :parse_args
        )
    ) else (
        set "prompt=%arg%"
        shift
        goto :parse_args
    )
)

:send_request
call :check_api_key

REM Ako prompt nije postavljen, citaj sa stdin
if "%prompt%"=="" (
    set /p "prompt="
)

REM Kreiraj JSON payload
set "payload={"model": "%model%", "messages": [{"role": "user", "content": "%prompt%"}], "temperature": %temperature%, "max_tokens": %max_tokens%, "stream": %stream%}"

REM Posalji zahtjev
if "%stream%"=="true" (
    curl -s -H "Authorization: Bearer %MISTRAL_API_KEY%" -H "Content-Type: application/json" -d "%payload%" "%MISTRAL_API_URL%/chat/completions"
) else (
    curl -s -H "Authorization: Bearer %MISTRAL_API_KEY%" -H "Content-Type: application/json" -d "%payload%" "%MISTRAL_API_URL%/chat/completions"
)

goto :eof

:check_api_key
if "%MISTRAL_API_KEY%"=="" (
    echo ERROR: MISTRAL_API_KEY environment variable not set. Please set it before running. >&2
    exit /b 1
)
goto :eof

:eof
