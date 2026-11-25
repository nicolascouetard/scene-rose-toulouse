import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Scène Rose — Injection de données structurées schema.org (rich results Google)
 * ------------------------------------------------------------------------------
 * Génère au build un bloc JSON-LD `ItemList` de `MusicEvent` pour les prochaines
 * dates (les plus pertinentes pour l'indexation) à partir de public/data/concerts.json.
 *
 * Règles :
 *  - plafonné à 40 événements (poids maîtrisé, sous la limite recommandée par Google),
 *  - uniquement les concerts à venir, triés par date,
 *  - prix et devise réels quand connus, sinon entrée sans prix,
 *  - un `WebSite` + `Organization` pour le knowledge panel,
 *  - silencieux si le fichier de données est absent (build à froid).
 */

const MAX_EVENTS = 40;
const SITE = 'https://scene-rose.pages.dev';

interface RawConcert {
  id: string;
  title: string;
  subtitle?: string;
  date: string;
  endDate?: string;
  time?: string;
  poster?: string;
  price?: string;
  status?: string;
  venueId: string;
  category?: string;
  genres?: string[];
  venueEventUrl?: string;
  [k: string]: unknown;
}

interface RawVenue {
  id: string;
  name: string;
  address?: string;
  city?: string;
  [k: string]: unknown;
}

function todayParisIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Décalage réel Europe/Paris pour une date donnée (été +02:00 / hiver +01:00).
 * Évite de coder en dur un offset faux la moitié de l'année.
 */
function parisOffset(dateIso: string): string {
  const probe = new Date(`${dateIso}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    timeZoneName: 'longOffset',
  }).formatToParts(probe);
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+01:00';
  const m = tz.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : '+01:00';
}

/** "20h30" -> "20:30" ; "20h" -> "20:00" ; sinon 20:00 */
function parseTime(time?: string): string {
  if (!time) return '20:00';
  const m = time.match(/(\d{1,2})\s*[h:]\s*(\d{2})?/);
  if (!m) return '20:00';
  const h = String(Math.min(23, Number(m[1]))).padStart(2, '0');
  const min = String(Math.min(59, Number(m[2] || 0))).padStart(2, '0');
  return `${h}:${min}`;
}

/** Extrait un prix numérique depuis "12 €", "de 25 à 40 €", "Gratuit"… */
function parsePrice(price?: string): { amount?: string; free: boolean } {
  if (!price) return { free: false };
  const normalized = price.toLowerCase();
  if (normalized.includes('gratuit') || normalized.includes('free')) return { free: true };
  const match = normalized.replace(',', '.').match(/(\d+(?:\.\d{1,2})?)/);
  return match ? { amount: match[1], free: false } : { free: false };
}

function absoluteUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${SITE}${value}`;
  return undefined;
}

function buildJsonLd(dataPath: string): string | null {
  let raw: { concerts?: RawConcert[]; venues?: RawVenue[] };
  try {
    if (!fs.existsSync(dataPath)) return null;
    raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch {
    return null;
  }

  const venues = new Map<string, RawVenue>((raw.venues || []).map((v) => [v.id, v]));
  const today = todayParisIso();

  const upcoming = (raw.concerts || [])
    .filter((c) => (c.endDate || c.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, MAX_EVENTS);

  if (upcoming.length === 0) return null;

  const events = upcoming.map((c) => {
    const venue = venues.get(c.venueId);
    const startTime = parseTime(c.time);
    const offset = parisOffset(c.date);
    const startDate = `${c.date}T${startTime}:00${offset}`;
    const endDate =
      c.endDate && c.endDate !== c.date
        ? `${c.endDate}T23:59:00${parisOffset(c.endDate)}`
        : undefined;
    const poster = absoluteUrl(c.poster);
    const { amount, free } = parsePrice(c.price);

    const event: Record<string, unknown> = {
      '@type': 'MusicEvent',
      '@id': `${SITE}/?concert=${encodeURIComponent(c.id)}#event`,
      name: c.title,
      startDate,
      ...(endDate ? { endDate } : {}),
      eventStatus:
        c.status === 'sold-out'
          ? 'https://schema.org/EventSoldOut'
          : 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      ...(poster ? { image: [poster] } : {}),
      ...(c.subtitle ? { description: c.subtitle } : {}),
      url: `${SITE}/?concert=${encodeURIComponent(c.id)}`,
      performer: { '@type': 'MusicGroup', name: c.title },
    };

    const genre = c.genres?.length ? c.genres.slice(0, 3).join(', ') : c.category;
    if (genre) event.genre = genre;

    if (venue) {
      event.location = {
        '@type': 'MusicVenue',
        name: venue.name,
        address: {
          '@type': 'PostalAddress',
          streetAddress: venue.address || undefined,
          addressLocality: venue.city || 'Toulouse',
          postalCode: (venue as { postalCode?: string }).postalCode || '31000',
          addressCountry: 'FR',
        },
      };
    }

    if (free) {
      event.isAccessibleForFree = true;
      event.offers = {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: `${SITE}/?concert=${encodeURIComponent(c.id)}`,
      };
    } else if (amount) {
      event.offers = {
        '@type': 'Offer',
        price: amount,
        priceCurrency: 'EUR',
        availability:
          c.status === 'sold-out'
            ? 'https://schema.org/SoldOut'
            : 'https://schema.org/InStock',
        url: `${SITE}/?concert=${encodeURIComponent(c.id)}`,
      };
    }

    return event;
  });

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE}/#website`,
        url: `${SITE}/`,
        name: 'Scène Rose',
        inLanguage: 'fr-FR',
        description:
          'Agenda des concerts à Toulouse et des festivals d’Occitanie, mis à jour 4× par jour.',
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${SITE}/?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'ItemList',
        '@id': `${SITE}/#agenda`,
        name: 'Prochains concerts à Toulouse',
        numberOfItems: events.length,
        itemListElement: events.map((event, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: event,
        })),
      },
    ],
  };

  // Échappe les séquences dangereuses pour un bloc <script>
  return JSON.stringify(graph).replace(/</g, '\\u003c');
}

export function sceneRoseJsonLdPlugin(): Plugin {
  return {
    name: 'scene-rose-jsonld',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const dataPath = path.resolve(process.cwd(), 'public/data/concerts.json');
        const jsonLd = buildJsonLd(dataPath);
        if (!jsonLd) return html;
        const script = `  <script type="application/ld+json">${jsonLd}</script>\n`;
        if (html.includes('</head>')) {
          return html.replace('</head>', `${script}</head>`);
        }
        return html + script;
      },
    },
  };
}
