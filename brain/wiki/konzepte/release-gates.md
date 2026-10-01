---
typ: konzept
stand: 2026-10-01
quellen:
  - docs/BACKLOG.md
  - docs/ROADMAP_ACCEPTANCE.md
  - docs/PROJECT_STATUS.md
---

# Release-Gates

Nachweise, die vor echten Betriebsdaten und vor V1.0 vorliegen müssen. Sie
dürfen nie simuliert abgehakt werden. Stand der Quellen: alle offen.

| Issue | Prio | Gate |
| --- | --- | --- |
| #11 | P1 | iPhone-PWA-Abnahme |
| #12 | P1 | Android-Chrome-Abnahme |
| #13 | P1 | Chrome-/Edge-Abnahme der Plantafel |
| #14 | P1 | Last- und Datenmengentest (10.000 Mitarbeiter) |
| #15 | P1 | Zielplattform und getrennte Umgebungen |
| #16 | P1 | Backup, PITR, Wiederherstellung (RPO ≤ 15 min, RTO ≤ 4 h) |
| #17 | P1 | Produktionshärtung (Virenscan, Rate Limits, Passwort-Reset, Notzugang) |
| #18 | P1 | Monitoring und Alarmierung |
| #19 | P1 | Datenschutz und Verträge (AVV, TOM, Impressum) |
| #20 | P1 | Vierwöchiger Gesamtpilot |
| #21 | P2 | PDF-Viewer-/Druck-Grenzfälle |
| #22 | P2 | Onboarding, Support, Störungsprozess |
| #23 | P2 | Preis- und Lizenzmodell |

Ob einzelne Gates inzwischen geschlossen sind, zeigen die GitHub-Issues. Diese
Seite gibt nur den Stand der Dokumente wieder.

## Verwandt

- [Render nur zur Erprobung](../entscheidungen/render-nur-erprobung.md)
- [Definition of Done](definition-of-done.md)
