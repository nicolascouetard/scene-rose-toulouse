import { useMemo, useState } from 'react';
import {
  Calendar,
  Car,
  Headphones,
  Heart,
  MapPin,
  Search,
  Sparkles,
  Tent,
  X,
} from 'lucide-react';
import {
  formatFestivalDates,
  type Festival,
} from '../data/festivalsData';
import { GENRE_CATEGORIES, type GenreCategory } from '../data/toulouseData';
import { matchesSearchQuery } from '../utils/dates';

interface FestivalsViewProps {
  festivals: Festival[];
  favoriteIds: string[];
  onToggleFavorite: (id: string) => void;
  onSelectFestival: (festival: Festival) => void;
}

type ZoneFilter = 'all' | 'toulouse' | 'near' | 'with-lineup';

const STATUS_PILL: Record<Festival['status'], { label: string; cls: string }> = {
  available: {
    label: 'Pass dispo',
    cls: 'bg-emerald-500/18 text-emerald-300 border-emerald-500/35',
  },
  'early-bird': {
    label: 'Early Bird',
    cls: 'bg-[#C85A6E]/22 text-[#F2A9B6] border-[#C85A6E]/45',
  },
  'last-tickets': {
    label: 'Dernières places',
    cls: 'bg-amber-500/18 text-amber-300 border-amber-500/35',
  },
  'sold-out': {
    label: 'Complet',
    cls: 'bg-rose-500/18 text-rose-300 border-rose-500/35',
  },
  free: {
    label: 'Gratuit',
    cls: 'bg-emerald-500/18 text-emerald-300 border-emerald-500/35',
  },
  'upcoming-tba': {
    label: 'À venir',
    cls: 'bg-white/[0.07] text-[#CFC7BE] border-white/12',
  },
};

