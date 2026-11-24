import { TODAY_ISO, type GenreCategory } from './toulouseData';

export type FestivalZone = 'toulouse' | 'near' | 'occitanie';

export type FestivalStatus =
  | 'available'
  | 'early-bird'
  | 'last-tickets'
  | 'sold-out'
  | 'free'
  | 'upcoming-tba';

export interface FestivalArtist {
  name: string;
  day?: string; // ex. "Jeu. 8 juil."
  genre?: string;
}

export interface FestivalPreviousEdition {
  year: number;
  highlights: string[];
  attendance?: string;
}

export interface Festival {
  id: string;
  name: string;
  tagline: string;
  editionYear: number;
  editionNumber?: number;
  startDate: string; // YYYY-MM-DD (officiel ou estimé si datesConfirmed === false)
  endDate: string; // YYYY-MM-DD
  datesConfirmed: boolean;
  typicalPeriod: string; // ex. "Fin août", "Mi-juin"
  city: string;
  departmentCode: string; // ex. "31", "81", "30", "11", "34", "32", "82", "66", "46"
  departmentName: string;
  venueName: string;
  address: string;
  lat: number;
  lng: number;
  zone: FestivalZone;
  distanceFromToulouse: string; // ex. "Sur place · Tram T1", "55 min (A68 / TER)"
  driveMinutes: number;
  category: GenreCategory;
  genres: string[];
  price?: string;
  status: FestivalStatus;
  accentColor: string;
  websiteUrl: string;
  lineup: FestivalArtist[];
  previousEdition: FestivalPreviousEdition;
  statusVerifiedAt?: string;
}

function shiftIsoYear(iso: string, yearsToAdd: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y + yearsToAdd}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Moteur évolutif annuel :
 * Dès que la date de fin d'une édition est dépassée (endDate < todayIso),
 * le festival bascule automatiquement sur l'édition suivante (année + 1)
 * en archivant son ancien line-up comme référence et en passant ses dates en "À confirmer".
 */
export function rollFestivalToActiveEdition(
  festival: Festival,
  todayIso: string = TODAY_ISO
): Festival {
  let current = { ...festival };
  let guard = 0;

  while (current.endDate < todayIso && guard < 5) {
    const archivedHighlights =
      current.lineup.length > 0
        ? current.lineup.map((a) => a.name).slice(0, 10)
        : current.previousEdition.highlights;

    current = {
      ...current,
      editionYear: current.editionYear + 1,
      editionNumber: current.editionNumber ? current.editionNumber + 1 : undefined,
      startDate: shiftIsoYear(current.startDate, 1),
      endDate: shiftIsoYear(current.endDate, 1),
      datesConfirmed: false,
      status: current.status === 'free' ? 'free' : 'upcoming-tba',
      lineup: [],
      previousEdition: {
        year: current.editionYear,
        highlights: archivedHighlights,
        attendance: current.previousEdition.attendance,
      },
    };
    guard += 1;
  }

  return current;
}

