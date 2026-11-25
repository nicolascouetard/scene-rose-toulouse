export type GenreCategory =
  | 'Rock & Indie'
  | 'Metal & Hardcore'
  | 'Électro & House'
  | 'Techno & Rave'
  | 'Rap & Hip-Hop'
  | 'Pop'
  | 'Chanson & Folk'
  | 'Jazz & Blues'
  | 'Soul, Funk & R&B'
  | 'Reggae & Dub'
  | 'Musiques du Monde'
  | 'Classique & Opéra';

export type TicketStatus = 'available' | 'last-tickets' | 'sold-out' | 'free';

export type TransitLine = 'M-A' | 'M-B' | 'T1' | 'Bus';

export interface VenueGeo {
  lat: number;
  lng: number;
  transitLines: TransitLine[];
}

export const VENUE_GEO: Record<string, VenueGeo> = {
  'le-bikini': { lat: 43.5491, lng: 1.4828, transitLines: ['M-B'] },
  'zenith-toulouse': { lat: 43.5993, lng: 1.4086, transitLines: ['T1'] },
  'le-metronum': { lat: 43.6406, lng: 1.4526, transitLines: ['M-B'] },
  interference: { lat: 43.6285, lng: 1.4878, transitLines: ['M-A'] },
  'le-rex': { lat: 43.6119, lng: 1.4375, transitLines: ['M-B'] },
  'la-cabane': { lat: 43.6022, lng: 1.4067, transitLines: ['T1'] },
  'halle-aux-grains': { lat: 43.6003, lng: 1.4544, transitLines: ['M-B'] },
  'le-taquin': { lat: 43.6066, lng: 1.4253, transitLines: ['M-B'] },
  'le-bijou': { lat: 43.5844, lng: 1.4281, transitLines: ['T1'] },
  'casino-barriere': { lat: 43.5754, lng: 1.4342, transitLines: ['Bus'] },
  'le-cri-de-la-mouette': { lat: 43.6094, lng: 1.4256, transitLines: ['M-B'] },
  'opera-capitole': { lat: 43.6045, lng: 1.4442, transitLines: ['M-A'] },
  'auditorium-saint-pierre': { lat: 43.6041, lng: 1.4357, transitLines: ['M-A', 'M-B'] },
  'salle-nougaro': { lat: 43.6197, lng: 1.4054, transitLines: ['Bus'] },
  odyssud: { lat: 43.6352, lng: 1.3845, transitLines: ['T1'] },
  'le-labo-des-arts': { lat: 43.6156, lng: 1.4609, transitLines: ['M-A', 'Bus'] },
  'l-arena': { lat: 43.6511, lng: 1.4206, transitLines: ['M-B', 'Bus'] },
};

export interface VenueSyncLog {
  venueId: string;
  venueName: string;
  sourceUrl: string;
  ok: boolean;
  checkedCount: number;
  soldOutCount: number;
  lastTicketsCount: number;
  freeCount: number;
  statusChanges: number;
  latencyMs: number;
  checkedAt: string;
  note?: string;
}

export interface SyncChange {
  concertId: string;
  title: string;
  venueId: string;
  previousStatus: TicketStatus;
  newStatus: TicketStatus;
  detectedAt: string;
}

export interface SyncMeta {
  lastSyncedAt: string;
  scheduleLabel: string;
  nextScheduledSync: string;
  durationMs: number;
  totalVenues: number;
  syncedVenuesOk: number;
  totalConcerts: number;
  availableCount: number;
  soldOutCount: number;
  lastTicketsCount: number;
  freeCount: number;
  removedPastCount: number;
  removedCancelledCount: number;
  addedCount?: number;
  horizonDate?: string;
  changes: SyncChange[];
  venuesReport: VenueSyncLog[];
}

export interface Venue {
  id: string;
  name: string;
  shortName: string;
  district: string;
  address: string;
  transit: string;
  capacity: string;
  vibe: string;
  websiteUrl: string;
  accentColor: string;
}

