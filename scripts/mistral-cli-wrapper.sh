#!/bin/bash
# Mistral CLI Wrapper - omogucuje integraciju s Lekta autonomnim sustavom
# Ova skripta simulira Mistral CLI ponašanje za potrebe Lekta agent sistema
#
# Upotreba:
#   mistral --version          - Ispis verzije
#   mistral auth status        - Provjera login statusa
#   mistral [model] [args]     - Pokretanje modela
#
# Zahtjevi:
#   - MISTRAL_API_KEY mora biti postavljen u okolini
#   - curl mora biti dostupan
#
# Instalacija:
#   cp scripts/mistral-cli-wrapper.sh /usr/local/bin/mistral
#   chmod +x /usr/local/bin/mistral

set -euo pipefail

# --- Konfiguracija ---
MISTRAL_API_URL="${MISTRAL_API_URL:-https://api.mistral.ai/v1}"
TIMEOUT_SECONDS="${MISTRAL_TIMEOUT:-120}"

# --- Pomocne funkcije ---

usage() {
  cat <<EOF
Upotreba: mistral [OPCIJE] [NAREDBA]

Naredbe:
  --version           Ispis verzije
  auth status         Provjeri login status
  auth login          Prijava (zahtjeva API kljuc)
  [MODEL] [PROMPT]    Pokreni model

Opcije:
  --help              Prikazi ovu pomoc
  --model MODEL      Odaberi model (zadano: mistral-large-latest)
  --json              Izlaz u JSON formatu
  --stream            Stream odgovor
  --temperature T    Temperatura (0.0-1.0)
  --max-tokens N     Maksimalan broj tokena

Podrzani modeli:
  mistral-large-latest
  mistral-small-latest
  mixtral-8x7b-latest
  codestral-latest

Primjeri:
  mistral --version
  mistral auth status
  mistral mistral-large-latest "Objasni mi AI"
EOF
}

log_error() {
  echo "ERROR: $1" >&2
  exit 1
}

check_api_key() {
  if [ -z "${MISTRAL_API_KEY:-}" ]; then
    log_error "MISTRAL_API_KEY environment variable not set. Please set it before running mistral CLI."
  fi
}

check_curl() {
  if ! command -v curl &> /dev/null; then
    log_error "curl is required but not installed. Please install curl."
  fi
}

# --- Glavne naredbe ---

cmd_version() {
  echo "mistral-cli-wrapper 1.0.0"
  echo "Mistral AI CLI wrapper for Lekta autonomy system"
}

auth_status() {
  check_api_key
  
  # Provjeri da li API kljuc radi
  local response
  response=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${MISTRAL_API_KEY}" \
    "${MISTRAL_API_URL}/models" 2>/dev/null || echo "000")
  
  if [ "$response" = "200" ]; then
    echo '{"logged_in": true, "method": "api_key", "authMethod": "mistral.ai", "subscriptionType": "paid"}'
  else
    echo '{"logged_in": false, "method": "unknown", "detail": "API key verification failed"}'
  fi
}

auth_login() {
  check_api_key
  check_curl
  
  # Testiraj API kljuc
  local response
  response=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${MISTRAL_API_KEY}" \
    "${MISTRAL_API_URL}/models" 2>/dev/null || echo "000")
  
  if [ "$response" = "200" ]; then
    echo "Successfully authenticated with Mistral API"
    echo "Provider: mistral.ai"
    echo "Authentication method: API key"
  else
    log_error "Authentication failed. Please check your MISTRAL_API_KEY."
  fi
}

# Funkcija za slanje chat zahtjeva
send_chat_request() {
  local model="$1"
  local prompt="$2"
  local temperature="${3:-0.7}"
  local max_tokens="${4:-4096}"
  local stream="${5:-false}"
  
  check_api_key
  check_curl
  
  # Ako je prompt prazan, citaj sa stdin
  if [ -z "$prompt" ]; then
    prompt=$(cat -)
  fi
  
  # Kreiraj JSON payload
  local payload
  payload=$(jq -n \
    --arg model "$model" \
    --arg prompt "$prompt" \
    --argjson temperature "$temperature" \
    --argjson max_tokens "$max_tokens" \
    --argjson stream "$stream" \
    '{
      "model": $model,
      "messages": [{"role": "user", "content": $prompt}],
      "temperature": $temperature,
      "max_tokens": $max_tokens,
      "stream": $stream
    }')
  
  # Posalji zahtjev
  if [ "$stream" = "true" ]; then
    # Stream mod - izlaz red po red
    curl -s -H "Authorization: Bearer ${MISTRAL_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$payload" \
      "${MISTRAL_API_URL}/chat/completions" | \
    while IFS= read -r line; do
      # Filtriraj prazne redove
      if [ -n "$line" ]; then
        # Parsiraj JSON i izvadi content
        echo "$line" | jq -r '.choices[0].delta.content // empty' 2>/dev/null || echo "$line"
      fi
    done
  else
    # Normalni mod - cijelog odgovor
    curl -s -H "Authorization: Bearer ${MISTRAL_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$payload" \
      "${MISTRAL_API_URL}/chat/completions"
  fi
}

# --- Glavni program ---

# Ako nema argumenata, prikazi pomoc
if [ $# -eq 0 ]; then
  usage
  exit 1
fi

# Prvi argument
first_arg="$1"

case "$first_arg" in
  --version)
    cmd_version
    ;;
  --help|-h)
    usage
    ;;
  auth)
    subcommand="${2:-}"
    case "$subcommand" in
      status)
        auth_status
        ;;
      login)
        auth_login
        ;;
      *)
        log_error "Unknown auth subcommand: $subcommand. Use 'auth status' or 'auth login'."
        ;;
    esac
    ;;
  *)
    # Pretpostavimo da je model ili prompt
    # Parsiraj argumente
    local model="mistral-large-latest"
    local prompt=""
    local temperature="0.7"
    local max_tokens="4096"
    local stream="false"
    local json_output="false"
    
    # Parsiraj opcije
    while [ $# -gt 0 ]; do
      case "$1" in
        --model)
          model="$2"
          shift 2
          ;;
        --temperature|-t)
          temperature="$2"
          shift 2
          ;;
        --max-tokens)
          max_tokens="$2"
          shift 2
          ;;
        --stream)
          stream="true"
          shift
          ;;
        --json)
          json_output="true"
          shift
          ;;
        --version)
          cmd_version
          exit 0
          ;;
        --help|-h)
          usage
          exit 0
          ;;
        *)
          # Prvi ne-opcijski argument je model ili prompt
          if [ "$model" = "mistral-large-latest" ]; then
            # Pretpostavimo da je ovo model
            if [[ "$1" == mistral-* || "$1" == mixtral-* || "$1" == codestral-* ]]; then
              model="$1"
              shift
            else
              # Inace je ovo prompt
              prompt="$1"
              shift
            fi
          else
            # Vec imamo model, pa je ovo prompt
            prompt="$1"
            shift
          fi
          ;;
      esac
    done
    
    # Ako je prompt prazan, citaj sa stdin
    if [ -z "$prompt" ]; then
      prompt=$(cat -)
    fi
    
    # Pozovi chat request
    send_chat_request "$model" "$prompt" "$temperature" "$max_tokens" "$stream"
    ;;
esac