export function formatFestivalDates(festival: Festival): string {
  const monthsShort = [
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
  if (!festival.datesConfirmed) {
    return `${festival.typicalPeriod} ${festival.editionYear} (à confirmer)`;
  }
  const [ys, ms, ds] = festival.startDate.split('-').map(Number);
  const [ye, me, de] = festival.endDate.split('-').map(Number);
  if (ms === me && ys === ye) {
    return `${ds} → ${de} ${monthsShort[ms - 1]} ${ys}`;
  }
  return `${ds} ${monthsShort[ms - 1]} → ${de} ${monthsShort[me - 1]} ${ye}`;
}

export function downloadFestivalIcs(festival: Festival) {
  const fmt = (iso: string) => iso.replace(/-/g, '');
  // ICS all-day DTEND is exclusive (+1 day)
  const [ey, em, ed] = festival.endDate.split('-').map(Number);
  const endNext = new Date(Date.UTC(ey, em - 1, ed + 1));
  const dtEnd = `${endNext.getUTCFullYear()}${String(endNext.getUTCMonth() + 1).padStart(2, '0')}${String(
    endNext.getUTCDate()
  ).padStart(2, '0')}`;

  const escape = (str: string) =>
    str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  const artistsPreview =
    festival.lineup.length > 0
      ? `Line-up ${festival.editionYear} : ${festival.lineup.map((a) => a.name).join(', ')}. `
      : '';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Scene Rose Toulouse//Festivals Occitanie//FR',
    'BEGIN:VEVENT',
    `UID:${festival.id}-${festival.editionYear}@scenerose.toulouse`,
    `DTSTART;VALUE=DATE:${fmt(festival.startDate)}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${escape(`${festival.name} ${festival.editionYear}`)}`,
    `LOCATION:${escape(`${festival.venueName}, ${festival.address}`)}`,
    `DESCRIPTION:${escape(`${artistsPreview}${festival.tagline} — Site officiel : ${festival.websiteUrl}`)}`,
    `URL:${festival.websiteUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${festival.id}-${festival.editionYear}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Catalogue vérifié des grands festivals de musique à Toulouse & en Occitanie (2027)
 * Chaque fiche embarque ses dates 2027 officielles ou estimées d'après 2026 + son line-up
 * et bascule automatiquement sur l'édition suivante une fois les dates passées.
 */
export const FESTIVALS: Festival[] = [
  // ================= TOULOUSE & HAUTE-GARONNE (31) =================
  {
    id: 'echos-et-merveilles',
    name: 'Échos & Merveilles',
    tagline: 'Musiques médiévales, celtiques, folk & fantasy en plein air au nord de Toulouse.',
    editionYear: 2027,
    startDate: '2027-05-06',
    endDate: '2027-05-09',
    datesConfirmed: false,
    typicalPeriod: 'Début mai',
    city: 'Bruguières',
    departmentCode: '31',
    departmentName: 'Haute-Garonne',
    venueName: 'Parc du Bascala',
    address: '12 Rue de la Briqueterie, 31150 Bruguières',
    lat: 43.7245,
    lng: 1.4126,
    zone: 'toulouse',
    distanceFromToulouse: '20 min · Nord Toulouse',
    driveMinutes: 20,
    category: 'Chanson & Folk',
    genres: ['Folk', 'Celtique', 'Médiéval', 'Metal Folk'],
    price: 'Dès 25 €',
    status: 'upcoming-tba',
    accentColor: '#10B981',
    websiteUrl: 'https://www.echosetmerveilles.com/',
    lineup: [],
    previousEdition: {
      year: 2026,
      highlights: ['Luc Arbogast', 'Skáld', 'Cécile Corbel', 'Naheulband', 'Corvus Corax'],
      attendance: '25 000+ festivaliers',
    },
  },
  {
    id: 'rio-loco',
    name: 'Festival Rio Loco · Noctiluca',
    tagline: '32e édition du grand festival des musiques du monde sur les bords de Garonne.',
    editionYear: 2027,
    editionNumber: 32,
    startDate: '2027-06-09',
    endDate: '2027-06-13',
    datesConfirmed: true,
    typicalPeriod: 'Mi-juin',
    city: 'Toulouse',
    departmentCode: '31',
    departmentName: 'Haute-Garonne',
    venueName: 'Prairie des Filtres',
    address: 'Cours Dillon, 31300 Toulouse',
    lat: 43.5979,
    lng: 1.4378,
    zone: 'toulouse',
    distanceFromToulouse: 'Sur place · Métro A / Tram T1',
    driveMinutes: 5,
    category: 'Musiques du Monde',
    genres: ['Musiques du monde', 'Groove', 'Électro World', 'Afrobeat'],
    price: 'Dès 12 €',
    status: 'upcoming-tba',
    accentColor: '#F59E0B',
    websiteUrl: 'https://rio-loco.org/',
    lineup: [],
    previousEdition: {
      year: 2026,
      highlights: ['Danyel Waro', 'Oumou Sangaré', 'Flavia Coelho', 'Bonga', 'BCUC', 'Lindigo'],
      attendance: '100 000+ spectateurs',
    },
  },
  {
    id: 'les-siestes-electroniques',
    name: 'Les Siestes Électroniques',
    tagline: 'Festival gratuit dédié aux musiques électroniques aventureuses et découvertes au Jardin Compans.',
    editionYear: 2027,
    startDate: '2027-06-24',
    endDate: '2027-06-27',
    datesConfirmed: false,
    typicalPeriod: 'Fin juin',
    city: 'Toulouse',
    departmentCode: '31',
    departmentName: 'Haute-Garonne',
    venueName: 'Jardin Compans-Caffarelli',
    address: 'Boulevard Lascrosses, 31000 Toulouse',
    lat: 43.6114,
    lng: 1.4337,
    zone: 'toulouse',
    distanceFromToulouse: 'Sur place · Métro B Compans',
    driveMinutes: 5,
    category: 'Électro & House',
    genres: ['Électro', 'Ambient', 'Expérimental', 'Club'],
    price: 'Gratuit',
    status: 'free',
    accentColor: '#8B5CF6',
    websiteUrl: 'https://les-siestes.com/',
    lineup: [],
    previousEdition: {
      year: 2026,
      highlights: ['Azu Tiwaline', 'Bambii', 'Marina Herlop', 'Simo Cell', 'OK Williams'],
      attendance: 'Entrée libre · 4 jours',
    },
  },
  {
    id: 'rose-festival',
    name: 'Rose Festival',
    tagline: '6e édition au MEETT par Bigflo & Oli : rap, pop, électro & scénographies XXL.',
    editionYear: 2027,
    editionNumber: 6,
    startDate: '2027-08-26',
    endDate: '2027-08-28',
    datesConfirmed: true,
    typicalPeriod: 'Fin août',
    city: 'Toulouse · Aussonne',
    departmentCode: '31',
    departmentName: 'Haute-Garonne',
    venueName: 'MEETT — Parc des Expositions',
    address: 'Concorde Avenue, 31840 Aussonne',
    lat: 43.6694,
    lng: 1.3636,
    zone: 'toulouse',
    distanceFromToulouse: '25 min · Tram T1 MEETT',
    driveMinutes: 25,
    category: 'Rap & Hip-Hop',
    genres: ['Rap', 'Pop', 'Électro', 'Éclectique'],
    price: 'Pass 3j dès 169 €',
    status: 'early-bird',
    accentColor: '#C85A6E',
    websiteUrl: 'https://rosefestival.fr/',
    lineup: [],
    previousEdition: {
      year: 2026,
      highlights: ['Aya Nakamura', 'Macklemore', 'DJ Snake', 'Bigflo & Oli', 'Zaho de Sagazan', 'PLK'],
      attendance: '120 000 festivaliers',
    },
  },
  {
    id: 'pink-paradize-festival',
    name: 'Pink Paradize Festival',
    tagline: 'Ovni culturel toulousain mêlant électro, pop, concerts live et nuits club multi-lieux.',
    editionYear: 2027,
    editionNumber: 13,
    startDate: '2027-10-08',
    endDate: '2027-10-25',
    datesConfirmed: false,
    typicalPeriod: 'Été & Octobre',
    city: 'Toulouse',
    departmentCode: '31',
    departmentName: 'Haute-Garonne',
    venueName: 'Multi-lieux (Bikini, Halle de la Machine, Poney Club)',
    address: 'Toulouse Centre & Périphérie, 31000 Toulouse',
    lat: 43.5718,
    lng: 1.4777,
    zone: 'toulouse',
    distanceFromToulouse: 'Sur place · Multi-salles',
    driveMinutes: 10,
    category: 'Techno & Rave',
    genres: ['Électro', 'Techno', 'Pop', 'Hybride'],
    price: 'Dès 25 €',
    status: 'upcoming-tba',
    accentColor: '#EC4899',
    websiteUrl: 'https://www.pinkparadizefestival.com/',
    lineup: [],
    previousEdition: {
      year: 2026,
      highlights: [
        'Carl Cox',
        'Polo & Pan',
        'MEUTE',
        'Jean-Michel Jarre',
        'Boris Brejcha',
        'Moby',
        'Chilly Gonzales',
        "L'Entourloop",
      ],
      attendance: 'Multi-salles à Toulouse',
    },
  },
  {
    id: 'jazz-sur-son-31',
    name: 'Jazz sur son 31',
    tagline: 'Grand festival départemental de jazz et musiques improvisées dans toute la Haute-Garonne.',
    editionYear: 2027,
    startDate: '2027-10-08',
    endDate: '2027-10-19',
    datesConfirmed: false,
    typicalPeriod: 'Mi-octobre',
    city: 'Toulouse & Haute-Garonne',
    departmentCode: '31',
    departmentName: 'Haute-Garonne',
    venueName: 'Salles partenaires (Nougaro, Taquin, St-Pierre…)',
    address: 'Toulouse & communes du 31',
    lat: 43.6045,
    lng: 1.4442,
    zone: 'toulouse',
    distanceFromToulouse: 'Sur place · Toulouse & 31',
    driveMinutes: 10,
    category: 'Jazz & Blues',
    genres: ['Jazz', 'Swing', 'Soul', 'Musiques improvisées'],
    price: 'Gratuit à 25 €',
    status: 'upcoming-tba',
    accentColor: '#D97706',
    websiteUrl: 'https://cultures.haute-garonne.fr/jazz-sur-son-31',
    lineup: [],
    previousEdition: {
      year: 2025,
      highlights: ['Airelle Besson & Lionel Suarez', 'Amaury Faye', 'Samuel Blaser', 'Oriane Lacaille'],
      attendance: 'Biennale départementale',
    },
  },

  // ================= À MOINS DE 1H30 DE TOULOUSE =================
  {
    id: 'montauban-en-scenes',
    name: 'Montauban en Scènes',
    tagline: '4 soirées festives au Jardin des Plantes + concert exceptionnel de Sting au Stade de Sapiac.',
    editionYear: 2027,
    editionNumber: 12,
    startDate: '2027-06-24',
    endDate: '2027-07-11',
    datesConfirmed: true,
    typicalPeriod: 'Fin juin – mi-juillet',
    city: 'Montauban',
    departmentCode: '82',
    departmentName: 'Tarn-et-Garonne',
    venueName: 'Jardin des Plantes & Stade de Sapiac',
    address: 'Grand Rue Sapiac, 82000 Montauban',
    lat: 44.0112,
    lng: 1.3578,
    zone: 'near',
    distanceFromToulouse: '45 min (A62 / 30 min TER)',
    driveMinutes: 45,
    category: 'Pop',
    genres: ['Pop', 'Rock', 'Électro', 'Reggae'],
    price: 'Dès 45 € · Pass dispo',
    status: 'available',
    accentColor: '#3B82F6',
    websiteUrl: 'https://www.montauban-en-scenes.fr/',
    lineup: [
      { name: 'Skip the Use', day: 'Jeu. 24 juin', genre: 'Rock' },
      { name: 'Suzane', day: 'Jeu. 24 juin', genre: 'Électro Pop' },
      { name: 'Mosimann', day: 'Jeu. 24 juin', genre: 'Électro' },
      { name: 'Magic System', day: 'Ven. 25 juin', genre: 'Afropop' },
      { name: 'Lucenzo', day: 'Ven. 25 juin', genre: 'Latino' },
      { name: 'Matt Houston', day: 'Ven. 25 juin', genre: 'R&B' },
      { name: 'Billy Crawford', day: 'Ven. 25 juin', genre: 'Pop R&B' },
      { name: 'Shaggy', day: 'Sam. 26 juin', genre: 'Reggae Dancehall' },
      { name: 'Zaho', day: 'Sam. 26 juin', genre: 'R&B' },
      { name: 'Tété', day: 'Sam. 26 juin', genre: 'Chanson Folk' },
      { name: 'Imany', day: 'Dim. 27 juin', genre: 'Soul Folk' },
      { name: 'Sting', day: 'Dim. 11 juil. (Sapiac)', genre: 'Rock Pop' },
    ],
    previousEdition: {
      year: 2026,
      highlights: ['Skip the Use', 'Suzane', 'Shaggy', 'Sting'],
      attendance: '40 000+ festivaliers',
    },
  },
  {
    id: 'pause-guitare-albi',
    name: 'Festival Pause Guitare',
    tagline: '31e édition à Albi : grande scène de Pratgraussals + concerts gratuits devant la cathédrale.',
    editionYear: 2027,
    editionNumber: 31,
    startDate: '2027-07-07',
    endDate: '2027-07-11',
    datesConfirmed: true,
    typicalPeriod: 'Début juillet',
    city: 'Albi',
    departmentCode: '81',
    departmentName: 'Tarn',
    venueName: 'Base de loisirs de Pratgraussals',
    address: 'Rue de Lamothe, 81000 Albi',
    lat: 43.9351,
    lng: 2.1558,
    zone: 'near',
    distanceFromToulouse: '55 min (A68 / TER)',
    driveMinutes: 55,
    category: 'Chanson & Folk',
    genres: ['Chanson', 'Rock', 'Rap', 'Reggae'],
    price: 'Pass & billets ouverts',
    status: 'available',
    accentColor: '#E11D48',
    websiteUrl: 'https://www.pauseguitare.net/',
    lineup: [
      { name: 'Feu! Chatterton', day: 'Jeu. 8 juil.', genre: 'Rock Chanson' },
      { name: 'IDLES', day: 'Jeu. 8 juil.', genre: 'Post-Punk' },
      { name: 'MC Solaar', day: 'Jeu. 8 juil.', genre: 'Rap' },
      { name: 'Youssoupha', day: 'Jeu. 8 juil.', genre: 'Rap' },
      { name: 'UB40', day: 'Ven. 9 juil.', genre: 'Reggae' },
      { name: 'Gaëtan Roussel', day: 'Ven. 9 juil.', genre: 'Pop Rock' },
      { name: 'Christophe Maé', day: 'Ven. 9 juil.', genre: 'Chanson' },
      { name: 'Vianney', day: 'Sam. 10 juil.', genre: 'Pop Chanson' },
      { name: 'Grand Corps Malade', day: 'Sam. 10 juil.', genre: 'Slam' },
      { name: 'Marine', day: 'Sam. 10 juil.', genre: 'Pop' },
    ],
    previousEdition: {
      year: 2026,
      highlights: ['Orelsan', 'Ben Harper', 'The Kooks', 'Jean-Louis Aubert', 'Véronique Sanson', 'Gims'],
      attendance: '65 000 festivaliers',
    },
  },
  {
    id: 'festival-de-carcassonne',
    name: 'Festival de Carcassonne',
    tagline: 'Concerts d’exception en plein air au Théâtre Jean-Deschamps au cœur de la Cité médiévale.',
    editionYear: 2027,
    startDate: '2027-07-04',
    endDate: '2027-07-31',
    datesConfirmed: false,
    typicalPeriod: 'Juillet',
    city: 'Carcassonne',
    departmentCode: '11',
    departmentName: 'Aude',
    venueName: 'Théâtre Jean-Deschamps (La Cité)',
    address: 'Rue Saint-Jean, La Cité, 11000 Carcassonne',
    lat: 43.2063,
    lng: 2.3646,
    zone: 'near',
    distanceFromToulouse: '1h05 (A61 / 50 min TER)',
    driveMinutes: 65,
    category: 'Rock & Indie',
    genres: ['Rock', 'Pop', 'Rap', 'Classique & Off gratuit'],
    price: 'Concerts dès 35 € + 70 shows gratuits',
    status: 'upcoming-tba',
    accentColor: '#F97316',
    websiteUrl: 'https://www.festivaldecarcassonne.fr/',
    lineup: [],
    previousEdition: {
      year: 2026,
      highlights: ['Airbourne', 'Scorpions', 'Sting', 'Gojira', 'Judas Priest', 'Mika'],
      attendance: '200 000 spectateurs',
    },
  },
  {
    id: 'xtreme-fest',
    name: 'Xtreme Fest',
    tagline: 'Le grand rendez-vous punk, hardcore et metal du Sud-Ouest dans le cratère de Cap’Découverte.',
    editionYear: 2027,
    editionNumber: 14,
    startDate: '2027-07-29',
    endDate: '2027-08-01',
    datesConfirmed: false,
    typicalPeriod: 'Fin juillet – début août',
    city: 'Le Garric · Albi',
    departmentCode: '81',
    departmentName: 'Tarn',
    venueName: 'Cap’Découverte',
    address: 'Parc de loisirs Cap’Découverte, 81450 Le Garric',
    lat: 44.0168,
    lng: 2.1636,
    zone: 'near',
    distanceFromToulouse: '1h10 (A68)',
    driveMinutes: 70,
    category: 'Metal & Hardcore',
    genres: ['Punk', 'Hardcore', 'Metal', 'Ska'],
    price: 'Pass 3j ~95 €',
    status: 'upcoming-tba',
    accentColor: '#EF4444',
    websiteUrl: 'https://xtremefest.fr/',
    lineup: [],
    previousEdition: {
      year: 2026,
      highlights: ['Comeback Kid', 'Suicidal Tendencies', 'Lagwagon', 'Madball', 'Tagada Jones', 'Psykup'],
      attendance: 'Cap’Découverte · 3 jours',
    },
  },

  // ================= TOUTE L'OCCITANIE (> 1H30) =================
  {
    id: 'festival-de-nimes',
    name: 'Festival de Nîmes',
    tagline: '30e édition dans les mythiques Arènes romaines : rock international, légendes et rap.',
    editionYear: 2027,
    editionNumber: 30,
    startDate: '2027-06-15',
    endDate: '2027-07-17',
    datesConfirmed: true,
    typicalPeriod: 'Mi-juin – mi-juillet',
    city: 'Nîmes',
    departmentCode: '30',
    departmentName: 'Gard',
    venueName: 'Arènes de Nîmes',
    address: 'Boulevard des Arènes, 30000 Nîmes',
    lat: 43.8349,
    lng: 4.3596,
    zone: 'occitanie',
    distanceFromToulouse: '2h50 (A61/A9)',
    driveMinutes: 170,
    category: 'Rock & Indie',
    genres: ['Rock', 'Metal', 'Rap', 'Pop'],
    price: 'Dès 46 €',
    status: 'available',
    accentColor: '#EA580C',
    websiteUrl: 'https://www.festivaldenimes.com/',
    lineup: [
      { name: 'Slash feat. Myles Kennedy & The Conspirators', day: 'Mar. 15 juin', genre: 'Hard Rock' },
      { name: 'Fontaines D.C.', day: 'Mer. 16 juin', genre: 'Post-Punk' },
      { name: 'Julien Clerc & Laurent Voulzy', day: 'Sam. 19 juin', genre: 'Chanson' },
      { name: 'Queens of the Stone Age', day: 'Mer. 23 juin', genre: 'Stoner Rock' },
      { name: 'Ninho', day: 'Ven. 25 juin', genre: 'Rap' },
      { name: 'Sofiane Pamart', day: 'Sam. 26 juin', genre: 'Piano' },
      { name: 'Christophe Maé', day: 'Jeu. 1 juil.', genre: 'Chanson' },
      { name: 'Vianney', day: 'Ven. 9 juil.', genre: 'Pop' },
      { name: 'Tokio Hotel & Kyo', day: 'Dim. 11 juil.', genre: 'Pop Rock' },
      { name: 'Scorpions', day: 'Jeu. 15 juil.', genre: 'Hard Rock' },
      { name: 'Toto & Christopher Cross', day: 'Sam. 17 juil.', genre: 'Classic Rock' },
    ],
    previousEdition: {
      year: 2026,
      highlights: ['Damso', 'Lenny Kravitz', 'Pixies', 'Sting', 'Feu! Chatterton', 'Sabaton'],
      attendance: '150 000 spectateurs',
    },
  },
  {
    id: 'worldwide-festival-sete',
    name: 'Worldwide Festival Sète',
    tagline: '21e édition du festival culte de Gilles Peterson entre plage et Théâtre de la Mer.',
    editionYear: 2027,
    editionNumber: 21,
    startDate: '2027-07-04',
    endDate: '2027-07-11',
    datesConfirmed: true,
    typicalPeriod: 'Début juillet',
    city: 'Sète',
    departmentCode: '34',
    departmentName: 'Hérault',
    venueName: 'Théâtre de la Mer & Plage du Lido',
    address: 'Promenade Maréchal Leclerc, 34200 Sète',
    lat: 43.3941,
    lng: 3.6946,
    zone: 'occitanie',
    distanceFromToulouse: '2h10 (A61/A9 · 2h Intercités)',
    driveMinutes: 130,
    category: 'Soul, Funk & R&B',
    genres: ['Électro', 'Jazz', 'Soul', 'Afrobeats'],
    price: 'Dès 20 € · Pass semaine',
    status: 'upcoming-tba',
    accentColor: '#06B6D4',
    websiteUrl: 'https://www.worldwidefestival.com/',
    lineup: [],
    previousEdition: {
      year: 2026,
      highlights: ['Gilles Peterson', 'Laurent Garnier', 'Floating Points', 'Ezra Collective', 'Nubya Garcia'],
      attendance: '8 jours face à la mer',
    },
  },
  {
    id: 'les-deferlantes',
    name: 'Les Déferlantes Sud de France',
    tagline: '3 jours de concerts géants au pied du paquebot Le Lydia en bord de Méditerranée.',
    editionYear: 2027,
    startDate: '2027-07-09',
    endDate: '2027-07-11',
    datesConfirmed: true,
    typicalPeriod: 'Mi-juillet',
    city: 'Le Barcarès',
    departmentCode: '66',
    departmentName: 'Pyrénées-Orientales',
    venueName: 'Les Jardins du Lydia',
    address: 'Allée des Arts, 66420 Le Barcarès',
    lat: 42.8271,
    lng: 3.0383,
    zone: 'occitanie',
    distanceFromToulouse: '2h10 (A61/A9)',
    driveMinutes: 130,
    category: 'Pop',
    genres: ['Rap', 'Pop', 'Électro', 'Rock'],
    price: 'Pass 3j bientôt ouverts',
    status: 'upcoming-tba',
    accentColor: '#0EA5E9',
    websiteUrl: 'https://www.festival-lesdeferlantes.com/',
    lineup: [],
    previousEdition: {
      year: 2026,
      highlights: ['Aya Nakamura', 'Damso', 'PLK', 'Sean Paul', 'Timmy Trumpet', 'Mosimann', 'Theodora'],
      attendance: '105 000 spectateurs',
    },
  },
  {
    id: 'jazz-in-marciac',
    name: 'Jazz in Marciac',
    tagline: 'L’un des plus grands festivals de jazz au monde sous chapiteau et sur la place du village.',
    editionYear: 2027,
    editionNumber: 49,
    startDate: '2027-07-23',
    endDate: '2027-08-08',
    datesConfirmed: false,
    typicalPeriod: 'Fin juillet – mi-août',
    city: 'Marciac',
    departmentCode: '32',
    departmentName: 'Gers',
    venueName: 'Chapiteau & Place de l’Hôtel de Ville',
    address: 'Place de l’Hôtel de Ville, 32230 Marciac',
    lat: 43.5245,
    lng: 0.1619,
    zone: 'occitanie',
    distanceFromToulouse: '1h50 (N124)',
    driveMinutes: 110,
    category: 'Jazz & Blues',
    genres: ['Jazz', 'Soul', 'Blues', 'Groove'],
    price: 'Concerts dès 38 € + Festival Bis gratuit',
    status: 'upcoming-tba',
    accentColor: '#CA8A04',
    websiteUrl: 'https://www.jazzinmarciac.com/',
    lineup: [],
    previousEdition: {
      year: 2026,
      highlights: ['Herbie Hancock', 'Ibrahim Maalouf', 'Marcus Miller', 'Gregory Porter', 'Diana Krall', 'Jamie Cullum'],
      attendance: '200 000+ visiteurs',
    },
  },
  {
    id: 'ecaussysteme-gignac',
    name: 'Festival Ecaussystème',
    tagline: 'Festival éco-citoyen et festif au cœur du Lot : reggae, rock, rap, chanson et dub.',
    editionYear: 2027,
    editionNumber: 25,
    startDate: '2027-07-30',
    endDate: '2027-08-01',
    datesConfirmed: true,
    typicalPeriod: 'Fin juillet – début août',
    city: 'Gignac',
    departmentCode: '46',
    departmentName: 'Lot',
    venueName: 'Prairie de Gignac',
    address: 'Lieu-Dit Touron, 46600 Gignac',
    lat: 45.0049,
    lng: 1.4581,
    zone: 'occitanie',
    distanceFromToulouse: '1h50 (A20)',
    driveMinutes: 110,
    category: 'Reggae & Dub',
    genres: ['Reggae', 'Rock', 'Chanson', 'Électro Dub'],
    price: 'Dès 49 € · Pass 3j ~119 €',
    status: 'available',
    accentColor: '#22C55E',
    websiteUrl: 'https://www.ecaussysteme.com/',
    lineup: [],
    previousEdition: {
      year: 2026,
      highlights: ['Dub Inc', 'Chinese Man', 'Ska-P', 'Deluxe', 'Matmatah', 'Groundation'],
      attendance: '35 000 festivaliers',
    },
  },
  {
    id: 'family-piknik',
    name: 'Family Piknik Festival',
    tagline: 'Grand open-air techno, melodic house & électronique près de Montpellier sur 3 scènes.',
    editionYear: 2027,
    startDate: '2027-08-01',
    endDate: '2027-08-02',
    datesConfirmed: false,
    typicalPeriod: 'Début août',
    city: 'Frontignan · Montpellier',
    departmentCode: '34',
    departmentName: 'Hérault',
    venueName: 'Espace Lucien Jean',
    address: 'Rue Marcel Petit, 34110 Frontignan',
    lat: 43.4472,
    lng: 3.7556,
    zone: 'occitanie',
    distanceFromToulouse: '2h15 (A61/A9)',
    driveMinutes: 135,
    category: 'Techno & Rave',
    genres: ['Techno', 'House', 'Melodic Techno', 'Open-Air'],
    price: 'Pass dès 91 €',
    status: 'upcoming-tba',
    accentColor: '#A855F7',
    websiteUrl: 'https://www.familypiknikfestival.com/',
    lineup: [],
    previousEdition: {
      year: 2026,
      highlights: ['Carl Cox', 'Sven Väth', 'Maceo Plex', 'CamelPhat', 'Luciano', 'Miss Monique'],
      attendance: '3 scènes open-air',
    },
  },
  {
    id: 'poney-club-toulouse',
    name: 'Le Poney Club',
    tagline: 'Le plus grand open-air électro & pop-dance de France au bord des pistes de l’aéroport de Toulouse-Blagnac.',
    editionYear: 2027,
    startDate: '2027-06-03',
    endDate: '2027-08-29',
    datesConfirmed: false,
    typicalPeriod: 'Juin → août (tout l’été)',
    city: 'Toulouse · Blagnac',
    departmentCode: '31',
    departmentName: 'Haute-Garonne',
    venueName: 'Poney Club · Aéroport Toulouse-Blagnac (Parking P3)',
    address: 'Aéroport Toulouse-Blagnac, Parking P3, 31700 Blagnac',
    lat: 43.6293,
    lng: 1.3678,
    zone: 'toulouse',
    distanceFromToulouse: '15 min · Navette Aéroport / Tram T1',
    driveMinutes: 15,
    category: 'Électro & House',
    genres: ['Électro', 'House', 'Pop Dance', 'Open-Air'],
    price: 'Dès 20 € / soirée',
    status: 'upcoming-tba',
    accentColor: '#EC4899',
    websiteUrl: 'https://www.poneyclubtoulouse.fr/',
    lineup: [],
    previousEdition: {
      year: 2026,
      highlights: ['Moby', 'Bob Sinclar', 'Bon Entendeur', 'Cerrone', 'Petit Biscuit'],
      attendance: '50+ soirées · 150 000 festivaliers',
    },
  },
  {
    id: 'la-kermesse-festival-toulouse',
    name: 'La Kermesse Festival',
    tagline: '5e édition toulousaine au Poney Club : 3 jours de tubes cultes des années 2000 en plein air.',
    editionYear: 2027,
    editionNumber: 5,
    startDate: '2027-08-13',
    endDate: '2027-08-15',
    datesConfirmed: true,
    typicalPeriod: 'Mi-août (13–15 août)',
    city: 'Toulouse · Blagnac',
    departmentCode: '31',
    departmentName: 'Haute-Garonne',
    venueName: 'Poney Club · Aéroport Toulouse-Blagnac (Parking P3)',
    address: 'Aéroport Toulouse-Blagnac, Parking P3, 31700 Blagnac',
    lat: 43.6293,
    lng: 1.3678,
    zone: 'toulouse',
    distanceFromToulouse: '15 min · Navette Aéroport / Tram T1',
    driveMinutes: 15,
    category: 'Pop',
    genres: ['Années 2000', 'Pop', 'R&B', 'Dance'],
    price: 'Dès 49,39 € / jour',
    status: 'available',
    accentColor: '#F59E0B',
    websiteUrl: 'https://lakermesse.fr/toulouse/',
    lineup: [
      { name: "Keen'V", day: 'Ven. 13 août' },
      { name: 'Gala', day: 'Ven. 13 août' },
      { name: 'L5', day: 'Ven. 13 août' },
      { name: 'PZK', day: 'Ven. 13 août' },
      { name: 'Linkup', day: 'Ven. 13 août' },
      { name: 'Poetic Lover', day: 'Ven. 13 août' },
      { name: 'Faudel', day: 'Ven. 13 août' },
      { name: 'Axel Tony', day: 'Ven. 13 août' },
      { name: 'Kamini', day: 'Ven. 13 août' },
      { name: 'K.Maro', day: 'Sam. 14 août' },
      { name: 'Slaï', day: 'Sam. 14 août' },
      { name: 'Lucenzo', day: 'Sam. 14 août' },
      { name: 'Ménélik', day: 'Sam. 14 août' },
      { name: 'Amine', day: 'Sam. 14 août' },
      { name: 'Jessy Matador', day: 'Sam. 14 août' },
      { name: 'Tribal King', day: 'Sam. 14 août' },
      { name: 'Makassy', day: 'Sam. 14 août' },
      { name: "Shy'm", day: 'Dim. 15 août' },
      { name: 'Passi', day: 'Dim. 15 août' },
      { name: 'Helmut Fritz', day: 'Dim. 15 août' },
      { name: 'Kevin Lyttle', day: 'Dim. 15 août' },
      { name: 'Willy Denzey', day: 'Dim. 15 août' },
      { name: 'Emma Daumas', day: 'Dim. 15 août' },
      { name: 'Marc Antoine', day: 'Dim. 15 août' },
      { name: 'One-T', day: 'Dim. 15 août' },
    ],
    previousEdition: {
      year: 2026,
      highlights: ['K.Maro', 'Tragédie', 'Sheryfa Luna', 'Colonel Reyel', 'Las Ketchup'],
      attendance: '3 jours au Poney Club',
    },
  },
];
