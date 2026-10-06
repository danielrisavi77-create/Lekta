#!/usr/bin/env python3
"""
Mistral CLI Wrapper - Python implementacija
Omogucuje integraciju s Lekta autonomnim sustavom

Upotreba:
    python scripts/mistral-cli-wrapper.py --version
    python scripts/mistral-cli-wrapper.py auth status
    python scripts/mistral-cli-wrapper.py --model mistral-large-latest "Objasni AI"

Zahtjevi:
    - MISTRAL_API_KEY u okolini
    - requests library (pip install requests)
"""

import argparse
import json
import os
import sys
import subprocess
from typing import Optional, Dict, Any

# --- Konfiguracija ---
MISTRAL_API_URL = os.environ.get("MISTRAL_API_URL", "https://api.mistral.ai/v1")
TIMEOUT_SECONDS = int(os.environ.get("MISTRAL_TIMEOUT", "120"))

# --- Podrzani modeli ---
SUPPORTED_MODELS = {
    "mistral-large-latest": {"max_tokens": 32768, "description": "Mistral Large - najjaci model"},
    "mistral-small-latest": {"max_tokens": 32768, "description": "Mistral Small - brzi i efikasan"},
    "mixtral-8x7b-latest": {"max_tokens": 32768, "description": "Mixture of Experts"},
    "mixtral-8x22b-latest": {"max_tokens": 32768, "description": "Mixture of Experts - veci"},
    "codestral-latest": {"max_tokens": 32768, "description": "Code specijaliziran model"},
}


class MistralCLIError(Exception):
    """Custom exception for Mistral CLI errors"""
    pass


def check_api_key() -> None:
    """Provjeri da li je API kljuc postavljen"""
    if not os.environ.get("MISTRAL_API_KEY"):
        raise MistralCLIError("MISTRAL_API_KEY environment variable not set. Please set it before running.")


def get_api_key() -> str:
    """Dohvati API kljuc"""
    key = os.environ.get("MISTRAL_API_KEY")
    if not key:
        raise MistralCLIError("MISTRAL_API_KEY not found in environment")
    return key


def check_dependencies() -> None:
    """Provjeri da li su potrebni alati dostupni"""
    try:
        import requests
    except ImportError:
        raise MistralCLIError("requests library is required. Install with: pip install requests")


def cmd_version() -> Dict[str, str]:
    """Ispis verzije"""
    return {
        "version": "1.0.0",
        "implementation": "python",
        "description": "Mistral CLI wrapper for Lekta autonomy system"
    }


def auth_status() -> Dict[str, Any]:
    """Provjeri login status"""
    check_api_key()
    
    try:
        import requests
        response = requests.get(
            f"{MISTRAL_API_URL}/models",
            headers={"Authorization": f"Bearer {get_api_key()}"},
            timeout=TIMEOUT_SECONDS
        )
        
        if response.status_code == 200:
            return {
                "logged_in": True,
                "method": "api_key",
                "authMethod": "mistral.ai",
                "subscriptionType": "paid"
            }
        else:
            return {
                "logged_in": False,
                "method": "unknown",
                "detail": f"API key verification failed: {response.status_code}"
            }
    except Exception as e:
        return {
            "logged_in": False,
            "method": "unknown",
            "detail": str(e)
        }


def auth_login() -> Dict[str, str]:
    """Prijava (testira API kljuc)"""
    check_api_key()
    
    try:
        import requests
        response = requests.get(
            f"{MISTRAL_API_URL}/models",
            headers={"Authorization": f"Bearer {get_api_key()}"},
            timeout=TIMEOUT_SECONDS
        )
        
        if response.status_code == 200:
            return {
                "status": "authenticated",
                "provider": "mistral.ai",
                "authMethod": "api_key"
            }
        else:
            raise MistralCLIError(f"Authentication failed: {response.status_code}")
    except Exception as e:
        raise MistralCLIError(f"Authentication failed: {e}")


def list_models() -> Dict[str, Any]:
    """Popis dostupnih modela"""
    check_api_key()
    
    try:
        import requests
        response = requests.get(
            f"{MISTRAL_API_URL}/models",
            headers={"Authorization": f"Bearer {get_api_key()}"},
            timeout=TIMEOUT_SECONDS
        )
        
        if response.status_code == 200:
            return {
                "models": response.json().get("data", []),
                "supported": list(SUPPORTED_MODELS.keys())
            }
        else:
            raise MistralCLIError(f"Failed to list models: {response.status_code}")
    except Exception as e:
        raise MistralCLIError(f"Failed to list models: {e}")


