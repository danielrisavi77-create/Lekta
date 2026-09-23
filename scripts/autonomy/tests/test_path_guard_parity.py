"""Parnost gardova staza: `policy.canonical_path` naspram `worker._safe_relative_paths`.

Do 2026-09-21 su to bile DVIJE kopije istih pravila i vec su se bile razisle: NUL bajt je odbijala samo
politika, `~` samo gard u `worker.py`, a razrjesavanje veza se u `worker.py` preskakalo kad `repo` nije
mapa. Nizvodni ishod (`needs_human`, odnosno `failed` commit) to ne bi pokazao, jer su obje presude
odbijanje, pa ovaj test mjeri IZRAVNO: isti skup ulaza, obje presude, i tvrdnja da se slazu.

Jedina razlika je izricita i namjerna: `reject_home`. Uz nju je tvrdnja da politika tu stazu ipak ne
propusta nizvodno, dakle da razlika nije rupa nego razlicita ostrina istog odbijanja.
"""
import os
import subprocess
import tempfile
import unittest

from scripts.autonomy import policy as policy_module
from scripts.autonomy import worker as worker_module
from scripts.autonomy.policy import PolicyError, canonical_path, explain_change, path_escapes_root
from scripts.autonomy.worker import UnsafeCommitPaths, _safe_relative_paths

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
EXAMPLE = os.path.join(ROOT, "config", "autonomy.example.json")

# Isti skup ulaza za oba garda. Svaki oblik je jedan nacin da staza izadje iz radnikova stabla.
SHARED_BAD = (
    "../tudje.txt",
    "a/../../b.txt",
    "docs/../../x",
    "/etc/passwd",
    "\\\\server\\share\\x.txt",
    "\\windows\\x.ini",
    "C:/Windows/system.ini",
    "C:x",
    "c:/temp/x.txt",
    "",
    ".",
    "a\x00b",
    "src/ui\x00/app.ts",
)

SHARED_GOOD = (
    ("src/ui/app.ts", "src/ui/app.ts"),
    ("./docs/x.md", "docs/x.md"),
    ("docs\\agents\\./x.md", "docs/agents/x.md"),
)


def _config() -> dict:
    import json

    with open(EXAMPLE, encoding="utf-8") as fh:
        return json.load(fh)


