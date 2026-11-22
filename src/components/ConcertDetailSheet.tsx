import { useEffect, useState } from 'react';
import {
  Calendar,
  CalendarPlus,
  Clock,
  Disc3,
  ExternalLink,
  Headphones,
  Heart,
  MapPin,
  Maximize2,
  Navigation,
  PlayCircle,
  Share2,
  Ticket,
  TrainFront,
  X,
} from 'lucide-react';
import type { Concert, Venue } from '../data/toulouseData';
import { cleanArtistQuery, downloadConcertIcs, formatFullDate } from '../utils/dates';
import { RoutePickerSheet } from './RoutePickerSheet';

interface ConcertDetailSheetProps {
  concert: Concert | null;
  venue: Venue | null;
  isFavorite: boolean;
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
  onSelectVenue: (venueId: string) => void;
  onNotify: (msg: string) => void;
}

export function ConcertDetailSheet({
  concert,
  venue,
  isFavorite,
  onClose,
  onToggleFavorite,
  onSelectVenue,
  onNotify,
}: ConcertDetailSheetProps) {
  const [zoomPoster, setZoomPoster] = useState(false);
  const [showRoutePicker, setShowRoutePicker] = useState(false);

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

  const artistQuery = cleanArtistQuery(concert.title);
  const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(artistQuery)}`;
  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artistQuery} live music`)}`;
  const deezerUrl = `https://www.deezer.com/search/${encodeURIComponent(artistQuery)}`;

  const handleShare = async () => {
    const shareText = `${concert.title} au ${venue.name} le ${formatFullDate(concert.date)} à ${concert.time}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: concert.title,
          text: shareText,
          url: concert.venueEventUrl,
        });
        return;
      } catch {
        // User cancelled or unsupported
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText} — ${concert.venueEventUrl}`);
      onNotify('Lien du concert copié !');
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
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-[440px] max-h-[92dvh] rounded-t-3xl bg-[#131117] border-t border-x border-white/12 shadow-2xl flex flex-col overflow-hidden animate-sheet-up"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-20 w-10 h-1 rounded-full bg-white/35" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="absolute top-3.5 right-3.5 z-20 w-9 h-9 rounded-full bg-black/65 backdrop-blur-md border border-white/15 flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <X className="w-4.5 h-4.5" />
          </button>

          {/* Scrollable content */}
          <div className="overflow-y-auto no-scrollbar pb-28">
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
                <span className="px-2.5 py-0.5 rounded-full bg-[#E85D4A]/18 border border-[#E85D4A]/35 text-[11px] font-semibold text-[#F69587]">
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
                      ? 'bg-[#E85D4A]/20 border-[#E85D4A]/50 text-[#F79A8C]'
                      : 'bg-white/[0.05] border-white/10 text-[#EAE3DB]'
                  }`}
                >
                  <Heart
                    className={`w-4 h-4 ${isFavorite ? 'fill-[#E85D4A] text-[#E85D4A]' : ''}`}
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

              {/* Écoute rapide de l'artiste (Spotify / YouTube / Deezer) */}
              <div className="mt-3.5 rounded-2xl bg-[#1A1720] border border-white/[0.08] p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-[#9E968F] font-semibold flex items-center gap-1.5">
                    <Headphones className="w-3.5 h-3.5 text-[#E85D4A]" />
                    Écouter « {artistQuery} »
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <a
                    href={spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-2 rounded-xl bg-[#1DB954]/15 hover:bg-[#1DB954]/25 border border-[#1DB954]/35 text-[11.5px] font-semibold text-[#6EE7A0] flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  >
                    <Disc3 className="w-3.5 h-3.5" />
                    Spotify
                  </a>
                  <a
                    href={youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-2 rounded-xl bg-[#FF0000]/15 hover:bg-[#FF0000]/25 border border-[#FF0000]/30 text-[11.5px] font-semibold text-[#FCA5A5] flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    YouTube
                  </a>
                  <a
                    href={deezerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-2 rounded-xl bg-[#A238FF]/15 hover:bg-[#A238FF]/25 border border-[#A238FF]/35 text-[11.5px] font-semibold text-[#D8B4FE] flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    Deezer
                  </a>
                </div>
              </div>

              {/* Practical details box */}
              <div className="mt-4 rounded-2xl bg-[#1A1720] border border-white/[0.08] divide-y divide-white/[0.06]">
                <div className="p-3.5 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-[#E85D4A]" />
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
                      <Ticket className="w-4 h-4 text-[#E85D4A]" />
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
                        className="text-[11px] font-semibold text-[#E85D4A] hover:underline"
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
                        <TrainFront className="w-3 h-3 text-[#E85D4A]" />
                        {venue.transit}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowRoutePicker(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#E85D4A]/15 hover:bg-[#E85D4A]/25 border border-[#E85D4A]/35 text-[11px] font-semibold text-[#F69587] active:scale-95 transition-all"
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
              className="w-full py-3.5 px-5 rounded-2xl bg-[#E85D4A] hover:bg-[#F06B59] active:scale-[0.98] transition-all text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#E85D4A]/25"
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
