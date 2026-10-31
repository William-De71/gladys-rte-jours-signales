// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, widget contents, toasts, messages of the
// Configuration screen. Vocabulary of the Gladys interface (appareil / Gerät /
// dispositivo, scène / Szene / escena) and of RTE (jour PP, période de pointe,
// effacement, jour signalé).
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // device names (Discovery)
  device_pp: { en: 'RTE PP days', fr: 'Jours PP RTE', de: 'RTE-PP-Tage', es: 'Días PP de RTE' },
  device_demand_response: {
    en: 'RTE demand response days',
    fr: 'Jours signalés effacement RTE',
    de: 'RTE-Lastabwurftage',
    es: 'Días de deslastre de RTE',
  },

  // feature names (Discovery, device page)
  feature_pp_today: {
    en: 'PP day today',
    fr: 'Jour PP aujourd’hui',
    de: 'PP-Tag heute',
    es: 'Día PP hoy',
  },
  feature_pp_tomorrow: {
    en: 'PP day tomorrow',
    fr: 'Jour PP demain',
    de: 'PP-Tag morgen',
    es: 'Día PP mañana',
  },
  feature_pp_day_after: {
    en: 'PP day the day after tomorrow',
    fr: 'Jour PP après-demain',
    de: 'PP-Tag übermorgen',
    es: 'Día PP pasado mañana',
  },
  feature_pp_peak_now: {
    en: 'Peak period now',
    fr: 'Période de pointe en cours',
    de: 'Spitzenzeit läuft',
    es: 'Periodo punta en curso',
  },
  feature_pp_season_count: {
    en: 'PP days this season',
    fr: 'Jours PP de la saison',
    de: 'PP-Tage dieser Saison',
    es: 'Días PP de la temporada',
  },
  feature_pp_season_remaining: {
    en: 'PP days left this season',
    fr: 'Jours PP restants',
    de: 'Verbleibende PP-Tage',
    es: 'Días PP restantes',
  },
  feature_demand_response_today: {
    en: 'Flagged day today',
    fr: 'Jour signalé aujourd’hui',
    de: 'Signaltag heute',
    es: 'Día señalado hoy',
  },
  feature_demand_response_tomorrow: {
    en: 'Flagged day tomorrow',
    fr: 'Jour signalé demain',
    de: 'Signaltag morgen',
    es: 'Día señalado mañana',
  },
  feature_demand_response_year_count: {
    en: 'Flagged days this year',
    fr: 'Jours signalés de l’année',
    de: 'Signaltage dieses Jahres',
    es: 'Días señalados del año',
  },

  // widget rows
  rowToday: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  rowTomorrow: { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' },
  rowDayAfter: {
    en: 'Day after tomorrow',
    fr: 'Après-demain',
    de: 'Übermorgen',
    es: 'Pasado mañana',
  },
  rowPeak: {
    en: 'Peak periods',
    fr: 'Périodes de pointe',
    de: 'Spitzenzeiten',
    es: 'Periodos punta',
  },
  ppSignaled: { en: 'PP day', fr: 'Jour PP', de: 'PP-Tag', es: 'Día PP' },
  ppNormal: { en: 'Normal day', fr: 'Jour normal', de: 'Normaler Tag', es: 'Día normal' },
  ppPending: {
    en: 'Not announced yet',
    fr: 'Pas encore annoncé',
    de: 'Noch nicht angekündigt',
    es: 'Aún sin anunciar',
  },
  drSignaled: {
    en: 'Flagged ({kind})',
    fr: 'Signalé ({kind})',
    de: 'Signalisiert ({kind})',
    es: 'Señalado ({kind})',
  },
  drNormal: { en: 'Not flagged', fr: 'Non signalé', de: 'Nicht signalisiert', es: 'No señalado' },
  drPending: {
    en: 'Not published yet',
    fr: 'Pas encore publié',
    de: 'Noch nicht veröffentlicht',
    es: 'Aún sin publicar',
  },
  kind_explicit: { en: 'explicit', fr: 'explicite', de: 'explizit', es: 'explícito' },
  kind_implicit: { en: 'implicit', fr: 'implicite', de: 'implizit', es: 'implícito' },
  kind_explicit_implicit: {
    en: 'explicit and implicit',
    fr: 'explicite et implicite',
    de: 'explizit und implizit',
    es: 'explícito e implícito',
  },
  peakNow: {
    en: 'Now, until {end}',
    fr: 'En cours jusqu’à {end}',
    de: 'Jetzt, bis {end}',
    es: 'Ahora, hasta las {end}',
  },
  peakNext: {
    en: 'Next at {start}',
    fr: 'Prochaine à {start}',
    de: 'Nächste um {start}',
    es: 'Próximo a las {start}',
  },
  peakOver: {
    en: 'Over for today',
    fr: 'Terminées pour aujourd’hui',
    de: 'Für heute vorbei',
    es: 'Terminados por hoy',
  },
  tileSeasonCount: {
    en: 'PP days this season',
    fr: 'Jours PP de la saison',
    de: 'PP-Tage der Saison',
    es: 'Días PP de temporada',
  },
  tileRemaining: { en: 'Left', fr: 'Restants', de: 'Verbleibend', es: 'Restantes' },
  tileYearCount: {
    en: 'Flagged days in {year}',
    fr: 'Jours signalés en {year}',
    de: 'Signaltage {year}',
    es: 'Días señalados en {year}',
  },
  badgeUpcoming: { en: 'Coming', fr: 'À venir', de: 'Kommend', es: 'Próximo' },
  badgeToday: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  captionSeason: {
    en: 'Season {season} · updated {ago}',
    fr: 'Saison {season} · mise à jour {ago}',
    de: 'Saison {season} · aktualisiert {ago}',
    es: 'Temporada {season} · actualizado {ago}',
  },
  captionYear: {
    en: 'Year {year} · updated {ago}',
    fr: 'Année {year} · mise à jour {ago}',
    de: 'Jahr {year} · aktualisiert {ago}',
    es: 'Año {year} · actualizado {ago}',
  },
  emptySeason: {
    en: 'No PP day so far this season.',
    fr: 'Aucun jour PP pour l’instant cette saison.',
    de: 'Bisher kein PP-Tag in dieser Saison.',
    es: 'Ningún día PP por ahora esta temporada.',
  },
  offSeason: {
    en: 'Off season: the next PP season runs from 1 November to 31 March.',
    fr: 'Hors saison : la prochaine saison PP va du 1er novembre au 31 mars.',
    de: 'Außerhalb der Saison: Die nächste PP-Saison läuft vom 1. November bis 31. März.',
    es: 'Fuera de temporada: la próxima temporada PP va del 1 de noviembre al 31 de marzo.',
  },
  emptyYear: {
    en: 'No flagged day so far this year.',
    fr: 'Aucun jour signalé pour l’instant cette année.',
    de: 'Bisher kein Signaltag in diesem Jahr.',
    es: 'Ningún día señalado por ahora este año.',
  },
  buttonRefresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },

  // state of one API
  api_ok: { en: 'Connected', fr: 'Connectée', de: 'Verbunden', es: 'Conectada' },
  api_unknown: { en: 'Starting', fr: 'Démarrage', de: 'Startet', es: 'Iniciando' },
  api_unconfigured: {
    en: 'Not configured',
    fr: 'Non configurée',
    de: 'Nicht eingerichtet',
    es: 'Sin configurar',
  },
  api_refused: {
    en: 'Credentials refused',
    fr: 'Identifiants refusés',
    de: 'Zugangsdaten abgelehnt',
    es: 'Credenciales rechazadas',
  },
  api_unsubscribed: {
    en: 'API not subscribed',
    fr: 'API non souscrite',
    de: 'API nicht abonniert',
    es: 'API sin suscripción',
  },
  api_rate_limited: {
    en: 'Too many requests',
    fr: 'Trop de requêtes',
    de: 'Zu viele Anfragen',
    es: 'Demasiadas peticiones',
  },
  api_error: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
  api_unknown_hint: {
    en: 'The first reading is under way.',
    fr: 'La première lecture est en cours.',
    de: 'Die erste Abfrage läuft.',
    es: 'La primera lectura está en curso.',
  },
  api_unconfigured_hint: {
    en: 'Enter the client id and client secret of your RTE application in the configuration of the integration.',
    fr: 'Saisissez l’ID client et l’ID secret de votre application RTE dans la configuration de l’intégration.',
    de: 'Gib die Client-ID und das Client-Secret deiner RTE-Anwendung in der Konfiguration der Integration ein.',
    es: 'Introduzca el ID de cliente y el secreto de su aplicación RTE en la configuración de la integración.',
  },
  api_refused_hint: {
    en: 'RTE refuses the client id or secret: copy them again from your application on data.rte-france.com.',
    fr: 'RTE refuse l’ID client ou l’ID secret : recopiez-les depuis votre application sur data.rte-france.com.',
    de: 'RTE lehnt Client-ID oder Secret ab: Kopiere sie erneut aus deiner Anwendung auf data.rte-france.com.',
    es: 'RTE rechaza el ID de cliente o el secreto: cópielos de nuevo desde su aplicación en data.rte-france.com.',
  },
  api_unsubscribed_hint_pp: {
    en: 'Your RTE application is not subscribed to the “Signal” API: subscribe to it on data.rte-france.com and attach it to the application.',
    fr: 'Votre application RTE n’est pas abonnée à l’API « Signal » : abonnez-vous sur data.rte-france.com et rattachez-la à l’application.',
    de: 'Deine RTE-Anwendung hat die API „Signal“ nicht abonniert: Abonniere sie auf data.rte-france.com und verknüpfe sie mit der Anwendung.',
    es: 'Su aplicación RTE no está suscrita a la API «Signal»: suscríbase en data.rte-france.com y vincúlela a la aplicación.',
  },
  api_unsubscribed_hint_demand_response: {
    en: 'Your RTE application is not subscribed to the “Demand Response Signal” API: subscribe to it on data.rte-france.com and attach it to the application.',
    fr: 'Votre application RTE n’est pas abonnée à l’API « Demand Response Signal » : abonnez-vous sur data.rte-france.com et rattachez-la à l’application.',
    de: 'Deine RTE-Anwendung hat die API „Demand Response Signal“ nicht abonniert: Abonniere sie auf data.rte-france.com und verknüpfe sie mit der Anwendung.',
    es: 'Su aplicación RTE no está suscrita a la API «Demand Response Signal»: suscríbase en data.rte-france.com y vincúlela a la aplicación.',
  },
  api_rate_limited_hint: {
    en: 'RTE asked to slow down: the next reading waits a little.',
    fr: 'RTE demande de ralentir : la prochaine lecture attend un peu.',
    de: 'RTE bittet um weniger Anfragen: Die nächste Abfrage wartet etwas.',
    es: 'RTE pide ir más despacio: la próxima lectura espera un poco.',
  },
  api_error_hint: {
    en: 'The RTE API does not answer: the integration tries again in 15 minutes.',
    fr: 'L’API RTE ne répond pas : l’intégration réessaie dans 15 minutes.',
    de: 'Die RTE-API antwortet nicht: Die Integration versucht es in 15 Minuten erneut.',
    es: 'La API de RTE no responde: la integración lo reintenta en 15 minutos.',
  },

  // relative times
  never: { en: 'never', fr: 'jamais', de: 'nie', es: 'nunca' },
  justNow: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  minutesAgo: { en: '{n} min ago', fr: 'il y a {n} min', de: 'vor {n} Min.', es: 'hace {n} min' },
  hoursAgo: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  daysAgo: { en: '{n} days ago', fr: 'il y a {n} jours', de: 'vor {n} Tagen', es: 'hace {n} días' },

  // Configuration screen
  statusSummary: {
    en: 'PP days: {pp} · Demand response days: {dr}',
    fr: 'Jours PP : {pp} · Jours signalés effacement : {dr}',
    de: 'PP-Tage: {pp} · Lastabwurftage: {dr}',
    es: 'Días PP: {pp} · Días de deslastre: {dr}',
  },
  statusUnsubscribed: {
    en: 'Subscribe your application to the missing API on data.rte-france.com.',
    fr: 'Abonnez votre application à l’API manquante sur data.rte-france.com.',
    de: 'Abonniere die fehlende API für deine Anwendung auf data.rte-france.com.',
    es: 'Suscriba su aplicación a la API que falta en data.rte-france.com.',
  },
  toastRefreshed: {
    en: 'RTE signals read again.',
    fr: 'Signaux RTE relus.',
    de: 'RTE-Signale neu abgefragt.',
    es: 'Señales de RTE leídas de nuevo.',
  },
  toastFailed: {
    en: 'RTE: {error}',
    fr: 'RTE : {error}',
    de: 'RTE: {error}',
    es: 'RTE: {error}',
  },
  testDetail: {
    en: 'PP days: today {today}, tomorrow {tomorrow}.',
    fr: 'Jours PP : aujourd’hui {today}, demain {tomorrow}.',
    de: 'PP-Tage: heute {today}, morgen {tomorrow}.',
    es: 'Días PP: hoy {today}, mañana {tomorrow}.',
  },
};