class PathGuardParityTest(unittest.TestCase):
    def test_the_rules_have_exactly_one_implementation(self):
        """Izravan signal da kopije vise nema: oba modula gledaju u IST objekt, ne u svoju verziju."""
        self.assertIs(worker_module.canonical_path, policy_module.canonical_path)
        self.assertIs(worker_module.path_escapes_root, policy_module.path_escapes_root)
        self.assertFalse(hasattr(worker_module, "_leaves_tree_via_link"),
                         "vlastita kopija provjere veza je uklonjena, inace se moze opet razici")
        self.assertFalse(hasattr(worker_module, "_DRIVE_PREFIX_RE"),
                         "vlastita kopija pravila o oznaci pogona je uklonjena")

    def test_both_guards_refuse_the_same_inputs_with_the_same_reason(self):
        """MJERI SE PRESUDA, ne samo cinjenica odbijanja: razlog mora biti isti niz."""
        for bad in SHARED_BAD:
            with self.assertRaises(PolicyError, msg=bad) as policy_ctx:
                canonical_path(bad, reject_home=True)
            with self.assertRaises(UnsafeCommitPaths, msg=bad) as worker_ctx:
                _safe_relative_paths([bad])
            self.assertEqual(str(worker_ctx.exception), str(policy_ctx.exception), bad)

    def test_the_nul_byte_is_refused_by_both(self):
        """Prva od tri izmjerene razlike: NUL bajt je do popravka vidjela samo politika."""
        for bad in ("a\x00b", "src/ui\x00/app.ts"):
            with self.assertRaises(UnsafeCommitPaths, msg=bad) as ctx:
                _safe_relative_paths([bad])
            self.assertIn("NUL bajt", str(ctx.exception), bad)

    def test_both_guards_accept_the_same_ordinary_paths(self):
        """BASELINE: gard koji sve odbija nije gard. Kanonski oblik mora biti ISTI kod oba."""
        for raw, expected in SHARED_GOOD:
            self.assertEqual(canonical_path(raw), expected, raw)
            self.assertEqual(_safe_relative_paths([raw]), [expected], raw)

    def test_the_home_directory_rule_is_the_one_explicit_difference(self):
        """Druga razlika: `~`. Ona OSTAJE, ali je sada jedan parametar i ovdje izmjerena s obje strane."""
        home = "~/.ssh/id_rsa"
        self.assertEqual(canonical_path(home), home,
                         "bez `reject_home` je to obicna relativna staza, kao i do sada")
        with self.assertRaises(PolicyError) as policy_ctx:
            canonical_path(home, reject_home=True)
        with self.assertRaises(UnsafeCommitPaths) as worker_ctx:
            _safe_relative_paths([home])
        self.assertIn("kucnu mapu", str(policy_ctx.exception))
        self.assertEqual(str(worker_ctx.exception), str(policy_ctx.exception))
        # Razlika nije rupa: klasifikacija istu stazu i dalje ne pusta kroz automatski prihvat.
        verdict, reasons = explain_change([home], 1, _config())
        self.assertEqual(verdict, "needs_human", reasons)
        self.assertTrue(any(home in r for r in reasons), reasons)

    def test_a_missing_repo_root_is_not_a_false_refusal(self):
        """Treca razlika: `worker.py` je provjeru veza preskakao kad `repo` nije mapa.

        Sada se zove ista funkcija uvijek, pa je vazno dokazati da izmisljeni `repo` NE proizvodi lazno
        odbijanje; inace bi "spajanje na jedan izvor" tiho oborilo testove s ubrizganim `run`.
        """
        self.assertFalse(path_escapes_root("/repo", "src/ui/app.ts"))
        self.assertEqual(_safe_relative_paths(["src/ui/app.ts"], repo="/repo"), ["src/ui/app.ts"])

    def test_a_link_out_of_the_tree_is_refused_by_both(self):
        """Symlink na POSIX-u, directory junction na Windowsu. Kad se veza ne da stvoriti, test se PRESKACE."""
        repo = tempfile.mkdtemp()
        outside = tempfile.mkdtemp()
        with open(os.path.join(outside, "tudje.txt"), "w", encoding="utf-8") as fh:
            fh.write("nije nase" + chr(10))
        link = os.path.join(repo, "veza")
        if os.name == "nt":
            made = subprocess.run(["cmd", "/c", "mklink", "/J", link, outside], capture_output=True,
                                  text=True, check=False, shell=False)
            if made.returncode != 0:
                self.skipTest("junction se nije dao stvoriti: " + (made.stderr or made.stdout).strip())
        else:
            try:
                os.symlink(outside, link, target_is_directory=True)
            except (OSError, NotImplementedError) as exc:
                self.skipTest("symlink se nije dao stvoriti: " + str(exc))
        self.assertTrue(path_escapes_root(repo, "veza/tudje.txt"))
        with self.assertRaises(UnsafeCommitPaths) as ctx:
            _safe_relative_paths(["veza/tudje.txt"], repo=repo)
        self.assertIn("izvan stabla preko veze", str(ctx.exception))
        with self.assertRaises(PolicyError):
            explain_change(["veza/tudje.txt"], 1, _config(), root=repo)
        # BASELINE: staza u ISTOM stablu prolazi kod oba, pa provjera ne gasi ono sto stiti.
        with open(os.path.join(repo, "nase.txt"), "w", encoding="utf-8") as fh:
            fh.write("nase" + chr(10))
        self.assertEqual(_safe_relative_paths(["nase.txt"], repo=repo), ["nase.txt"])
        self.assertFalse(path_escapes_root(repo, "nase.txt"))


if __name__ == "__main__":
    unittest.main()
