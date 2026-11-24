import { useEffect, useState } from 'react';
import {
  BellPlus,
  Calendar,
  CalendarPlus,
  Check,
  Clock,
  ExternalLink,
  Headphones,
  Heart,
  MapPin,
  Maximize2,
  Navigation,
  Share2,
  Ticket,
  TrainFront,
  X,
} from 'lucide-react';
import type { Concert, Venue } from '../data/toulouseData';
import { useSwipeDownToClose } from '../hooks/useSwipeDownToClose';
import {
  downloadConcertIcs,
  extractListenArtists,
  formatFullDate,
  normalizeSearchText,
} from '../utils/dates';
import { RoutePickerSheet } from './RoutePickerSheet';
import { StreamingLinksRow } from './StreamingLinksRow';

interface ConcertDetailSheetProps {
  concert: Concert | null;
  venue: Venue | null;
  isFavorite: boolean;
  favoriteArtists: string[];
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
  onToggleFavoriteArtist: (artistName: string) => void;
  onSelectVenue: (venueId: string) => void;
  onNotify: (msg: string) => void;
}

export function ConcertDetailSheet({
  concert,
  venue,
  isFavorite,
  favoriteArtists,
  onClose,
  onToggleFavorite,
  onToggleFavoriteArtist,
  onSelectVenue,
  onNotify,
}: ConcertDetailSheetProps) {
  const [zoomPoster, setZoomPoster] = useState(false);
  const [showRoutePicker, setShowRoutePicker] = useState(false);
  const [selectedArtistIdx, setSelectedArtistIdx] = useState(0);
  const { scrollRef, sheetStyle, backdropOpacity, handlers } = useSwipeDownToClose({
    onClose,
  });

  useEffect(() => {
    setSelectedArtistIdx(0);
  }, [concert?.id]);

  useEffect(() => {
    if (!concert) {
      setZoomPoster(false);
      setShowRoutePicker(false);
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showRoutePicker) setShowRoutePicker(false);
        else if (zoomPoster) setZoomPoster(false);
        else onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [concert, zoomPoster, showRoutePicker, onClose]);

  if (!concert || !venue) return null;

  const listenArtists = extractListenArtists(concert.title);
  const activeArtist = listenArtists[selectedArtistIdx] || listenArtists[0] || null;
  const isFollowingActiveArtist = Boolean(
    activeArtist &&
      favoriteArtists.some(
        (a) => normalizeSearchText(a) === normalizeSearchText(activeArtist)
      )
  );

  const handleShare = async () => {
    const deepUrl = new URL(window.location.href);
    deepUrl.search = '';
    deepUrl.searchParams.set('concert', concert.id);
    const shareUrl = deepUrl.toString();
    const shareText = `${concert.title} au ${venue.name} le ${formatFullDate(concert.date)} à ${concert.time}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${concert.title} · Scène Rose`,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // User cancelled or unsupported
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      onNotify('Lien direct du concert copié !');
    } catch {
      onNotify('Lien prêt à être partagé');
    }
  };

  const handleCalendar = () => {
    downloadConcertIcs(concert, venue);
    onNotify('Fichier calendrier (.ics) téléchargé');
  };

  const statusMeta = {
    available: {
      label: 'Places disponibles',
      cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    },
    'last-tickets': {
      label: 'Dernières places',
      cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    },
    'sold-out': {
      label: 'Complet',
      cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    },
    free: {
      label: 'Entrée gratuite',
      cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    },
  }[concert.status];

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
          {/* Swipe-down handle zone (mobile) */}
          <div
            data-swipe-handle="true"
            className="absolute top-0 inset-x-0 h-11 z-20 flex items-start justify-center pt-2.5 md:pointer-events-none"
          >
            <div className="w-11 h-1.5 rounded-full bg-white/40 shadow" />
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="absolute top-3.5 right-3.5 z-30 w-9 h-9 rounded-full bg-black/65 backdrop-blur-md border border-white/15 flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <X className="w-4.5 h-4.5" />
          </button>

          {/* Scrollable content */}
          <div ref={scrollRef} className="overflow-y-auto no-scrollbar pb-28">
            {/* Hero Poster */}
            <div className="relative w-full aspect-[16/11] bg-[#1C1922] overflow-hidden">
              <img
                src={concert.poster}
                alt={`Affiche ${concert.title}`}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src !== concert.sourcePosterUrl) {
                    target.src = concert.sourcePosterUrl;
                  }
                }}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#131117] via-transparent to-black/35" />

              <button
                type="button"
                onClick={() => setZoomPoster(true)}
                className="absolute bottom-3 right-3 px-2.5 py-1.5 rounded-full bg-black/65 backdrop-blur-md border border-white/15 flex items-center gap-1.5 text-[11px] font-medium text-white active:scale-95 transition-transform"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Voir l’affiche
              </button>

              <div className="absolute bottom-3 left-4">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-semibold backdrop-blur-md ${statusMeta.cls}`}
                >
                  {statusMeta.label}
                </span>
              </div>
            </div>

            {/* Main details */}
            <div className="px-5 pt-3">
              {/* Genres */}
              <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                <span className="px-2.5 py-0.5 rounded-full bg-[#C85A6E]/18 border border-[#C85A6E]/35 text-[11px] font-semibold text-[#F2A9B6]">
                  {concert.category}
                </span>
                {concert.genres.map((genre) => (
                  <span
                    key={genre}
                    className="px-2.5 py-0.5 rounded-full bg-white/[0.07] text-[11px] font-medium text-[#D6CEC5]"
                  >
                    {genre}
                  </span>
                ))}
              </div>

              <h2 className="font-display text-xl font-extrabold leading-tight text-white">
                {concert.title}
              </h2>

              {concert.subtitle && (
                <p className="mt-2 text-sm leading-relaxed text-[#B8B0A7]">
                  {concert.subtitle}
                </p>
              )}

              {/* Quick action row */}
              <div className="mt-4 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => onToggleFavorite(concert.id)}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold active:scale-95 transition-all ${
                    isFavorite
                      ? 'bg-[#C85A6E]/20 border-[#C85A6E]/50 text-[#F2A9B6]'
                      : 'bg-white/[0.05] border-white/10 text-[#EAE3DB]'
                  }`}
                >
                  <Heart
                    className={`w-4 h-4 ${isFavorite ? 'fill-[#C85A6E] text-[#C85A6E]' : ''}`}
                  />
                  {isFavorite ? 'Enregistré' : 'Favori'}
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

              {/* Écoute rapide du ou des artistes au line-up + Suivre l'artiste */}
              {activeArtist && (
                <div className="mt-3.5 rounded-2xl bg-[#1A1720] border border-white/[0.08] p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] uppercase tracking-wider text-[#9E968F] font-semibold flex items-center gap-1.5 min-w-0 truncate">
                      <Headphones className="w-3.5 h-3.5 text-[#C85A6E] shrink-0" />
                      <span className="truncate">
                        {listenArtists.length > 1
                          ? `Line-up (${listenArtists.length} artistes)`
                          : `Écouter « ${activeArtist} »`}
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() => onToggleFavoriteArtist(activeArtist)}
                      className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all active:scale-95 ${
                        isFollowingActiveArtist
                          ? 'bg-[#C85A6E]/22 border-[#C85A6E]/55 text-[#F2A9B6]'
                          : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/12 text-[#EAE3DB]'
                      }`}
                    >
                      {isFollowingActiveArtist ? (
                        <>
                          <Check className="w-3 h-3" />
                          Suivi
                        </>
                      ) : (
                        <>
                          <BellPlus className="w-3 h-3 text-[#C85A6E]" />
                          Suivre
                        </>
                      )}
                    </button>
                  </div>

                  {listenArtists.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      {listenArtists.map((artist, idx) => {
                        const isSelected = idx === selectedArtistIdx;
                        return (
                          <button
                            key={artist}
                            type="button"
                            onClick={() => setSelectedArtistIdx(idx)}
                            className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold transition-all ${
                              isSelected
                                ? 'bg-[#C85A6E] text-white shadow-sm shadow-[#C85A6E]/30'
                                : 'bg-white/[0.06] text-[#CFC8C0] hover:bg-white/[0.12] hover:text-white border border-white/[0.08]'
                            }`}
                          >
                            {artist}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <StreamingLinksRow artistName={activeArtist} />
                </div>
              )}

              {/* Practical details box */}
              <div className="mt-4 rounded-2xl bg-[#1A1720] border border-white/[0.08] divide-y divide-white/[0.06]">
                <div className="p-3.5 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-[#C85A6E]" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-[#8E8680] font-semibold">
                      Date & horaire
                    </div>
                    <div className="text-sm font-semibold text-white mt-0.5 capitalize">
                      {formatFullDate(concert.date)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#B3ABA2]">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Début / portes : {concert.time}</span>
                      {concert.endDate && (
                        <span>· Jusqu’au {formatFullDate(concert.endDate)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {concert.price && (
                  <div className="p-3.5 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
                      <Ticket className="w-4 h-4 text-[#C85A6E]" />
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-[#8E8680] font-semibold">
                        Tarif indicatif
                      </div>
                      <div className="text-sm font-semibold text-white mt-0.5">
                        {concert.price}
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-3.5 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" style={{ color: venue.accentColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] uppercase tracking-wider text-[#8E8680] font-semibold">
                        Salle de concert
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onSelectVenue(venue.id);
                        }}
                        className="text-[11px] font-semibold text-[#C85A6E] hover:underline"
                      >
                        Tous ses concerts
                      </button>
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {venue.name}
                    </div>
                    <p className="text-xs text-[#B3ABA2] mt-0.5 leading-snug">
                      {venue.address}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.07] text-[11px] font-medium text-[#E3DBD2]">
                        <TrainFront className="w-3 h-3 text-[#C85A6E]" />
                        {venue.transit}
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
              href={concert.venueEventUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 px-5 rounded-2xl bg-[#C85A6E] hover:bg-[#DA7083] active:scale-[0.98] transition-all text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#C85A6E]/25"
            >
              <span>Aller sur le site · {venue.shortName}</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Fullscreen poster lightbox */}
      {zoomPoster && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setZoomPoster(false)}
        >
          <button
            type="button"
            onClick={() => setZoomPoster(false)}
            aria-label="Fermer l'affiche"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={concert.poster}
            alt={`Affiche complète ${concert.title}`}
            className="max-w-full max-h-[86dvh] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}

      {/* Route Picker Sheet (Google Maps · Apple Plans · Waze) */}
      <RoutePickerSheet
        venue={showRoutePicker ? venue : null}
        onClose={() => setShowRoutePicker(false)}
      />
    </>
  );
}
