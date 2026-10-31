# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - 2026-10-31

### Added

- The days RTE flags on the French grid through its official APIs ("Signal" 2.0 and "Demand Response Signal" 2.0), with the client id and client secret of the user's application on the RTE data portal; readings at the times RTE publishes (00:05, 09:45, 12:15, 19:15 for the PP days, 00:05 and 11:15 for the demand response days), a "Test the connection" button.
- "RTE PP days" device for the capacity mechanism from 1 November 2026: today, tomorrow and the day after (normal day, not announced yet, PP day), peak period now (7-10 h and 17-20 h of a PP day), PP days of the season so far and left out of 22.
- "RTE demand response days" device: today and tomorrow (flagged, not flagged, not published yet) and the flagged days of the calendar year; each device is offered only when the application is subscribed to its API.
- Scene triggers: PP day announced (today, tomorrow, the day after), peak period started and ended, demand response day flagged (explicit, implicit); each day fires once, even across restarts.
- Dashboard widgets: the PP days (three days, peak periods, season count, list of the PP days) and the demand response days (today, tomorrow, the days of the year).
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.

[0.1.0]: https://github.com/William-De71/gladys-rte-jours-signales/releases/tag/v0.1.0
