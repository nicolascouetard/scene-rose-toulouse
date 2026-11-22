import { TODAY_ISO, type Concert, type Venue } from '../data/toulouseData';

export type PeriodFilter = 'all' | 'today' | 'week' | 'weekend' | 'upcoming2027';
export type BudgetFilter = 'all' | 'free' | 'under15' | 'under25';
export type EventFormatFilter = 'all' | 'concerts' | 'club';

const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const DAYS_SHORT_FR = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
const MONTHS_SHORT_FR = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function diffDays(isoA: string, isoB: string): number {
  const a = parseIsoDate(isoA).getTime();
  const b = parseIsoDate(isoB).getTime();
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

export function formatDayHeader(iso: string): { primary: string; tag?: string } {
  const d = parseIsoDate(iso);
  const delta = diffDays(iso, TODAY_ISO);
  const dayName = DAYS_FR[d.getDay()];
  const dayNum = d.getDate();
  const monthShort = MONTHS_SHORT_FR[d.getMonth()];

  if (delta === 0) {
    return { primary: `${dayName} ${dayNum} ${monthShort}`, tag: "Aujourd'hui" };
  }
  if (delta === 1) {
    return { primary: `${dayName} ${dayNum} ${monthShort}`, tag: 'Demain' };
  }
  return { primary: `${dayName} ${dayNum} ${monthShort}` };
}

export function formatShortDate(iso: string): string {
  const d = parseIsoDate(iso);
  const delta = diffDays(iso, TODAY_ISO);
  if (delta === 0) return "Ce soir";
  if (delta === 1) return "Demain";
  return `${DAYS_SHORT_FR[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT_FR[d.getMonth()]}`;
}

export function formatFullDate(iso: string): string {
  const d = parseIsoDate(iso);
  return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

export function matchesPeriod(concert: Concert, period: PeriodFilter): boolean {
  const delta = diffDays(concert.date, TODAY_ISO);
  if (period === 'all') return true;
  if (period === 'today') return delta === 0;
  if (period === 'week') return delta >= 0 && delta <= 7;
  if (period === 'weekend') {
    const dow = parseIsoDate(concert.date).getDay(); // 5=Fri, 6=Sat, 0=Sun
    return dow === 5 || dow === 6 || dow === 0;
  }
  if (period === 'upcoming2027') {
    return concert.date.startsWith('2027-');
  }
  return true;
}

export function formatSyncTime(iso: string): string {
  try {
    const d = new Date(iso);
    const time = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
    })
      .format(d)
      .replace(':', 'h');
    const dateStr = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      day: 'numeric',
      month: 'short',
    }).format(d);
    return `${dateStr} à ${time}`;
  } catch {
    return 'à l’instant';
  }
}

/** Extrait le tarif minimum numérique d'un concert (ex: "16 € – 23 €" -> 16, "Gratuit" -> 0) */
export function extractMinPrice(concert: Concert): number | null {
  if (concert.status === 'free') return 0;
  if (!concert.price) return null;
  if (/gratuit|libre/i.test(concert.price)) return 0;
  const matches = [...concert.price.matchAll(/(\d+(?:[.,]\d+)?)/g)]
    .map((m) => Number(m[1].replace(',', '.')))
    .filter((n) => !Number.isNaN(n));
  if (matches.length === 0) return null;
  return Math.min(...matches);
}

export function matchesBudget(concert: Concert, budget: BudgetFilter): boolean {
  if (budget === 'all') return true;
  if (budget === 'free') return concert.status === 'free' || extractMinPrice(concert) === 0;
  const price = extractMinPrice(concert);
  if (price === null) return false;
  if (budget === 'under15') return price <= 15;
  if (budget === 'under25') return price <= 25;
  return true;
}

export function formatMonthChip(ym: string): string {
  const [y, m] = ym.split('-');
  const idx = Number(m) - 1;
  const label = MONTHS_SHORT_FR[idx] || m;
  const cap = label.charAt(0).toUpperCase() + label.slice(1).replace(/\.$/, '');
  return y === '2026' ? cap : `${cap} ${y.slice(2)}`;
}

/** Nettoie le titre d'un concert pour la recherche d'artiste sur Spotify / YouTube / Deezer */
export function cleanArtistQuery(title: string): string {
  return title
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+[+×&/]\s+.*$/i, '')
    .replace(/\s+[—–-]\s+.*$/, '')
    .replace(/^(les\s+jeudis\s+du\s+cri|le\s+cri|cri\s+toute\s+la\s+nuit|plein\s+phare|thunder\s*x\s*interference|saturnales)\s*(inv\.?|presents|:)\s*/i, '')
    .replace(/:\s+.*$/, '')
    .replace(/\s+/g, ' ')
    .trim() || title;
}

/** Indique si un concert a été fraîchement découvert par la synchro quotidienne (< 72h) */
export function isRecentlyAdded(concert: Concert): boolean {
  if (!concert.firstSeenAt) return false;
  const ageMs = Date.now() - new Date(concert.firstSeenAt).getTime();
  return ageMs >= 0 && ageMs <= 72 * 3600 * 1000;
}

export function downloadConcertIcs(concert: Concert, venue: Venue) {
  const [y, m, d] = concert.date.split('-');
  const [hh, mm] = concert.time.replace('h', ':').split(':');
  const startH = String(hh || '20').padStart(2, '0');
  const startM = String(mm || '00').padStart(2, '0');
  const endHourNum = (parseInt(startH, 10) + 2) % 24;
  const endH = String(endHourNum).padStart(2, '0');

  const dtStart = `${y}${m}${d}T${startH}${startM}00`;
  const dtEnd = `${y}${m}${d}T${endH}${startM}00`;

  const escape = (str: string) =>
    str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Scene Rose Toulouse//Concerts//FR',
    'BEGIN:VEVENT',
    `UID:${concert.id}@scenerose.toulouse`,
    `DTSTART;TZID=Europe/Paris:${dtStart}`,
    `DTEND;TZID=Europe/Paris:${dtEnd}`,
    `SUMMARY:${escape(concert.title)} — ${escape(venue.shortName)}`,
    `LOCATION:${escape(`${venue.name}, ${venue.address}`)}`,
    `DESCRIPTION:${escape(`${concert.subtitle ? concert.subtitle + ' — ' : ''}Genres : ${concert.genres.join(', ')}. Infos & billetterie : ${concert.venueEventUrl}`)}`,
    `URL:${concert.venueEventUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${concert.id}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
