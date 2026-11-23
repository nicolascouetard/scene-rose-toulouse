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
    const q = search.trim().toLowerCase();
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
            ...f.genres,
            ...f.lineup.map((a) => a.name),
            ...f.previousEdition.highlights,
          ]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) return false;
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
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
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
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
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
        <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4">
          {filtered.map((festival) => {
            const isFav = favoriteIds.includes(festival.id);
            const pill = STATUS_PILL[festival.status];
            const hasLineup = festival.lineup.length > 0;
            const previewArtists = hasLineup
              ? festival.lineup.slice(0, 4).map((a) => a.name)
              : festival.previousEdition.highlights.slice(0, 4);

            return (
              <article
                key={festival.id}
                onClick={() => onSelectFestival(festival)}
                className="group cursor-pointer rounded-2xl bg-[#16141A] hover:bg-[#1B1821] border border-white/[0.08] hover:border-white/[0.16] overflow-hidden flex flex-col justify-between transition-all"
              >
                {/* Top Accent Strip + Header */}
                <div
                  className="p-4 space-y-2.5"
                  style={{
                    background: `radial-gradient(280px circle at 95% 0%, ${festival.accentColor}26, transparent 70%)`,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className="px-2 py-0.5 rounded-md text-[10.5px] font-bold text-white"
                        style={{ backgroundColor: `${festival.accentColor}CC` }}
                      >
                        {festival.editionYear}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md border text-[10.5px] font-semibold ${pill.cls}`}>
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
                      className="w-8 h-8 -mt-1 -mr-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center shrink-0 transition-colors"
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          isFav ? 'fill-[#C85A6E] text-[#C85A6E]' : 'text-[#A9A097]'
                        }`}
                      />
                    </button>
                  </div>

                  <div>
                    <h3 className="font-display text-[16px] font-extrabold text-white group-hover:text-[#F2A9B6] transition-colors leading-snug">
                      {festival.name}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-[#CFC7BE]">
                      <span className="inline-flex items-center gap-1 font-semibold text-[#F2A9B6]">
                        <Calendar className="w-3 h-3" />
                        {formatFestivalDates(festival)}
                      </span>
                    </div>
                  </div>

                  {/* Location & Distance */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#A9A097]">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#C85A6E]" />
                      {festival.city} ({festival.departmentCode})
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Car className="w-3 h-3 text-[#9E968F]" />
                      {festival.distanceFromToulouse}
                    </span>
                  </div>

                  {/* Line-up or 2026 DNA preview */}
                  <div className="pt-1.5 border-t border-white/[0.07]">
                    <div className="flex items-center justify-between text-[10.5px] font-semibold mb-1.5">
                      <span className="flex items-center gap-1 text-[#DDD5CC]">
                        {hasLineup ? (
                          <>
                            <Sparkles className="w-3 h-3 text-[#F2A9B6]" />
                            Line-up {festival.editionYear}
                          </>
                        ) : (
                          <>
                            <Headphones className="w-3 h-3 text-[#9E968F]" />
                            Vu en {festival.previousEdition.year} (à écouter)
                          </>
                        )}
                      </span>
                      <span className="text-[#F2A9B6]">Écouter →</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {previewArtists.map((artist) => (
                        <span
                          key={artist}
                          className="px-2 py-0.5 rounded-md bg-white/[0.06] text-[10.5px] font-medium text-[#EAE3DB]"
                        >
                          {artist}
                        </span>
                      ))}
                      {hasLineup && festival.lineup.length > 4 && (
                        <span className="px-2 py-0.5 rounded-md bg-[#C85A6E]/15 text-[10.5px] font-bold text-[#F2A9B6]">
                          +{festival.lineup.length - 4}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="px-4 py-2.5 bg-white/[0.025] border-t border-white/[0.06] flex items-center justify-between text-[11px]">
                  <span className="text-[#A9A097] truncate">
                    {festival.genres.slice(0, 3).join(' · ')}
                  </span>
                  {festival.price && (
                    <span className="shrink-0 font-bold text-white ml-2">
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
