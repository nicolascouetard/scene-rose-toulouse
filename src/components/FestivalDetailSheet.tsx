import { useEffect, useState } from 'react';
import {
  BellPlus,
  Calendar,
  CalendarPlus,
  Car,
  Check,
  ExternalLink,
  Headphones,
  Heart,
  History,
  MapPin,
  Navigation,
  Share2,
  Sparkles,
  Tent,
  Ticket,
  X,
} from 'lucide-react';
import {
  downloadFestivalIcs,
  formatFestivalDates,
  type Festival,
} from '../data/festivalsData';
import { useSwipeDownToClose } from '../hooks/useSwipeDownToClose';
import { normalizeSearchText } from '../utils/dates';
import { RoutePickerSheet } from './RoutePickerSheet';
import { StreamingLinksRow } from './StreamingLinksRow';

interface FestivalDetailSheetProps {
  festival: Festival | null;
  isFavorite: boolean;
  favoriteArtists: string[];
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
  onToggleFavoriteArtist: (artistName: string) => void;
  onNotify: (msg: string) => void;
}

const STATUS_BADGE: Record<Festival['status'], { label: string; cls: string }> = {
  available: {
    label: 'Pass & billets disponibles',
    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  },
  'early-bird': {
    label: 'Early Bird ouvert',
    cls: 'bg-[#C85A6E]/20 text-[#F2A9B6] border-[#C85A6E]/45',
  },
  'last-tickets': {
    label: 'Dernières places',
    cls: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
  },
  'sold-out': {
    label: 'Complet',
    cls: 'bg-rose-500/15 text-rose-300 border-rose-500/35',
  },
  free: {
    label: 'Entrée gratuite',
    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  },
  'upcoming-tba': {
    label: 'Annonces & billetterie à venir',
    cls: 'bg-white/[0.08] text-[#DDD5CC] border-white/15',
  },
};