export interface Concert {
  id: string;
  title: string;
  subtitle?: string;
  date: string; // YYYY-MM-DD
  endDate?: string; // Optional multi-day event
  time: string; // HHhMM
  venueId: string;
  category: GenreCategory;
  genres: string[];
  price?: string;
  status: TicketStatus;
  statusVerifiedAt?: string; // ISO timestamp from daily sync
  /**
   * Provenance du statut billetterie.
   * `'fallback'` = la date a été confirmée par une source externe (la salle est
   * protégée par un mur anti-robot) : l'existence du concert est fiable, mais le
   * statut Complet / Dernières places est inconnu.
   */
  statusSource?: 'venue' | 'fallback';
  firstSeenAt?: string; // ISO timestamp when first discovered by sync
  poster: string; // Local cached path /posters/...
  sourcePosterUrl: string; // Official venue poster URL fallback
  venueEventUrl: string; // Direct link to concert page on venue website
  featured?: boolean;
  isClubNight?: boolean;
}

export function getTodayParisIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export const TODAY_ISO = getTodayParisIso();

export const GENRE_CATEGORIES: GenreCategory[] = [
  'Rock & Indie',
  'Metal & Hardcore',
  'Électro & House',
  'Techno & Rave',
  'Rap & Hip-Hop',
  'Pop',
  'Chanson & Folk',
  'Jazz & Blues',
  'Soul, Funk & R&B',
  'Reggae & Dub',
  'Musiques du Monde',
  'Classique & Opéra',
];