export function FestivalsView({
  festivals,
  favoriteIds,
  onToggleFavorite,
  onSelectFestival,
}: FestivalsViewProps) {
  const [search, setSearch] = useState('');
  const [zone, setZone] = useState<ZoneFilter>('all');
  const [genre, setGenre] = useState<GenreCategory | 'all'>('all');

  const filtered = useMemo(() => {
    const q = search.trim();
    return festivals
      .filter((f) => {
        if (zone === 'toulouse' && f.zone !== 'toulouse') return false;
        if (zone === 'near' && f.driveMinutes > 90) return false;
        if (zone === 'with-lineup' && f.lineup.length === 0) return false;
        if (genre !== 'all' && f.category !== genre) return false;

        if (q) {
          const haystack = [
            f.name,
            f.city,
            f.departmentName,
            f.departmentCode,
            f.tagline,
            f.venueName,
            ...f.genres,
            ...f.lineup.map((a) => a.name),
            ...f.previousEdition.highlights,
          ].join(' ');
          if (!matchesSearchQuery(haystack, q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [festivals, search, zone, genre]);

  const { toulouseCount, nearCount, withLineupCount } = useMemo(
    () => ({
      toulouseCount: festivals.filter((f) => f.zone === 'toulouse').length,
      nearCount: festivals.filter((f) => f.driveMinutes <= 90).length,
      withLineupCount: festivals.filter((f) => f.lineup.length > 0).length,
    }),
    [festivals]
  );

  return (
    <div className="px-4 md:px-6 pt-3 pb-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-2">
        <h2 className="font-display text-lg md:text-xl font-extrabold text-white">
          Festivals en Occitanie
        </h2>
      </div>

      {/* Search + Filters */}
      <div className="space-y-2.5">
        <div className="relative flex items-center max-w-xl">
          <Search className="w-4 h-4 text-[#8E8680] absolute left-3.5 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Festival, ville, département (81, 30…) ou artiste (IDLES, Sting…)"
            className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-[#18151D] border border-white/[0.08] focus:border-[#C85A6E]/60 focus:outline-none text-[13px] text-white placeholder:text-[#78706A] transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Effacer"
              className="absolute right-2.5 p-1 rounded-full text-[#8E8680] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Zone filter pills */}
        <div className="flex md:flex-wrap items-center gap-1.5 overflow-x-auto md:overflow-visible no-scrollbar">
          {[
            { id: 'all' as const, label: `Toute l’Occitanie (${festivals.length})` },
            { id: 'toulouse' as const, label: `Toulouse (${toulouseCount})` },
            { id: 'near' as const, label: `≤ 1h30 de Toulouse (${nearCount})` },
            {
              id: 'with-lineup' as const,
              label: `Line-up annoncé (${withLineupCount})`,
            },
          ].map((item) => {
            const active = zone === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setZone(item.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  active
                    ? 'bg-[#C85A6E] text-white shadow-sm shadow-[#C85A6E]/25'
                    : 'bg-[#18151D] text-[#A9A097] border border-white/[0.07] hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Genre chips */}
        <div className="flex md:flex-wrap items-center gap-1.5 overflow-x-auto md:overflow-visible no-scrollbar">
          <button
            type="button"
            onClick={() => setGenre('all')}
            className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
              genre === 'all'
                ? 'bg-white text-[#0E0D10]'
                : 'bg-white/[0.05] text-[#A9A097] hover:text-white'
            }`}
          >
            Tous styles
          </button>
          {GENRE_CATEGORIES.filter((g) => g !== 'Classique & Ciné').map((g) => {
            const active = genre === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setGenre(active ? 'all' : g)}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  active
                    ? 'bg-white text-[#0E0D10]'
                    : 'bg-white/[0.05] text-[#A9A097] hover:text-white'
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </div>

      {/* Festival Cards Grid */}
      {filtered.length === 0 ? (
        <div className="py-14 text-center rounded-2xl bg-[#16141A] border border-white/[0.08]">
          <Tent className="w-7 h-7 text-[#C85A6E] mx-auto mb-2" />
          <p className="font-display text-sm font-bold text-white">
            Aucun festival trouvé
          </p>
          <p className="text-xs text-[#9E968F] mt-1">
            Essaie un autre filtre ou réinitialise la recherche.
          </p>
        </div>
      ) : (
        <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-5">
          {filtered.map((festival) => {
            const isFav = favoriteIds.includes(festival.id);
            const pill = STATUS_PILL[festival.status];
            const hasLineup = festival.lineup.length > 0;
            const previewArtists = hasLineup
              ? festival.lineup.slice(0, 4).map((a) => a.name)
              : festival.previousEdition.highlights.slice(0, 3);

            return (
              <article
                key={festival.id}
                onClick={() => onSelectFestival(festival)}
                className="group cursor-pointer rounded-2xl bg-[#16141A] hover:bg-[#1B1821] border border-white/[0.08] hover:border-white/[0.16] overflow-hidden flex flex-col justify-between transition-all"
              >
                {/* Top Accent Strip + Airy Editorial Body */}
                <div
                  className="p-5 space-y-3.5"
                  style={{
                    background: `radial-gradient(300px circle at 95% 0%, ${festival.accentColor}24, transparent 70%)`,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold text-white"
                        style={{ backgroundColor: `${festival.accentColor}CC` }}
                      >
                        {festival.editionYear}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-semibold ${pill.cls}`}>
                        {pill.label}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(festival.id);
                      }}
                      aria-label={isFav ? 'Ne plus suivre' : 'Suivre ce festival'}
                      className="w-9 h-9 -mr-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center shrink-0 transition-colors"
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          isFav ? 'fill-[#C85A6E] text-[#C85A6E]' : 'text-[#A9A097]'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Title & Dates */}
                  <div className="space-y-1.5">
                    <h3 className="font-display text-[18px] font-extrabold text-white group-hover:text-[#F2A9B6] transition-colors leading-snug tracking-tight">
                      {festival.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#F2A9B6]">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span>{formatFestivalDates(festival)}</span>
                    </div>
                  </div>

                  {/* Location & Distance */}
                  <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-[#B7AFA6]">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#C85A6E] shrink-0" />
                      <span>
                        {festival.city} ({festival.departmentCode})
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[#9E968F]">
                      <Car className="w-3.5 h-3.5 shrink-0" />
                      <span>{festival.distanceFromToulouse}</span>
                    </span>
                  </div>

                  {/* Line-up or previous edition preview */}
                  <div className="pt-3 border-t border-white/[0.07] space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="flex items-center gap-1.5 text-[#DDD5CC]">
                        {hasLineup ? (
                          <>
                            <Sparkles className="w-3.5 h-3.5 text-[#F2A9B6]" />
                            Line-up {festival.editionYear}
                          </>
                        ) : (
                          <>
                            <Headphones className="w-3.5 h-3.5 text-[#9E968F]" />
                            Vu en {festival.previousEdition.year}
                          </>
                        )}
                      </span>
                      <span className="text-[#F2A9B6] text-[11.5px]">Voir & écouter →</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {previewArtists.map((artist) => (
                        <span
                          key={artist}
                          className="px-2.5 py-1 rounded-lg bg-white/[0.06] text-xs font-medium text-[#EAE3DB]"
                        >
                          {artist}
                        </span>
                      ))}
                      {hasLineup && festival.lineup.length > 4 && (
                        <span className="px-2.5 py-1 rounded-lg bg-[#C85A6E]/15 text-xs font-bold text-[#F2A9B6]">
                          +{festival.lineup.length - 4}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="px-5 py-3 bg-white/[0.025] border-t border-white/[0.06] flex items-center justify-between gap-3 text-xs">
                  <span className="text-[#A9A097] truncate">
                    {festival.genres.slice(0, 3).join(' · ')}
                  </span>
                  {festival.price && (
                    <span className="shrink-0 font-bold text-white">
                      {festival.price}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
