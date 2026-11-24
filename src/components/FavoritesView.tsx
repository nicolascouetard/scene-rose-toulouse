import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  Calendar,
  CheckCircle2,
  Clock,
  Heart,
  Loader2,
  MapPin,
  Music2,
  Plus,
  Share2,
  Sparkles,
  Tent,
  UserCheck,
  X,
} from 'lucide-react';
import { TODAY_ISO, type Concert, type Venue } from '../data/toulouseData';
import { formatFestivalDates, type Festival } from '../data/festivalsData';
import { daysUntilConcert, matchesFollowedArtist } from '../utils/dates';
import { ConcertCard } from './ConcertCard';

interface FavoritesViewProps {
  concerts: Concert[];
  venueMap: Record<string, Venue>;
  favorites: string[];
  favoriteArtists: string[];
  festivals?: Festival[];
  favoriteFestivals?: string[];
  favAlertEmail: string | null;
  onSaveFavAlertEmail: (email: string | null) => void;
  onToggleFavorite: (id: string) => void;
  onAddFavoriteArtist: (artistName: string) => void;
  onRemoveFavoriteArtist: (artistName: string) => void;
  onToggleFavoriteFestival?: (id: string) => void;
  onSelectConcert: (concert: Concert) => void;
  onSelectFestival?: (festival: Festival) => void;
  onSearchArtist: (artistName: string) => void;
  onGoExplore: () => void;
  onShareSelection: () => void;
  onNotify: (msg: string) => void;
}

