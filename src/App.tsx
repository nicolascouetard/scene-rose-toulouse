import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Building2,
  Calendar,
  ExternalLink,
  Heart,
  LayoutGrid,
  List,
  Mail,
  Map as MapIcon,
  MapPin,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tent,
  UserCheck,
  WifiOff,
  X,
} from 'lucide-react';
import {
  CONCERTS as BUNDLED_CONCERTS,
  GENRE_CATEGORIES,
  TODAY_ISO,
  VENUE_GEO,
  VENUES as BUNDLED_VENUES,
  type Concert,
  type GenreCategory,
  type SyncMeta,
  type TransitLine,
  type Venue,
} from './data/toulouseData';
import {
  FESTIVALS as BUNDLED_FESTIVALS,
  rollFestivalToActiveEdition,
  type Festival,
} from './data/festivalsData';
import {
  daysUntilConcert,
  formatDayHeader,
  formatMonthChip,
  formatSyncTime,
  isRecentlyAdded,
  matchesBudget,
  matchesFollowedArtist,
  matchesPeriod,
  matchesSearchQuery,
  normalizeSearchText,
  type BudgetFilter,
  type EventFormatFilter,
  type PeriodFilter,
} from './utils/dates';
import { FeaturedCarousel } from './components/FeaturedCarousel';
import { ConcertCard } from './components/ConcertCard';
import { ConcertDetailSheet } from './components/ConcertDetailSheet';
import { NewsletterSheet } from './components/NewsletterSheet';
import { VenuesView } from './components/VenuesView';
import { FavoritesView } from './components/FavoritesView';
import { SyncStatusSheet } from './components/SyncStatusSheet';
import { AdvancedFiltersSheet } from './components/AdvancedFiltersSheet';
import { ToulouseMapView } from './components/ToulouseMapView';
import { FestivalsView } from './components/FestivalsView';
import { FestivalDetailSheet } from './components/FestivalDetailSheet';
import { AboutRgpdSheet } from './components/AboutRgpdSheet';
import {
  CalendarPickerSheet,
  type CalendarSelection,
} from './components/CalendarPickerSheet';

type Tab = 'agenda' | 'festivals' | 'map' | 'venues' | 'favorites';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const PERIOD_OPTIONS: { id: PeriodFilter; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'today', label: "Aujourd'hui" },
  { id: 'week', label: '7 jours' },
  { id: 'weekend', label: 'Week-end' },
  { id: 'upcoming2027', label: '2027' },
];

const FAVORITES_KEY = 'scene_rose_toulouse_favorites_v1';
const FESTIVAL_FAVORITES_KEY = 'scene_rose_occitanie_festivals_v1';
const FAVORITE_ARTISTS_KEY = 'scene_rose_favorite_artists_v1';
const FAV_ALERT_EMAIL_KEY = 'scene_rose_fav_alert_email_v1';

