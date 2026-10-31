# RTE Jours signalés

## Überblick

Diese Integration zeigt in Gladys die Tage, die RTE im französischen Stromnetz signalisiert:

- die **PP-Tage** des Kapazitätsmechanismus (ab 1. November 2026): bis zu 22 Tage pro Winter, vom 1. November bis 31. März, werktags außer an Feiertagen. An diesen Tagen dauern die **Spitzenzeiten** von 7 bis 10 Uhr und von 17 bis 20 Uhr. RTE kündigt sie am Vortag um 9:30 Uhr an, manchmal schon zwei Tage vorher;
- die **Lastabwurftage** der Lastabwurf-Ausschreibung (explizit, implizit), gegen 11 Uhr für den Folgetag veröffentlicht.

Manche Versorger und Aggregatoren belohnen die an diesen Tagen erzielten Einsparungen. Mit den Szenenauslösern kann Gladys während der Spitzenzeiten die Heizung absenken, den Warmwasserspeicher ausschalten oder das Laden des Autos verschieben.

Die Daten stammen aus den offiziellen, kostenlosen RTE-APIs, mit deiner eigenen Anwendung. Die Integration fragt RTE nur zu den Veröffentlichungszeiten ab, wenige Male am Tag.

## Voraussetzungen

- Gladys **5.3.0** oder neuer.
- Ein kostenloses Konto auf [data.rte-france.com](https://data.rte-france.com).
- Eine RTE-Anwendung mit der API **Signal** (PP-Tage), der API **Demand Response Signal** (Lastabwurf) oder beiden.

## Konfiguration

1. Öffne auf [data.rte-france.com](https://data.rte-france.com) die API [Signal](https://data.rte-france.com/catalog/-/api/market/Signal/v2.0) und klick auf **Subscribe to API**. Leg eine Anwendung an (Typ Web / Server).
2. Mach dasselbe für die API [Demand Response Signal](https://data.rte-france.com/catalog/-/api/market/Demand-Response-Signal/v2.0) und verknüpfe sie mit **derselben Anwendung**.
3. Kopier unter **My applications** die **Client-ID** und das **Client-Secret** der Anwendung in die Konfiguration der Integration.
4. Klick auf **Verbindung testen**: Die Meldung zeigt den Zustand jeder API und ob heute und morgen PP-Tage sind.

| Feld                    | Zweck                                                                          |
| ----------------------- | ------------------------------------------------------------------------------ |
| Client-ID               | Die Client-ID deiner RTE-Anwendung                                             |
| Client-Secret           | Das Secret der Anwendung, nie wieder angezeigt und nie in die Logs geschrieben |
| Sprache der Gerätetexte | Namen der Geräte und Funktionen; automatisch: die des Dashboards               |

## Verwendung

### Geräte

Füge in der **Erkennung** die angebotenen Geräte hinzu (eines pro API, die die Anwendung abonniert hat).

**RTE-PP-Tage**: heute, morgen, übermorgen, laufende Spitzenzeit, PP-Tage der Saison und verbleibende. **RTE-Lastabwurftage**: heute, morgen und Signaltage des Jahres.

| Wert | Abzeichen   | Bedeutung                                                                      |
| ---- | ----------- | ------------------------------------------------------------------------------ |
| 0    | Kein Risiko | Normaler Tag oder nicht signalisiert                                           |
| 1    | Niedrig     | Noch nicht angekündigt (ein Werktag der Saison oder noch nicht veröffentlicht) |
| 3    | Hoch        | PP-Tag, Signaltag oder laufende Spitzenzeit                                    |

In einer Szene diese Werte vergleichen: „PP-Tag morgen“ gleich 3, „Spitzenzeit läuft“ gleich 3.

### Dashboard-Widgets

![Generierte Illustration der Widgets „RTE-PP-Tage“ und „RTE-Signaltage“ — kein Screenshot](https://raw.githubusercontent.com/William-De71/gladys-rte-jours-signales/main/docs/assets/widgets.de.png)

- **RTE-PP-Tage**: heute, morgen, übermorgen, Spitzenzeiten, PP-Tage der Saison von 22, letzte PP-Tage, Schaltfläche **Aktualisieren**.
- **RTE-Signaltage**: heute und morgen mit der Art, Signaltage des Jahres, Schaltfläche **Aktualisieren**.

### Szenen

Auslöser:

- **Ein PP-Tag wird angekündigt**: Filter heute, morgen oder übermorgen. Variablen: Tag, Tage bis dahin, PP-Tage der Saison und verbleibende.
- **Eine Spitzenzeit beginnt** / **endet**: um 7:00 und 17:00, um 10:00 und 20:00 Uhr eines PP-Tags; Filter Morgen oder Abend.
- **Ein Lastabwurftag wird signalisiert**: Filter Tag und Art (explizit, implizit).

Jeder Tag löst nur einmal aus, auch wenn die Integration neu startet.

Beispiele:

- Wenn ein PP-Tag für morgen angekündigt wird → benachrichtigen „Morgen PP-Tag“.
- Wenn eine Spitzenzeit beginnt → Heizkörper absenken und den Warmwasserspeicher ausschalten; wenn sie endet → alles zurücksetzen.
- Wenn ein impliziter Lastabwurftag signalisiert wird → das Laden des Autos nach 20 Uhr verschieben.

### Transport

Cloud: Die Integration liest die RTE-APIs über HTTPS mit deiner Client-ID und deinem Secret. Nichts über dein Zuhause wird gesendet. Die Tage werden in französischer Zeit gezählt.

## Fehlerbehebung

- **„Zugangsdaten abgelehnt“**: Client-ID und Secret erneut aus „My applications“ auf data.rte-france.com kopieren.
- **„API nicht abonniert“**: Die Anwendung hat diese API nicht abonniert. Abonniere sie auf der Seite der API und klick dann auf **Verbindung testen** (sonst versucht es die Integration alle 6 Stunden erneut).
- **Nur ein Gerät in der Erkennung**: normal, wenn die Anwendung nur eine API abonniert hat.
- **„Noch nicht angekündigt“ um 9 Uhr**: RTE kündigt die PP-Tage gegen 9:30 Uhr an; die Integration fragt um 9:45 Uhr ab, dann alle 30 Minuten, solange morgen unbekannt ist.
- **Außerhalb der Saison (April bis Oktober)**: kein PP-Tag möglich, die Werte bleiben bei 0.
- Um ein Problem zu melden, öffne ein Issue auf [GitHub](https://github.com/William-De71/gladys-rte-jours-signales/issues) mit den Versionen von Gladys und der Integration und dem Ergebnis von „Verbindung testen“.