export function FavoritesView({
  concerts,
  venueMap,
  favorites,
  favoriteArtists,
  festivals = [],
  favoriteFestivals = [],
  favAlertEmail,
  onSaveFavAlertEmail,
  onToggleFavorite,
  onAddFavoriteArtist,
  onRemoveFavoriteArtist,
  onToggleFavoriteFestival,
  onSelectConcert,
  onSelectFestival,
  onSearchArtist,
  onGoExplore,
  onShareSelection,
  onNotify,
}: FavoritesViewProps) {
  const [artistInput, setArtistInput] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailInput, setEmailInput] = useState(() => {
    if (favAlertEmail) return favAlertEmail;
    try {
      return localStorage.getItem('scene_rose_remembered_email_v1') || '';
    } catch {
      return '';
    }
  });
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saved = concerts.filter((c) => favorites.includes(c.id));
  const savedFestivals = festivals.filter((f) => favoriteFestivals.includes(f.id));
  const totalSaved = saved.length + savedFestivals.length + favoriteArtists.length;

  // Croise chaque artiste suivi avec les concerts à Toulouse & les line-ups festivals
  const artistMatches = useMemo(() => {
    return favoriteArtists.map((artist) => {
      const matchedConcerts = concerts.filter((c) =>
        matchesFollowedArtist(c.title, artist)
      );
      const matchedFestivals = festivals.filter((f) =>
        f.lineup.some((a) => matchesFollowedArtist(a.name, artist))
      );
      return { artist, matchedConcerts, matchedFestivals };
    });
  }, [favoriteArtists, concerts, festivals]);

  // Concerts correspondant à un artiste suivi (non encore mis en cœur) pour le bandeau d'alertes
  const artistNewMatches = useMemo(() => {
    const seen = new Set<string>();
    const list: { artist: string; concert: Concert }[] = [];
    for (const item of artistMatches) {
      for (const c of item.matchedConcerts) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          list.push({ artist: item.artist, concert: c });
        }
      }
    }
    return list.slice(0, 6);
  }, [artistMatches]);

  const lastTicketsAlerts = saved.filter((c) => c.status === 'last-tickets');
  const soldOutAlerts = saved.filter((c) => c.status === 'sold-out');
  const soonAlerts = saved
    .map((c) => ({ concert: c, days: daysUntilConcert(c.date, TODAY_ISO) }))
    .filter(({ concert, days }) => days >= 0 && days <= 7 && concert.status !== 'sold-out')
    .sort((a, b) => a.days - b.days);

  const hasAlerts =
    lastTicketsAlerts.length > 0 ||
    soldOutAlerts.length > 0 ||
    soonAlerts.length > 0 ||
    artistNewMatches.length > 0;

  const hasAlertableItems = saved.length > 0 || favoriteArtists.length > 0;

  const handleAddArtistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = artistInput.trim();
    if (cleaned.length < 2) return;
    onAddFavoriteArtist(cleaned);
    setArtistInput('');
  };

  const handleActivateEmailAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleaned = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleaned)) {
      setErrorMsg('Merci de saisir une adresse e-mail valide.');
      return;
    }
    if (!consent) {
      setErrorMsg('Merci de cocher la case de consentement RGPD.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/favorites-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleaned,
          favoriteIds: favorites,
          favoriteArtists,
          enabled: true,
          consent: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || 'Impossible d’activer les alertes pour le moment.');
        return;
      }
      onSaveFavAlertEmail(cleaned);
      try {
        localStorage.setItem('scene_rose_remembered_email_v1', cleaned);
      } catch {
        // ignore
      }
      setShowEmailForm(false);
      onNotify(data.message || 'Alertes favoris & artistes activées !');
    } catch {
      setErrorMsg('Erreur réseau — vérifie ta connexion et réessaie.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisableEmailAlerts = async () => {
    if (!favAlertEmail) return;
    setSubmitting(true);
    try {
      await fetch('/api/favorites-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: favAlertEmail,
          favoriteIds: [],
          favoriteArtists: [],
          enabled: false,
          consent: false,
        }),
      });
    } catch {
      // ignore network error on local disable
    } finally {
      onSaveFavAlertEmail(null);
      setSubmitting(false);
      onNotify('Alertes e-mail sur tes favoris désactivées');
    }
  };

  const summaryParts = [
    saved.length > 0 ? `${saved.length} concert${saved.length > 1 ? 's' : ''}` : null,
    favoriteArtists.length > 0
      ? `${favoriteArtists.length} artiste${favoriteArtists.length > 1 ? 's' : ''}`
      : null,
  ].filter(Boolean);

  return (
    <div className="px-4 md:px-6 pt-3 pb-6 space-y-5">
      {/* Header + Share selection button */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-extrabold text-white">
            Mes favoris {totalSaved > 0 ? `(${totalSaved})` : ''}
          </h2>
          <p className="text-xs text-[#9E968F] mt-0.5">
            Concerts enregistrés, artistes suivis & alertes e-mail automatiques
          </p>
        </div>

        {saved.length > 0 && (
          <button
            type="button"
            onClick={onShareSelection}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#C85A6E]/18 hover:bg-[#C85A6E]/28 border border-[#C85A6E]/40 text-xs font-bold text-[#F2A9B6] active:scale-95 transition-all"
          >
            <Share2 className="w-3.5 h-3.5" />
            Partager
          </button>
        )}
      </div>

      {/* Followed Artists Section (manual add + follow from any concert/festival) */}
      <section className="rounded-2xl bg-[#16141B] border border-white/[0.09] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#C85A6E]/18 border border-[#C85A6E]/35 flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4 text-[#F2A9B6]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">
                Artistes suivis ({favoriteArtists.length})
              </h3>
              <p className="text-[11px] text-[#9E968F] mt-0.5">
                Ajoute un artiste pour être alerté dès qu’un concert sort à Toulouse
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleAddArtistSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={artistInput}
            onChange={(e) => setArtistInput(e.target.value)}
            placeholder="Ex : Orelsan, Gojira, Clara Luciani, Moby..."
            maxLength={60}
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#0F0D13] border border-white/12 focus:border-[#C85A6E] outline-none text-sm text-white placeholder:text-[#6D665F]"
          />
          <button
            type="submit"
            disabled={artistInput.trim().length < 2}
            className="shrink-0 h-[42px] px-3.5 rounded-xl bg-[#C85A6E] hover:bg-[#DA7083] disabled:opacity-45 text-white text-xs font-bold inline-flex items-center gap-1.5 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Suivre</span>
          </button>
        </form>

        {artistMatches.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {artistMatches.map(({ artist, matchedConcerts, matchedFestivals }) => {
              const totalDates = matchedConcerts.length + matchedFestivals.length;
              return (
                <div
                  key={artist}
                  className="rounded-xl bg-[#1D1A23] border border-white/[0.08] px-3 py-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{artist}</div>
                    {totalDates > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (matchedConcerts.length === 1) {
                            onSelectConcert(matchedConcerts[0]);
                          } else if (matchedConcerts.length > 1) {
                            onSearchArtist(artist);
                          } else if (matchedFestivals[0]) {
                            onSelectFestival?.(matchedFestivals[0]);
                          }
                        }}
                        className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#F2A9B6] hover:underline"
                      >
                        <Sparkles className="w-3 h-3 shrink-0" />
                        <span>
                          {matchedConcerts.length > 0
                            ? `${matchedConcerts.length} concert${matchedConcerts.length > 1 ? 's' : ''} à Toulouse →`
                            : `${matchedFestivals.length} festival${matchedFestivals.length > 1 ? 's' : ''} →`}
                        </span>
                      </button>
                    ) : (
                      <div className="mt-0.5 text-[10.5px] text-[#8E8680]">
                        En veille · alerte dès qu’une date sort
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveFavoriteArtist(artist)}
                    aria-label={`Ne plus suivre ${artist}`}
                    className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] flex items-center justify-center text-[#9E968F] hover:text-white shrink-0 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11.5px] text-[#8E8680]">
            Astuce : tu peux aussi appuyer sur <strong>« Suivre »</strong> directement dans la fiche d’un concert ou d’un festival.
          </p>
        )}
      </section>

      {/* Option 1: Smart in-app alerts (Followed artists dates + J-7 + Last tickets + Sold out) */}
      {hasAlerts && (
        <div className="rounded-2xl bg-gradient-to-r from-amber-500/14 via-[#C85A6E]/14 to-rose-500/14 border border-amber-400/35 p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
            <span>Rappels & alertes sur tes favoris</span>
          </div>
          <div className="space-y-1.5">
            {artistNewMatches.map(({ artist, concert: c }) => (
              <button
                key={`artist-${c.id}`}
                type="button"
                onClick={() => onSelectConcert(c)}
                className="w-full text-left flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-black/30 hover:bg-black/45 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{c.title}</div>
                  <div className="text-[10.5px] text-[#CFC7BE] truncate">
                    {venueMap[c.venueId]?.shortName} · Artiste suivi : {artist}
                  </div>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#C85A6E] text-[10px] font-bold uppercase text-white">
                  <Sparkles className="w-3 h-3" />
                  Date dispo
                </span>
              </button>
            ))}

            {lastTicketsAlerts.map((c) => (
              <button
                key={`last-${c.id}`}
                type="button"
                onClick={() => onSelectConcert(c)}
                className="w-full text-left flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-black/30 hover:bg-black/45 transition-colors"
              >
                <span className="text-xs font-semibold text-white truncate">{c.title}</span>
                <span className="shrink-0 px-2 py-0.5 rounded bg-amber-500 text-[10px] font-bold uppercase text-[#130F09]">
                  Dernières places
                </span>
              </button>
            ))}

            {soonAlerts.map(({ concert: c, days }) => {
              const countdown =
                days === 0 ? 'Ce soir !' : days === 1 ? 'Demain' : `Dans ${days} jours`;
              return (
                <button
                  key={`soon-${c.id}`}
                  type="button"
                  onClick={() => onSelectConcert(c)}
                  className="w-full text-left flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-black/30 hover:bg-black/45 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">{c.title}</div>
                    <div className="text-[10.5px] text-[#CFC7BE] truncate">
                      {venueMap[c.venueId]?.shortName} · Pense à tes places !
                    </div>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#C85A6E] text-[10px] font-bold uppercase text-white">
                    <Clock className="w-3 h-3" />
                    {countdown}
                  </span>
                </button>
              );
            })}

            {soldOutAlerts.map((c) => (
              <button
                key={`sold-${c.id}`}
                type="button"
                onClick={() => onSelectConcert(c)}
                className="w-full text-left flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-black/30 hover:bg-black/45 transition-colors"
              >
                <span className="text-xs font-semibold text-[#CFC7BE] truncate">{c.title}</span>
                <span className="shrink-0 px-2 py-0.5 rounded bg-rose-500 text-[10px] font-bold uppercase text-white">
                  Complet
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Option 2: Automated Brevo email reminders (New dates for followed artists + J-7 + Last Tickets) */}
      {hasAlertableItems && (
        <div className="rounded-2xl bg-[#16141B] border border-white/[0.09] p-3.5">
          {favAlertEmail ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white">
                    Alertes e-mail actives ({summaryParts.join(' · ')})
                  </div>
                  <p className="text-[11px] text-[#9E968F] truncate">
                    Nouveaux concerts d’artistes suivis, J-7 & Dernières places →{' '}
                    <strong className="text-[#E5DFD8]">{favAlertEmail}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={handleDisableEmailAlerts}
                className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] text-[11px] font-semibold text-[#CFC7BE] transition-colors"
              >
                <BellOff className="w-3.5 h-3.5" />
                Désactiver
              </button>
            </div>
          ) : !showEmailForm ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#C85A6E]/15 border border-[#C85A6E]/35 flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4 text-[#F2A9B6]" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">
                    Recevoir des alertes par e-mail sur mes favoris & artistes suivis
                  </div>
                  <p className="text-[11px] text-[#9E968F] mt-0.5 leading-snug">
                    Prévenu automatiquement dès qu’un <strong>artiste suivi annonce un concert</strong> à Toulouse, <strong>7 jours avant</strong> un favori ou en <strong>Dernières places</strong> (0 € · sans spam).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEmailForm(true)}
                className="shrink-0 px-3.5 py-2 rounded-xl bg-[#C85A6E] hover:bg-[#DA7083] text-white text-xs font-bold active:scale-95 transition-all"
              >
                Activer
              </button>
            </div>
          ) : (
            <form onSubmit={handleActivateEmailAlerts} className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-[#F2A9B6]" />
                  Alertes e-mail Artistes suivis, J-7 & Dernières places
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowEmailForm(false);
                    setErrorMsg(null);
                  }}
                  className="text-[11px] text-[#9E968F] hover:text-white"
                >
                  Annuler
                </button>
              </div>

              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="ton.email@exemple.fr"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F0D13] border border-white/12 focus:border-[#C85A6E] outline-none text-sm text-white placeholder:text-[#6D665F]"
              />

              <label className="flex items-start gap-2 text-[11px] text-[#ABA39B] cursor-pointer leading-snug">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 accent-[#C85A6E]"
                />
                <span>
                  J’accepte de recevoir uniquement des alertes sur mes concerts favoris et artistes suivis via Brevo (UE). <strong>Indépendant de la newsletter du jeudi</strong> · désactivation en 1 clic.
                </span>
              </label>

              {errorMsg && (
                <p className="text-[11px] text-rose-300 font-medium">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-[#C85A6E] hover:bg-[#DA7083] disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Synchronisation...
                  </>
                ) : (
                  <>Activer les alertes ({summaryParts.join(' · ')})</>
                )}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Followed Occitanie Festivals */}
      {savedFestivals.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#A9A097]">
            <Tent className="w-3.5 h-3.5 text-[#C85A6E]" />
            <span>Festivals suivis ({savedFestivals.length})</span>
          </div>
          <div className="space-y-2.5 md:space-y-0 md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-3">
            {savedFestivals.map((f) => (
              <div
                key={f.id}
                onClick={() => onSelectFestival?.(f)}
                className="cursor-pointer rounded-2xl bg-[#16141A] hover:bg-[#1B1821] border border-white/[0.08] p-3.5 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                      style={{ backgroundColor: `${f.accentColor}CC` }}
                    >
                      {f.editionYear}
                    </span>
                    <span className="text-sm font-bold text-white truncate">{f.name}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-[#A9A097]">
                    <span className="inline-flex items-center gap-1 text-[#F2A9B6] font-semibold">
                      <Calendar className="w-3 h-3" />
                      {formatFestivalDates(f)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#C85A6E]" />
                      {f.city} ({f.departmentCode})
                    </span>
                  </div>
                </div>
                {onToggleFavoriteFestival && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavoriteFestival(f.id);
                    }}
                    aria-label="Retirer ce festival"
                    className="w-8 h-8 rounded-full bg-white/[0.05] flex items-center justify-center shrink-0"
                  >
                    <Heart className="w-4 h-4 fill-[#C85A6E] text-[#C85A6E]" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved concert cards */}
      {saved.length > 0 ? (
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#A9A097]">
            <Music2 className="w-3.5 h-3.5 text-[#C85A6E]" />
            <span>Concerts enregistrés ({saved.length})</span>
          </div>
          <div className="space-y-2.5 md:space-y-0 md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-3">
            {saved.map((concert) => (
              <ConcertCard
                key={concert.id}
                concert={concert}
                venue={venueMap[concert.venueId]}
                isFavorite={true}
                viewMode="list"
                showDateBadge={true}
                onToggleFavorite={onToggleFavorite}
                onSelect={onSelectConcert}
              />
            ))}
          </div>
        </div>
      ) : (
        savedFestivals.length === 0 && (
          <div className="rounded-2xl bg-[#16141A] border border-white/[0.08] px-6 py-10 text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-[#1F1B26] border border-white/10 flex items-center justify-center mb-3">
              <Heart className="w-5 h-5 text-[#C85A6E]" />
            </div>
            <h3 className="font-display text-base font-bold text-white">
              Aucun concert enregistré
            </h3>
            <p className="mt-1 text-xs text-[#9E968F] max-w-[300px] leading-relaxed">
              Appuie sur le cœur d’un concert ou d’un festival pour suivre sa billetterie et partager ta liste.
            </p>
            <button
              type="button"
              onClick={onGoExplore}
              className="mt-4 px-4 py-2 rounded-xl bg-[#C85A6E] hover:bg-[#DA7083] text-white text-xs font-semibold active:scale-95 transition-transform inline-flex items-center gap-1.5"
            >
              <Music2 className="w-3.5 h-3.5" />
              Explorer les concerts
            </button>
          </div>
        )
      )}
    </div>
  );
}
