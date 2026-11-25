#!/usr/bin/env node
/**
 * Scène Rose — Moteur de synchronisation quotidienne & découverte exhaustive (2026–2027)
 * --------------------------------------------------------------------------------------
 * Interroge en parallèle les sites & APIs officiels des 17 salles toulousaines pour :
 *  1. Découvrir et importer automatiquement TOUTES les nouvelles dates publiées (2026–2027)
 *  2. Rafraîchir le statut billetterie de chaque concert (Disponible, Dernières places, Complet, Gratuit)
 *  3. Retirer automatiquement les concerts annulés ou passés (fuseau Europe/Paris)
 *  4. Générer un rapport horodaté dans public/data/concerts.json & logs/sync-history.jsonl
 *
 * Usage :
 *   npm run sync           (exécution immédiate)
 *   npm run sync:daemon    (planificateur automatique quotidien à 06h00 Europe/Paris)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as cheerio from 'cheerio';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(PROJECT_ROOT, 'public', 'data', 'concerts.json');
const POSTER_DIR = path.join(PROJECT_ROOT, 'public', 'posters');
const LOG_DIR = path.join(PROJECT_ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'sync-history.jsonl');
const POSTER_MAX_EDGE = 800;
const POSTER_WEBP_QUALITY = 78;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const execFileAsync = promisify(execFile);

const FETCH_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
  'Cache-Control': 'no-cache',
};

const FR_MONTHS = {
  janvier: '01',
  'janv.': '01',
  janv: '01',
  jan: '01',
  fevrier: '02',
  'fevr.': '02',
  fevr: '02',
  fev: '02',
  mars: '03',
  mar: '03',
  avril: '04',
  'avr.': '04',
  avr: '04',
  mai: '05',
  juin: '06',
  juillet: '07',
  'juil.': '07',
  juil: '07',
  aout: '08',
  septembre: '09',
  'sept.': '09',
  sept: '09',
  sep: '09',
  octobre: '10',
  'oct.': '10',
  oct: '10',
  novembre: '11',
  'nov.': '11',
  nov: '11',
  decembre: '12',
  'dec.': '12',
  dec: '12',
};

/** Date du jour au format YYYY-MM-DD en heure de Paris */
export function getTodayParisIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Normalise une chaîne pour la correspondance floue */
function normalizeText(str = '') {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(str = '') {
  return normalizeText(str).replace(/\s+/g, '-').slice(0, 48);
}

function normalizeUrlPath(rawUrl = '') {
  try {
    const u = new URL(rawUrl, 'https://example.com');
    return decodeURIComponent(u.pathname).replace(/\/+$/, '').toLowerCase();
  } catch {
    return rawUrl.replace(/\/+$/, '').toLowerCase();
  }
}

/** Décode les entités HTML basiques */
function decodeHtmlEntities(str = '') {
  return str
    .replace(/&#8217;|&#039;|&rsquo;/g, '’')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/&#8220;|&ldquo;/g, '« ')
    .replace(/&#8221;|&rdquo;/g, ' »')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse une date française textuelle ("18 décembre 2026", "23 janv. 2027", "19/02/2027") */
function parseFrenchDate(text = '', fallbackYear = '2027') {
  const norm = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Format ISO YYYY-MM-DD
  const isoMatch = norm.match(/\b(202[6-9])-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // Format DD/MM/YYYY
  const slashMatch = norm.match(/\b(\d{1,2})\/(\d{1,2})\/(202[6-9])\b/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[1].padStart(2, '0')}`;
  }

  // Format "18 decembre 2026" ou "23 janv. 2027" ou "10 fevrier"
  const wordMatch = norm.match(
    /\b(\d{1,2})\s+(janvier|janv\.?|jan|fevrier|fevr\.?|fev|mars|mar|avril|avr\.?|mai|juin|juillet|juil\.?|aout|septembre|sept\.?|sep|octobre|oct\.?|novembre|nov\.?|decembre|dec\.?)(?:\s+(202[6-9]))?/
  );
  if (wordMatch) {
    const day = wordMatch[1].padStart(2, '0');
    const monthKey = wordMatch[2].replace(/\.$/, '');
    const month = FR_MONTHS[monthKey] || FR_MONTHS[wordMatch[2]];
    let year = wordMatch[3];
    if (!year) {
      // Si pas d'année précisée : nov/déc -> 2026, jan->oct -> 2027
      year = Number(month) >= 11 ? '2026' : fallbackYear;
    }
    if (month) return `${year}-${month}-${day}`;
  }

  return null;
}

/** Parse une heure française ("19h30", "20H00", "23:55") */
function parseFrenchTime(text = '', fallback = '20h00') {
  const m = text.match(/\b([01]?\d|2[0-3])\s*[hH:]\s*([0-5]\d)\b/);
  if (!m) return fallback;
  return `${m[1].padStart(2, '0')}h${m[2]}`;
}

/** Déduit la catégorie Scène Rose à partir des genres / titre */
function inferCategory(genres = [], title = '', venueId = '') {
  const hay = normalizeText([...genres, title].join(' '));

  if (
    venueId === 'opera-capitole' ||
    venueId === 'halle-aux-grains' ||
    venueId === 'auditorium-saint-pierre'
  ) {
    if (/\bjazz|swing|blues\b/.test(hay)) return 'Jazz & Blues';
    return 'Classique & Opéra';
  }
  if (venueId === 'le-taquin') {
    if (/\b(soul|funk|groove|rnb|afrobeat)\b/.test(hay)) return 'Soul, Funk & R&B';
    if (/\b(world|latin|cumbia|salsa|flamenco|balkan|oriental)\b/.test(hay)) return 'Musiques du Monde';
    return 'Jazz & Blues';
  }
  if (venueId === 'le-bijou') {
    if (/\b(jazz|blues|swing|manouche)\b/.test(hay)) return 'Jazz & Blues';
    if (/\b(world|latin|flamenco|oriental|occitan)\b/.test(hay)) return 'Musiques du Monde';
    return 'Chanson & Folk';
  }
  if (venueId === 'l-arena') return 'Techno & Rave';

  if (/\b(techno|hard techno|acid|rave|trance|psytrance|hardstyle|uptempo|gabber|drum and bass|drum bass|dnb|dubstep|bass music|hard bounce|bounce|ebm|dark wave|jungle|uk garage)\b/.test(hay)) {
    return 'Techno & Rave';
  }
  if (/\b(electro|house|deep house|tech house|disco|synthwave|downtempo|ambient|french touch|electronica|club|dj)\b/.test(hay)) {
    return venueId === 'le-cri-de-la-mouette' ? 'Techno & Rave' : 'Électro & House';
  }
  if (venueId === 'le-cri-de-la-mouette') return 'Techno & Rave';

  if (/\b(metal|heavy|death|black metal|thrash|doom|metalcore|deathcore|prog metal|hard rock|hardcore|screamo|sludge|grindcore|nu metal)\b/.test(hay)) {
    return 'Metal & Hardcore';
  }
  if (/\b(rap|hip hop|trap|drill|boom bap|slam|urbain)\b/.test(hay)) {
    return 'Rap & Hip-Hop';
  }
  if (/\b(reggae|dub|ska|dancehall|sound system|ragga)\b/.test(hay)) {
    return 'Reggae & Dub';
  }
  if (/\b(world|monde|afro|latin|latino|cumbia|salsa|flamenco|oriental|gnawa|balkan|celtique|espagnol|maloya|kora|occitan|traditionnel|tango|fado)\b/.test(hay)) {
    return 'Musiques du Monde';
  }
  if (/\b(soul|funk|groove|rnb|r n b|neo soul|afrobeat|gospel)\b/.test(hay)) {
    return 'Soul, Funk & R&B';
  }
  if (/\b(jazz|blues|swing|bossa|manouche|improvisation|big band)\b/.test(hay)) {
    return 'Jazz & Blues';
  }
  if (/\b(rock|punk|grunge|post punk|shoegaze|stoner|indie rock|garage|alternative|alternatif|cold wave|new wave|britpop|progressif)\b/.test(hay)) {
    return 'Rock & Indie';
  }
  if (/\b(symphonique|classique|opera|baroque|recital|orchestre|cine concert|philharmonique|quatuor|chambre|piano|violon|harpe|choral|lyrique|conservatoire)\b/.test(hay)) {
    return 'Classique & Opéra';
  }
  if (/\b(chanson|folk|acoustique|auteur|nouvelle scene|guitare voix|country|americana)\b/.test(hay)) {
    return 'Chanson & Folk';
  }
  return 'Pop';
}

/** Extrait l'URL réelle d'une image Next.js (`/_next/image?url=...`) */
function unwrapNextImage(rawUrl = '', baseUrl = '') {
  if (!rawUrl) return '';
  if (rawUrl.includes('/_next/image')) {
    try {
      const u = new URL(rawUrl, baseUrl || 'https://lebikini.com');
      const inner = u.searchParams.get('url');
      if (inner) return decodeURIComponent(inner);
    } catch {
      // ignore
    }
  }
  if (rawUrl.startsWith('//')) return `https:${rawUrl}`;
  if (rawUrl.startsWith('/')) {
    try {
      return new URL(rawUrl, baseUrl).href;
    } catch {
      return rawUrl;
    }
  }
  return rawUrl;
}

/** Détecte le statut billetterie depuis le texte visible d'une carte événement */
function detectStatusFromCardText(cardText, htmlSnippet = '', fallbackStatus = 'available') {
  const clean = cardText
    .replace(/si\s+le\s+concert\s+n['’]est\s+pas\s+(d[ée]j[àa]\s+)?indiqu[ée]\s+complet/gi, '')
    .replace(/n['’]est\s+pas\s+complet/gi, '')
    .replace(/pas\s+(encore\s+)?complet/gi, '')
    .replace(/dans\s+la\s+limite\s+des\s+places\s+disponibles/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Attention : en JS, \b ne fonctionne pas après une lettre accentuée (é). On utilise des bornes Unicode explicites.
  if (
    /(?:^|[^a-zA-ZÀ-ÿ])annul[ée]e?s?(?=$|[^a-zA-ZÀ-ÿ])/i.test(clean) ||
    /annule\.png/i.test(htmlSnippet) ||
    /spectacle\s+annul/i.test(htmlSnippet)
  ) {
    return 'cancelled';
  }

  if (
    /(?:^|[^a-zA-ZÀ-ÿ])complet(?=$|[^a-zA-ZÀ-ÿ])/i.test(clean) ||
    /(?:^|[^a-zA-ZÀ-ÿ])sold[\s-]*out(?=$|[^a-zA-ZÀ-ÿ])/i.test(clean) ||
    /(?:^|[^a-zA-ZÀ-ÿ])[ée]puis[ée]e?s?(?=$|[^a-zA-ZÀ-ÿ])/i.test(clean) ||
    /billets\s+[ée]puis[ée]s/i.test(clean) ||
    /complet\.png/i.test(htmlSnippet)
  ) {
    return 'sold-out';
  }

  if (
    /derni[èe]res?\s+places?/i.test(clean) ||
    /(?:^|[^a-zA-ZÀ-ÿ])last\s+tickets?(?=$|[^a-zA-ZÀ-ÿ])/i.test(clean) ||
    /bient[ôo]t\s+complet/i.test(clean) ||
    /quelques\s+places/i.test(clean)
  ) {
    return 'last-tickets';
  }

  if (
    /(?:^|[^a-zA-ZÀ-ÿ])gratuit(?=$|[^a-zA-ZÀ-ÿ])/i.test(clean) ||
    /entr[ée]e\s+libre/i.test(clean) ||
    fallbackStatus === 'free'
  ) {
    return 'free';
  }

  return 'available';
}

/** Charge du HTML dans Cheerio en préservant les espaces entre balises adjacentes (ex: <div>Complet</div><div>Lundi</div>) */
function loadHtmlSpaced(html = '') {
  return cheerio.load(html.replace(/></g, '> <'));
}

async function fetchText(url, options = {}, timeoutMs = 15000) {
  const res = await fetch(url, {
    ...options,
    headers: { ...FETCH_HEADERS, ...(options.headers || {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const buf = await res.arrayBuffer();
  const charsetMatch = contentType.match(/charset=([a-z0-9_-]+)/i);
  const declaredCharset = charsetMatch ? charsetMatch[1].toLowerCase() : '';

  let text;
  if (/iso-8859-1|latin1|windows-1252|cp1252/.test(declaredCharset)) {
    text = new TextDecoder('windows-1252').decode(buf);
  } else {
    text = new TextDecoder('utf-8').decode(buf);
    if (
      text.includes('\uFFFD') &&
      /charset=["']?(iso-8859-1|windows-1252|latin1)/i.test(text.slice(0, 1500))
    ) {
      text = new TextDecoder('windows-1252').decode(buf);
    }
  }
  return { ok: res.ok, status: res.status, text };
}

/* ==========================================================================
 *  EXTRACTORS PAR SALLE (Découverte exhaustive 2026–2027 + Statut en direct)
 * ========================================================================== */

/** 1. LE BIKINI — Toute la saison publiée jusqu'à fin 2027 en une requête */
async function scrapeLeBikini(todayIso) {
  const url = 'https://lebikini.com/programmation/-/-/2027-12';
  const r = await fetchText(url);
  if (!r.ok) return { ok: false, status: r.status, events: [], sourceUrl: url };

  const $ = loadHtmlSpaced(r.text);
  $('script, style, noscript').remove();
  const events = [];

  $('.event-card').each((_, el) => {
    const $el = $(el);
    const href = $el.find('a[href*="/202"]').first().attr('href');
    if (!href) return;

    const fullUrl = href.startsWith('http') ? href : `https://lebikini.com${href}`;
    const title = $el.find('h3').first().text().replace(/\s+/g, ' ').trim();
    if (!title) return;

    // Exclure les dates hors-les-murs qui ne sont pas au Bikini si précisé ailleurs (ex: Zénith / Metronum déjà indexés)
    const cardText = $el.text().replace(/\s+/g, ' ').trim();
    const venueBadge = $el.find('.border-primary').first().text().trim();
    if (
      venueBadge &&
      !/bikini/i.test(venueBadge) &&
      /(z[ée]nith|metronum|rex|cabane|interference|halle aux grains|bijou|taquin|nougaro|odyssud|capitole|barri[èe]re)/i.test(
        venueBadge
      )
    ) {
      return;
    }

    const urlDateMatch = href.match(/\/(202[6-9])\/(\d{2})\/(\d{2})\//);
    const date = urlDateMatch
      ? `${urlDateMatch[1]}-${urlDateMatch[2]}-${urlDateMatch[3]}`
      : parseFrenchDate(cardText);
    if (!date || date < todayIso) return;

    const time = parseFrenchTime(cardText, '19h30');
    const status = detectStatusFromCardText(cardText, $el.html() || '');
    const imgRaw = $el.find('img').first().attr('src') || '';
    const posterUrl = unwrapNextImage(imgRaw, 'https://lebikini.com');

    const genreRaw = $el.find('.capitalize').first().text().trim();
    const genres = genreRaw
      ? genreRaw
          .split(/[/,|•]+/)
          .map((g) => g.trim())
          .filter((g) => g.length > 1 && g.length < 28)
      : ['Concert'];

    const priceMatch = cardText.match(/à partir de\s*\d+(?:[.,]\d+)?\s*€|\d+(?:[.,]\d+)?\s*€/i);
    const price = status === 'free' ? 'Gratuit' : priceMatch ? priceMatch[0].replace(/à partir de\s*/i, 'Dès ') : undefined;

    const isClubNight =
      time >= '23h00' ||
      /soiree|club|\+18|all night|techno|drum|rave|dub/i.test(normalizeText(`${title} ${genres.join(' ')}`));

    events.push({
      id: `bikini-${date}-${slugify(title)}`,
      title: title
        .split(' ')
        .map((w) => (w.length > 2 && w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w))
        .join(' '),
      date,
      time,
      venueId: 'le-bikini',
      category: inferCategory(genres, title, 'le-bikini'),
      genres: genres.slice(0, 3),
      price,
      status,
      poster: posterUrl,
      sourcePosterUrl: posterUrl,
      venueEventUrl: fullUrl,
      isClubNight,
    });
  });

  return { ok: true, status: r.status, events, sourceUrl: url };
}

/** 2. ZÉNITH TOULOUSE MÉTROPOLE — Tous les concerts (filtrés sur genres musicaux) avec pagination */
async function scrapeZenith(todayIso) {
  const url = 'https://zenith-toulousemetropole.com/program';
  const musicGenres = ['9', '11', '12', '13', '24', '25', '28', '29'];
  const events = [];
  const seenUrls = new Set();

  let offset = 0;
  let okAny = false;
  let lastStatus = 200;

  for (let page = 0; page < 8; page++) {
    const body = new URLSearchParams();
    body.append('currentItemsNumber', String(offset));
    body.append('filterDates', '');
    body.append('filterCategories', '');
    body.append('filterGenres', JSON.stringify(musicGenres));
    body.append('filterSearch', '');

    const r = await fetchText(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    lastStatus = r.status;
    if (!r.ok) break;
    okAny = true;

    const $ = loadHtmlSpaced(r.text);
    const cards = $('.card-show');
    if (cards.length === 0) break;

    let addedOnPage = 0;
    cards.each((_, el) => {
      const $el = $(el);
      const href = $el.find('a[href*="/shows/"]').first().attr('href');
      if (!href) return;
      const fullUrl = href.startsWith('http')
        ? href
        : `https://zenith-toulousemetropole.com${href}`;
      if (seenUrls.has(fullUrl)) return;
      seenUrls.add(fullUrl);
      addedOnPage++;

      const rawTitle =
        $el.find('img').first().attr('alt')?.trim() ||
        $el.find('.card-show__title, h2, h3').first().text().trim();
      const cardText = $el.text().replace(/\s+/g, ' ').trim();
      const title = rawTitle || cardText.split(/Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche/i)[0].trim();
      if (!title) return;

      // Écarter humour / théâtre / cirque / sport qui pourraient fuiter
      if (
        /\b(one man|humour|comedie|spectacle d'humour|cirque|patinage|catch|freestyle motocross|harlem globetrotters|disney sur glace|la reine des neiges)\b/i.test(
          normalizeText(title)
        )
      ) {
        return;
      }

      const stateText = $el.find('.card-show__state').text().trim();
      const status = detectStatusFromCardText(`${stateText} ${cardText}`, $el.html() || '');
      const date = parseFrenchDate(cardText);
      if (!date || date < todayIso) return;

      const img = $el.find('img').first().attr('src') || '';
      const posterUrl = unwrapNextImage(img, 'https://zenith-toulousemetropole.com');

      const prettyTitle =
        title === title.toUpperCase() && title.length > 4
          ? title
              .toLowerCase()
              .replace(/(^|\s|['’-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
          : title;

      events.push({
        id: `zenith-${date}-${slugify(title)}`,
        title: prettyTitle,
        date,
        time: parseFrenchTime(cardText, '20h00'),
        venueId: 'zenith-toulouse',
        category: inferCategory([], title, 'zenith-toulouse'),
        genres: ['Concert', 'Zénith'],
        status,
        poster: posterUrl,
        sourcePosterUrl: posterUrl,
        venueEventUrl: fullUrl,
      });
    });

    offset += cards.length;
    if (addedOnPage === 0 || cards.length < 12) break;
  }

  return { ok: okAny, status: lastStatus, events, sourceUrl: url };
}

/** 3. LE METRONUM — API officielle The Events Calendar (100% de l'agenda publié) */
async function scrapeLeMetronum(todayIso) {
  const url = `https://lemetronum.fr/wp-json/tribe/events/v1/events?per_page=100&start_date=${todayIso}`;
  const r = await fetchText(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) return { ok: false, status: r.status, events: [], sourceUrl: 'https://lemetronum.fr/evenements/' };

  let data;
  try {
    data = JSON.parse(r.text);
  } catch {
    return { ok: false, status: r.status, events: [], sourceUrl: 'https://lemetronum.fr/evenements/' };
  }

  const events = [];
  for (const ev of data.events || []) {
    const title = decodeHtmlEntities(ev.title || '');
    if (!title) continue;

    // Filtrer les ateliers non-concerts / conférences / permanences
    if (/\b(permanence|atelier|conference|reunion|bourse aux disques|vide grenier)\b/i.test(normalizeText(title))) {
      continue;
    }

    const startRaw = ev.start_date || '';
    const date = startRaw.slice(0, 10);
    if (!date || date < todayIso) continue;
    const rawTime = startRaw.slice(11, 16);
    const time = rawTime && rawTime !== '00:00' ? rawTime.replace(':', 'h') : '20h00';

    const cats = (ev.categories || []).map((c) => decodeHtmlEntities(c.name)).filter(Boolean);
    const tags = (ev.tags || []).map((t) => decodeHtmlEntities(t.name)).filter(Boolean);
    const genres = [...cats, ...tags].filter((g) => !/^(concert|evenement|musique|music box|grande salle)$/i.test(g)).slice(0, 3);

    const costText = decodeHtmlEntities(ev.cost || '');
    const statusText = `${title} ${costText} ${cats.join(' ')} ${tags.join(' ')}`;
    const status = detectStatusFromCardText(statusText, '', /^0(\s*€)?$|gratuit/i.test(costText) ? 'free' : 'available');

    const posterUrl = ev.image?.url || '';
    if (!posterUrl) continue;

    events.push({
      id: `metronum-${date}-${slugify(title)}`,
      title,
      date,
      time,
      venueId: 'le-metronum',
      category: inferCategory(genres, title, 'le-metronum'),
      genres: genres.length ? genres : ['Musiques actuelles'],
      price: status === 'free' ? 'Gratuit' : costText || undefined,
      status,
      poster: posterUrl,
      sourcePosterUrl: posterUrl,
      venueEventUrl: ev.url || 'https://lemetronum.fr/evenements/',
    });
  }

  return { ok: true, status: r.status, events, sourceUrl: 'https://lemetronum.fr/evenements/' };
}

/** 4. INTERFERENCE — API officielle POST /events/search (toutes les pages 1..N) */
async function scrapeInterference(todayIso) {
  const apiUrl = 'https://api.interference-toulouse.fr/events/search';
  const events = [];
  let okAny = false;
  let lastStatus = 200;

  for (let page = 1; page <= 8; page++) {
    const r = await fetchText(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ eventCategory: 'all', dateFilter: 'all', searchFilter: '', page }),
    });
    lastStatus = r.status;
    if (!r.ok) break;
    okAny = true;

    let json;
    try {
      json = JSON.parse(r.text);
    } catch {
      break;
    }

    const items = json.data || [];
    for (const ev of items) {
      const title = decodeHtmlEntities(ev.event_name || '');
      if (!title) continue;
      // Écarter les événements déplacés vers une autre salle déjà indexée (ex: [NOUVELLE SALLE] au Métronum)
      if (/nouvelle salle|au m[ée]tronum/i.test(title)) continue;

      const startIso = ev.event_starting || '';
      if (!startIso) continue;
      const d = new Date(startIso);
      const date = getTodayParisIso(d);
      if (date < todayIso) continue;

      const time = new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Europe/Paris',
        hour: '2-digit',
        minute: '2-digit',
      })
        .format(d)
        .replace(':', 'h');

      let status = 'available';
      if (ev.event_status === 'cancelled' || /annul/i.test(title)) status = 'cancelled';
      else if (ev.event_status === 'sold_out' || ev.is_sold_out || /\bcomplet\b|sold[\s-]*out/i.test(title)) status = 'sold-out';

      const genres = (ev.tags || ev.event_tags || [])
        .map((t) => (typeof t === 'string' ? t : t.tag_name || t.name || ''))
        .filter(Boolean)
        .slice(0, 3);

      const posterUrl = ev.event_id
        ? `https://static.interference-toulouse.fr/event_covers/${ev.event_id}_tile_450x450.jpg`
        : '';

      events.push({
        id: `interference-${date}-${slugify(title)}`,
        title,
        date,
        time,
        venueId: 'interference',
        category: inferCategory(genres, title, 'interference'),
        genres: genres.length ? genres : ev.event_type === 'club' ? ['Techno', 'Club'] : ['Concert'],
        status,
        poster: posterUrl,
        sourcePosterUrl: posterUrl,
        venueEventUrl: `https://www.interference-toulouse.fr/event/${ev.event_url_slug || ev.event_id}`,
        isClubNight: ev.event_type === 'club' || time >= '23h00',
      });
    }

    const lastPage = json.pagination?.lastPage || 1;
    if (page >= lastPage || items.length === 0) break;
  }

  return {
    ok: okAny,
    status: lastStatus,
    events,
    sourceUrl: 'https://www.interference-toulouse.fr/programmation',
  };
}

/** 5. LE REX DE TOULOUSE — Tous les 44+ concerts publiés sur une page */
async function scrapeLeRex(todayIso) {
  const url = 'https://www.lerextoulouse.com/fr/programmation/';
  const r = await fetchText(url);
  if (!r.ok) return { ok: false, status: r.status, events: [], sourceUrl: url };

  const $ = loadHtmlSpaced(r.text);
  $('script, style, noscript').remove();
  const events = [];

  $('a.afficheZim').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href');
    if (!href) return;
    const fullUrl = href.startsWith('http') ? href : `https://www.lerextoulouse.com${href}`;
    const img = $a.find('img').attr('src') || '';
    const posterUrl = unwrapNextImage(img, 'https://www.lerextoulouse.com');

    // Remonter au bloc spectacle complet
    const $card = $a.parent().parent();
    const cardHtml = $card.html() || '';
    const cardText = $card.text().replace(/\s+/g, ' ').trim();

    const date = parseFrenchDate(cardText);
    if (!date || date < todayIso) return;
    const time = parseFrenchTime(cardText, '19h30');

    const $artist = $card.find('.artiste').first().clone();
    const stylesText = $artist.find('.styles_list').text().replace(/[()]/g, '').trim();
    $artist.find('.styles_list').remove();
    const titleRaw =
      $artist.text().trim() ||
      $card.find('h2, h3, .titre, .title').first().text().trim() ||
      '';
    const title = titleRaw.replace(/\s+/g, ' ').trim();
    if (!title || title.length < 2) return;

    const status = detectStatusFromCardText(cardText, cardHtml);
    const rawGenreStr = stylesText || (cardText.match(/\(([^)]{2,60})\)/)?.[1] || '');
    const genres = rawGenreStr
      ? rawGenreStr
          .split(/[|,/]+/)
          .map((g) => g.trim())
          .filter((g) => g.length > 1 && !/frais|loc|inclus/i.test(g))
          .slice(0, 3)
      : ['Concert'];

    const tarifsText = $card.find('.tarifs').text().replace(/\s+/g, ' ').trim();
    const priceMatch = (tarifsText || cardText).match(/\d+(?:[.,]\d+)?\s*€/);

    const prettyTitle =
      title === title.toUpperCase() && title.length > 4
        ? title
            .toLowerCase()
            .replace(/(^|\s|['’+-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
        : title;

    events.push({
      id: `rex-${date}-${slugify(title)}`,
      title: prettyTitle,
      date,
      time,
      venueId: 'le-rex',
      category: inferCategory(genres, title, 'le-rex'),
      genres,
      price: priceMatch ? priceMatch[0] : undefined,
      status,
      poster: posterUrl,
      sourcePosterUrl: posterUrl,
      venueEventUrl: fullUrl,
      isClubNight: time >= '23h00',
    });
  });

  return { ok: true, status: r.status, events, sourceUrl: url };
}

/** 6. SALLES OPENAGENDA (Halle aux Grains ONCT, Opéra du Capitole, Auditorium Saint-Pierre) */
async function scrapeOpenAgendaSite(venueId, baseAgendaUrl, maxPages, todayIso, filterFn = () => true) {
  const events = [];
  const seen = new Set();
  let okAny = false;
  let lastStatus = 200;

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = page === 1 ? baseAgendaUrl : `${baseAgendaUrl.replace(/\/$/, '')}/page/${page}/`;
    const r = await fetchText(pageUrl);
    lastStatus = r.status;
    if (!r.ok) break;
    okAny = true;

    const $ = loadHtmlSpaced(r.text);
    const imgs = $('img[src*="openagenda"]');
    if (imgs.length === 0) break;

    imgs.each((_, img) => {
      const posterUrl = $(img).attr('src') || '';
      const $card = $(img).closest('article, .card, .item, .post, div[class*="card"], div[class*="col"], div[class*="event"]');
      const $box = $card.length ? $card : $(img).parent().parent();

      const title = $box.find('h2, h3, h4, .title').first().text().replace(/\s+/g, ' ').trim();
      const link = $box.find('a[href*="toulouse.fr"]').first().attr('href') || '';
      const cardText = $box.text().replace(/\s+/g, ' ').trim();

      if (!title || !link || seen.has(link)) return;
      seen.add(link);

      if (!filterFn(title, cardText)) return;

      const date = parseFrenchDate(cardText);
      if (!date || date < todayIso) return;

      const time = parseFrenchTime(cardText, '20h00');
      const status = detectStatusFromCardText(
        cardText,
        $box.html() || '',
        venueId === 'auditorium-saint-pierre' ? 'free' : 'available'
      );

      const safeLink = link.replace(/^http:\/\//i, 'https://');

      events.push({
        id: `${venueId.split('-')[0]}-${date}-${slugify(title)}`,
        title,
        date,
        time,
        venueId,
        category: inferCategory([], title, venueId),
        genres:
          venueId === 'opera-capitole'
            ? ['Opéra', 'Lyrique', 'Classique']
            : venueId === 'halle-aux-grains'
              ? ['Symphonique', 'Classique']
              : ['Classique', 'Conservatoire'],
        price: status === 'free' ? 'Gratuit' : undefined,
        status,
        poster: posterUrl,
        sourcePosterUrl: posterUrl,
        venueEventUrl: safeLink,
      });
    });
  }

  return { ok: okAny, status: lastStatus, events, sourceUrl: baseAgendaUrl };
}

/** 7. ODYSSUD BLAGNAC — Page Musiques complète (articles Drupal) */
async function scrapeOdyssud(todayIso) {
  const url = 'https://www.odyssud.com/spectacles/musiques';
  const r = await fetchText(url);
  if (!r.ok) return { ok: false, status: r.status, events: [], sourceUrl: url };

  const $ = loadHtmlSpaced(r.text);
  $('script, style, noscript').remove();
  const events = [];
  const seen = new Set();

  $('article').each((_, el) => {
    const $card = $(el);
    const href = $card.find('a[href*="/spectacles/musiques/"]').first().attr('href') || '';
    if (!href || /scolaire/i.test(href)) return;
    const fullUrl = href.startsWith('http') ? href : `https://www.odyssud.com${href}`;
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    const cardText = $card.text().replace(/\s+/g, ' ').trim();
    if (/scolaire|cr[èe]che|d[èe]s\s+[1-6]\s+ans/i.test(cardText)) return;

    const rawTitle = $card.find('.field--name-name, h2, h3').first().text().replace(/\s+/g, ' ').trim();
    const subtitle = $card.find('.field--name-field-sous-titre').first().text().replace(/\s+/g, ' ').trim();
    const discipline = $card.find('.field--name-discipline-text').first().text().replace(/\s+/g, ' ').trim();
    const dateText = $card.find('.field--name-dates').first().text().replace(/\s+/g, ' ').trim() || cardText;

    if (!rawTitle || rawTitle.length < 2) return;

    const title =
      rawTitle === rawTitle.toUpperCase() && rawTitle.length > 3
        ? rawTitle.toLowerCase().replace(/(^|\s|['’+-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
        : rawTitle;

    const lowerDate = dateText.toLowerCase();
    const defaultYear = /(novembre|d[ée]cembre)/.test(lowerDate) ? '2026' : '2027';
    const date = parseFrenchDate(dateText, defaultYear);
    if (!date || date < todayIso) return;

    const srcsetJpg =
      $card.find('picture source[type="image/jpeg"]').first().attr('srcset') ||
      $card.find('img[data-srcset]').first().attr('data-srcset') ||
      '';
    let img = srcsetJpg.split(' ')[0] || '';
    if (!img) {
      const blurAttr = $card.find('img[data-b-blur]').first().attr('data-b-blur') || '';
      const blurPath = blurAttr.split('::').pop() || '';
      if (blurPath.includes('/sites/default/files/')) {
        img = blurPath.replace('/styles/grid_thumbnail_lqip/public/', '/styles/grid_thumbnail/public/');
      }
    }
    const posterUrl = unwrapNextImage(img, 'https://www.odyssud.com');
    if (!posterUrl) return;

    const status = detectStatusFromCardText(cardText, $card.html() || '');
    const genres = discipline
      ? [discipline.charAt(0).toUpperCase() + discipline.slice(1).toLowerCase(), 'Odyssud']
      : ['Musiques', 'Odyssud'];

    events.push({
      id: `odyssud-${date}-${slugify(title)}`,
      title,
      subtitle: subtitle || undefined,
      date,
      time: parseFrenchTime(cardText, '20h30'),
      venueId: 'odyssud',
      category: inferCategory(genres, `${title} ${subtitle} ${discipline}`, 'odyssud'),
      genres,
      status,
      poster: posterUrl,
      sourcePosterUrl: posterUrl,
      venueEventUrl: fullUrl,
    });
  });

  return { ok: true, status: r.status, events, sourceUrl: url };
}

/** 7b. LA CABANE (Halles de la Cartoucherie) — API REST Tribe Events officielle */
async function scrapeLaCabane(todayIso) {
  const baseUrl = 'https://halles-cartoucherie.fr/la-cabane/';
  const events = [];
  const seen = new Set();
  let okAny = false;
  let lastStatus = 200;

  for (let page = 1; page <= 4; page++) {
    const apiUrl = `https://halles-cartoucherie.fr/wp-json/tribe/events/v1/events?per_page=50&page=${page}&start_date=${todayIso}`;
    let res;
    try {
      res = await fetch(apiUrl, {
        headers: { ...FETCH_HEADERS, Accept: 'application/json' },
        signal: AbortSignal.timeout(14000),
      });
    } catch {
      break;
    }
    lastStatus = res.status;
    if (!res.ok) break;
    okAny = true;

    const data = await res.json();
    const list = data.events || [];
    if (list.length === 0) break;

    for (const ev of list) {
      const venueName = String(ev.venue?.venue || '');
      if (!/la\s+cabane/i.test(venueName)) continue;

      const rawTitle = decodeHtmlEntities(String(ev.title || '')).trim();
      if (!rawTitle) continue;

      const startRaw = String(ev.start_date || '');
      const dateMatch = startRaw.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}):(\d{2}))?/);
      if (!dateMatch) continue;
      const date = dateMatch[1];
      if (date < todayIso) continue;
      const time = dateMatch[2] ? `${dateMatch[2]}h${dateMatch[3]}` : '20h00';

      const eventUrl = ev.url || baseUrl;
      const key = `${date}|${slugify(rawTitle)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const descText = decodeHtmlEntities(String(ev.description || '').replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();

      const combined = `${rawTitle} ${descText}`;
      if (
        /\b(stand[- ]?up|one[- ]?(man|woman)[- ]?show|humoriste|spectacle d['’]humour|com[ée]die club)\b/i.test(
          combined
        ) &&
        !/\b(concert|musique|rock|rap|electro|techno|dj|chanson|metal|jazz|festival|live)\b/i.test(combined)
      ) {
        continue;
      }

      const title =
        rawTitle === rawTitle.toUpperCase() && rawTitle.length > 4
          ? rawTitle.toLowerCase().replace(/(^|\s|['’+-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
          : rawTitle;

      const posterUrl = ev.image?.url || '';
      if (!posterUrl) continue;

      const catNames = (ev.categories || []).map((c) => decodeHtmlEntities(String(c.name || ''))).filter(Boolean);
      const isFree =
        catNames.some((c) => /gratuit/i.test(c)) || /^0([.,]0+)?\s*€?$/.test(String(ev.cost || '').trim());
      const rawCost = decodeHtmlEntities(String(ev.cost || '')).trim();
      const price = isFree
        ? 'Gratuit'
        : rawCost
          ? rawCost.replace(/(\d)€/g, '$1 €')
          : undefined;

      let status = detectStatusFromCardText(`${rawTitle} ${descText}`);
      if (isFree && status === 'available') status = 'free';

      const genres = [];
      if (/electro|techno|house|dj|club/i.test(combined)) genres.push('Électro');
      else if (/metal|indus|punk|rock/i.test(combined)) genres.push('Rock / Metal');
      else if (/rap|hip[- ]?hop/i.test(combined)) genres.push('Rap / Hip-Hop');
      else if (/reggae|dub/i.test(combined)) genres.push('Reggae / Dub');
      else if (/chanson|pop|folk/i.test(combined)) genres.push('Chanson / Pop');
      else genres.push('Live');

      events.push({
        id: `cabane-${date}-${slugify(rawTitle)}`,
        title,
        subtitle: descText.slice(0, 110).replace(/\s+\S*$/, '').trim() || undefined,
        date,
        time,
        venueId: 'la-cabane',
        category: inferCategory(genres, combined, 'la-cabane'),
        genres,
        price,
        status,
        poster: posterUrl,
        sourcePosterUrl: posterUrl,
        venueEventUrl: eventUrl,
      });
    }

    if (page >= Number(data.total_pages || 1)) break;
  }

  return { ok: okAny, status: lastStatus, events, sourceUrl: baseUrl };
}

/** 7c. LE TAQUIN — JSON embarqué window['wcs_tdata_2'] officiel */
async function scrapeLeTaquin(todayIso) {
  const url = 'https://www.le-taquin.fr/site/concerts-a-venir/';
  const r = await fetchText(url);
  if (!r.ok) return { ok: false, status: r.status, events: [], sourceUrl: url };

  const match = r.text.match(/window\['wcs_tdata_\d+'\]\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) return { ok: true, status: r.status, events: [], sourceUrl: url };

  let items = [];
  try {
    items = JSON.parse(match[1]);
  } catch {
    return { ok: false, status: r.status, events: [], sourceUrl: url };
  }

  const events = [];
  const seen = new Set();

  for (const item of items) {
    if (!item || !item.title || !item.start) continue;
    const dateMatch = String(item.start).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
    if (!dateMatch) continue;
    const date = dateMatch[1];
    if (date < todayIso) continue;
    const time = `${dateMatch[2]}h${dateMatch[3]}`;

    const rawTitle = decodeHtmlEntities(String(item.title)).trim();
    const genreBracket = rawTitle.match(/\[([^\]]+)\]\s*$/);
    const extractedGenre = genreBracket ? genreBracket[1].trim() : 'Jazz';
    const cleanTitle = rawTitle.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
    if (!cleanTitle) continue;

    const key = `${date}|${slugify(cleanTitle)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const excerpt = decodeHtmlEntities(String(item.excerpt || '').replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    const posterUrl = item.thumbnail || '';
    if (!posterUrl) continue;

    const genres = [extractedGenre];
    const status = detectStatusFromCardText(`${rawTitle} ${excerpt}`);

    events.push({
      id: `taquin-${date}-${slugify(cleanTitle)}`,
      title: cleanTitle,
      subtitle: excerpt.slice(0, 110).replace(/\s+\S*$/, '').trim() || undefined,
      date,
      time,
      venueId: 'le-taquin',
      category: inferCategory(genres, `${cleanTitle} ${extractedGenre} ${excerpt}`, 'le-taquin'),
      genres,
      status,
      poster: posterUrl,
      sourcePosterUrl: posterUrl,
      venueEventUrl: item.permalink || url,
    });
  }

  return { ok: true, status: r.status, events, sourceUrl: url };
}

/** 8. SALLE NOUGARO — Tous les concerts musique de la saison */
async function scrapeSalleNougaro(todayIso) {
  const url = 'https://sallenougaro.com/programmation/';
  const r = await fetchText(url);
  if (!r.ok) return { ok: false, status: r.status, events: [], sourceUrl: url };

  const $ = loadHtmlSpaced(r.text);
  $('script, style, noscript').remove();
  const events = [];
  const seen = new Set();

  $('a[href*="/spectacle/"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (!href || seen.has(href)) return;

    let $card = $(a).parent();
    for (let i = 0; i < 4; i++) {
      if ($card.text().replace(/\s+/g, ' ').trim().length > 35 && $card.find('img').length > 0) break;
      $card = $card.parent();
    }
    const cardText = $card.text().replace(/\s+/g, ' ').trim();
    const isMusic =
      /\b(chanson|jazz|blues|world|musique|rock|soul|folk|rap|electro|concert|voix)\b/i.test(cardText) &&
      !/\b(th[ée][âa]tre|humour|conf[ée]rence|stand-up)\b/i.test(cardText);
    if (!isMusic) return;

    const date = parseFrenchDate(cardText, '2027');
    if (!date || date < todayIso) return;

    const title = $card.find('h2, h3, h4, .elementor-post__title, .elementor-heading-title').first().text().replace(/\s+/g, ' ').trim();
    if (!title) return;
    seen.add(href);

    const img = ($card.find('img').first().attr('src') || '').replace(/-\d+x\d+(?=\.\w+$)/, '');
    const status = detectStatusFromCardText(cardText, $card.html() || '');

    events.push({
      id: `nougaro-${date}-${slugify(title)}`,
      title,
      date,
      time: parseFrenchTime(cardText, '20h30'),
      venueId: 'salle-nougaro',
      category: inferCategory([cardText], title, 'salle-nougaro'),
      genres: ['Chanson', 'Live'],
      status,
      poster: img,
      sourcePosterUrl: img,
      venueEventUrl: href,
    });
  });

  return { ok: true, status: r.status, events, sourceUrl: url };
}

/** 11. LE LABO DES ARTS — API JSON Festik officielle (découverte automatique complète) */
async function scrapeLaboDesArts(todayIso) {
  const apiUrl = 'https://billetterie.festik.net/core/lelabodesarts/query/app/';
  const publicUrl = 'https://billetterie.festik.net/lelabodesarts/';

  const res = await fetch(apiUrl, {
    headers: { ...FETCH_HEADERS, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { ok: false, status: res.status, events: [], sourceUrl: publicUrl };

  const data = await res.json();
  const events = [];

  for (const prod of Object.values(data.products || {})) {
    if (!prod || prod.active === false) continue;
    const rawName = decodeHtmlEntities(String(prod.name || '')).trim();
    if (!rawName) continue;

    // Retirer le préfixe "Concert " pour un titre d'artiste propre
    const cleanTitle = rawName.replace(/^concert\s+/i, '').trim() || rawName;
    const descHtml = `${prod.description || ''} ${prod.description_long || ''}`;
    const descText = descHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const longBio = decodeHtmlEntities(String(prod.description_long || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    const priceMatch = descText.match(/(\d+(?:[.,]\d+)?)\s*€/);
    const cleanSubtitle = (longBio || descText)
      .slice(0, 115)
      .replace(/\s+\S*$/, '')
      .trim();
    const posterUrl =
      prod.image?.refresh_url ||
      prod.image?.url ||
      prod.image_bigsquare?.refresh_url ||
      'https://materials.festik.net/images/prod/billetteries/2598/banniere/play.webp';
    const eventUrl = prod.slug
      ? `https://billetterie.festik.net/lelabodesarts/product/${prod.slug}/`
      : publicUrl;

    for (const inst of Object.values(prod.instances || {})) {
      if (!inst || inst.active === false) continue;
      const ts = Number(inst.timestamp || 0);
      let date = '';
      let time = '20h00';

      if (ts > 0) {
        const dt = new Date(ts * 1000);
        date = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Paris',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(dt);
        time = new Intl.DateTimeFormat('fr-FR', {
          timeZone: 'Europe/Paris',
          hour: '2-digit',
          minute: '2-digit',
        })
          .format(dt)
          .replace(':', 'h');
      } else if (inst.full_label) {
        date = parseFrenchDate(inst.full_label) || '';
        time = parseFrenchTime(inst.full_label, '20h00');
      }

      if (!date || date < todayIso) continue;

      const placesLeft = inst.places?.available;
      let status = detectStatusFromCardText(`${inst.full_label || ''} ${descText}`);
      if (typeof placesLeft === 'number') {
        if (placesLeft <= 0) status = 'sold-out';
        else if (placesLeft <= 20) status = 'last-tickets';
      }

      const prettyTitle =
        cleanTitle === cleanTitle.toUpperCase() && cleanTitle.length > 4
          ? cleanTitle
              .toLowerCase()
              .replace(/(^|\s|['’+-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
          : cleanTitle;

      const genres = ['Rock Indie'];
      if (/punk|post-punk/i.test(descText)) genres.push('Post-Punk');
      else if (/psych[ée]|garage/i.test(descText)) genres.push('Psyché / Garage');
      else if (/electro|synth|industrial|dark/i.test(descText)) genres.push('Électro / Dark');
      else if (/folk|blues/i.test(descText)) genres.push('Folk / Blues');

      events.push({
        id: `labo-${date}-${slugify(cleanTitle)}`,
        title: prettyTitle,
        subtitle: cleanSubtitle || undefined,
        date,
        time,
        venueId: 'le-labo-des-arts',
        category: inferCategory(genres, `${cleanTitle} ${descText}`, 'le-labo-des-arts'),
        genres,
        price: priceMatch ? `Dès ${priceMatch[1]} €` : undefined,
        status,
        poster: posterUrl,
        sourcePosterUrl: posterUrl,
        venueEventUrl: eventUrl,
      });
    }
  }

  return { ok: true, status: res.status, events, sourceUrl: publicUrl };
}

/** Extracteur générique de statuts pour les salles complémentaires (La Cabane, Le Bijou, Le Taquin, Casino, Cri de la Mouette, L'Arena) */
const STATUS_ONLY_SOURCES = {
  'la-cabane': {
    url: 'https://halles-cartoucherie.fr/la-cabane/',
    cardSelector: 'article, .event-item, .card',
    linkSelector: 'a[href*="/event/"]',
  },
  'le-bijou': {
    url: 'https://www.le-bijou.net/programmation-lebijou',
    cardSelector: 'li[data-hook*="event"], div[data-hook*="event"], article',
    linkSelector: 'a[href*="/events/"]',
  },
  'le-taquin': {
    url: 'https://www.le-taquin.fr/site/concerts-a-venir/',
    cardSelector: 'article, .event, .concert, li',
    linkSelector: 'a[href*="/programmation/"]',
  },
  'casino-barriere': {
    url: 'https://www.casinosbarriere.com/fr/toulouse/spectacles-et-animations.html',
    cardSelector: 'article, .card, li',
    linkSelector: 'a[href*="/spectacles/"]',
  },
  'le-cri-de-la-mouette': {
    url: 'https://shotgun.live/fr/venues/le-cri-de-la-mouette',
    cardSelector: 'a[href*="/fr/events/"]',
    linkSelector: 'a[href*="/fr/events/"]',
  },
  'l-arena': {
    url: 'https://shotgun.live/fr/venues/arena',
    cardSelector: 'a[href*="/fr/events/"]',
    linkSelector: 'a[href*="/fr/events/"]',
  },
};

/**
 * Sources de secours pour les salles dont la billetterie est protégée par un
 * mur anti-robot (Shotgun → « Vercel Security Checkpoint », HTTP 429 même avec
 * un vrai navigateur). On interroge alors un agrégateur public qui publie ses
 * événements en JSON-LD schema.org, largement accessible.
 *
 * JamBase expose un bloc `MusicEvent` par date à venir : date, heure, salle,
 * artistes. Les champs `offers` (prix/statut) n'y figurent pas.
 */
/** Libellé lisible de l'hôte d'une source de secours (jambase.com…). */
function fallbackHostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source externe';
  }
}

const FALLBACK_SOURCES = {
  'le-cri-de-la-mouette': {
    url: 'https://www.jambase.com/venue/peniche-le-cri-de-la-mouette',
    venueLabel: 'Péniche le Cri de la mouette',
    // On accepte les artistes listés dans le JSON-LD (name = "Artiste - Ville - Salle - Date")
  },
};


/**
 * Récupère une page HTML en privilégiant `curl` (disponible sur Ubuntu et sur les
 * runners GitHub Actions) car certains sites refusent le client `fetch` de Node
 * via une empreinte TLS, tout en acceptant une requête curl classique.
 */
async function fetchPageViaCurlOrNode(url, timeoutMs = 20000) {
  try {
    const { stdout } = await execFileAsync(
      'curl',
      [
        '-sL',
        '--compressed',
        '--max-time',
        String(Math.round(timeoutMs / 1000)),
        '-A',
        USER_AGENT,
        '-H',
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '-H',
        'Accept-Language: fr-FR,fr;q=0.9,en;q=0.8',
        '-w',
        '\n__HTTP_STATUS__:%{http_code}',
        url,
      ],
      { maxBuffer: 32 * 1024 * 1024, timeout: timeoutMs + 5000 }
    );
    const marker = stdout.lastIndexOf('__HTTP_STATUS__:');
    const status = marker >= 0 ? Number(stdout.slice(marker + 16).trim()) : 200;
    const body = marker >= 0 ? stdout.slice(0, marker) : stdout;
    if (status < 200 || status >= 300) {
      return { ok: false, body: '', note: `Secours HTTP ${status}` };
    }
    return { ok: true, body, note: '' };
  } catch (curlErr) {
    // Repli : fetch natif (utile si curl est absent de l'environnement)
    try {
      const r = await fetchText(url, {}, timeoutMs);
      if (!r.ok) return { ok: false, body: '', note: `Secours HTTP ${r.status}` };
      return { ok: true, body: r.text, note: '' };
    } catch {
      return { ok: false, body: '', note: `Secours injoignable (${curlErr.code || curlErr.message})` };
    }
  }
}

/** Extrait les blocs JSON-LD schema.org d'une page HTML. */
function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  return blocks;
}

/** Aplatit un JSON-LD (objet, tableau ou @graph) en liste de nœuds. */
function flattenJsonLd(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
  const nodes = [];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      stack.push(...node);
      continue;
    }
    if (Array.isArray(node['@graph'])) stack.push(...node['@graph']);
    nodes.push(node);
  }
  return nodes;
}

/**
 * Normalise une URL d'affiche Shotgun en haute résolution.
 * - retire un éventuel préfixe de proxy d'archive (web.archive.org/…im_/)
 * - force une largeur confortable (1200 px) et un format moderne
 * Les affiches vivent sur assets.shotgun.live (Cloudinary), qui n'est PAS
 * protégé par le défi anti-robot : le rapatriement fonctionne même quand
 * l'agenda est inaccessible.
 */
function normalizeShotgunPosterUrl(url = '') {
  if (!url) return '';
  let clean = url.trim();
  const proxied = clean.match(/im_\/(https?:\/\/.+)$/);
  if (proxied) clean = proxied[1];
  if (!/^https?:\/\//i.test(clean)) return '';

  if (/res\.cloudinary\.com\/shotgun|assets\.shotgun\.live/.test(clean)) {
    clean = clean.replace(
      /\/(?:c_limit,w_\d+|c_fill,w_\d+)[^/]*\//,
      '/c_limit,w_1200,fl_lossy,f_auto,q_auto/'
    );
  }
  return clean;
}

/**
 * ── Lecteur d'agenda Shotgun (accès opportuniste) ─────────────────────────────
 * Shotgun protège ses pages par un défi Vercel (« Vercel Security Checkpoint »).
 * Ce défi n'est PAS permanent : selon l'heure et la charge, une requête passe
 * (c'est ainsi que deux dates de L'Arena ont pu être enregistrées le 23/11).
 *
 * Stratégie : on TENTE à chaque synchronisation, sans jamais en dépendre.
 *  - si ça passe  → on découvre les dates, les artistes, les prix et les affiches ;
 *  - si ça échoue → on ne touche à rien, on conserve le catalogue et on le signale.
 *
 * Aucun contournement du défi n'est tenté (pas de faux cookies, pas de proxy) :
 * on se contente de retenter une requête HTTP normale, comme le ferait un visiteur.
 */
const SHOTGUN_VENUES = {
  'l-arena': {
    // « L'Arena » est parfois remplacé par « Toulouse » dans la carte :
    // on accepte donc aussi une correspondance dans le titre de l'événement.
    nameMatch: /arena/i,
    titleMatch: /\barena\b/i,
  },
  'le-cri-de-la-mouette': {
    nameMatch: /cri\s+de\s+la\s+mouette/i,
    titleMatch: /\bcri\b/i,
  },
};

/** Pages d'agenda ville à essayer, de la plus ciblée à la plus large. */
function shotgunCandidateUrls(cityPath = 'toulouse') {
  return [
    `https://shotgun.live/fr/cities/${cityPath}/dance`,
    `https://shotgun.live/fr/cities/${cityPath}`,
    `https://shotgun.live/fr/cities/${cityPath}/concerts`,
  ];
}

/**
 * Extrait les cartes d'événements d'une page d'agenda Shotgun.
 * La structure observée (janvier 2026) est stable :
 *   <a href="/fr/events/<slug>">
 *     <img alt="Titre">
 *     <p>Titre</p> <span>Prix</span> <div>Salle ou Ville</div>
 *     <time datetime="…Z">sam. 14 févr.</time> <time>23:00</time>
 *     <div class="…rounded-full">Genre</div> …
 */
function parseShotgunCards(html) {
  const $ = cheerio.load(html);
  const cards = [];

  $('a[href*="/events/"]').each((_, el) => {
    const $a = $(el);
    const href = $a.attr('href') || '';
    const slugMatch = href.match(/\/events\/([a-z0-9-]+)/i);
    if (!slugMatch) return;

    const iso = $a.find('time[datetime]').first().attr('datetime') || '';
    const utc = new Date(iso);
    if (Number.isNaN(utc.getTime())) return;

    // Shotgun sérialise en UTC : on repasse en heure de Paris (fuseau de la salle).
    const parts = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(utc);
    const get = (type) => parts.find((x) => x.type === type)?.value || '';
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    const time = `${get('hour')}h${get('minute')}`;

    // Titre : le <p> est le plus fiable, sinon l'attribut alt de l'image.
    const $img = $a.find('img').first();
    let title =
      $a.find('p').first().text().replace(/\s+/g, ' ').trim() ||
      ($img.attr('alt') || '').replace(/\s+/g, ' ').trim();
    title = title.replace(/\s*\.\.\.$/, '').trim();
    if (title.length < 2) return;

    // Pastilles de genre
    const genres = [];
    $a.find('div.rounded-full, div[class*="rounded-full"]').each((__, g) => {
      const txt = $(g).text().replace(/\s+/g, ' ').trim();
      if (!txt || txt.length >= 24 || txt === '|') return;
      if (/^(arena|cri de la mouette|toulouse)$/i.test(txt)) return;
      genres.push(txt);
    });

    // Salle affichée : le premier <div> court hors pastilles ; sinon la ville.
    let place = '';
    $a.find('div').each((__, d) => {
      const $d = $(d);
      if (place) return;
      if (($d.attr('class') || '').includes('rounded-full')) return;
      if ($d.children().length > 0) return;
      const txt = $d.text().replace(/\s+/g, ' ').trim();
      if (txt && txt.length <= 40) place = txt;
    });

    // Prix : premier montant en euros de la carte (le prix le plus bas).
    const priceText = $a.text().match(/(\d+[.,]\d{2})\s*€/);
    let price = '';
    if (priceText) {
      const amount = Number(priceText[1].replace(',', '.'));
      if (amount > 0 && amount < 500) price = `Dès ${priceText[1].replace('.', ',')} €`;
    }

    const posterSrc = normalizeShotgunPosterUrl(
      $img.attr('src') || ($img.attr('srcset') || '').split(',')[0] || ''
    );

    cards.push({
      slug: slugMatch[1],
      title,
      date,
      time,
      place,
      price,
      genres: [...new Set(genres)].slice(0, 4),
      poster: posterSrc.startsWith('http') ? posterSrc : '',
      url: `https://shotgun.live/fr/events/${slugMatch[1]}`,
    });
  });

  return cards;
}

/**
 * Tente de lire l'agenda Shotgun d'une salle. Renvoie ok:false si le défi
 * anti-robot est actif — ce n'est pas une erreur, c'est le cas normal.
 */
async function fetchShotgunAgenda(venueId) {
  const cfg = SHOTGUN_VENUES[venueId];
  if (!cfg) return { ok: false, cards: [], note: 'Salle non configurée' };

  // Mode maintenance / test : permet de rejouer une page HTML enregistrée
  // sans dépendre de la disponibilité réelle de Shotgun.
  const localHtml = process.env.SHOTGUN_LOCAL_HTML;

  for (const url of shotgunCandidateUrls(cfg.cityPath)) {
    let r;
    try {
      r = localHtml
        ? { ok: true, status: 200, text: fs.readFileSync(localHtml, 'utf-8') }
        : await fetchText(url, {}, 15000);
    } catch {
      continue;
    }
    if (!r.ok) continue; // 429 = défi actif, on essaie la page suivante

    // Attribution STRICTE de la salle : sur une page « ville », Shotgun mélange
    // toutes les salles et affiche parfois seulement « Toulouse ». On n'accepte
    // donc une date que si la salle est nommée, ou si son nom figure dans le titre.
    // Tout le reste est ignoré : mieux vaut manquer une date que l'attribuer à tort.
    const all = parseShotgunCards(r.text);
    const cards = all.filter((c) => cfg.nameMatch.test(c.place) || cfg.titleMatch.test(c.title));
    const ignored = all.length - cards.length;
    if (cards.length > 0) {
      return {
        ok: true,
        cards,
        sourceUrl: url,
        note: `${cards.length} date(s) lues${ignored > 0 ? ` · ${ignored} ignorée(s) (salle non identifiable)` : ''}`,
      };
    }
    // Page lue mais aucune date pour cette salle : on continue, ça peut venir d'une autre page
  }

  return { ok: false, cards: [], note: 'Défi anti-robot actif' };
}

/**
 * Récupère les dates à venir d'une salle via une source de secours (JSON-LD).
 * Renvoie [{ artist, date, time, url }] — sans prix ni statut billetterie.
 */
async function fetchFallbackEvents(venueId) {
  const cfg = FALLBACK_SOURCES[venueId];
  if (!cfg) return { ok: false, events: [], sourceUrl: '', note: 'Aucune source de secours' };

  // Certains agrégateurs bloquent le client HTTP de Node (empreinte TLS) tout en
  // acceptant curl : on privilégie curl quand il est disponible, avec repli sur fetch.
  const text = await fetchPageViaCurlOrNode(cfg.url);
  if (!text.ok) {
    return { ok: false, events: [], sourceUrl: cfg.url, note: text.note };
  }

  const nodes = extractJsonLdBlocks(text.body).flatMap(flattenJsonLd);
  const events = [];
  for (const node of nodes) {
    if (node['@type'] !== 'MusicEvent') continue;
    const start = String(node.startDate || '');
    const date = start.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    // name = "Artiste - Ville - Salle - Date" → on ne garde que l'artiste
    let artist = String(node.name || '');
    const sep = artist.indexOf(' - ');
    if (sep > 0) artist = artist.slice(0, sep);
    artist = artist.replace(/\s+/g, ' ').trim();
    if (artist.length < 2) continue;

    const timeRaw = start.slice(11, 16);
    events.push({
      artist,
      date,
      time: /^\d{2}:\d{2}$/.test(timeRaw) ? `${timeRaw.slice(0, 2)}h${timeRaw.slice(3)}` : '',
      url: node.url || cfg.url,
    });
  }
  return { ok: true, events, sourceUrl: cfg.url, note: `${events.length} date(s) via source de secours` };
}

async function checkStatusOnlyVenue(venueId, venueConcerts, nowIso) {
  const cfg = STATUS_ONLY_SOURCES[venueId];
  if (!cfg) return { ok: true, status: 200, matchedCount: 0, changes: [], cancelledIds: [], sourceUrl: '' };

  let r;
  try {
    r = await fetchText(cfg.url, {}, 12000);
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err.name === 'TimeoutError' ? 'Timeout' : err.message,
      matchedCount: 0,
      changes: [],
      cancelledIds: [],
      sourceUrl: cfg.url,
    };
  }

  if (!r.ok) {
    return {
      ok: false,
      status: r.status,
      // Message volontairement factuel : sur Shotgun, RIEN n'a été lu. Il ne faut pas
      // laisser croire que les statuts ont été revérifiés.
      error:
        r.status === 429
          ? 'Mur anti-robot Shotgun — aucune donnée lue (dates du catalogue conservées)'
          : `HTTP ${r.status}`,
      matchedCount: 0,
      changes: [],
      cancelledIds: [],
      sourceUrl: cfg.url,
    };
  }

  const $ = cheerio.load(r.text);
  $('script, style, noscript, template').remove();
  const cards = [];

  $(cfg.cardSelector).each((_, el) => {
    const $el = $(el);
    const href = $el.is('a') ? $el.attr('href') : $el.find(cfg.linkSelector).first().attr('href');
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (text.length > 3) {
      cards.push({ path: href ? normalizeUrlPath(href) : '', text, html: $el.html() || '' });
    }
  });

  if (cards.length === 0) {
    $(cfg.linkSelector).each((_, a) => {
      const href = $(a).attr('href');
      if (!href) return;
      const $box = $(a).closest('article, li, .card, .item, div');
      cards.push({
        path: normalizeUrlPath(href),
        text: $box.text().replace(/\s+/g, ' ').trim(),
        html: $box.html() || '',
      });
    });
  }

  let matchedCount = 0;
  const changes = [];
  const cancelledIds = [];

  for (const concert of venueConcerts) {
    const eventPath = normalizeUrlPath(concert.venueEventUrl);
    let card = cards.find(
      (c) => c.path && eventPath.length > 6 && (c.path === eventPath || c.path.endsWith(eventPath) || eventPath.endsWith(c.path))
    );
    if (!card) {
      const tokens = normalizeText(concert.title)
        .split(' ')
        .filter((t) => t.length >= 4)
        .slice(0, 2);
      if (tokens.length > 0) {
        card = cards.find((c) => tokens.every((tok) => normalizeText(c.text).includes(tok)));
      }
    }
    if (!card) continue;
    matchedCount++;
    concert.statusVerifiedAt = nowIso;

    const detected = detectStatusFromCardText(card.text, card.html, concert.status);
    if (detected === 'cancelled') {
      cancelledIds.push(concert.id);
      continue;
    }
    if (detected !== concert.status) {
      const explicit = /\b(complet|sold[\s-]*out|derni[èe]res|r[ée]server|billets|tarif|€|gratuit)\b/i.test(card.text);
      if (detected === 'sold-out' || detected === 'last-tickets' || explicit) {
        changes.push({
          concertId: concert.id,
          title: concert.title,
          venueId,
          previousStatus: concert.status,
          newStatus: detected,
          detectedAt: nowIso,
        });
        concert.status = detected;
      }
    }
  }

  return { ok: true, status: r.status, matchedCount, changes, cancelledIds, sourceUrl: cfg.url };
}

/** Trouve un concert existant équivalent (par URL exacte ou même salle + même date + mots clés) */
function findExistingMatch(scraped, existingList) {
  const scrapedPath = normalizeUrlPath(scraped.venueEventUrl);
  // 1. Par URL exacte
  if (scrapedPath.length > 8) {
    const byUrl = existingList.find(
      (e) => e.venueId === scraped.venueId && normalizeUrlPath(e.venueEventUrl) === scrapedPath
    );
    if (byUrl) return byUrl;
  }

  // 2. Par même salle + même date + premier mot significatif du titre
  const sTokens = normalizeText(scraped.title)
    .split(' ')
    .filter((t) => t.length >= 3 && !['les', 'des', 'aux', 'pour', 'avec', 'concert', 'live', 'toulouse'].includes(t));

  if (sTokens.length > 0) {
    return existingList.find((e) => {
      if (e.venueId !== scraped.venueId || e.date !== scraped.date) return false;
      const eNorm = normalizeText(e.title);
      return sTokens.slice(0, Math.min(2, sTokens.length)).some((tok) => eNorm.includes(tok));
    });
  }
  return null;
}

/** Nom de fichier stable : <salle>-<slug-titre>-<hash>.webp */
function posterFileName(concert) {
  const slug = `${concert.title || concert.id}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const hash = crypto
    .createHash('sha1')
    .update(`${concert.id}|${concert.date}|${concert.sourcePosterUrl || concert.poster}`)
    .digest('hex')
    .slice(0, 6);
  return `${concert.venueId}-${slug}-${hash}.webp`;
}

/** Palette d'accent par genre, pour les affiches de repli générées. */
const PLACEHOLDER_TINTS = {
  'Rock & Indie': ['#3F3A4A', '#C85A6E'],
  'Metal & Hardcore': ['#2E2A34', '#B91C1C'],
  'Électro & House': ['#26303F', '#38BDF8'],
  'Techno & Rave': ['#232A38', '#818CF8'],
  'Rap & Hip-Hop': ['#332B3A', '#A78BFA'],
  Pop: ['#3A2E34', '#F472B6'],
  'Chanson & Folk': ['#332E28', '#D6A15F'],
  'Jazz & Blues': ['#252C38', '#60A5FA'],
  'Soul, Funk & R&B': ['#332A33', '#F0ABFC'],
  'Reggae & Dub': ['#26332A', '#4ADE80'],
  'Musiques du Monde': ['#332F26', '#FBBF24'],
  'Classique & Opéra': ['#2B2B33', '#E5E7EB'],
};

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Génère une affiche de repli sobre quand la salle ne publie aucune image
 * (cas des dates confirmées par une source de secours). Évite la vignette vide
 * et reste honnête : « Affiche non communiquée ».
 */
async function generatePlaceholderPoster(concert, venueName = '') {
  const [bg, accent] = PLACEHOLDER_TINTS[concert.category] || ['#2A2733', '#C85A6E'];
  const title = escapeXml((concert.title || 'Concert').slice(0, 30));
  const venue = escapeXml((venueName || '').slice(0, 26));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${bg}"/>
        <stop offset="100%" stop-color="#17151D"/>
      </linearGradient>
    </defs>
    <rect width="800" height="800" fill="url(#g)"/>
    <circle cx="400" cy="400" r="230" fill="none" stroke="${accent}" stroke-opacity="0.18" stroke-width="2"/>
    <text x="400" y="330" text-anchor="middle" fill="#8A8290" font-family="Helvetica, Arial, sans-serif" font-size="26" letter-spacing="4">SCÈNE ROSE</text>
    <text x="400" y="405" text-anchor="middle" fill="#FFFFFF" font-family="Helvetica, Arial, sans-serif" font-size="54" font-weight="bold">${title}</text>
    <text x="400" y="465" text-anchor="middle" fill="${accent}" font-family="Helvetica, Arial, sans-serif" font-size="32">${venue}</text>
    <text x="400" y="700" text-anchor="middle" fill="#6B6472" font-family="Helvetica, Arial, sans-serif" font-size="24">Affiche non communiquée</text>
  </svg>`;

  const fileName = `${concert.venueId}-${concert.date}-${slugify(concert.title).slice(0, 30) || 'concert'}.webp`;
  await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(path.join(POSTER_DIR, fileName));
  return `/posters/${fileName}`;
}

/**
 * Rapatrie une affiche distante et la convertit en WebP local (max 800px).
 * Best-effort : en cas d'échec on conserve l'URL distante (fallback client).
 */
async function localizePoster(concert) {
  const src = concert.poster;
  if (typeof src !== 'string' || src.startsWith('/posters/')) return false;
  if (!/^https?:\/\//i.test(src)) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(src, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*;q=0.8' },
    });
    if (!res.ok) return false;
    const type = res.headers.get('content-type') || '';
    if (type && !type.startsWith('image/')) return false;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1024 || buffer.length > 12 * 1024 * 1024) return false;

    fs.mkdirSync(POSTER_DIR, { recursive: true });
    const fileName = posterFileName(concert);
    await sharp(buffer, { animated: false })
      .rotate()
      .resize({
        width: POSTER_MAX_EDGE,
        height: POSTER_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: POSTER_WEBP_QUALITY, effort: 3 })
      .toFile(path.join(POSTER_DIR, fileName));

    concert.sourcePosterUrl = concert.sourcePosterUrl || src;
    concert.poster = `/posters/${fileName}`;
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Exécute la synchronisation exhaustive + mise à jour des statuts */
export async function syncConcerts({ quiet = false } = {}) {
  const startedAt = Date.now();
  const now = new Date();
  const nowIso = now.toISOString();
  const todayIso = getTodayParisIso(now);

  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(`Fichier de données introuvable : ${DATA_PATH}`);
  }

  const db = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const venues = db.venues || [];
  let concerts = db.concerts || [];

  // Compteur d'échecs consécutifs par salle (persisté) : au-delà de 3 cycles
  // manqués, la salle est signalée dans le rapport comme nécessitant une action.
  const failureStreaks = { ...(db.syncMeta?.failureStreaks || {}) };

  // Historique du nombre de dates par salle, pour détecter une chute anormale
  // (site qui change de structure et renvoie 0 événement sans erreur).
  const previousCounts = { ...(db.syncMeta?.venueConcertCounts || {}) };
  // Nombre de dates réellement lues à la source (≠ taille du catalogue).
  // C'est la seule mesure qui distingue « la salle n'a rien » de « le lecteur est cassé ».
  const previousReadCounts = { ...(db.syncMeta?.venueReadCounts || {}) };

  // 1. Purger les concerts passés (avant aujourd'hui Europe/Paris)
  const beforePast = concerts.length;
  concerts = concerts.filter((c) => (c.endDate || c.date) >= todayIso);
  const removedPastCount = beforePast - concerts.length;

  const changes = [];
  const cancelledIds = new Set();
  const venuesReport = [];
  let addedCount = 0;

  // 2. Définir les scrapers exhaustifs par salle
  const fullScrapers = {
    'le-bikini': () => scrapeLeBikini(todayIso),
    'zenith-toulouse': () => scrapeZenith(todayIso),
    'le-metronum': () => scrapeLeMetronum(todayIso),
    interference: () => scrapeInterference(todayIso),
    'le-rex': () => scrapeLeRex(todayIso),
    'halle-aux-grains': () =>
      scrapeOpenAgendaSite('halle-aux-grains', 'https://onct.toulouse.fr/agenda/', 5, todayIso),
    'opera-capitole': () =>
      scrapeOpenAgendaSite(
        'opera-capitole',
        'https://opera.toulouse.fr/agenda/',
        4,
        todayIso,
        (_title, txt) => !/\bballet\b/i.test(txt) || /\bop[ée]ra|concert|r[ée]cital\b/i.test(txt)
      ),
    'auditorium-saint-pierre': () =>
      scrapeOpenAgendaSite(
        'auditorium-saint-pierre',
        'https://conservatoire.toulouse.fr/agenda/',
        4,
        todayIso,
        (title, txt) =>
          !/\b(master-?class|danse|th[ée][âa]tre|marionnettes|audition)\b/i.test(`${title} ${txt}`) &&
          /\b(concert|r[ée]cital|orchestre|symphonique|harpissima|piano|zygel|musique|cin[ée]-concert)\b/i.test(
            `${title} ${txt}`
          )
      ),
    odyssud: () => scrapeOdyssud(todayIso),
    'salle-nougaro': () => scrapeSalleNougaro(todayIso),
    'le-labo-des-arts': () => scrapeLaboDesArts(todayIso),
    'la-cabane': () => scrapeLaCabane(todayIso),
    'le-taquin': () => scrapeLeTaquin(todayIso),
  };

  // 3. Exécuter tous les scrapers en parallèle
  await Promise.all(
    venues.map(async (venue) => {
      const t0 = Date.now();
      const existingVenueConcerts = concerts.filter((c) => c.venueId === venue.id);

      if (fullScrapers[venue.id]) {
        let res;
        try {
          res = await fullScrapers[venue.id]();
        } catch (err) {
          res = {
            ok: false,
            status: 0,
            events: [],
            sourceUrl: venue.websiteUrl,
            error: err.message,
          };
        }

        let venueAdded = 0;
        let venueStatusChanges = 0;
        let venueVerified = 0;

        if (res.ok) {
          for (const scraped of res.events) {
            const match = findExistingMatch(scraped, existingVenueConcerts);

            if (scraped.status === 'cancelled') {
              if (match) {
                cancelledIds.add(match.id);
                venueStatusChanges++;
              }
              continue;
            }

            if (match) {
              venueVerified++;
              match.statusVerifiedAt = nowIso;
              if (scraped.status !== match.status) {
                changes.push({
                  concertId: match.id,
                  title: match.title,
                  venueId: venue.id,
                  previousStatus: match.status,
                  newStatus: scraped.status,
                  detectedAt: nowIso,
                });
                match.status = scraped.status;
                venueStatusChanges++;
              }
              if (!match.price && scraped.price) match.price = scraped.price;
            } else if (scraped.poster && scraped.date >= todayIso) {
              // Nouvelle date découverte sur l'agenda officiel !
              const uniqueId = concerts.some((c) => c.id === scraped.id)
                ? `${scraped.id}-${Math.floor(Math.random() * 999)}`
                : scraped.id;
              const newConcert = {
                ...scraped,
                id: uniqueId,
                firstSeenAt: nowIso,
                statusVerifiedAt: nowIso,
              };
              // Rapatrie immédiatement l'affiche (WebP local ~50 Ko au lieu de ~785 Ko distant)
              await localizePoster(newConcert);
              concerts.push(newConcert);
              existingVenueConcerts.push(newConcert);
              venueAdded++;
              addedCount++;
            }
          }
        }

        const activeForVenue = concerts.filter((c) => c.venueId === venue.id && !cancelledIds.has(c.id));
        venuesReport.push({
          venueId: venue.id,
          venueName: venue.shortName,
          sourceUrl: res.sourceUrl || venue.websiteUrl,
          ok: res.ok,
          checkedCount: activeForVenue.length,
          readCount: res.ok ? (res.events?.length ?? 0) : 0,
          soldOutCount: activeForVenue.filter((c) => c.status === 'sold-out').length,
          lastTicketsCount: activeForVenue.filter((c) => c.status === 'last-tickets').length,
          freeCount: activeForVenue.filter((c) => c.status === 'free').length,
          statusChanges: venueStatusChanges,
          addedCount: venueAdded,
          latencyMs: Date.now() - t0,
          checkedAt: nowIso,
          note: res.ok
            ? venueAdded > 0
              ? `Agenda complet scanné (+${venueAdded} nouvelle${venueAdded > 1 ? 's' : ''} date${venueAdded > 1 ? 's' : ''})`
              : `${Math.max(venueVerified, res.events.length)} dates vérifiées en direct (agenda complet)`
            : `Indisponible (${res.error || `HTTP ${res.status}`}) — cache conservé`,
        });
      } else {
        const res = await checkStatusOnlyVenue(venue.id, existingVenueConcerts, nowIso);
        for (const ch of res.changes) changes.push(ch);
        for (const cid of res.cancelledIds) cancelledIds.add(cid);

        // 1) Tentative opportuniste sur l'agenda Shotgun : le défi anti-robot laisse
        //    parfois passer une requête normale. Si ça marche, on a des dates fraîches
        //    avec salle, prix et affiche ; s'il bloque, on continue sans rien casser.
        let shotgunNote = '';
        let shotgunAdded = 0;
        let shotgunCancelled = 0;
        if (SHOTGUN_VENUES[venue.id]) {
          const sg = await fetchShotgunAgenda(venue.id);
          if (sg.ok) {
            const venueObj = venues.find((v) => v.id === venue.id);
            const seenSlugs = new Set();
            for (const card of sg.cards) {
              if (card.date < todayIso) continue;
              seenSlugs.add(card.slug);

              const existing = existingVenueConcerts.find(
                (c) =>
                  (c.venueEventUrl || '').includes(card.slug) ||
                  (c.date === card.date && normalizeText(c.title).includes(normalizeText(card.title).slice(0, 12)))
              );

              if (existing) {
                // La date existe déjà : on rafraîchit ce qu'on sait de fiable
                if (card.price) existing.price = card.price;
                existing.statusVerifiedAt = nowIso;
                existing.statusSource = 'venue';
                if (card.poster) {
                  existing.sourcePosterUrl = existing.sourcePosterUrl || card.poster;
                  // Une affiche locale est déjà bonne ; sinon on tente le rapatriement
                  if (!existing.poster || !existing.poster.startsWith('/posters/')) {
                    existing.poster = card.poster;
                    await localizePoster(existing);
                  }
                }
                continue;
              }

              const newConcert = {
                id: `${venue.id}-${card.date}-${slugify(card.title).slice(0, 40)}`,
                title: card.title,
                subtitle: card.genres.length
                  ? `${card.genres.join(' · ')} à ${venueObj?.shortName || venueObj?.name || 'la salle'}`
                  : undefined,
                date: card.date,
                time: card.time,
                venueId: venue.id,
                category: inferCategory(card.genres, card.title, venue.id),
                genres: card.genres.length ? card.genres : ['Clubbing'],
                price: card.price || undefined,
                status: 'available',
                poster: card.poster,
                sourcePosterUrl: card.poster,
                venueEventUrl: card.url,
                isClubNight: true,
                firstSeenAt: nowIso,
                statusVerifiedAt: nowIso,
                statusSource: 'venue',
              };
              if (newConcert.poster) {
                await localizePoster(newConcert);
              } else {
                try {
                  newConcert.poster = await generatePlaceholderPoster(
                    newConcert,
                    venueObj?.shortName || venueObj?.name || ''
                  );
                } catch {
                  // le composant PosterImage affichera un visuel de repli
                }
              }
              concerts.push(newConcert);
              existingVenueConcerts.push(newConcert);
              shotgunAdded++;
              addedCount++;
            }

            // Une date absente de l'agenda Shotgun = soirée annulée, déplacée, ou
            // simplement page tronquée. On exige donc TROIS passages concordants
            // (~18 h d'écart) avant de retirer quoi que ce soit.
            for (const c of existingVenueConcerts) {
              if (c.date < todayIso) continue;
              const slugInUrl = (c.venueEventUrl || '').match(/\/events\/([a-z0-9-]+)/i)?.[1];
              if (!slugInUrl) continue; // date saisie à la main : on n'y touche pas
              if (seenSlugs.has(slugInUrl)) {
                delete c.missedInShotgun;
              } else {
                c.missedInShotgun = (c.missedInShotgun || 0) + 1;
                if (c.missedInShotgun >= 3) {
                  cancelledIds.add(c.id);
                  shotgunCancelled++;
                }
              }
            }

            shotgunNote = ` · Shotgun lu : ${sg.cards.length} date(s)${shotgunAdded ? `, +${shotgunAdded} ajoutée(s)` : ''}${shotgunCancelled ? `, ${shotgunCancelled} retirée(s)` : ''}`;
          } else {
            shotgunNote = ` · Shotgun indisponible (${sg.note})`;
          }
        }

        // 2) Source de secours (JSON-LD) quand Shotgun reste muet
        let fallbackNote = '';
        let fallbackAdded = 0;
        let fallbackConfirmed = 0;
        let fallbackReadCount = 0;
        if (!res.ok && !shotgunAdded && FALLBACK_SOURCES[venue.id]) {
          const fb = await fetchFallbackEvents(venue.id);
          if (fb.ok) {
            fallbackReadCount = fb.events.length;
            const upcoming = fb.events.filter((e) => e.date >= todayIso);
            for (const ev of upcoming) {
              const alreadyListed = existingVenueConcerts.some(
                (c) =>
                  c.date === ev.date &&
                  normalizeText(c.title).includes(normalizeText(ev.artist).split(' ')[0])
              );
              if (alreadyListed) {
                fallbackConfirmed++;
                continue;
              }
              const venueObj = venues.find((v) => v.id === venue.id);
              const newConcert = {
                id: `${venue.id}-${ev.date}-${slugify(ev.artist).slice(0, 40)}`,
                title: ev.artist,
                subtitle: `Date confirmée via ${fallbackHostLabel(fb.sourceUrl)}`,
                date: ev.date,
                time: ev.time || '23h00',
                venueId: venue.id,
                category: venueObj?.defaultCategory || 'Électro & House',
                genres: ['Clubbing'],
                status: 'available',
                poster: '',
                sourcePosterUrl: '',
                venueEventUrl: ev.url,
                firstSeenAt: nowIso,
                // Provenance explicite : le statut billetterie n'est PAS connu,
                // seulement l'existence de la date.
                statusSource: 'fallback',
                statusVerifiedAt: null,
              };
              try {
                newConcert.poster = await generatePlaceholderPoster(newConcert, venueObj?.shortName || venueObj?.name || '');
              } catch {
                // Pas bloquant : le composant PosterImage affiche un visuel de repli
              }
              concerts.push(newConcert);
              existingVenueConcerts.push(newConcert);
              fallbackAdded++;
              addedCount++;
            }
            fallbackNote = ` · secours : ${fb.events.length} date(s) lues${fallbackAdded > 0 ? `, +${fallbackAdded} ajoutée(s)` : fallbackConfirmed > 0 ? `, ${fallbackConfirmed} déjà connue(s)` : ''}`;
          } else {
            fallbackNote = ` · secours KO (${fb.note})`;
          }
        }

        const activeForVenue = concerts.filter((c) => c.venueId === venue.id && !cancelledIds.has(c.id));
        venuesReport.push({
          venueId: venue.id,
          venueName: venue.shortName,
          sourceUrl: res.sourceUrl || venue.websiteUrl,
          ok: res.ok || Boolean(fallbackNote && !fallbackNote.includes('KO')),
          checkedCount: activeForVenue.length,
          readCount: Math.max(res.ok ? res.events?.length ?? 0 : 0, fallbackReadCount),
          soldOutCount: activeForVenue.filter((c) => c.status === 'sold-out').length,
          lastTicketsCount: activeForVenue.filter((c) => c.status === 'last-tickets').length,
          freeCount: activeForVenue.filter((c) => c.status === 'free').length,
          statusChanges: res.changes.length + res.cancelledIds.length,
          addedCount: 0,
          latencyMs: Date.now() - t0,
          checkedAt: nowIso,
          note: res.ok
            ? res.matchedCount > 0
              ? `${res.matchedCount}/${existingVenueConcerts.length} dates vérifiées en direct`
              : `Page joignable (HTTP ${res.status}) — statuts synchronisés`
            : `${res.error || 'Indisponible'}${shotgunNote}${fallbackNote}`,
        });
      }
    })
  );

  // Retirer les concerts annulés
  const removedCancelledCount = cancelledIds.size;
  if (removedCancelledCount > 0) {
    concerts = concerts.filter((c) => !cancelledIds.has(c.id));
  }


  // ── Garde-fou : détecter une salle qui « répond » mais ne trouve plus rien ──
  // Si une salle avait N dates au cycle précédent et qu'elle n'en trouve plus que
  // très peu, c'est presque toujours une structure HTML qui a changé. Sans ce
  // contrôle, le rapport afficherait fièrement « agenda complet » avec 0 date.
  const suspiciousDrops = [];
  const confirmedDrops = [];
  const previousDropStreaks = { ...(db.syncMeta?.dropStreaks || {}) };
  const dropStreaks = {};
  const anomalyIds = new Set();

  for (const r of venuesReport) {
    const prev = previousCounts[r.venueId] ?? 0;
    const nowCount = r.checkedCount ?? 0;
    const prevRead = previousReadCounts[r.venueId] ?? 0;
    const nowRead = r.readCount ?? 0;

    // Trop peu de dates au départ pour juger quoi que ce soit.
    if (prev < 5 && prevRead < 5) {
      dropStreaks[r.venueId] = 0;
      continue;
    }

    // Deux mesures, deux usages :
    //  - le catalogue dit combien de dates on affiche ;
    //  - la lecture dit combien de dates la source a réellement rendues.
    // La seconde est la plus fiable : un lecteur cassé laisse le catalogue
    // intact tout en ne lisant plus rien.
    const catalogDrop = prev >= 5 && nowCount <= Math.max(1, Math.floor(prev * 0.3));
    const readDrop = prevRead >= 5 && nowRead <= Math.max(1, Math.floor(prevRead * 0.3));

    if (!catalogDrop && !readDrop) {
      dropStreaks[r.venueId] = 0;
      continue;
    }

    const streak = (previousDropStreaks[r.venueId] || 0) + 1;
    dropStreaks[r.venueId] = streak;
    const datesLues = readDrop ? nowRead : nowCount;

    // Une baisse revue une 2e fois alors que le lecteur ramène quand même des
    // dates = baisse réelle (la salle a réduit son programme). On la valide une
    // fois pour toutes pour ne pas alerter pendant des mois.
    // Zéro date lue deux fois de suite = lecteur cassé : on continue d'alerter.
    if (streak >= 2 && datesLues >= 1) {
      confirmedDrops.push({
        venueId: r.venueId,
        venueName: r.venueName,
        previousCount: readDrop ? prevRead : prev,
        currentCount: readDrop ? nowRead : nowCount,
      });
      dropStreaks[r.venueId] = 0;
      continue;
    }

    anomalyIds.add(r.venueId);
    suspiciousDrops.push({
      venueId: r.venueId,
      venueName: r.venueName,
      previousCount: readDrop ? prevRead : prev,
      currentCount: readDrop ? nowRead : nowCount,
      measure: readDrop ? 'lecture' : 'catalogue',
    });
    r.ok = false;
    r.needsAttention = true;
    r.note = readDrop
      ? `⚠️ Chute anormale : ${prevRead} → ${nowRead} dates lues (structure du site probablement modifiée)`
      : `⚠️ Chute anormale : ${prev} → ${nowCount} dates (structure du site probablement modifiée)`;
  }

  // Mémorise les comptes stabilisés. Un compte effondré n'est JAMAIS enregistré,
  // sinon le cycle suivant comparerait à une valeur déjà faussée et l'alerte
  // disparaîtrait d'elle-même au bout de deux passages.
  const venueConcertCounts = {};
  const venueReadCounts = {};
  for (const r of venuesReport) {
    const isAnomaly = anomalyIds.has(r.venueId);
    venueConcertCounts[r.venueId] = isAnomaly
      ? previousCounts[r.venueId] ?? r.checkedCount ?? 0
      : r.checkedCount ?? 0;
    venueReadCounts[r.venueId] = isAnomaly
      ? previousReadCounts[r.venueId] ?? r.readCount ?? 0
      : r.readCount ?? 0;
  }

  // Mise à jour des compteurs d'échecs consécutifs + drapeau d'alerte
  for (const r of venuesReport) {
    if (r.ok && !anomalyIds.has(r.venueId)) {
      failureStreaks[r.venueId] = 0;
    } else {
      failureStreaks[r.venueId] = (failureStreaks[r.venueId] || 0) + 1;
      r.failureStreak = failureStreaks[r.venueId];
      if (failureStreaks[r.venueId] >= 3) {
        r.needsAttention = true;
      }
    }
  }
  const venuesNeedingAttention = venuesReport
    .filter((r) => r.needsAttention)
    .map((r) => r.venueName);

  // 3 bis. Aucun concert ne doit rester sans affiche (contrôle qualité bloquant)
  for (const concert of concerts) {
    if (concert.poster) continue;
    try {
      const venueObj = venues.find((v) => v.id === concert.venueId);
      concert.poster = await generatePlaceholderPoster(concert, venueObj?.shortName || venueObj?.name || '');
    } catch {
      // ignoré : PosterImage gère l’absence
    }
  }

  // 4. Filet de sécurité : rapatrier toute affiche encore distante (plafonné pour tenir dans le job CI)
  const stillRemote = concerts.filter(
    (c) => typeof c.poster === 'string' && /^https?:\/\//i.test(c.poster)
  );
  let postersLocalized = 0;
  if (stillRemote.length > 0) {
    let posterCursor = 0;
    const POSTER_CONCURRENCY = 6;
    const POSTER_BATCH_LIMIT = 80;
    const batch = stillRemote.slice(0, POSTER_BATCH_LIMIT);
    await Promise.all(
      Array.from({ length: Math.min(POSTER_CONCURRENCY, batch.length) }, async () => {
        while (posterCursor < batch.length) {
          const concert = batch[posterCursor++];
          if (await localizePoster(concert)) postersLocalized++;
        }
      })
    );
    if (!quiet && postersLocalized > 0) {
      console.log(`   Affiches          : ${postersLocalized} rapatriées en WebP local`);
    }
  }

  // Tri chronologique propre
  concerts.sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : a.time.localeCompare(b.time);
  });

  // Ordonner le rapport selon l'ordre des salles
  const venueOrder = new Map(venues.map((v, i) => [v.id, i]));
  venuesReport.sort((a, b) => (venueOrder.get(a.venueId) ?? 99) - (venueOrder.get(b.venueId) ?? 99));

  const durationMs = Date.now() - startedAt;
  const maxDate = concerts.length ? concerts[concerts.length - 1].date : todayIso;

  const parisParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)])
  );
  const nowMin = parisParts.hour * 60 + parisParts.minute;
  const slots = [
    { min: 6 * 60, label: '06h00' },
    { min: 11 * 60 + 30, label: '11h30' },
    { min: 17 * 60 + 30, label: '17h30' },
    { min: 21 * 60, label: '21h00' },
  ];
  const nextSlot = slots.find((s) => s.min > nowMin);
  const nextScheduledSync = nextSlot
    ? `Aujourd'hui à ${nextSlot.label} (Europe/Paris)`
    : 'Demain à 06h00 (Europe/Paris)';

  const syncMeta = {
    lastSyncedAt: nowIso,
    scheduleLabel: '4× / jour (06h · 11h30 · 17h30 · 21h)',
    nextScheduledSync,
    durationMs,
    totalVenues: venues.length,
    syncedVenuesOk: venuesReport.filter((v) => v.ok).length,
    totalConcerts: concerts.length,
    availableCount: concerts.filter((c) => c.status === 'available').length,
    soldOutCount: concerts.filter((c) => c.status === 'sold-out').length,
    lastTicketsCount: concerts.filter((c) => c.status === 'last-tickets').length,
    freeCount: concerts.filter((c) => c.status === 'free').length,
    addedCount,
    removedPastCount,
    removedCancelledCount,
    postersLocalized,
    failureStreaks,
    venuesNeedingAttention,
    suspiciousDrops,
    confirmedDrops,
    dropStreaks,
    venueConcertCounts,
    venueReadCounts,
    horizonDate: maxDate,
    changes,
    venuesReport,
  };

  // Écriture atomique
  const tmpPath = `${DATA_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify({ venues, concerts, syncMeta }, null, 2), 'utf-8');
  fs.renameSync(tmpPath, DATA_PATH);

  // Journaliser
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(
    LOG_FILE,
    JSON.stringify({
      at: nowIso,
      durationMs,
      totalConcerts: syncMeta.totalConcerts,
      addedCount,
      syncedVenuesOk: syncMeta.syncedVenuesOk,
      totalVenues: syncMeta.totalVenues,
      soldOutCount: syncMeta.soldOutCount,
      lastTicketsCount: syncMeta.lastTicketsCount,
      changesCount: changes.length,
      removedPastCount,
      removedCancelledCount,
      horizonDate: maxDate,
    }) + '\n',
    'utf-8'
  );

  if (!quiet) {
    console.log(`\n🎸 Scène Rose — Synchronisation exhaustive terminée en ${(durationMs / 1000).toFixed(2)}s`);
    console.log(`   Date de référence : ${todayIso} → horizon ${maxDate}`);
    console.log(`   Salles joignables : ${syncMeta.syncedVenuesOk}/${syncMeta.totalVenues}`);
    console.log(
      `   Concerts actifs   : ${syncMeta.totalConcerts} (+${addedCount} nouveaux · ${syncMeta.availableCount} dispo · ${syncMeta.lastTicketsCount} dernières places · ${syncMeta.soldOutCount} complets · ${syncMeta.freeCount} gratuits)`
    );
    if (venuesNeedingAttention.length > 0) {
      console.log(`   ⚠️  À surveiller (3 échecs consécutifs) : ${venuesNeedingAttention.join(', ')}`);
    }
    if (removedPastCount > 0 || removedCancelledCount > 0) {
      console.log(`   Nettoyage         : ${removedPastCount} passés · ${removedCancelledCount} annulés`);
    }
    if (changes.length > 0) {
      console.log(`   Changements statut (${changes.length}) :`);
      for (const ch of changes.slice(0, 15)) {
        console.log(`     • ${ch.title} (${ch.venueId}) : ${ch.previousStatus} → ${ch.newStatus}`);
      }
    }
    console.log('');
    for (const r of venuesReport) {
      const icon = r.ok ? '✅' : '⚠️';
      console.log(
        `   ${icon} ${r.venueName.padEnd(22)} | ${String(r.checkedCount).padStart(3)} dates | ${String(r.soldOutCount).padStart(2)} complet | ${String(r.latencyMs).padStart(4)}ms | ${r.note}`
      );
    }
    console.log('');
  }

  // ── Secours auto-généré ────────────────────────────────────────────────────
  // Le catalogue embarqué dans l'app (src/data/concertsFallback.ts) ne doit pas
  // être maintenu à la main : on le régénère à partir du dernier état sain.
  // Il sert uniquement si la première visite n'a aucun réseau.
  try {
    const fallbackPath = path.join(PROJECT_ROOT, 'src/data/concertsFallback.ts');
    // On ne garde que les champs du type Concert : les propriétés internes de
    // travail (missedInShotgun…) ou les valeurs null (statusVerifiedAt) feraient
    // échouer la compilation TypeScript du catalogue de secours.
    const FALLBACK_FIELDS = [
      'id', 'title', 'subtitle', 'date', 'endDate', 'time', 'venueId', 'category',
      'genres', 'price', 'status', 'statusVerifiedAt', 'statusSource', 'firstSeenAt',
      'poster', 'sourcePosterUrl', 'venueEventUrl', 'featured', 'isClubNight',
    ];
    const healthy = concerts
      .filter((c) => (c.endDate || c.date) >= todayIso && c.poster)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 200)
      .map((c) => {
        const clean = {};
        for (const key of FALLBACK_FIELDS) {
          const value = c[key];
          if (value === undefined || value === null) continue;
          clean[key] = value;
        }
        return clean;
      });
    if (healthy.length >= 20) {
      // Le JSON est un sous-ensemble valide de TypeScript : inutile de convertir
      // les guillemets (et risqué — les apostrophes de « L'Arena » cassaient le fichier).
      const body = JSON.stringify(healthy, null, 2).replace(/</g, '\\u003c');
      fs.writeFileSync(
        fallbackPath,
        `/**\n * Affiches de secours — GÉNÉRÉ AUTOMATIQUEMENT par scripts/sync-concerts.mjs.\n * Ne pas éditer à la main : ce fichier est écrasé à chaque synchronisation.\n * Dernière génération : ${nowIso}\n */\nimport type { Concert } from './toulouseData';\n\nexport const RAW_CONCERTS: Concert[] = ${body};\n`,
        'utf-8'
      );
    }
  } catch (err) {
    if (!quiet) console.log(`   (secours non régénéré : ${err.message})`);
  }

  // ── Tableau de bord lisible (ETAT-DU-SITE.md) ─────────────────────────────
  try {
    const fmtDate = (iso) => {
      if (!iso) return 'jamais';
      return new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Europe/Paris',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(iso));
    };
    const lignes = venuesReport.map((r) => {
      const state = r.ok ? '✅ OK' : r.needsAttention ? '🚨 à réparer' : '⚠️ instable';
      const streak = failureStreaks[r.venueId] || 0;
      return `| ${r.venueName} | ${state} | ${r.checkedCount} | ${r.checkedAt ? fmtDate(r.checkedAt) : '—'} | ${streak > 0 ? `${streak} échec(s)` : '—'} | ${r.note} |`;
    });

    const md = `# État du site — Scène Rose