export function FestivalDetailSheet({
  festival,
  isFavorite,
  favoriteArtists,
  onClose,
  onToggleFavorite,
  onToggleFavoriteArtist,
  onNotify,
}: FestivalDetailSheetProps) {
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [showRoutePicker, setShowRoutePicker] = useState(false);
  const { scrollRef, sheetStyle, backdropOpacity, handlers } = useSwipeDownToClose({
    onClose,
  });

  useEffect(() => {
    if (!festival) {
      setSelectedArtist(null);
      setShowRoutePicker(false);
      return;
    }
    // Sélectionner automatiquement le premier artiste pour un accès écoute immédiat
    const first =
      festival.lineup[0]?.name || festival.previousEdition.highlights[0] || null;
    setSelectedArtist(first);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showRoutePicker) setShowRoutePicker(false);
        else onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [festival, showRoutePicker, onClose]);

  if (!festival) return null;

  const badge = STATUS_BADGE[festival.status];
  const hasConfirmedLineup = festival.lineup.length > 0;
  const isFollowingSelectedArtist = Boolean(
    selectedArtist &&
      favoriteArtists.some(
        (a) => normalizeSearchText(a) === normalizeSearchText(selectedArtist)
      )
  );

  const handleShare = async () => {
    const deepUrl = new URL(window.location.href);
    deepUrl.search = '';
    deepUrl.searchParams.set('festival', festival.id);
    const shareUrl = deepUrl.toString();
    const shareText = `${festival.name} ${festival.editionYear} (${festival.city}) · ${formatFestivalDates(festival)}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${festival.name} ${festival.editionYear} · Scène Rose`,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // fallback clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      onNotify('Lien direct du festival copié !');
    } catch {
      onNotify('Partage indisponible');
    }
  };

  const handleCalendar = () => {
    downloadFestivalIcs(festival);
    onNotify('Festival ajouté en calendrier (.ics)');
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-6 bg-black/75 backdrop-blur-sm animate-fade-in"
        style={{ opacity: backdropOpacity }}
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-[440px] md:max-w-xl max-h-[92dvh] md:max-h-[88dvh] rounded-t-3xl md:rounded-3xl bg-[#131117] border-t border-x md:border border-white/12 shadow-2xl flex flex-col overflow-hidden animate-sheet-up"
          style={sheetStyle}
          onClick={(e) => e.stopPropagation()}
          {...handlers}
        >
          {/* Swipe-down handle zone (mobile only) */}
          <div
            data-swipe-handle="true"
            className="md:hidden flex justify-center pt-2.5 pb-1.5"
          >
            <div className="w-11 h-1.5 rounded-full bg-white/30" />
          </div>

          {/* Scrollable Body */}
          <div ref={scrollRef} className="overflow-y-auto no-scrollbar pb-24">
            {/* Editorial Festival Header Banner */}
            <div
              className="relative px-5 pt-5 pb-5 border-b border-white/[0.08]"
              style={{
                background: `radial-gradient(420px circle at 85% 0%, ${festival.accentColor}38, transparent 70%), linear-gradient(180deg, #1A1621 0%, #131117 100%)`,
              }}
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/45 backdrop-blur-md border border-white/15 flex items-center justify-center text-white active:scale-95 transition-transform"
              >
                <X className="w-4.5 h-4.5" />
              </button>

              <div className="flex flex-wrap items-center gap-1.5 pr-10">
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: `${festival.accentColor}CC` }}
                >
                  <Tent className="w-3 h-3" />
                  Édition {festival.editionYear}
                  {festival.editionNumber ? ` · ${festival.editionNumber}e` : ''}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/[0.08] border border-white/10 text-[11px] font-semibold text-[#EAE3DB]">
                  {festival.city} ({festival.departmentCode})
                </span>
                <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>

              <h2 className="mt-3 font-display text-2xl font-extrabold text-white leading-tight">
                {festival.name}
              </h2>
              <p className="mt-1.5 text-sm text-[#BDB5AC] leading-relaxed">
                {festival.tagline}
              </p>

              {/* Genres */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {festival.genres.map((g) => (
                  <span
                    key={g}
                    className="px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.09] text-[11px] font-medium text-[#DDD5CC]"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>

            <div className="px-5 pt-4 space-y-4">
              {/* Quick Actions */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => onToggleFavorite(festival.id)}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold active:scale-95 transition-all ${
                    isFavorite
                      ? 'bg-[#C85A6E]/20 border-[#C85A6E]/55 text-[#F2A9B6]'
                      : 'bg-white/[0.05] border-white/10 text-[#EAE3DB]'
                  }`}
                >
                  <Heart
                    className={`w-4 h-4 ${isFavorite ? 'fill-[#C85A6E] text-[#C85A6E]' : ''}`}
                  />
                  {isFavorite ? 'Suivi' : 'Suivre'}
                </button>

                <button
                  type="button"
                  onClick={handleCalendar}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-xs font-semibold text-[#EAE3DB] active:scale-95 transition-transform"
                >
                  <CalendarPlus className="w-4 h-4 text-[#C7BEB5]" />
                  Agenda
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-xs font-semibold text-[#EAE3DB] active:scale-95 transition-transform"
                >
                  <Share2 className="w-4 h-4 text-[#C7BEB5]" />
                  Partager
                </button>
              </div>

              {/* INTERACTIVE LINEUP + 1-TAP STREAMING PLAYER */}
              <div className="rounded-2xl bg-[#18151E] border border-white/[0.09] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {hasConfirmedLineup ? (
                      <Sparkles className="w-4 h-4 text-[#F2A9B6]" />
                    ) : (
                      <History className="w-4 h-4 text-amber-300" />
                    )}
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                      {hasConfirmedLineup
                        ? `Line-up ${festival.editionYear} (${festival.lineup.length} artistes)`
                        : `Esprit du festival · Vu en ${festival.previousEdition.year}`}
                    </h3>
                  </div>
                  <span className="text-[10.5px] text-[#9E968F]">Touche un artiste</span>
                </div>

                {!hasConfirmedLineup && (
                  <p className="text-[11.5px] text-[#A9A097] leading-snug">
                    La programmation {festival.editionYear} n’est pas encore dévoilée — découvre l’ambiance musicale en écoutant les artistes de l’édition {festival.previousEdition.year} :
                  </p>
                )}

                {/* Clickable Artist Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {hasConfirmedLineup
                    ? festival.lineup.map((artist) => {
                        const active = selectedArtist === artist.name;
                        return (
                          <button
                            key={artist.name}
                            type="button"
                            onClick={() => setSelectedArtist(artist.name)}
                            className={`px-2.5 py-1.5 rounded-xl border text-left transition-all active:scale-95 ${
                              active
                                ? 'bg-[#C85A6E]/25 border-[#C85A6E]/65 text-white shadow-sm'
                                : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.09] text-[#DDD5CC]'
                            }`}
                          >
                            <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                              <Headphones
                                className={`w-3 h-3 shrink-0 ${
                                  active ? 'text-[#F2A9B6]' : 'text-[#8E8680]'
                                }`}
                              />
                              <span>{artist.name}</span>
                            </div>
                            {(artist.day || artist.genre) && (
                              <div className="mt-0.5 text-[10px] text-[#A9A097]">
                                {[artist.day, artist.genre].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </button>
                        );
                      })
                    : festival.previousEdition.highlights.map((artistName) => {
                        const active = selectedArtist === artistName;
                        return (
                          <button
                            key={artistName}
                            type="button"
                            onClick={() => setSelectedArtist(artistName)}
                            className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 ${
                              active
                                ? 'bg-[#C85A6E]/25 border-[#C85A6E]/65 text-white'
                                : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.09] text-[#DDD5CC]'
                            }`}
                          >
                            <Headphones
                              className={`w-3 h-3 shrink-0 ${
                                active ? 'text-[#F2A9B6]' : 'text-[#8E8680]'
                              }`}
                            />
                            <span>{artistName}</span>
                          </button>
                        );
                      })}
                </div>

                {/* Instant 1-tap Spotify / Apple Music / Deezer / Qobuz / YouTube Bar + Suivre l'artiste */}
                {selectedArtist && (
                  <div className="pt-2.5 border-t border-white/[0.08] space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-[#A9A097] truncate">
                        Écouter <strong className="text-white">{selectedArtist}</strong> :
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleFavoriteArtist(selectedArtist)}
                        className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all active:scale-95 ${
                          isFollowingSelectedArtist
                            ? 'bg-[#C85A6E]/22 border-[#C85A6E]/55 text-[#F2A9B6]'
                            : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/12 text-[#EAE3DB]'
                        }`}
                      >
                        {isFollowingSelectedArtist ? (
                          <>
                            <Check className="w-3 h-3" />
                            Suivi
                          </>
                        ) : (
                          <>
                            <BellPlus className="w-3 h-3 text-[#C85A6E]" />
                            Suivre l’artiste
                          </>
                        )}
                      </button>
                    </div>
                    <StreamingLinksRow artistName={selectedArtist} />
                  </div>
                )}
              </div>

              {/* Practical Info Card */}
              <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] divide-y divide-white/[0.07]">
                <div className="p-3.5 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-[#C85A6E]" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-[#8E8680] font-semibold">
                      Dates · Édition {festival.editionYear}
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {formatFestivalDates(festival)}
                    </div>
                    <p className="text-[11px] text-[#A9A097] mt-0.5">
                      {festival.datesConfirmed
                        ? 'Dates officielles confirmées.'
                        : `Période estimée d’après l’édition ${festival.previousEdition.year} — mise à jour dès l’annonce officielle.`}
                    </p>
                  </div>
                </div>

                {festival.price && (
                  <div className="p-3.5 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
                      <Ticket className="w-4 h-4 text-[#C85A6E]" />
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-[#8E8680] font-semibold">
                        Tarif indicatif
                      </div>
                      <div className="text-sm font-semibold text-white mt-0.5">
                        {festival.price}
                      </div>
                      {festival.previousEdition.attendance && (
                        <div className="text-[11px] text-[#A9A097] mt-0.5">
                          Affluence habituelle : {festival.previousEdition.attendance}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="p-3.5 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" style={{ color: festival.accentColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] uppercase tracking-wider text-[#8E8680] font-semibold">
                      Lieu & accès depuis Toulouse
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {festival.venueName}
                    </div>
                    <p className="text-xs text-[#B3ABA2] mt-0.5">
                      {festival.address} ({festival.departmentName} · {festival.departmentCode})
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.07] text-[11px] font-medium text-[#E3DBD2]">
                        <Car className="w-3 h-3 text-[#C85A6E]" />
                        {festival.distanceFromToulouse}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowRoutePicker(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#C85A6E]/15 hover:bg-[#C85A6E]/25 border border-[#C85A6E]/35 text-[11px] font-semibold text-[#F2A9B6] active:scale-95 transition-all"
                      >
                        <Navigation className="w-3 h-3" />
                        Itinéraire (Maps · Plans · Waze)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Bottom CTA */}
          <div className="absolute bottom-0 inset-x-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-[#131117] via-[#131117]/95 to-transparent">
            <a
              href={festival.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 px-5 rounded-2xl bg-[#C85A6E] hover:bg-[#DA7083] active:scale-[0.98] transition-all text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#C85A6E]/25"
            >
              <span>Site officiel & billetterie · {festival.name}</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* GPS Route Picker (Google Maps · Apple Plans · Waze) */}
      <RoutePickerSheet
        destination={
          showRoutePicker
            ? {
                id: festival.id,
                name: festival.name,
                shortName: festival.city,
                address: festival.address,
                transit: festival.distanceFromToulouse,
                lat: festival.lat,
                lng: festival.lng,
              }
            : null
        }
        onClose={() => setShowRoutePicker(false)}
      />
    </>
  );
}
