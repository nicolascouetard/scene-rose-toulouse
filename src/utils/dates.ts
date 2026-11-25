import { TODAY_ISO, type Concert, type GenreCategory, type Venue } from '../data/toulouseData';

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

const GENERIC_EVENT_RE =
  /\b(soir[ée]e\b|va\s+danser|techno\s+party|house\s+party|boat\s+party|dance\s+party|jam\s*session|\bjam\s*#?\d*|open\s*mic|karaok[ée]|blind\s*test|drag\s+after|after\s*show|r[ée]veillon|2000\s*vs\s*2010|forever\s+90|ann[ée]es\s*(80|90|2000)|cin[ée]-concert|orchestre\s+symphonique|concert\s+de\s+gala|concert\s+du\s+nouvel|symphonique\s+tour|electro\s+symphony|tribute|hommage|sublime\s+club|koalition\s+xxl|winter\s+festival|f[êe]te\s+ses\s+\d+\s+ans|terres\s+de\s+rencontres|s[ée]ance\s+scolaire|gayguette|bal\s+swing|sc[èe]ne\s+ouverte|girls\s+don['’]t\s+cry\s+festival|echos\s*&\s*merveilles|madame\s+arthur)\b/i;

const GENERIC_TOKEN_RE =
  /^(dj\s*set|guests?|more|and\s+more|\+?\s*guests?|collectif|festival|concert|soir[ée]e|sp[ée]cial|all\s+night(\s+long)?|live|toulouse|interference|le\s+bikini|l['’]arena|ax-les-thermes)$/i;

/**
 * Extrait TOUS les noms d'artistes écoutables d'un titre de concert / line-up club.
 * Retourne `[]` pour les soirées thématiques sans artiste identifiable (ex: "Madame Va Danser").
 */
export function extractListenArtists(title: string): string[] {
  const raw = title.trim();
  if (!raw) return [];

  const lineupPrefixMatch = raw.match(
    /^.+?(?:\bw\/|\binv\.|\binvite\b|\bpres\.|\bpr[ée]sente\b|\bfeat\.?|\bavec\b)\s+(.+)$/i
  );
  let candidate = '';
  let isExplicitLineup = false;

  if (lineupPrefixMatch) {
    candidate = lineupPrefixMatch[1];
    isExplicitLineup = true;
  } else if (raw.includes(':')) {
    const [left, right] = raw.split(/:\s+/, 2);
    const leftLooksLikeEvent =
      /^(?:23:59|thunder|pact|fearz|critical\s+sound|la\s+qlub|saturnales|return|vertiges|karnage|the\s+lost\s+island|koalition|badlands|iii\.|toulouse\s+massive|2much|rave\s+on|girls\s+on\s+rave|bikini\s+house|christmas\s+rave|jingle\s+rave|jetlag|r[ée]veillon|cin[ée]-concert|toulouse\s+django|l['’]organisation)/i.test(
        left.trim()
      ) || /\b(party|rave|festival|edition|[ée]dition|birthday|xxl|club|soir[ée]e|nuit)\b/i.test(left);

    if (leftLooksLikeEvent && right) {
      if (
        /\b(boat\s+party|reggaeton|perreo|ans\s+de\s+musique|dj\s+set|guests|moontrip\s*x\s*interference|hitchcock|flow\s+avec)\b/i.test(
          right
        )
      ) {
        return [];
      }
      candidate = right;
      isExplicitLineup = true;
    } else {
      candidate = left;
    }
  } else {
    candidate = raw;
  }

  if (!isExplicitLineup && GENERIC_EVENT_RE.test(raw) && candidate === raw) {
    return [];
  }

  // Retirer lieu final ("@ Ax-Les-Thermes"), parenthèses et mention "All Night Long / 4H Live / Release Party"
  const stripped = candidate
    .replace(/\s+@\s+.*$/, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+[—–-]\s+(?:all\s+night.*|release\s+party.*|tourn[ée]e.*|tour.*|live.*|en\s+concert.*)$/i, '')
    .replace(/\s+(?:all\s+night(?:\s+long)?|4h\s+live|dj\s*set|release\s+party)\b/gi, '')
    .trim();

  // Découpage intelligent multi-artistes :
  // - toujours sur "+", ",", " b2b ", " vs ", " feat. ", " / "
  // - sur " & " ou " x " uniquement si c'est un line-up explicite ou déjà multi-artistes (préserve "Bigflo & Oli", "Earth, Wind & Fire"...)
  const hasStrongSep = /(?:\s+\+\s+|,\s+|\s+b2b\s+|\s+vs\.?\s+|\s+feat\.?\s+)/i.test(stripped);
  const splitRe =
    isExplicitLineup || hasStrongSep
      ? /(?:\s*\+\s*|,\s*|\s+b2b\s+|\s+vs\.?\s+|\s+feat\.?\s+|\s+&\s+|\s+x\s+)/i
      : /(?:\s*\+\s*|\s+b2b\s+|\s+vs\.?\s+|\s+feat\.?\s+)/i;

  const parts = stripped.split(splitRe);
  const artists: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const clean = part
      .replace(/\s+[—–-]\s+.*$/, '')
      .replace(/\.{2,}$/, '')
      .replace(/^["«“]|["»”]$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!clean || clean.length < 2) continue;
    if (GENERIC_EVENT_RE.test(clean) || GENERIC_TOKEN_RE.test(clean)) continue;
    if (/^\d+\s*(ans|h|€)$/i.test(clean)) continue;

    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      artists.push(clean);
    }
  }

  return artists.slice(0, 12);
}

/**
 * Normalise une chaîne pour la recherche globale :
 * - Supprime les accents (Zénith -> zenith, Métronum -> metronum, Café -> cafe)
 * - Remplace apostrophes, tirets et ponctuation par des espaces (Saint-Pierre -> saint pierre)
 * - Passe en minuscules et compacte les espaces
 */
export function normalizeSearchText(str: string): string {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`\-_./,&:+()]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Vérifie si TOUS les mots de la requête sont présents dans le texte cible
 * (insensible aux accents, à la casse, aux tirets et aux apostrophes :
 * ex. "zenith", "larena", "bikini rock", "saint pierre").
 */
export function matchesSearchQuery(haystack: string, rawQuery: string): boolean {
  const normQuery = normalizeSearchText(rawQuery);
  if (!normQuery) return true;
  const normHaystack = normalizeSearchText(haystack);
  const compactHaystack = normHaystack.replace(/\s+/g, '');
  const tokens = normQuery.split(' ').filter(Boolean);
  return tokens.every((tok) => {
    if (normHaystack.includes(tok)) return true;
    if (tok.length >= 4 && compactHaystack.includes(tok)) return true;
    return false;
  });
}

const GENRE_MATCH_RULES: Record<GenreCategory, RegExp> = {
  'Rock & Indie':
    /\b(rock|indie|post punk|punk|garage|grunge|shoegaze|psyche|britpop|pop rock|alternatif|alternative|stoner|progressif|cold wave|new wave|surf)\b/,
  'Metal & Hardcore':
    /\b(metal|heavy|death|black metal|thrash|doom|metalcore|deathcore|prog metal|hard rock|hardcore|screamo|sludge|grindcore|nu metal|symphonic metal)\b/,
  'Électro & House':
    /\b(electro|house|deep house|tech house|disco|nu disco|synthwave|synthpop|downtempo|ambient|french touch|melodic|electro pop|electronica|minimal|afro house)\b/,
  'Techno & Rave':
    /\b(techno|hard techno|acid|rave|trance|psytrance|hardstyle|uptempo|gabber|drum and bass|drum bass|dnb|dubstep|bass music|hard bounce|bounce|ebm|dark wave|jungle|uk garage|club)\b/,
  'Rap & Hip-Hop':
    /\b(rap|hip hop|trap|drill|boom bap|slam|cloud rap|old school|urbain|mc|freestyle)\b/,
  Pop: /\b(pop|indie pop|electro pop|pop rock|variete|k pop|kpop|synthpop|dream pop|hyperpop|chanson pop)\b/,
  'Chanson & Folk':
    /\b(chanson|folk|acoustique|nouvelle scene|auteur|compositeur|indie folk|americana|country|ballade|guitare voix|chanson francaise)\b/,
  'Jazz & Blues':
    /\b(jazz|blues|swing|manouche|bebop|bossa|improvisation|big band|fusion|nu jazz|jazz rock)\b/,
  'Soul, Funk & R&B':
    /\b(soul|funk|groove|rnb|r n b|r b|neo soul|motown|afrobeat|gospel|disco funk)\b/,
  'Reggae & Dub':
    /\b(reggae|dub|ska|dancehall|roots|sound system|rocksteady|ragga)\b/,
  'Musiques du Monde':
    /\b(world|monde|latino|latin|salsa|cumbia|flamenco|oriental|gnawa|balkan|celtique|afro|maloya|kora|occitan|traditionnel|trad|bresil|tango|fado|espagnol|andalou|raï|rai|rumba)\b/,
  'Classique & Opéra':
    /\b(classique|opera|symphonique|lyrique|baroque|recital|orchestre|philharmonique|cine concert|quatuor|chambre|piano|violon|harpe|choral|conservatoire|orgue)\b/,
};

/**
 * Vérifie si un concert ou festival correspond à un genre musical sélectionné :
 * matche soit la catégorie principale, soit les sous-genres / tags associés
 * (ex: un concert "Pop Rock" apparaît dans Pop ET dans Rock & Indie).
 */
export function matchesGenreCategory(
  item: { category?: string; genres?: string[]; title?: string; subtitle?: string },
  selectedCategory: GenreCategory | 'all'
): boolean {
  if (selectedCategory === 'all') return true;
  if (item.category === selectedCategory) return true;
  const tagText = normalizeSearchText(
    [...(item.genres || []), item.subtitle || ''].join(' ')
  );
  const rule = GENRE_MATCH_RULES[selectedCategory];
  if (rule && tagText && rule.test(tagText)) return true;
  return false;
}

/**
 * Vérifie si un titre de concert (ou un line-up) correspond à un artiste suivi.
 * Utilise des frontières de mots après normalisation sans accents pour éviter les faux positifs
 * (ex. "Air" ne matche pas "Clair", mais "Florent Pagny" matche "Florent Pagny — Tournée").
 */
export function matchesFollowedArtist(text: string, artistName: string): boolean {
  const normArtist = normalizeSearchText(artistName);
  if (!normArtist || normArtist.length < 2) return false;
  const normText = normalizeSearchText(text);
  if (!normText) return false;
  const escaped = normArtist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(normText);
}

/** Extrait le premier artiste écoutable (rétro-compatibilité) */
export function extractListenArtist(title: string): string | null {
  return extractListenArtists(title)[0] || null;
}

/** Nettoie le titre d'un concert pour la recherche d'artiste (alias rétro-compatible) */
export function cleanArtistQuery(title: string): string {
  return extractListenArtists(title)[0] || title;
}

/** Nombre de jours restants avant un concert (>= 0 si aujourd'hui ou futur) */
export function daysUntilConcert(dateIso: string, todayIso: string): number {
  const [ya, ma, da] = todayIso.split('-').map(Number);
  const [yb, mb, db] = dateIso.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
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
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-P7D',
    `DESCRIPTION:${escape(`Rappel J-7 : ${concert.title} au ${venue.shortName} dans 1 semaine — pense à tes places !`)}`,
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT3H',
    `DESCRIPTION:${escape(`Ce soir à ${concert.time} : ${concert.title} (${venue.shortName})`)}`,
    'END:VALARM',
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

/**
 * Nombre de jours entiers écoulés depuis un instant ISO (fuseau de Paris).
 * Utilisé pour signaler un agenda qui n'est plus actualisé.
 */
export function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}
