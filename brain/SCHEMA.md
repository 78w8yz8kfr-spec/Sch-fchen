# Schema des Schäfchen-Wikis (Second Brain)

Dieses Wiki folgt dem Muster „LLM Wiki“ von Andrej Karpathy
(https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).
Der Mensch wählt Quellen aus und stellt Fragen. Der Agent schreibt und pflegt
das Wiki. Diese Datei ist die verbindliche Arbeitsanweisung für jeden Agenten,
der im Wiki arbeitet. Sie wird gemeinsam mit dem Nutzer weiterentwickelt.

## Drei Schichten

| Schicht | Ort | Wer schreibt | Regel |
| --- | --- | --- | --- |
| Rohquellen | `docs/`, `CHANGELOG.md`, `AGENTS.md`, `README.md`, `brain/eingang/` | Mensch bzw. reguläre Entwicklung | Das Wiki liest sie nur. Ein Ingest ändert keine Rohquelle. |
| Wiki | `brain/wiki/`, `brain/index.md`, `brain/log.md` | Agent | Der Agent erstellt, aktualisiert und verlinkt alle Seiten. |
| Schema | `brain/SCHEMA.md` | Mensch und Agent gemeinsam | Änderungen nur nach Absprache mit dem Nutzer. |

`brain/eingang/` nimmt neue Rohquellen auf, die nicht ins Repository-`docs/`
gehören: Gesprächsnotizen, Kundenrückmeldungen, Pilotbeobachtungen, Artikel,
Screenshots. Dateinamen beginnen mit dem Datum: `2026-10-01-pilot-gespraech.md`.

`docs/` ist anders als bei Karpathy nicht unveränderlich, weil die reguläre
Entwicklung es fortschreibt. Jede Quellenseite nennt deshalb den Commit, auf
dem ihr Ingest beruht. Ein Lint vergleicht ihn mit dem aktuellen Stand.

## Seitentypen und Ordner

| Ordner | Inhalt | Beispiel |
| --- | --- | --- |
| `wiki/quellen/` | Eine Zusammenfassung je Rohquelle | `produktvision.md` |
| `wiki/konzepte/` | Querschnittsprinzipien und Fachbegriffe | `mandantentrennung.md` |
| `wiki/module/` | Fachmodule und ihr Stand | `zeiterfassung.md` |
| `wiki/entscheidungen/` | Getroffene Entscheidungen mit Datum und Begründung | `dguv-nach-v1.md` |
| `wiki/analysen/` | Abgelegte Antworten, Vergleiche und Lint-Befunde | `widersprueche.md` |
| `wiki/uebersicht.md` | Die laufende Gesamtsynthese | – |

Dateinamen: Kleinbuchstaben, Bindestriche, keine Umlaute (`ae`, `oe`, `ue`, `ss`).

## Seitenformat

Jede Wiki-Seite beginnt mit YAML-Frontmatter, damit Obsidian Dataview sie
abfragen kann:

```yaml
---
typ: konzept            # quelle | konzept | modul | entscheidung | analyse | uebersicht
stand: 2026-10-01       # Datum der letzten inhaltlichen Änderung
quellen:                # Rohquellen, auf denen die Seite beruht
  - docs/ARCHITECTURE.md
---
```

Quellenseiten ergänzen `commit:` (Kurz-Hash des gelesenen Stands).

Danach folgen:

1. `# Titel`
2. Ein bis drei Sätze Kernaussage.
3. Inhalt. Jede Aussage ist mit ihrer Rohquelle belegt, zum Beispiel
   „(Quelle: `docs/ARCHITECTURE.md`, Abschnitt Mandantentrennung)“.
4. `## Verwandt`: Links auf verwandte Seiten.

Links sind relative Markdown-Links (`[Mandantentrennung](../konzepte/mandantentrennung.md)`).
Damit funktionieren sie in Obsidian und auf GitHub gleichermaßen.

Widersprüche zwischen Quellen werden nicht still aufgelöst. Sie stehen auf der
betroffenen Seite als `> **Widerspruch:** …` und zusätzlich in
`wiki/analysen/widersprueche.md`.

## Abläufe

### Ingest

Auslöser: „Nimm `<Quelle>` auf.“

1. Rohquelle vollständig lesen.
2. Die wichtigsten Erkenntnisse kurz mit dem Nutzer besprechen, sofern er
   nicht ausdrücklich einen Stapel-Ingest wünscht.
3. Quellenseite in `wiki/quellen/` anlegen oder aktualisieren.
4. Alle betroffenen Konzept-, Modul- und Entscheidungsseiten aktualisieren
   oder neu anlegen. Eine Quelle berührt oft zehn und mehr Seiten.
5. Neue Widersprüche markieren.
6. `index.md` aktualisieren.
7. Eintrag an `log.md` anhängen.
8. `python3 brain/werkzeuge/lint.py` ausführen und Fehler beheben.

### Frage

Auslöser: eine Frage an das Wiki.

1. `index.md` lesen, passende Seiten öffnen, bei Bedarf die Rohquelle prüfen.
2. Antwort mit Links auf Wiki-Seiten und Rohquellen geben.
3. Ist die Antwort dauerhaft wertvoll (Vergleich, Analyse, neue Verbindung),
   den Nutzer fragen und sie als Seite in `wiki/analysen/` ablegen. Danach
   Index und Log aktualisieren.

### Lint

Auslöser: „Prüfe das Wiki.“

1. `python3 brain/werkzeuge/lint.py` ausführen: defekte Links, verwaiste
   Seiten, fehlendes Frontmatter, nicht indizierte Seiten, veraltete Quellen.
2. Inhaltlich prüfen: Widersprüche, durch neuere Quellen überholte Aussagen,
   wichtige Begriffe ohne eigene Seite, fehlende Querverweise.
3. Befunde in `wiki/analysen/widersprueche.md` bzw. einer Lint-Seite festhalten
   und neue Fragen oder Quellen vorschlagen.
4. Eintrag an `log.md` anhängen.

## Log-Format

`log.md` wird nur ergänzt. Jeder Eintrag beginnt mit

```
## [JJJJ-MM-TT] ingest | Titel
```

Erlaubte Arten: `ingest`, `frage`, `lint`, `schema`. Die letzten Einträge
liefert `grep "^## \[" brain/log.md | tail -5`.

## Grenzen

- Das Wiki ist Wissen über das Projekt, keine Produktfunktion. Es ändert
  keine Phase und keinen Entwicklungsumfang aus `AGENTS.md`.
- Bei Abweichungen zwischen Wiki und Rohquelle gilt die Rohquelle. Verbindlich
  bleiben `AGENTS.md` und die Dokumente in `docs/`.
- Keine Zugangsdaten, Passwörter oder personenbezogenen Betriebsdaten in
  `brain/` ablegen.
- Änderungen nur in `brain/` lösen keine Fassungsanhebung und keinen
  Changelog-Eintrag aus.
