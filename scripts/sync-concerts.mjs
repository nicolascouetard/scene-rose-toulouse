#!/usr/bin/env node
/**
 * Scène Rose — Moteur de synchronisation quotidienne & découverte exhaustive (2026–2027)
 * --------------------------------------------------------------------------------------
 * Interroge en parallèle les sites & APIs officiels des 15 salles toulousaines pour :
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
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(PROJECT_ROOT, 'public', 'data', 'concerts.json');
const LOG_DIR = path.join(PROJECT_ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'sync-history.jsonl');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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
    if (/\bjazz|swing|blues\b/.test(hay)) return 'Jazz & Groove';
    return 'Classique & Ciné';
  }
  if (venueId === 'le-taquin') return 'Jazz & Groove';
  if (venueId === 'le-cri-de-la-mouette') return 'Électro & Club';

  if (/\b(techno|house|electro|drum|bass|trance|hardcore|rave|dubstep|club|dj|hardstyle|acid|ebm|dark wave|synthwave|uk garage|jungle|psytrance|bounce)\b/.test(hay)) {
    return 'Électro & Club';
  }
  if (/\b(rap|hip hop|trap|rnb|r n b|drill|boom bap|slam|urbain)\b/.test(hay)) {
    return 'Rap & Hip-Hop';
  }
  if (/\b(metal|rock|punk|hardcore|grunge|post punk|shoegaze|stoner|doom|thrash|death|black metal|indie rock|garage|alternative|screamo|emo|core)\b/.test(hay)) {
    return 'Rock & Metal';
  }
  if (/\b(jazz|funk|soul|groove|blues|afrobeat|swing|bossa|manouche)\b/.test(hay)) {
    return 'Jazz & Groove';
  }
  if (/\b(reggae|dub|ska|world|monde|afro|latin|cumbia|salsa|flamenco|oriental|gnawa|balkan|celtique|espagnol|maloya|kora)\b/.test(hay)) {
    return 'Reggae & World';
  }
  if (/\b(symphonique|classique|opera|baroque|recital|orchestre|cine concert|philharmonique|quatuor|chambre|piano|violon|harpe|choral|lyrique)\b/.test(hay)) {
    return 'Classique & Ciné';
  }
  return 'Pop & Chanson';
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

/** 7. ODYSSUD BLAGNAC — Page Musiques complète */
async function scrapeOdyssud(todayIso) {
  const url = 'https://www.odyssud.com/spectacles/musiques';
  const r = await fetchText(url);
  if (!r.ok) return { ok: false, status: r.status, events: [], sourceUrl: url };

  const $ = loadHtmlSpaced(r.text);
  $('script, style, noscript').remove();
  const events = [];
  const seen = new Set();

  // Ne garder que la section "À Venir" (avant le titre "Passés")
  const upcomingContainer = $('h2:contains("À Venir")').nextAll().first();
  const $scope = upcomingContainer.length ? upcomingContainer : $('main');

  $scope.find('a[href*="/spectacles/musiques/"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (!href || /scolaire/i.test(href)) return;
    const fullUrl = href.startsWith('http') ? href : `https://www.odyssud.com${href}`;
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    // Remonter jusqu'au conteneur carte contenant l'image et la date
    let $card = $(a).parent();
    for (let i = 0; i < 4; i++) {
      if ($card.find('img[src*="sites/default/files"]').length > 0) break;
      $card = $card.parent();
    }
    const cardText = $card.text().replace(/\s+/g, ' ').trim();
    if (/scolaire/i.test(cardText)) return;

    const date = parseFrenchDate(cardText, '2027');
    if (!date || date < todayIso) return;

    const title =
      $card.find('h2, h3, .field--name-title, [class*="title"]').first().text().replace(/\s+/g, ' ').trim() ||
      '';
    if (!title || title.length < 3 || /en savoir/i.test(title)) return;

    let img =
      $card
        .find('img')
        .map((_, el) => $(el).attr('src') || $(el).attr('data-src') || '')
        .get()
        .find((src) => src.includes('/sites/default/files/') && !src.endsWith('.svg')) || '';
    img = img.replace('/styles/grid_thumbnail_lqip/public/', '/').split('?')[0];
    const posterUrl = unwrapNextImage(img, 'https://www.odyssud.com');
    if (!posterUrl) return;

    const status = detectStatusFromCardText(cardText, $card.html() || '');

    events.push({
      id: `odyssud-${date}-${slugify(title)}`,
      title,
      date,
      time: '20h30',
      venueId: 'odyssud',
      category: inferCategory([], title, 'odyssud'),
      genres: ['Musiques', 'Odyssud'],
      status,
      poster: posterUrl,
      sourcePosterUrl: posterUrl,
      venueEventUrl: fullUrl,
    });
  });

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

/** Extracteur générique de statuts pour les salles complémentaires (La Cabane, Le Bijou, Le Taquin, Casino, Cri de la Mouette) */
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
};

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
      error: r.status === 429 ? 'Rate-limit plateforme (statuts vérifiés conservés)' : `HTTP ${r.status}`,
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

        const activeForVenue = concerts.filter((c) => c.venueId === venue.id && !cancelledIds.has(c.id));
        venuesReport.push({
          venueId: venue.id,
          venueName: venue.shortName,
          sourceUrl: res.sourceUrl || venue.websiteUrl,
          ok: res.ok,
          checkedCount: activeForVenue.length,
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
            : res.error || 'Indisponible — cache conservé',
        });
      }
    })
  );

  // Retirer les concerts annulés
  const removedCancelledCount = cancelledIds.size;
  if (removedCancelledCount > 0) {
    concerts = concerts.filter((c) => !cancelledIds.has(c.id));
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

  return { venues, concerts, syncMeta };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  syncConcerts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Erreur lors de la synchronisation :', err);
      process.exit(1);
    });
}