def send_chat_request(
    model: str,
    messages: list,
    temperature: float = 0.7,
    max_tokens: int = 4096,
    stream: bool = False,
    json_output: bool = False
) -> Any:
    """Posalji chat zahtjev Mistral API-ju"""
    check_api_key()
    check_dependencies()
    
    # Validiraj model
    if model not in SUPPORTED_MODELS:
        # Probaj s API-jem da vidimo da li model postoji
        try:
            models = list_models()
            if model not in [m.get("id") for m in models.get("models", [])]:
                raise MistralCLIError(f"Model '{model}' not found. Available models: {list(SUPPORTED_MODELS.keys())}")
        except:
            raise MistralCLIError(f"Model '{model}' not supported. Available: {list(SUPPORTED_MODELS.keys())}")
    
    import requests
    
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": stream
    }
    
    if stream:
        # Stream mod
        response = requests.post(
            f"{MISTRAL_API_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {get_api_key()}",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=TIMEOUT_SECONDS,
            stream=True
        )
        
        for chunk in response.iter_lines():
            if chunk:
                chunk_data = json.loads(chunk)
                if json_output:
                    print(json.dumps(chunk_data))
                else:
                    # Izvadi content
                    choice = chunk_data.get("choices", [{}])[0]
                    delta = choice.get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        print(content, end="", flush=True)
    else:
        # Normalni mod
        response = requests.post(
            f"{MISTRAL_API_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {get_api_key()}",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=TIMEOUT_SECONDS
        )
        
        if response.status_code != 200:
            raise MistralCLIError(f"API request failed: {response.status_code} - {response.text}")
        
        result = response.json()
        
        if json_output:
            print(json.dumps(result))
        else:
            # Izvadi content iz odgovora
            choice = result.get("choices", [{}])[0]
            message = choice.get("message", {})
            content = message.get("content", "")
            print(content)


def parse_messages(prompts: list) -> list:
    """Parsiraj poruke iz argumenata"""
    messages = []
    for i, prompt in enumerate(prompts):
        role = "user" if i % 2 == 0 else "assistant"
        messages.append({"role": role, "content": prompt})
    return messages


def main():
    """Glavna funkcija"""
    parser = argparse.ArgumentParser(
        description="Mistral CLI Wrapper for Lekta",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
Supported models: {', '.join(SUPPORTED_MODELS.keys())}

Examples:
  mistral --version
  mistral auth status
  mistral --model mistral-large-latest "Hello"
  mistral --model mistral-large-latest --json "Hello"
"""
    )
    
    # Globalne opcije
    parser.add_argument(
        "--version",
        action="store_true",
        help="Show version information"
    )
    parser.add_argument(
        "--model",
        default="mistral-large-latest",
        choices=list(SUPPORTED_MODELS.keys()),
        help="Mistral model to use"
    )
    parser.add_argument(
        "--temperature", "-t",
        type=float,
        default=0.7,
        help="Temperature (0.0-1.0)"
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=4096,
        help="Maximum number of tokens"
    )
    parser.add_argument(
        "--stream",
        action="store_true",
        help="Stream the response"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output in JSON format"
    )
    
    # Subcommands
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # auth command
    auth_parser = subparsers.add_parser("auth", help="Authentication commands")
    auth_subparsers = auth_parser.add_subparsers(dest="auth_command", help="Auth subcommands")
    auth_subparsers.add_parser("status", help="Check authentication status")
    auth_subparsers.add_parser("login", help="Authenticate with API key")
    
    # models command
    subparsers.add_parser("models", help="List available models")
    
    # Parse arguments
    args, remaining = parser.parse_known_args()
    
    # Handle remaining arguments as prompts
    prompts = remaining
    
    try:
        if args.version:
            result = cmd_version()
            print(f"mistral-cli-wrapper {result['version']}")
            print(f"Implementation: {result['implementation']}")
            print(f"Description: {result['description']}")
        
        elif args.command == "auth":
            if args.auth_command == "status":
                result = auth_status()
                print(json.dumps(result))
            elif args.auth_command == "login":
                result = auth_login()
                print(json.dumps(result))
            else:
                parser.error("Invalid auth subcommand")
        
        elif args.command == "models":
            result = list_models()
            print(json.dumps(result, indent=2))
        
        elif prompts:
            # Chat request
            messages = parse_messages(prompts)
            send_chat_request(
                model=args.model,
                messages=messages,
                temperature=args.temperature,
                max_tokens=args.max_tokens,
                stream=args.stream,
                json_output=args.json
            )
        else:
            # Ako nema argumenata, prikazi pomoc
            parser.print_help()
    
    except MistralCLIError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