/**
 * @description Whether a value is one of the languages of the integration.
 * @param {unknown} language - The value.
 * @returns {boolean} A language.
 */
const isLanguage = (language) => LANGUAGES.includes(language);

/**
 * @description A text in a language (English fallback), with its
 * substitutions.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('minutesAgo', 'fr', { n: 3 }); // -> 'il y a 3 min'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) return key;
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string|Function} key - The TEXTS key, or `(language) => string`.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      typeof key === 'function' ? key(language) : t(key, language, values),
    ]),
  );
}

const locale = (language) => (isLanguage(language) ? language : 'en');

/**
 * @description A number written in a language ("20,5", "20.5").
 * @param {number} n - The number.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
const formatNumber = (n, language) =>
  new Intl.NumberFormat(locale(language), { maximumFractionDigits: 1 }).format(n);

/**
 * @description How long ago an instant was: "just now", "12 min ago".
 * @param {number} at - The instant, in ms (0: never).
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function ago(at, now, language) {
  if (!at) return t('never', language);
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) return t('justNow', language);
  if (minutes < 60) return t('minutesAgo', language, { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t('hoursAgo', language, { n: hours });
  return t('daysAgo', language, { n: Math.floor(hours / 24) });
}

/**
 * @description A day written in a language: "Mon 2 November", "lun. 2 novembre".
 * @param {string} date - "YYYY-MM-DD".
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function formatDay(date, language) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale(language), {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export { LANGUAGES, TEXTS, isLanguage, t, all, formatNumber, formatDay, ago };
