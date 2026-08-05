# Berichtsheft (Ausbildungsnachweis)

Erste Ausbaustufe des Azubi-Moduls aus dem Fahrplan (V0.60).

## Warum

Ein Auszubildender muss seine Ausbildung schriftlich nachweisen. Ohne
vollständiges Berichtsheft lässt die Kammer ihn nicht zur Prüfung zu. Üblich
ist ein Bericht je Woche: was im Betrieb getan wurde, was die Berufsschule
behandelt hat, dazu Urlaub und Krankheit. Der Ausbilder gibt frei oder gibt
mit einer Bemerkung zurück.

## Wer ist beteiligt

| Rolle | Recht |
| --- | --- |
| Auszubildender (`users.is_apprentice`) | schreibt und reicht seine eigenen Wochenberichte ein |
| Ausbilder (`users.trainer_user_id`) | sieht und entscheidet die Berichte **seiner** Auszubildenden, auch ohne Planungsrolle |
| Planung (Büro, Geschäftsführung, …) | sieht und entscheidet alle Berichte der Firma |

Ein Ausbilder ist häufig Vorarbeiter und hat keine Planungsrolle. Deshalb
hängt sein Recht an der Zuordnung, nicht an einer Rolle — er bekommt dadurch
aber auch keinen weiteren Einblick ins Büro.

Beide Angaben werden am Mitarbeiter gepflegt (Verwaltung → Mitarbeiter
bearbeiten), sichtbar nur, wenn die Firma das Modul hat.

## Ablauf

```
Entwurf ──einreichen──► Eingereicht ──freigeben──► Freigegeben (unveränderlich)
   ▲                          │
   └──────nachbessern─────────┴──zurückgeben──► Zurückgegeben (mit Bemerkung)
```

* Eine Woche beginnt am **Montag**. Die Zeiterfassung rechnet ebenso; zwei
  verschiedene Wochenschnitte in einer App wären für niemanden nachvollziehbar.
* Je Auszubildendem und Woche gibt es **genau einen** Bericht.
* Die geleistete Arbeitszeit wird **nicht eingetippt**, sondern aus der
  Zeiterfassung übernommen. Wer sie abschreiben müsste, schriebe sie
  irgendwann falsch ab — und die Kammer sähe eine andere Zahl als das Büro.
* Eine **Rückgabe ohne Bemerkung** ist nicht möglich: der Auszubildende wüsste
  sonst nicht, was er nachbessern soll.
* Ein **freigegebener** Nachweis ist unveränderlich, auch für den Ausbilder.
  Er ist ein Nachweis; wer ihn nachträglich ändern könnte, könnte die
  Ausbildung umschreiben.
* Die **Unterschrift** ist eine festgehaltene Bestätigung mit Namen und
  Zeitpunkt, keine gemalte Unterschrift. Der Name wird mitgeschrieben: er muss
  auch dann noch lesbar sein, wenn der Mensch die Firma längst verlassen hat.
* Jeder Schritt bleibt in `apprentice_report_events` stehen, erzeugt vom
  Datenbank-Trigger. Der Verlauf lässt sich nicht ändern und nicht löschen.

## Schnittstelle

| Weg | Wer |
| --- | --- |
| `GET /api/v1/apprentice/reports?from=&to=` | Auszubildender, eigene Berichte |
| `PUT /api/v1/apprentice/reports/:montag` | Auszubildender, Entwurf speichern |
| `POST /api/v1/apprentice/reports/:montag/submit` | Auszubildender, einreichen |
| `GET /api/v1/admin/apprentice-reports` | Ausbilder und Planung |
| `POST /api/v1/admin/apprentice-reports/review` | Ausbilder und Planung, einzeln oder als Sammelfreigabe |

Alle Wege setzen voraus, dass die Plattformverwaltung das Modul
`apprentice_reports` für die Firma freigegeben hat; sonst antworten sie mit
409 `module_disabled`. Das Berichtsheft gehört **nicht** zum Standardumfang:
es ist ein eigener verkaufter Bereich.

## Noch nicht enthalten

* **PDF-Ausdruck** des Berichtshefts für die Kammer.
* **Erinnerungen** an fehlende Wochen (heute sieht man offene Berichte nur,
  wenn man in die Liste schaut).
* **Tagesberichte** als Alternative zum Wochenbericht.
