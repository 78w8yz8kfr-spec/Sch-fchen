#!/usr/bin/env python3
"""Mechanischer Gesundheitscheck des Wikis (siehe brain/SCHEMA.md, Ablauf Lint).

Prüft nur, was sich ohne Verständnis prüfen lässt: defekte Links, verwaiste
und nicht indizierte Seiten, fehlendes Frontmatter und Quellenseiten, deren
Rohquelle sich seit dem Ingest geändert hat. Widersprüche findet der Agent.
"""
import re
import subprocess
import sys
from pathlib import Path

BRAIN = Path(__file__).resolve().parent.parent
REPO = BRAIN.parent
WIKI = BRAIN / "wiki"
LINK = re.compile(r"\]\(([^)#\s]+\.md)(?:#[^)]*)?\)")
TYPEN = {"quelle", "konzept", "modul", "entscheidung", "analyse", "uebersicht"}


def frontmatter(text):
    if not text.startswith("---\n"):
        return None
    ende = text.find("\n---", 4)
    if ende < 0:
        return None
    felder, liste = {}, None
    for zeile in text[4:ende].splitlines():
        zeile = zeile.split("  #")[0].rstrip()
        if zeile.startswith("  - ") and liste:
            felder[liste].append(zeile[4:].strip())
        elif ":" in zeile:
            schluessel, wert = zeile.split(":", 1)
            wert = wert.strip()
            felder[schluessel] = wert if wert else []
            liste = None if wert else schluessel
    return felder


def geaendert_seit(commit, pfad):
    """True, wenn pfad nach commit geändert wurde; None, wenn Git es nicht weiß."""
    try:
        aus = subprocess.run(
            ["git", "-C", str(REPO), "diff", "--quiet", commit, "HEAD", "--", pfad],
            capture_output=True,
        )
    except FileNotFoundError:
        return None
    return {0: False, 1: True}.get(aus.returncode)


def main():
    fehler, hinweise = [], []
    seiten = sorted(WIKI.rglob("*.md"))
    eingehend = {s: 0 for s in seiten}
    index_text = (BRAIN / "index.md").read_text(encoding="utf-8")

    for datei in [BRAIN / "index.md", BRAIN / "log.md", *seiten]:
        text = datei.read_text(encoding="utf-8")
        name = datei.relative_to(BRAIN)
        for ziel in LINK.findall(text):
            if ziel.startswith("http"):
                continue
            pfad = (datei.parent / ziel).resolve()
            if not pfad.exists():
                fehler.append(f"{name}: defekter Link -> {ziel}")
            elif pfad in eingehend and pfad != datei.resolve():
                eingehend[pfad] += 1

    for seite in seiten:
        name = seite.relative_to(BRAIN)
        text = seite.read_text(encoding="utf-8")
        fm = frontmatter(text)
        if fm is None:
            fehler.append(f"{name}: Frontmatter fehlt")
            continue
        if fm.get("typ") not in TYPEN:
            fehler.append(f"{name}: unbekannter typ '{fm.get('typ')}'")
        for quelle in fm.get("quellen") or []:
            if not (REPO / quelle).exists():
                fehler.append(f"{name}: Rohquelle fehlt -> {quelle}")
        if str(seite.relative_to(BRAIN)) not in index_text:
            fehler.append(f"{name}: nicht in index.md")
        if eingehend[seite] == 0 and fm.get("typ") != "uebersicht":
            hinweise.append(f"{name}: verwaist (keine eingehenden Links)")
        commit = fm.get("commit")
        if fm.get("typ") == "quelle" and isinstance(commit, str) and commit:
            for quelle in fm.get("quellen") or []:
                if geaendert_seit(commit, quelle):
                    hinweise.append(f"{name}: {quelle} seit {commit} geändert, neu aufnehmen")

    for zeile in fehler:
        print("FEHLER  ", zeile)
    for zeile in hinweise:
        print("HINWEIS ", zeile)
    print(f"{len(seiten)} Seiten, {len(fehler)} Fehler, {len(hinweise)} Hinweise")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
