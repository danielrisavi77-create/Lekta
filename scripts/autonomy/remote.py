"""Udaljeni adapteri izdavaca: GitHub (PR, zastita grane, merge) i Netlify (deploy, povrat).

Ugovor je onaj koji `publisher.py` ocekuje (vidi njegov docstring). Token izdavaca NIKAD ne dolazi iz okoline
procesa (radnik je dijeli), nego iz datoteke `LEKTA_AUTONOMY_HOME/publisher-token` koju vlasnik stvori za
ODVOJEN GitHub identitet (machine user ili fine-grained PAT samo za ovaj repo). Bez te datoteke adapter ne
postoji i `tick` javlja `publisher_not_configured`. Isti princip za Netlify: `netlify-token` + `netlify-site`.

Sve HTTP pozive radi standardna biblioteka; nema retryja koji bi skrivao nepoznat ishod: greska mreze se
propagira kao iznimka i publisher je pretvara u `unknown`.
"""
from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request

GITHUB_API = "https://api.github.com"
NETLIFY_API = "https://api.netlify.com/api/v1"
AUTONOMY_PR_MARKER = "lekta-autonomy-key:"


class RemoteUnavailable(RuntimeError):
    """Mreza, 5xx ili neparsabilan odgovor. Publisher ovo vidi kao `unknown`, nikad kao uspjeh."""


class RemoteRefused(RuntimeError):
    """4xx koji nije 404: odbijeno, nema ovlasti, konflikt. Vidljiv razlog, bez tokena u tekstu."""


def read_secret_file(home: str, name: str) -> str | None:
    path = os.path.join(home, name)
    try:
        with open(path, encoding="utf-8") as fh:
            value = fh.read().strip()
    except OSError:
        return None
    return value or None