export function App() {
  const [venues, setVenues] = useState<Venue[]>(BUNDLED_VENUES);
  const [concerts, setConcerts] = useState<Concert[]>(BUNDLED_CONCERTS);
  const [selectedFestival, setSelectedFestival] = useState<Festival | null>(null);
  const [favoriteFestivals, setFavoriteFestivals] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(FESTIVAL_FAVORITES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [favoriteArtists, setFavoriteArtists] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(FAVORITE_ARTISTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const modalHistoryPushedRef = useRef(false);
  const closingFromPopstateRef = useRef(false);
  const [favAlertEmail, setFavAlertEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem(FAV_ALERT_EMAIL_KEY) || null;
    } catch {
      return null;
    }
  });

  const handleSaveFavAlertEmail = (email: string | null) => {
    setFavAlertEmail(email);
    try {
      if (email) localStorage.setItem(FAV_ALERT_EMAIL_KEY, email);
      else localStorage.removeItem(FAV_ALERT_EMAIL_KEY);
    } catch {
      // ignore
    }
  };

  // Festivals automatiquement maintenus à jour d'année en année (2027 -> 2028...)
  const activeFestivals = useMemo(
    () => BUNDLED_FESTIVALS.map((f) => rollFestivalToActiveEdition(f, TODAY_ISO)),
    []
  );
  const [syncMeta, setSyncMeta] = useState<SyncMeta | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSheetOpen, setSyncSheetOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [pendingDeepConcertId, setPendingDeepConcertId] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('concert');
    } catch {
      return null;
    }
  });

  // PWA & offline state
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalledPwa, setIsInstalledPwa] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  });

  // Shared selection from URL (?selection=id1,id2,...)
  const [sharedSelectionIds, setSharedSelectionIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    const raw = new URLSearchParams(window.location.search).get('selection');
    if (!raw) return [];
    return raw
      .split(',')
      .map((s) => decodeURIComponent(s.trim()))
      .filter(Boolean);
  });

  const [activeTab, setActiveTab] = useState<Tab>('agenda');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [calendarSelection, setCalendarSelection] = useState<CalendarSelection | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<GenreCategory | 'all'>('all');
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([]);
  const [selectedTransit, setSelectedTransit] = useState<TransitLine[]>([]);
  const [eventFormat, setEventFormat] = useState<EventFormatFilter>('all');
  const [budget, setBudget] = useState<BudgetFilter>('all');
  const [hideSoldOut, setHideSoldOut] = useState(false);
  const [onlyNew, setOnlyNew] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedConcert, setSelectedConcert] = useState<Concert | null>(null);
  const [newsletterOpen, setNewsletterOpen] = useState(false);
  const [newsletterTab, setNewsletterTab] = useState<'subscribe' | 'privacy'>('subscribe');
  const [toast, setToast] = useState<string | null>(null);

  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      // Ignore storage errors
    }
  }, [favorites]);

  useEffect(() => {
    try {
      localStorage.setItem(FESTIVAL_FAVORITES_KEY, JSON.stringify(favoriteFestivals));
    } catch {
      // Ignore storage errors
    }
  }, [favoriteFestivals]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITE_ARTISTS_KEY, JSON.stringify(favoriteArtists));
    } catch {
      // Ignore storage errors
    }
  }, [favoriteArtists]);

  // Ferme le menu Paramètres (header) au clic extérieur ou Échap
  useEffect(() => {
    if (!settingsMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        settingsMenuRef.current &&
        !settingsMenuRef.current.contains(e.target as Node)
      ) {
        setSettingsMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [settingsMenuOpen]);

  // Gestion native du bouton Retour (Android / geste bord iOS / navigateur) :
  // Ferme proprement une fiche ou modale ouverte au lieu de quitter la PWA
  const isAnyOverlayOpen = Boolean(
    selectedConcert ||
      selectedFestival ||
      filtersOpen ||
      calendarOpen ||
      syncSheetOpen ||
      newsletterOpen ||
      aboutOpen
  );

  useEffect(() => {
    const onPopState = () => {
      if (!modalHistoryPushedRef.current) return;
      modalHistoryPushedRef.current = false;
      closingFromPopstateRef.current = true;
      setSelectedConcert(null);
      setSelectedFestival(null);
      setFiltersOpen(false);
      setCalendarOpen(false);
      setSyncSheetOpen(false);
      setNewsletterOpen(false);
      setAboutOpen(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (isAnyOverlayOpen) {
      if (!modalHistoryPushedRef.current) {
        window.history.pushState({ sceneRoseOverlay: true }, '');
        modalHistoryPushedRef.current = true;
      }
    } else {
      if (closingFromPopstateRef.current) {
        closingFromPopstateRef.current = false;
      } else if (modalHistoryPushedRef.current) {
        modalHistoryPushedRef.current = false;
        if (window.history.state?.sceneRoseOverlay) {
          window.history.back();
        }
      }
    }
  }, [isAnyOverlayOpen]);

  // Listen to online/offline & PWA install prompt
  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalledPwa(true);
      setInstallPrompt(null);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // Détection paramètres URL (?subscribed=1, ?tab=festivals|map|venues|favorites, ?festival=id)
    try {
      const params = new URLSearchParams(window.location.search);
      let mutated = false;
      if (params.get('subscribed') === '1') {
        setToast('Inscription à l’alerte hebdo confirmée !');
        params.delete('subscribed');
        mutated = true;
      }
      const tabParam = params.get('tab');
      if (tabParam && ['agenda', 'festivals', 'map', 'venues', 'favorites'].includes(tabParam)) {
        setActiveTab(tabParam as Tab);
      }
      const festParam = params.get('festival');
      if (festParam) {
        const foundFest = activeFestivals.find((f) => f.id === festParam);
        if (foundFest) {
          setActiveTab('festivals');
          setSelectedFestival(foundFest);
        }
      }
      if (mutated) {
        const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
        window.history.replaceState({}, '', nextUrl);
      }
    } catch {
      // ignore
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Résolution deep-link ?concert=<id> dès que le catalogue live est hydraté
  useEffect(() => {
    if (!pendingDeepConcertId) return;
    const found = concerts.find((c) => c.id === pendingDeepConcertId);
    if (found) {
      setSelectedConcert(found);
      setPendingDeepConcertId(null);
    }
  }, [concerts, pendingDeepConcertId]);

  // Hydrate live synced JSON (works with Vite /api/concerts, static /data/concerts.json, and offline SW cache)
  useEffect(() => {
    let cancelled = false;
    const loadSyncedData = async () => {
      for (const endpoint of ['/api/concerts', '/data/concerts.json']) {
        try {
          const res = await fetch(endpoint, { cache: 'no-store' });
          if (!res.ok) continue;
          const data = await res.json();
          if (!cancelled && Array.isArray(data.concerts) && data.concerts.length > 0) {
            if (Array.isArray(data.venues) && data.venues.length > 0) setVenues(data.venues);
            setConcerts(data.concerts);
            if (data.syncMeta) setSyncMeta(data.syncMeta);
            return;
          }
        } catch {
          // Try next source
        }
      }
    };
    loadSyncedData();
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const handleInstallPwa = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      showToast('Scène Rose installée sur ton écran d’accueil !');
      setInstallPrompt(null);
    }
  };

  const triggerLiveSync = async () => {
    if (isSyncing) return;
    if (isOffline) {
      showToast('Mode hors-ligne : reconnecte-toi pour actualiser');
      return;
    }

    setIsSyncing(true);
    try {
      // 1. Essayer le scraping en direct si le serveur Node/Vite est actif
      const liveRes = await fetch('/api/sync', { method: 'POST' });
      const contentType = liveRes.headers.get('content-type') || '';
      if (liveRes.ok && contentType.includes('application/json')) {
        const data = await liveRes.json();
        if (Array.isArray(data.venues) && data.venues.length > 0) setVenues(data.venues);
        if (Array.isArray(data.concerts) && data.concerts.length > 0) setConcerts(data.concerts);
        if (data.syncMeta) {
          setSyncMeta(data.syncMeta);
          const changesCount = data.syncMeta.changes?.length || 0;
          const added = data.syncMeta.addedCount || 0;
          showToast(
            added > 0
              ? `Sync en direct · +${added} nouvelle${added > 1 ? 's' : ''} date${added > 1 ? 's' : ''}`
              : changesCount > 0
                ? `Sync en direct · ${changesCount} statut${changesCount > 1 ? 's' : ''} mis à jour`
                : `Sync en direct · ${data.syncMeta.syncedVenuesOk}/${data.syncMeta.totalVenues} salles vérifiées`
          );
        }
        return;
      }

      // 2. En hébergement statique (Cloudflare Pages / Vercel) : forcer le rechargement frais du dernier concerts.json
      const staticRes = await fetch(`/data/concerts.json?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!staticRes.ok) throw new Error('Données indisponibles');
      const staticData = await staticRes.json();
      if (Array.isArray(staticData.venues) && staticData.venues.length > 0) {
        setVenues(staticData.venues);
      }
      if (Array.isArray(staticData.concerts) && staticData.concerts.length > 0) {
        setConcerts(staticData.concerts);
      }
      if (staticData.syncMeta) {
        setSyncMeta(staticData.syncMeta);
        showToast(
          `Agenda à jour · synchro auto du ${formatSyncTime(staticData.syncMeta.lastSyncedAt)}`
        );
      } else {
        showToast('Agenda actualisé !');
      }
    } catch {
      showToast('Impossible de joindre le serveur pour le moment');
    } finally {
      setIsSyncing(false);
    }
  };

  const venueMap = useMemo<Record<string, Venue>>(() => {
    const map: Record<string, Venue> = {};
    for (const v of venues) map[v.id] = v;
    return map;
  }, [venues]);

  const venueCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const c of concerts) counts[c.venueId] = (counts[c.venueId] || 0) + 1;
    return counts;
  }, [concerts]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const exists = prev.includes(id);
      showToast(exists ? 'Retiré des favoris' : 'Ajouté aux favoris');
      return exists ? prev.filter((item) => item !== id) : [...prev, id];
    });
  };

  const toggleFavoriteFestival = (id: string) => {
    setFavoriteFestivals((prev) => {
      const exists = prev.includes(id);
      showToast(exists ? 'Festival retiré des favoris' : 'Festival suivi dans tes favoris');
      return exists ? prev.filter((item) => item !== id) : [...prev, id];
    });
  };

  const addFavoriteArtist = (rawName: string) => {
    const cleaned = rawName.replace(/[|\r\n<>]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length < 2) return;
    const norm = normalizeSearchText(cleaned);
    setFavoriteArtists((prev) => {
      if (prev.some((a) => normalizeSearchText(a) === norm)) {
        showToast(`Tu suis déjà « ${cleaned} »`);
        return prev;
      }
      showToast(`Artiste suivi : ${cleaned}`);
      return [cleaned, ...prev].slice(0, 40);
    });
  };

  const removeFavoriteArtist = (artistName: string) => {
    const norm = normalizeSearchText(artistName);
    setFavoriteArtists((prev) =>
      prev.filter((a) => normalizeSearchText(a) !== norm)
    );
    showToast(`« ${artistName} » retiré de tes artistes suivis`);
  };

  const toggleFavoriteArtist = (artistName: string) => {
    const norm = normalizeSearchText(artistName);
    const exists = favoriteArtists.some((a) => normalizeSearchText(a) === norm);
    if (exists) removeFavoriteArtist(artistName);
    else addFavoriteArtist(artistName);
  };

  const handleShareSelection = async () => {
    if (favorites.length === 0) return;
    const url = new URL(window.location.href);
    url.searchParams.set('selection', favorites.join(','));
    const shareUrl = url.toString();
    const shareText = `Ma sélection de ${favorites.length} concert${favorites.length > 1 ? 's' : ''} à Toulouse sur Scène Rose`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Sélection Scène Rose', text: shareText, url: shareUrl });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Lien de partage de ta sélection copié !');
    } catch {
      showToast('Lien de sélection prêt à partager');
    }
  };

  const importSharedSelection = () => {
    const validIds = sharedSelectionIds.filter((id) => concerts.some((c) => c.id === id));
    if (validIds.length === 0) return;
    setFavorites((prev) => Array.from(new Set([...prev, ...validIds])));
    showToast(`${validIds.length} concert${validIds.length > 1 ? 's' : ''} ajouté${validIds.length > 1 ? 's' : ''} à tes favoris !`);
    clearSharedSelection();
  };

  const clearSharedSelection = () => {
    setSharedSelectionIds([]);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('selection');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  };

  const toggleVenueFilter = (venueId: string) => {
    setSelectedVenueIds((prev) =>
      prev.includes(venueId) ? prev.filter((v) => v !== venueId) : [...prev, venueId]
    );
  };

  const toggleTransitFilter = (line: TransitLine) => {
    setSelectedTransit((prev) =>
      prev.includes(line) ? prev.filter((l) => l !== line) : [...prev, line]
    );
  };

  const featuredConcerts = useMemo(() => concerts.filter((c) => c.featured), [concerts]);

  // Concerts filtrés hors date/période (alimente le Calendrier interactif avec les compteurs exacts)
  const nonDateFilteredConcerts = useMemo(() => {
    const q = search.trim();
    const isSharedMode = sharedSelectionIds.length > 0;

    return concerts.filter((concert) => {
      // Ne jamais afficher un concert strictement passé (même entre minuit et la synchro de 06h)
      if ((concert.endDate || concert.date) < TODAY_ISO) return false;
      if (isSharedMode && !sharedSelectionIds.includes(concert.id)) return false;
      if (selectedCategory !== 'all' && concert.category !== selectedCategory) return false;
      if (selectedVenueIds.length > 0 && !selectedVenueIds.includes(concert.venueId)) return false;
      if (selectedTransit.length > 0) {
        const lines = VENUE_GEO[concert.venueId]?.transitLines || [];
        if (!selectedTransit.some((t) => lines.includes(t))) return false;
      }
      if (eventFormat === 'concerts' && concert.isClubNight) return false;
      if (eventFormat === 'club' && !concert.isClubNight) return false;
      if (!matchesBudget(concert, budget)) return false;
      if (hideSoldOut && concert.status === 'sold-out') return false;
      if (onlyNew && !isRecentlyAdded(concert)) return false;

      if (q) {
        const venue = venueMap[concert.venueId];
        const monthLabel = formatMonthChip(concert.date.slice(0, 7));
        const haystack = [
          concert.title,
          concert.subtitle || '',
          concert.category,
          ...concert.genres,
          venue?.name || '',
          venue?.shortName || '',
          venue?.district || '',
          venue?.address || '',
          venue?.transit || '',
          monthLabel,
        ].join(' ');
        if (!matchesSearchQuery(haystack, q)) return false;
      }
      return true;
    });
  }, [
    concerts,
    sharedSelectionIds,
    search,
    selectedCategory,
    selectedVenueIds,
    selectedTransit,
    eventFormat,
    budget,
    hideSoldOut,
    onlyNew,
    venueMap,
  ]);

  // Suggestions rapides de salles quand l'utilisateur tape un nom (ex: "zenith" -> Zénith Toulouse Métropole)
  const matchingVenuesForSearch = useMemo(() => {
    const q = search.trim();
    if (q.length < 2) return [];
    return venues
      .filter((v) =>
        matchesSearchQuery(`${v.name} ${v.shortName} ${v.district} ${v.transit}`, q)
      )
      .slice(0, 4);
  }, [venues, search]);

  // Pour les spectacles multi-dates en cours (ex: opéra 22–29 nov.), la date d'affichage est ramenée à aujourd'hui
  const getEffectiveDate = (c: Concert) =>
    c.date < TODAY_ISO && c.endDate && c.endDate >= TODAY_ISO ? TODAY_ISO : c.date;

  const filteredConcerts = useMemo(() => {
    if (calendarSelection) {
      return nonDateFilteredConcerts.filter((c) => {
        const d = getEffectiveDate(c);
        return d >= calendarSelection.startDate && d <= calendarSelection.endDate;
      });
    }
    return nonDateFilteredConcerts.filter((c) => matchesPeriod(c, period));
  }, [nonDateFilteredConcerts, calendarSelection, period]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, Concert[]>();
    for (const c of filteredConcerts) {
      const displayDate = getEffectiveDate(c);
      const list = map.get(displayDate);
      if (list) list.push(c);
      else map.set(displayDate, [c]);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => ({ date, concerts: list }));
  }, [filteredConcerts]);

  // Count how many advanced filters are active for the badge on "Filtres"
  const advancedFilterCount =
    (eventFormat !== 'all' ? 1 : 0) +
    (budget !== 'all' ? 1 : 0) +
    (hideSoldOut ? 1 : 0) +
    (onlyNew ? 1 : 0) +
    selectedTransit.length +
    selectedVenueIds.length;

  const hasActiveFilters =
    search.trim() !== '' ||
    period !== 'all' ||
    calendarSelection !== null ||
    selectedCategory !== 'all' ||
    advancedFilterCount > 0 ||
    sharedSelectionIds.length > 0;

  const resetFilters = () => {
    setSearch('');
    setPeriod('all');
    setCalendarSelection(null);
    setSelectedCategory('all');
    setSelectedVenueIds([]);
    setSelectedTransit([]);
    setEventFormat('all');
    setBudget('all');
    setHideSoldOut(false);
    setOnlyNew(false);
    if (sharedSelectionIds.length > 0) clearSharedSelection();
  };

  const handleSelectVenueFromAnywhere = (venueId: string) => {
    setSelectedVenueIds([venueId]);
    setCalendarSelection(null);
    setActiveTab('agenda');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Check if any saved favorite has a ticketing alert OR if a followed artist has upcoming concerts
  const favoriteAlertsCount = useMemo(() => {
    const concertAlerts = concerts.filter((c) => {
      if ((c.endDate || c.date) < TODAY_ISO) return false;
      if (favorites.includes(c.id)) {
        if (c.status === 'last-tickets' || c.status === 'sold-out') return true;
        const d = daysUntilConcert(c.date, TODAY_ISO);
        if (d >= 0 && d <= 7) return true;
      }
      if (
        favoriteArtists.length > 0 &&
        favoriteArtists.some((artist) => matchesFollowedArtist(c.title, artist))
      ) {
        return true;
      }
      return false;
    }).length;
    return concertAlerts;
  }, [concerts, favorites, favoriteArtists]);

  const totalFavoritesBadge =
    favorites.length + favoriteFestivals.length + favoriteArtists.length;

  // Auto-sync Brevo favorite alerts silently whenever favorites or followed artists change
  useEffect(() => {
    if (!favAlertEmail) return;
    const timer = window.setTimeout(() => {
      fetch('/api/favorites-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: favAlertEmail,
          favoriteIds: favorites,
          favoriteArtists,
          enabled: true,
          consent: true,
        }),
      }).catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [favorites, favoriteArtists, favAlertEmail]);

  const selectedVenuesObjects = selectedVenueIds
    .map((id) => venueMap[id])
    .filter(Boolean);

  return (
    <div className="min-h-dvh w-full flex justify-center bg-[#09080B]">
      {/* Responsive app shell: mobile-first (<=440px), tablet/half-screen (sm), wide editorial desktop (md/lg/xl) */}
      <div className="relative w-full max-w-[440px] sm:max-w-2xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl min-h-dvh bg-[#0E0D10] sm:border-x sm:border-white/[0.08] sm:shadow-[0_0_80px_rgba(0,0,0,0.75)] flex flex-col">
        {/* Offline Banner */}
        {isOffline && (
          <div className="bg-amber-500/20 border-b border-amber-400/30 px-4 py-1.5 flex items-center justify-center gap-2 text-[11px] font-semibold text-amber-200">
            <WifiOff className="w-3.5 h-3.5" />
            Mode hors-ligne · consultation depuis le cache local
          </div>
        )}

        {/* Sticky Top Header (compact navbar only — frees ~160px of vertical breathing room on desktop!) */}
        <header className="sticky top-0 z-30 bg-[#0E0D10]/94 backdrop-blur-xl border-b border-white/[0.08]">
          <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-2 lg:gap-4">
            <button
              type="button"
              onClick={() => {
                setActiveTab('agenda');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-2.5 text-left shrink-0"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#C85A6E] to-[#943A4D] flex items-center justify-center shadow-md shadow-[#C85A6E]/25">
                <Radio className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="font-display text-[17px] font-extrabold tracking-tight text-white leading-none">
                    SCÈNE ROSE
                  </h1>
                  <span className="px-1.5 py-0.5 rounded bg-[#C85A6E]/18 text-[9.5px] font-bold uppercase tracking-wider text-[#EE9EAB]">
                    31
                  </span>
                </div>
                <p className="text-[11px] text-[#9E968F] mt-0.5 flex items-center gap-1 whitespace-nowrap">
                  <MapPin className="w-3 h-3 text-[#C85A6E] shrink-0" />
                  <span>
                    Toulouse · {venues.length} salles
                    <span className="hidden lg:inline"> · {concerts.length} concerts</span>
                  </span>
                </p>
              </div>
            </button>

            {/* Desktop Top Navigation (md+: all 5 tabs always visible, crisp & non-wrapping) */}
            <nav
              aria-label="Navigation principale ordinateur"
              className="hidden md:flex items-center gap-0.5 lg:gap-1 p-1 rounded-2xl bg-[#16141B] border border-white/[0.08] shrink-0"
            >
              <button
                type="button"
                onClick={() => {
                  setActiveTab('agenda');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`px-2.5 lg:px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  activeTab === 'agenda'
                    ? 'bg-[#C85A6E] text-white shadow-sm'
                    : 'text-[#A9A097] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>Concerts</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('festivals');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`px-2.5 lg:px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  activeTab === 'festivals'
                    ? 'bg-[#C85A6E] text-white shadow-sm'
                    : 'text-[#A9A097] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Tent className="w-3.5 h-3.5 shrink-0" />
                <span>Festivals</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('map');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`px-2.5 lg:px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  activeTab === 'map'
                    ? 'bg-[#C85A6E] text-white shadow-sm'
                    : 'text-[#A9A097] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Carte</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('venues');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`px-2.5 lg:px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  activeTab === 'venues'
                    ? 'bg-[#C85A6E] text-white shadow-sm'
                    : 'text-[#A9A097] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Salles<span className="hidden lg:inline"> ({venues.length})</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('favorites');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`px-2.5 lg:px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  activeTab === 'favorites'
                    ? 'bg-[#C85A6E] text-white shadow-sm'
                    : 'text-[#A9A097] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Heart className="w-3.5 h-3.5 shrink-0" />
                <span>Favoris</span>
                {totalFavoritesBadge > 0 && (
                  <span
                    className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                      favoriteAlertsCount > 0
                        ? 'bg-amber-500 text-[#130F09]'
                        : activeTab === 'favorites'
                          ? 'bg-white/25 text-white'
                          : 'bg-[#C85A6E] text-white'
                    }`}
                  >
                    {totalFavoritesBadge}
                  </span>
                )}
              </button>
            </nav>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setSyncSheetOpen(true)}
                aria-label="Synchronisation & App mobile"
                title="Synchronisation quotidienne & installation PWA"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#18151D] hover:bg-[#221E29] border border-white/[0.08] text-[11px] font-semibold text-[#DDD5CC] transition-colors active:scale-95"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isOffline ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
                  }`}
                />
                <RefreshCw className={`w-3 h-3 text-emerald-300 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sync</span>
              </button>

              {/* Alerte email hebdo */}
              <button
                type="button"
                onClick={() => {
                  setNewsletterTab('subscribe');
                  setNewsletterOpen(true);
                }}
                aria-label="S'inscrire à l'alerte hebdomadaire par email"
                title="Alerte hebdomadaire par e-mail"
                className="flex items-center justify-center gap-1.5 h-8 px-2 lg:px-3 rounded-xl bg-[#18151D] hover:bg-[#221E28] border border-white/[0.08] text-[11px] font-semibold text-[#F5EFE9] active:scale-95 transition-all"
              >
                <Bell className="w-3.5 h-3.5 text-[#C85A6E]" />
                <span className="hidden xl:inline">Alerte mail</span>
              </button>

              {/* Menu Paramètres (Affichage Liste/Affiches, Contact & suggestions, À propos & RGPD) */}
              <div ref={settingsMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setSettingsMenuOpen((v) => !v)}
                  aria-label="Paramètres, affichage et contact"
                  aria-expanded={settingsMenuOpen}
                  title="Paramètres, affichage & contact"
                  className={`flex items-center justify-center w-8 h-8 rounded-xl border transition-all active:scale-95 ${
                    settingsMenuOpen
                      ? 'bg-[#C85A6E] border-[#C85A6E] text-white'
                      : 'bg-[#18151D] hover:bg-[#221E29] border-white/[0.08] text-[#DDD5CC]'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                </button>

                {settingsMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-64 rounded-2xl bg-[#18151F] border border-white/12 shadow-2xl shadow-black/75 p-2 z-50 animate-fade-in space-y-1"
                  >
                    {/* Affichage Agenda */}
                    <div className="px-2.5 py-2 rounded-xl bg-white/[0.03]">
                      <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#9E968F] mb-2">
                        Affichage des concerts
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#0F0D13] border border-white/[0.07]">
                        <button
                          type="button"
                          onClick={() => {
                            setViewMode('list');
                            setSettingsMenuOpen(false);
                          }}
                          className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                            viewMode === 'list'
                              ? 'bg-[#C85A6E] text-white'
                              : 'text-[#A9A097] hover:text-white'
                          }`}
                        >
                          <List className="w-3.5 h-3.5" />
                          Liste
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setViewMode('grid');
                            setSettingsMenuOpen(false);
                          }}
                          className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                            viewMode === 'grid'
                              ? 'bg-[#C85A6E] text-white'
                              : 'text-[#A9A097] hover:text-white'
                          }`}
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                          Affiches
                        </button>
                      </div>
                    </div>

                    <div className="h-px bg-white/[0.07] my-1" />

                    {/* Contact & suggestions */}
                    <a
                      href="mailto:scenerose.toulouse@gmail.com?subject=Sc%C3%A8ne%20Rose%20%E2%80%94%20Suggestion%20ou%20signalement"
                      onClick={() => setSettingsMenuOpen(false)}
                      className="w-full px-3 py-2.5 rounded-xl hover:bg-white/[0.06] text-left flex items-center gap-2.5 transition-colors"
                    >
                      <Mail className="w-4 h-4 text-[#C85A6E] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white">
                          Contact & suggestions
                        </div>
                        <div className="text-[10.5px] text-[#9E968F] truncate">
                          Signaler une erreur ou proposer un lieu
                        </div>
                      </div>
                    </a>

                    {/* Alerte hebdo */}
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsMenuOpen(false);
                        setNewsletterTab('subscribe');
                        setNewsletterOpen(true);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl hover:bg-white/[0.06] text-left flex items-center gap-2.5 transition-colors"
                    >
                      <Bell className="w-4 h-4 text-[#F2A9B6] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white">
                          Newsletter du jeudi
                        </div>
                        <div className="text-[10.5px] text-[#9E968F] truncate">
                          Sélection gratuite chaque semaine
                        </div>
                      </div>
                    </button>

                    {/* À propos & RGPD */}
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsMenuOpen(false);
                        setAboutOpen(true);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl hover:bg-white/[0.06] text-left flex items-center gap-2.5 transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white">
                          À propos & RGPD
                        </div>
                        <div className="text-[10.5px] text-[#9E968F] truncate">
                          Projet indépendant · confidentialité
                        </div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Scrollable Area */}
        <main className="flex-1 pb-24 md:pb-12">
          {activeTab === 'agenda' && (
            <>
              {/* Search & Filter Toolbar (scrolls cleanly with content; 1-row Search+Period on lg+, wrapping chips on PC) */}
              <div className="pt-3 pb-3 border-b border-white/[0.06] bg-[#110F15]/60 space-y-2.5">
                <div className="px-4 md:px-6 flex flex-col lg:flex-row lg:items-center gap-2.5">
                  <div className="flex items-center gap-2 lg:w-[360px] xl:w-[400px] shrink-0">
                    <div className="relative flex-1 flex items-center">
                      <Search className="w-4 h-4 text-[#8E8680] absolute left-3.5 pointer-events-none" />
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Artiste, genre, salle..."
                        className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-[#18151D] border border-white/[0.08] focus:border-[#C85A6E]/60 focus:outline-none text-[13px] text-white placeholder:text-[#78706A] transition-colors"
                      />
                      {search && (
                        <button
                          type="button"
                          aria-label="Effacer la recherche"
                          onClick={() => setSearch('')}
                          className="absolute right-2 p-1 rounded-full text-[#8E8680] hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setFiltersOpen(true)}
                      className={`relative shrink-0 h-[42px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 ${
                        advancedFilterCount > 0
                          ? 'bg-[#C85A6E]/20 border-[#C85A6E]/50 text-[#F2A9B6]'
                          : 'bg-[#18151D] border-white/[0.08] text-[#D2CAC2] hover:border-white/20 hover:text-white'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Filtres</span>
                      {advancedFilterCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#C85A6E] text-[10px] font-bold text-white flex items-center justify-center">
                          {advancedFilterCount}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Period, Calendar picker & quick chips */}
                  <div className="flex md:flex-wrap items-center gap-1.5 overflow-x-auto md:overflow-visible no-scrollbar">
                    {/* Sélecteur Calendrier interactif (jour, plage ou mois) */}
                    <div className="shrink-0 inline-flex items-center">
                      <button
                        type="button"
                        onClick={() => setCalendarOpen(true)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                          calendarSelection
                            ? 'rounded-l-full bg-[#C85A6E] text-white shadow-sm shadow-[#C85A6E]/30'
                            : 'rounded-full bg-[#19161F] text-[#F2A9B6] border border-[#C85A6E]/35 hover:bg-[#C85A6E]/15 hover:text-white'
                        }`}
                      >
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span>{calendarSelection ? calendarSelection.label : 'Calendrier'}</span>
                      </button>
                      {calendarSelection && (
                        <button
                          type="button"
                          onClick={() => setCalendarSelection(null)}
                          aria-label="Effacer la date du calendrier"
                          className="pl-1 pr-2 py-1.5 rounded-r-full bg-[#B2495D] hover:bg-[#9E3D50] text-white transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {PERIOD_OPTIONS.map((opt) => {
                      const active = period === opt.id && !calendarSelection;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setPeriod(opt.id);
                            setCalendarSelection(null);
                          }}
                          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                            active
                              ? 'bg-[#F7F4EF] text-[#110F14]'
                              : 'bg-[#19161F] text-[#B7AFA6] border border-white/[0.07] hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => setOnlyNew((v) => !v)}
                      className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                        onlyNew
                          ? 'bg-violet-500/25 text-violet-200 border border-violet-400/45'
                          : 'bg-[#19161F] text-[#B7AFA6] border border-white/[0.07] hover:text-white'
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      Nouveautés
                    </button>
                  </div>
                </div>

                {/* Suggestions rapides de salles quand la recherche matche une salle (ex: "zenith") */}
                {matchingVenuesForSearch.length > 0 && (
                  <div className="px-4 md:px-6 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-[#8E8680] font-medium">Salle :</span>
                    {matchingVenuesForSearch.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setSelectedVenueIds([v.id]);
                          setSearch('');
                          setCalendarSelection(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1A1721] hover:bg-[#231F2C] border border-[#C85A6E]/35 text-[11px] font-semibold text-white transition-colors"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: v.accentColor }}
                        />
                        <span>{v.name}</span>
                        <span className="text-[10px] text-[#F2A9B6]">
                          ({venueCounts[v.id] || 0})
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Genre chips */}
                <div className="flex md:flex-wrap items-center gap-1.5 overflow-x-auto md:overflow-visible no-scrollbar px-4 md:px-6">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className={`shrink-0 px-3 py-1.5 rounded-xl text-[11.5px] font-semibold transition-all active:scale-95 ${
                      selectedCategory === 'all'
                        ? 'bg-[#C85A6E] text-white shadow-sm shadow-[#C85A6E]/30'
                        : 'bg-white/[0.04] text-[#AEA69D] border border-white/[0.06] hover:text-white'
                    }`}
                  >
                    Tous les genres
                  </button>
                  {GENRE_CATEGORIES.map((cat) => {
                    const active = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(active ? 'all' : cat)}
                        className={`shrink-0 px-3 py-1.5 rounded-xl text-[11.5px] font-semibold transition-all active:scale-95 ${
                          active
                            ? 'bg-[#C85A6E] text-white shadow-sm shadow-[#C85A6E]/30'
                            : 'bg-white/[0.04] text-[#AEA69D] border border-white/[0.06] hover:text-white'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>

                {/* Active Venues Banner (supports multi-venue) */}
                {selectedVenuesObjects.length > 0 && (
                  <div className="px-4 md:px-6 pt-0.5">
                    <div className="px-3 py-2 rounded-xl bg-[#1A1721] border border-[#C85A6E]/35 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: selectedVenuesObjects[0].accentColor }}
                        />
                        <span className="text-xs font-semibold text-white truncate">
                          {selectedVenuesObjects.length === 1
                            ? selectedVenuesObjects[0].name
                            : `${selectedVenuesObjects.length} salles : ${selectedVenuesObjects
                                .map((v) => v.shortName)
                                .join(', ')}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {selectedVenuesObjects.length === 1 && (
                          <a
                            href={selectedVenuesObjects[0].websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#EE9EAB]"
                          >
                            Site
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedVenueIds([])}
                          aria-label="Retirer le filtre salle"
                          className="p-1 rounded-md bg-white/10 text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Shared friend selection banner (?selection=...) */}
              {sharedSelectionIds.length > 0 && (
                <div className="mx-4 mt-3 p-3.5 rounded-2xl bg-gradient-to-r from-[#C85A6E]/20 to-violet-500/15 border border-[#C85A6E]/40 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-[#F2A9B6] shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-white">
                          Sélection partagée par un ami ({filteredConcerts.length})
                        </p>
                        <p className="text-[11px] text-[#CFC7BE]">
                          Tu peux l’enregistrer directement dans tes favoris.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearSharedSelection}
                      aria-label="Fermer la sélection partagée"
                      className="p-1 rounded-lg bg-white/10 text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={importSharedSelection}
                    className="w-full py-2 rounded-xl bg-[#C85A6E] hover:bg-[#DA7083] text-white text-xs font-bold active:scale-[0.98] transition-all"
                  >
                    Tout ajouter à mes favoris
                  </button>
                </div>
              )}

              {/* Featured Strip when no filter/search active */}
              {!hasActiveFilters && (
                <FeaturedCarousel
                  concerts={featuredConcerts}
                  venueMap={venueMap}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                  onSelectConcert={setSelectedConcert}
                />
              )}

              {/* Results count & reset bar */}
              <div className="px-4 md:px-6 pt-3 pb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-[#9E968F]">
                  <strong className="text-[#F7F4EF] font-semibold">
                    {filteredConcerts.length}
                  </strong>{' '}
                  concert{filteredConcerts.length > 1 ? 's' : ''} à venir
                  {calendarSelection ? ` · ${calendarSelection.label}` : ''}
                </span>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#C85A6E] hover:text-[#EE9EAB]"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Réinitialiser
                  </button>
                )}
              </div>

              {/* Empty state */}
              {groupedByDate.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <p className="font-display text-base font-bold text-white">
                    Aucun concert trouvé
                  </p>
                  <p className="mt-1 text-xs text-[#9E968F]">
                    Essaie un autre mois, un autre budget ou réinitialise les filtres.
                  </p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-4 px-4 py-2 rounded-xl bg-[#C85A6E] text-white text-xs font-semibold"
                  >
                    Voir tous les concerts
                  </button>
                </div>
              ) : (
                <div className="space-y-5 pt-1">
                  {groupedByDate.map((group) => {
                    const header = formatDayHeader(group.date);
                    return (
                      <section key={group.date}>
                        <div className="px-4 md:px-6 py-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <h2 className="font-display text-sm font-bold text-[#F7F4EF] capitalize">
                              {header.primary}
                            </h2>
                            {header.tag && (
                              <span className="px-2 py-0.5 rounded-full bg-[#C85A6E]/20 border border-[#C85A6E]/35 text-[10px] font-bold uppercase tracking-wider text-[#F2A9B6]">
                                {header.tag}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-[#7D756F]">
                            {group.concerts.length} concert{group.concerts.length > 1 ? 's' : ''}
                          </span>
                        </div>

                        <div
                          className={
                            viewMode === 'grid'
                              ? 'px-4 md:px-6 mt-1.5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5 md:gap-3.5'
                              : 'px-4 md:px-6 mt-1.5 space-y-2.5 sm:space-y-0 sm:grid sm:grid-cols-2 xl:grid-cols-3 sm:gap-3'
                          }
                        >
                          {group.concerts.map((concert) => (
                            <ConcertCard
                              key={concert.id}
                              concert={concert}
                              venue={venueMap[concert.venueId]}
                              isFavorite={favorites.includes(concert.id)}
                              viewMode={viewMode}
                              onToggleFavorite={toggleFavorite}
                              onSelect={setSelectedConcert}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}

              {/* Minimalist Weekly Email Alert Card */}
              <section className="mt-8 px-4 md:px-6 max-w-2xl mx-auto">
                <div className="rounded-2xl bg-[#16141B] border border-white/[0.09] p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                      <Bell className="w-3.5 h-3.5 text-[#C85A6E] shrink-0" />
                      <span>Alerte nouvelles sorties</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#9E968F] leading-snug">
                      1 mail épuré par semaine · zéro spam · désinscription en 1 clic
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNewsletterTab('subscribe');
                      setNewsletterOpen(true);
                    }}
                    className="shrink-0 px-3 py-2 rounded-xl bg-[#C85A6E] hover:bg-[#DA7083] text-white text-[11.5px] font-bold active:scale-95 transition-all"
                  >
                    M’alerter
                  </button>
                </div>
              </section>

              {/* Subtle attribution footer */}
              <footer className="mt-6 px-5 text-center text-[11px] text-[#766E68] space-y-1.5">
                <p>
                  Programmation agrégée depuis les sites officiels de {venues.length} salles de
                  Toulouse et sa métropole.
                </p>
                <p>
                  {syncMeta
                    ? `Synchronisé en direct (${formatSyncTime(syncMeta.lastSyncedAt)}) · Auto-sync 4×/jour.`
                    : 'Synchronisation automatique 4×/jour · Horaires & tarifs indicatifs.'}
                </p>
                <p className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setNewsletterTab('privacy');
                      setNewsletterOpen(true);
                    }}
                    className="text-[#9E968F] hover:text-white underline underline-offset-2"
                  >
                    Confidentialité & RGPD
                  </button>
                </p>
              </footer>
            </>
          )}

          {activeTab === 'festivals' && (
            <FestivalsView
              festivals={activeFestivals}
              favoriteIds={favoriteFestivals}
              onToggleFavorite={toggleFavoriteFestival}
              onSelectFestival={setSelectedFestival}
            />
          )}

          {activeTab === 'map' && (
            <ToulouseMapView
              venues={venues}
              concerts={concerts}
              onFilterByVenue={handleSelectVenueFromAnywhere}
              onSelectConcert={setSelectedConcert}
            />
          )}

          {activeTab === 'venues' && (
            <VenuesView
              venues={venues}
              concerts={concerts}
              syncMeta={syncMeta}
              isSyncing={isSyncing}
              onOpenSyncSheet={() => setSyncSheetOpen(true)}
              onFilterByVenue={handleSelectVenueFromAnywhere}
              onSelectConcert={setSelectedConcert}
            />
          )}

          {activeTab === 'favorites' && (
            <FavoritesView
              concerts={concerts}
              venueMap={venueMap}
              favorites={favorites}
              favoriteArtists={favoriteArtists}
              festivals={activeFestivals}
              favoriteFestivals={favoriteFestivals}
              favAlertEmail={favAlertEmail}
              onSaveFavAlertEmail={handleSaveFavAlertEmail}
              onToggleFavorite={toggleFavorite}
              onAddFavoriteArtist={addFavoriteArtist}
              onRemoveFavoriteArtist={removeFavoriteArtist}
              onToggleFavoriteFestival={toggleFavoriteFestival}
              onSelectConcert={setSelectedConcert}
              onSelectFestival={setSelectedFestival}
              onSearchArtist={(artistName) => {
                setSearch(artistName);
                setPeriod('all');
                setCalendarSelection(null);
                setSelectedCategory('all');
                setSelectedVenueIds([]);
                setActiveTab('agenda');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onGoExplore={() => setActiveTab('agenda')}
              onShareSelection={handleShareSelection}
              onNotify={showToast}
            />
          )}

          {/* Subtle Footer · About & RGPD */}
          <footer className="mt-10 pt-5 pb-4 px-4 md:px-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[#7D766F]">
            <span>
              Scène Rose · {venues.length} salles toulousaines & {activeFestivals.length} festivals d’Occitanie
            </span>
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="inline-flex items-center gap-1.5 text-[#AFA8A0] hover:text-[#F2A9B6] transition-colors font-medium"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#C85A6E]" />
              À propos · Contact & suggestions · RGPD
            </button>
          </footer>
        </main>

        {/* Bottom Navigation Bar (Mobile / small screens only; md+ uses sticky top nav) */}
        <nav
          aria-label="Navigation principale"
          className="md:hidden fixed bottom-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-[440px] sm:max-w-2xl bg-[#121016]/95 backdrop-blur-xl border-t border-white/[0.09] pb-[env(safe-area-inset-bottom)]"
        >
          <div className="grid grid-cols-5 h-16">
            <button
              type="button"
              onClick={() => {
                setActiveTab('agenda');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                activeTab === 'agenda' ? 'text-[#C85A6E]' : 'text-[#8E8680]'
              }`}
            >
              <Calendar className="w-4.5 h-4.5" />
              <span className="text-[10px] font-semibold">Concerts</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('festivals');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                activeTab === 'festivals' ? 'text-[#C85A6E]' : 'text-[#8E8680]'
              }`}
            >
              <Tent className="w-4.5 h-4.5" />
              <span className="text-[10px] font-semibold">Festivals</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('map');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                activeTab === 'map' ? 'text-[#C85A6E]' : 'text-[#8E8680]'
              }`}
            >
              <MapIcon className="w-4.5 h-4.5" />
              <span className="text-[10px] font-semibold">Carte</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('venues');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                activeTab === 'venues' ? 'text-[#C85A6E]' : 'text-[#8E8680]'
              }`}
            >
              <Building2 className="w-4.5 h-4.5" />
              <span className="text-[10px] font-semibold">Salles</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('favorites');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`relative flex flex-col items-center justify-center gap-1 transition-colors ${
                activeTab === 'favorites' ? 'text-[#C85A6E]' : 'text-[#8E8680]'
              }`}
            >
              <div className="relative">
                <Heart
                  className={`w-4.5 h-4.5 ${
                    activeTab === 'favorites' ? 'fill-[#C85A6E]/20' : ''
                  }`}
                />
                {totalFavoritesBadge > 0 && (
                  <span
                    className={`absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${
                      favoriteAlertsCount > 0 ? 'bg-amber-500 text-[#130F09]' : 'bg-[#C85A6E]'
                    }`}
                  >
                    {totalFavoritesBadge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold">Favoris</span>
            </button>
          </div>
        </nav>

        {/* Concert Detail Bottom Sheet */}
        <ConcertDetailSheet
          concert={selectedConcert}
          venue={selectedConcert ? venueMap[selectedConcert.venueId] : null}
          isFavorite={selectedConcert ? favorites.includes(selectedConcert.id) : false}
          favoriteArtists={favoriteArtists}
          onClose={() => setSelectedConcert(null)}
          onToggleFavorite={toggleFavorite}
          onToggleFavoriteArtist={toggleFavoriteArtist}
          onSelectVenue={handleSelectVenueFromAnywhere}
          onNotify={showToast}
        />

        {/* Festival Detail Modal / Bottom Sheet */}
        <FestivalDetailSheet
          festival={selectedFestival}
          isFavorite={selectedFestival ? favoriteFestivals.includes(selectedFestival.id) : false}
          favoriteArtists={favoriteArtists}
          onClose={() => setSelectedFestival(null)}
          onToggleFavorite={toggleFavoriteFestival}
          onToggleFavoriteArtist={toggleFavoriteArtist}
          onNotify={showToast}
        />

        {/* Interactive Calendar Date/Range Picker Sheet */}
        <CalendarPickerSheet
          open={calendarOpen}
          concerts={nonDateFilteredConcerts}
          selection={calendarSelection}
          onApply={(next) => {
            setCalendarSelection(next);
            if (next) setPeriod('all');
          }}
          onClose={() => setCalendarOpen(false)}
        />

        {/* Advanced Filters Sheet */}
        <AdvancedFiltersSheet
          open={filtersOpen}
          venues={venues}
          venueCounts={venueCounts}
          resultCount={filteredConcerts.length}
          eventFormat={eventFormat}
          budget={budget}
          hideSoldOut={hideSoldOut}
          onlyNew={onlyNew}
          selectedTransit={selectedTransit}
          selectedVenueIds={selectedVenueIds}
          onChangeFormat={setEventFormat}
          onChangeBudget={setBudget}
          onToggleHideSoldOut={() => setHideSoldOut((v) => !v)}
          onToggleOnlyNew={() => setOnlyNew((v) => !v)}
          onToggleTransit={toggleTransitFilter}
          onToggleVenue={toggleVenueFilter}
          onReset={resetFilters}
          onClose={() => setFiltersOpen(false)}
        />

        {/* Daily Sync & PWA Install Bottom Sheet */}
        <SyncStatusSheet
          open={syncSheetOpen}
          syncMeta={syncMeta}
          isSyncing={isSyncing}
          isOffline={isOffline}
          canInstallPwa={Boolean(installPrompt)}
          isInstalledPwa={isInstalledPwa}
          onInstallPwa={handleInstallPwa}
          onSyncNow={triggerLiveSync}
          onClose={() => setSyncSheetOpen(false)}
        />

        {/* Weekly Newsletter & RGPD Privacy Bottom Sheet */}
        <NewsletterSheet
          open={newsletterOpen}
          initialTab={newsletterTab}
          onClose={() => setNewsletterOpen(false)}
        />

        {/* About & RGPD Privacy Modal */}
        <AboutRgpdSheet
          open={aboutOpen}
          venueCount={venues.length}
          concertCount={concerts.length}
          festivalCount={activeFestivals.length}
          onClose={() => setAboutOpen(false)}
          onOpenNewsletter={() => {
            setNewsletterTab('subscribe');
            setNewsletterOpen(true);
          }}
        />

        {/* Toast notification */}
        {toast && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[55] px-4 py-2 rounded-full bg-[#221F2A] border border-white/15 shadow-xl text-xs font-semibold text-white animate-fade-in">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