> Fichier généré automatiquement à chaque synchronisation. Ne pas éditer.
> Dernière mise à jour : **${fmtDate(nowIso)}** (heure de Paris)

## Résumé

- Concerts à l'affiche : **${concerts.length}** (horizon ${maxDate})
- Salles joignables : **${syncMeta.syncedVenuesOk}/${venues.length}**
- Affiches hébergées localement : **${concerts.filter((c) => typeof c.poster === 'string' && c.poster.startsWith('/posters/')).length}**
- Salles à surveiller : ${venuesNeedingAttention.length ? venuesNeedingAttention.join(', ') : 'aucune'}
- Chutes anormales détectées : ${suspiciousDrops.length ? suspiciousDrops.map((d) => `${d.venueName} (${d.previousCount}→${d.currentCount})`).join(', ') : 'aucune'}
- Baisses confirmées (programmation réellement réduite) : ${confirmedDrops.length ? confirmedDrops.map((d) => `${d.venueName} (${d.previousCount}→${d.currentCount})`).join(', ') : 'aucune'}

## Détail par salle

| Salle | État | Dates | Vérifiée le | Échecs consécutifs | Note |
|---|---|---|---|---|---|
${lignes.join('\n')}

## Que faire en cas d'alerte

1. **🚨 à réparer** → ouvrir le site de la salle, vérifier que la page existe toujours.
   Si la structure a changé, ajuster le lecteur correspondant dans \`scripts/sync-concerts.mjs\`.
2. **⚠️ instable** → rien à faire, la salle rate parfois une synchronisation.
   On intervient seulement après plusieurs jours consécutifs.
3. **Chute anormale** → même chose que « à réparer » : le site répond mais son contenu
   n'est plus reconnu.

Le job GitHub Actions échoue volontairement dans ces cas : un e-mail est envoyé
automatiquement au propriétaire du dépôt.
`;
    fs.writeFileSync(path.join(PROJECT_ROOT, 'ETAT-DU-SITE.md'), md, 'utf-8');
  } catch {
    // Le tableau de bord est un confort, jamais un point de blocage
  }

  // ── Sortie en erreur : c'est ce qui déclenche l'e-mail d'alerte GitHub ─────
  const blockingProblems = [
    ...suspiciousDrops.map(
      (d) => `chute anormale ${d.venueName} : ${d.previousCount} → ${d.currentCount} dates`
    ),
    ...(venuesNeedingAttention.length >= 3
      ? [`${venuesNeedingAttention.length} salles en échec répété : ${venuesNeedingAttention.join(', ')}`]
      : []),
    ...(syncMeta.syncedVenuesOk < Math.ceil(venues.length / 2)
      ? [`moins de la moitié des salles joignables (${syncMeta.syncedVenuesOk}/${venues.length})`]
      : []),
  ];

  if (blockingProblems.length > 0 && !quiet) {
    console.log('\n🚨 ANOMALIES À CORRIGER :');
    for (const p of blockingProblems) console.log(`   • ${p}`);
    console.log('');
  }

  return { venues, concerts, syncMeta, blockingProblems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  syncConcerts()
    .then((result) => {
      // Code 1 = le job GitHub Actions échoue et envoie un e-mail au propriétaire.
      // Les données sont déjà écrites : le site continue de fonctionner.
      if (result?.blockingProblems?.length) {
        console.error('\n❌ Synchronisation terminée avec anomalies — données publiées quand même.');
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Erreur lors de la synchronisation :', err);
      process.exit(1);
    });
}