def _request(method: str, url: str, token: str, body: dict | None = None, accept: str = "application/vnd.github+json") -> tuple[int, object]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", accept)
    req.add_header("User-Agent", "lekta-autonomy-publisher")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            text = res.read().decode("utf-8")
            return res.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", "replace")
        if exc.code == 404:
            return 404, None
        if 400 <= exc.code < 500:
            raise RemoteRefused(f"HTTP {exc.code}: {text[:200]}") from None
        raise RemoteUnavailable(f"HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise RemoteUnavailable(type(exc).__name__) from None


class GitHubRemote:
    """Minimalni writer: nikad ne izvrsava kandidatov kod, samo REST pozivi nad PR-ovima i zastitom grane."""

    def __init__(self, repository: str, token: str):
        self.repository = repository
        self.token = token

    def _url(self, path: str) -> str:
        return f"{GITHUB_API}/repos/{self.repository}{path}"

    @staticmethod
    def _pr_view(pr: dict) -> dict:
        return {"number": pr["number"], "head_sha": (pr.get("head") or {}).get("sha"), "base_sha": (pr.get("base") or {}).get("sha"),
                "merged": bool(pr.get("merged") or pr.get("merged_at")), "merge_sha": pr.get("merge_commit_sha") if (pr.get("merged") or pr.get("merged_at")) else None,
                "branch": (pr.get("head") or {}).get("ref"), "state": pr.get("state")}

    def find_pull_request(self, idempotency_key: str) -> dict | None:
        # Trazi po markeru u tijelu PR-a, u otvorenim I zatvorenim (spojen PR je zatvoren).
        q = urllib.parse.quote(f'repo:{self.repository} is:pr "{AUTONOMY_PR_MARKER}{idempotency_key}" in:body')
        status, data = _request("GET", f"{GITHUB_API}/search/issues?q={q}&per_page=5", self.token)
        if status != 200 or not isinstance(data, dict):
            raise RemoteUnavailable("search")
        for item in data.get("items") or []:
            status, pr = _request("GET", self._url(f"/pulls/{item['number']}"), self.token)
            if status == 200 and isinstance(pr, dict) and f"{AUTONOMY_PR_MARKER}{idempotency_key}" in (pr.get("body") or ""):
                return self._pr_view(pr)
        return None

    def open_pull_request(self, branch: str, base: str, title: str, body: str, idempotency_key: str) -> dict:
        marked = f"{body.rstrip()}\n\n<!-- {AUTONOMY_PR_MARKER}{idempotency_key} -->\n"
        status, pr = _request("POST", self._url("/pulls"), self.token, {"title": title, "head": branch, "base": base, "body": marked, "draft": False})
        if status not in (200, 201) or not isinstance(pr, dict):
            raise RemoteUnavailable("create pr")
        return self._pr_view(pr)

    def pull_request(self, number: int) -> dict:
        status, pr = _request("GET", self._url(f"/pulls/{number}"), self.token)
        if status != 200 or not isinstance(pr, dict):
            raise RemoteUnavailable("pr")
        view = self._pr_view(pr)
        sha = view["head_sha"]
        status, runs = _request("GET", self._url(f"/commits/{sha}/check-runs?per_page=100"), self.token)
        checks: dict[str, str] = {}
        if status == 200 and isinstance(runs, dict):
            for run in runs.get("check_runs") or []:
                conclusion = run.get("conclusion") if run.get("status") == "completed" else "pending"
                checks[run.get("name")] = conclusion or "pending"
        view["checks"] = checks
        return view

    def branch_protection(self, base: str) -> dict:
        status, data = _request("GET", self._url(f"/branches/{base}/protection"), self.token)
        if status != 200 or not isinstance(data, dict):
            return {"available": False, "required_checks": [], "enforce_admins": None}
        rsc = data.get("required_status_checks") or {}
        return {"available": True, "required_checks": list(rsc.get("contexts") or []),
                "strict": bool(rsc.get("strict")), "enforce_admins": bool((data.get("enforce_admins") or {}).get("enabled"))}

    def base_head(self, base: str) -> str:
        status, data = _request("GET", self._url(f"/git/ref/heads/{base}"), self.token)
        if status != 200 or not isinstance(data, dict):
            raise RemoteUnavailable("base head")
        return (data.get("object") or {}).get("sha") or ""

    def merge(self, number: int, expected_head_sha: str, idempotency_key: str) -> dict:
        # `sha` je GitHubova zastita: merge pada ako se glava PR-a pomaknula od provjere.
        status, data = _request("PUT", self._url(f"/pulls/{number}/merge"), self.token,
                                {"merge_method": "merge", "sha": expected_head_sha,
                                 "commit_title": f"Merge pull request #{number} (lekta-autonomy)"})
        if status == 200 and isinstance(data, dict) and data.get("merged"):
            return {"merged": True, "merge_sha": data.get("sha")}
        return {"merged": False}


class NetlifyHosting:
    def __init__(self, site_id: str, token: str):
        self.site_id = site_id
        self.token = token

    def _url(self, path: str) -> str:
        return f"{NETLIFY_API}/sites/{self.site_id}{path}"

    @staticmethod
    def _view(dep: dict) -> dict:
        return {"id": dep.get("id"), "state": dep.get("state"), "commit_sha": dep.get("commit_ref"),
                "artifact_hash": None, "published_at": dep.get("published_at"), "url": dep.get("deploy_ssl_url")}

    def current_deployment(self) -> dict | None:
        status, site = _request("GET", self._url(""), self.token, accept="application/json")
        if status != 200 or not isinstance(site, dict):
            raise RemoteUnavailable("site")
        dep = site.get("published_deploy")
        return self._view(dep) if isinstance(dep, dict) else None

    def deployment(self, deployment_id: str) -> dict | None:
        status, dep = _request("GET", f"{NETLIFY_API}/deploys/{deployment_id}", self.token, accept="application/json")
        if status == 404:
            return None
        if status != 200 or not isinstance(dep, dict):
            raise RemoteUnavailable("deploy")
        return self._view(dep)

    def restore(self, deployment_id: str) -> dict:
        status, dep = _request("POST", self._url(f"/deploys/{deployment_id}/restore"), self.token, accept="application/json")
        if status != 200 or not isinstance(dep, dict):
            return {"ok": False}
        return {"ok": True, "id": dep.get("id")}


def load_remotes(home: str, config: dict) -> dict:
    """Vraca {'remote': GitHubRemote|None, 'hosting': NetlifyHosting|None, 'reasons': [...]}. Nedostajuci token
    NIJE greska nego razlog zasto je izdavac blokiran; publisherEnabled=false ga svejedno ne aktivira."""
    reasons: list[str] = []
    gh_token = read_secret_file(home, "publisher-token")
    remote = GitHubRemote(str(config.get("repository")), gh_token) if gh_token else None
    if remote is None:
        reasons.append("publisher-token nedostaje (odvojen GitHub identitet)")
    nl_token = read_secret_file(home, "netlify-token")
    nl_site = read_secret_file(home, "netlify-site")
    hosting = NetlifyHosting(nl_site, nl_token) if nl_token and nl_site else None
    if hosting is None:
        reasons.append("netlify-token ili netlify-site nedostaje")
    return {"remote": remote, "hosting": hosting, "reasons": reasons}


def token_fingerprint(token: str | None) -> str | None:
    """Za dnevnik: nikad vrijednost tokena, samo kratak otisak da se vidi je li zamijenjen."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:8] if token else None