export const VENUES: Venue[] = [
  {
    id: 'le-bikini',
    name: 'Le Bikini',
    shortName: 'Le Bikini',
    district: 'Ramonville · Canal du Midi',
    address: 'Parc Technologique du Canal, Rue Théodore Monod, 31520 Ramonville-Saint-Agne',
    transit: 'Métro B · Ramonville',
    capacity: '1 500 places',
    vibe: 'Salle mythique rock, rap, metal & nuits électro',
    websiteUrl: 'https://lebikini.com/programmation',
    accentColor: '#C85A6E',
  },
  {
    id: 'zenith-toulouse',
    name: 'Zénith Toulouse Métropole',
    shortName: 'Zénith',
    district: 'Cartoucherie · Rive Gauche',
    address: '11 Avenue Raymond Badiou, 31300 Toulouse',
    transit: 'Tram T1 · Zénith',
    capacity: '11 000 places',
    vibe: 'Grandes tournées nationales, internationales & ciné-concerts',
    websiteUrl: 'https://zenith-toulousemetropole.com/program',
    accentColor: '#F59E0B',
  },
  {
    id: 'le-metronum',
    name: 'Le Metronum',
    shortName: 'Le Metronum',
    district: 'Borderouge',
    address: '2 Rond-Point Madame de Mondonville, 31200 Toulouse',
    transit: 'Métro B · Borderouge',
    capacity: '600 / 200 places',
    vibe: 'SMAC de Toulouse : découvertes, musiques actuelles & scène locale',
    websiteUrl: 'https://lemetronum.fr/evenements/',
    accentColor: '#A855F7',
  },
  {
    id: 'interference',
    name: 'Interference',
    shortName: 'Interference',
    district: 'Balma · Est Toulousain',
    address: '56 Route de Lavaur, 31130 Balma',
    transit: 'Métro A · Balma-Gramont',
    capacity: '1 600 places',
    vibe: 'Concerts rap, metal, variété & clubbing techno XXL',
    websiteUrl: 'https://www.interference-toulouse.fr/programmation',
    accentColor: '#38BDF8',
  },
  {
    id: 'le-rex',
    name: 'Le Rex de Toulouse',
    shortName: 'Le Rex',
    district: 'Compans-Caffarelli',
    address: '15 Avenue Honoré Serres, 31000 Toulouse',
    transit: 'Métro B · Compans-Caffarelli',
    capacity: '400 places',
    vibe: 'Club rock, punk, metal, rap & nuits underground en centre-ville',
    websiteUrl: 'https://www.lerextoulouse.com/fr/programmation/',
    accentColor: '#F43F5E',
  },
  {
    id: 'la-cabane',
    name: 'La Cabane (Cartoucherie)',
    shortName: 'La Cabane',
    district: 'Halles de la Cartoucherie',
    address: '10 Place de la Charte des Libertés Communales, 31300 Toulouse',
    transit: 'Tram T1 · Cartoucherie',
    capacity: '750 places',
    vibe: 'Salle éclectique au cœur des Halles : électro, metal, chanson & festivals',
    websiteUrl: 'https://halles-cartoucherie.fr/la-cabane/',
    accentColor: '#10B981',
  },
  {
    id: 'halle-aux-grains',
    name: 'Halle aux Grains (ONCT)',
    shortName: 'Halle aux Grains',
    district: 'Place Dupuy · Centre',
    address: '1 Place Dupuy, 31000 Toulouse',
    transit: 'Métro B · François Verdier',
    capacity: '2 200 places',
    vibe: 'Résidence de l’Orchestre National du Capitole : symphonique & jazz',
    websiteUrl: 'https://onct.toulouse.fr/agenda/',
    accentColor: '#EAB308',
  },
  {
    id: 'le-taquin',
    name: 'Le Taquin',
    shortName: 'Le Taquin',
    district: 'Amidonniers',
    address: '23 Rue des Amidonniers, 31000 Toulouse',
    transit: 'Métro B · Compans-Caffarelli',
    capacity: '180 places',
    vibe: 'Jazz club incontournable, groove, funk, blues & musiques du monde',
    websiteUrl: 'https://www.le-taquin.fr/concerts-a-venir/',
    accentColor: '#FB923C',
  },
  {
    id: 'le-bijou',
    name: 'Le Bijou',
    shortName: 'Le Bijou',
    district: 'Croix de Pierre',
    address: '123 Avenue de Muret, 31300 Toulouse',
    transit: 'Tram T1 · Croix de Pierre',
    capacity: '130 places',
    vibe: 'Bistrot-concert intimiste dédié à la chanson française & acoustique',
    websiteUrl: 'https://www.le-bijou.net/programmation-lebijou',
    accentColor: '#EC4899',
  },
  {
    id: 'casino-barriere',
    name: 'Casino Barrière Toulouse',
    shortName: 'Casino Barrière',
    district: 'Île du Ramier',
    address: '18 Chemin de la Loge, 31400 Toulouse',
    transit: 'Bus L4 / L5 · Île du Ramier',
    capacity: '1 200 places',
    vibe: 'Grand théâtre assis pour concerts variété, chanson & tournées acoustiques',
    websiteUrl: 'https://www.casinosbarriere.com/fr/toulouse/spectacles-et-animations.html',
    accentColor: '#C084FC',
  },
  {
    id: 'le-cri-de-la-mouette',
    name: 'Péniche Le Cri de la Mouette',
    shortName: 'Cri de la Mouette',
    district: 'Canal de Brienne · Compans',
    address: '78 Allée de Barcelone, 31000 Toulouse',
    transit: 'Métro B · Compans-Caffarelli',
    capacity: '220 places',
    vibe: 'Péniche-club emblématique sur le canal : techno, house, dark wave & hard bounce',
    websiteUrl: 'https://shotgun.live/fr/venues/le-cri-de-la-mouette',
    accentColor: '#06B6D4',
  },
  {
    id: 'opera-capitole',
    name: 'Opéra National du Capitole',
    shortName: 'Opéra Capitole',
    district: 'Place du Capitole · Hyper-centre',
    address: 'Place du Capitole, 31000 Toulouse',
    transit: 'Métro A · Capitole',
    capacity: '1 150 places',
    vibe: 'Maison lyrique historique : opéras, récitals, musique baroque & concerts',
    websiteUrl: 'https://opera.toulouse.fr/agenda/',
    accentColor: '#D97706',
  },
  {
    id: 'auditorium-saint-pierre',
    name: 'Auditorium Saint-Pierre-des-Cuisines',
    shortName: 'St-Pierre-des-Cuisines',
    district: 'Saint-Pierre · Garonne',
    address: '12 Place Saint-Pierre, 31000 Toulouse',
    transit: 'Métro A · Capitole / B · Compans',
    capacity: '400 places',
    vibe: 'Ancienne église à l’acoustique d’exception : symphonique, chambre, jazz & ciné-concerts',
    websiteUrl: 'https://conservatoire.toulouse.fr/agenda/',
    accentColor: '#14B8A6',
  },
  {
    id: 'salle-nougaro',
    name: 'Salle Nougaro',
    shortName: 'Salle Nougaro',
    district: 'Sept Deniers · Garric',
    address: '20 Chemin de Garric, 31200 Toulouse',
    transit: 'Bus L1 · Sept Deniers / Salvador Dali',
    capacity: '380 places',
    vibe: 'Salle chaleureuse dédiée à la chanson française, jazz, blues & musiques du monde',
    websiteUrl: 'https://sallenougaro.com/programmation/',
    accentColor: '#F97316',
  },
  {
    id: 'odyssud',
    name: 'Odyssud (Blagnac)',
    shortName: 'Odyssud',
    district: 'Blagnac · Toulouse Métropole',
    address: '4 Avenue du Parc, 31700 Blagnac',
    transit: 'Tram T1 · Odyssud-Ritouret',
    capacity: '1 000 places',
    vibe: 'Grande scène culturelle de la métropole : chanson, musiques du monde & récitals',
    websiteUrl: 'https://www.odyssud.com/spectacles/musiques',
    accentColor: '#6366F1',
  },
  {
    id: 'le-labo-des-arts',
    name: 'Le Labo des Arts',
    shortName: 'Labo des Arts',
    district: 'Bonnefoy · Marengo',
    address: '8-10 Rue Clément, 31500 Toulouse',
    transit: 'Métro A · Marengo-SNCF / Bus L9',
    capacity: '250 places',
    vibe: 'Lieu associatif indépendant dédié au rock indie, garage, psyché, post-punk & folk',
    websiteUrl: 'https://billetterie.festik.net/lelabodesarts/',
    accentColor: '#F43F5E',
  },
  {
    id: 'l-arena',
    name: "L'Arena — Arena Electronic Club",
    shortName: "L'Arena",
    district: 'Toulouse Nord · Les Izards / Aucamville',
    address: '26 Allée des Foulques, 31200 Toulouse',
    transit: 'Métro B · La Vache / Navette Compans',
    capacity: '1 500+ places',
    vibe: 'Club & warehouse électro XXL : techno, hardcore, hardstyle, uptempo & nuits rave',
    websiteUrl: 'https://shotgun.live/fr/venues/arena',
    accentColor: '#22D3EE',
  },
];



/**
 * Affiches de secours (fallback hors-ligne / premier rendu).
 * Chargées à la demande via `import()` : le catalogue complet (468 dates, ~80 Ko)
 * vit dans public/data/concerts.json et n'est donc plus dupliqué dans le bundle JS.
 */
let bundledConcertsPromise: Promise<Concert[]> | null = null;

export function loadBundledConcerts(): Promise<Concert[]> {
  if (!bundledConcertsPromise) {
    bundledConcertsPromise = loadRawConcerts().then((raw) =>
      [...raw].sort((a, b) => {
        const dateDiff = a.date.localeCompare(b.date);
        if (dateDiff !== 0) return dateDiff;
        return a.time.localeCompare(b.time);
      })
    );
  }
  return bundledConcertsPromise;
}

async function loadRawConcerts(): Promise<Concert[]> {
  const mod = await import('./concertsFallback');
  return mod.RAW_CONCERTS;
}


