import { ExternalLink, Heart, Sparkles } from 'lucide-react';
import type { Concert, Venue } from '../data/toulouseData';
import { formatShortDate } from '../utils/dates';

interface FeaturedCarouselProps {
  concerts: Concert[];
  venueMap: Record<string, Venue>;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onSelectConcert: (concert: Concert) => void;
}

export function FeaturedCarousel({
  concerts,
  venueMap,
  favorites,
  onToggleFavorite,
  onSelectConcert,
}: FeaturedCarouselProps) {
  if (concerts.length === 0) return null;

  return (
    <section className="pt-3 pb-2">
      <div className="flex items-center justify-between px-4 mb-2.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#E85D4A]" />
          <h2 className="font-display text-xs font-bold uppercase tracking-[0.14em] text-[#EAE4DC]">
            À ne pas manquer
          </h2>
        </div>
        <span className="text-[11px] text-[#8E8680]">Sélection toulousaine</span>
      </div>

      <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory px-4 pb-1">
        {concerts.map((concert) => {
          const venue = venueMap[concert.venueId];
          const isFav = favorites.includes(concert.id);

          return (
            <div
              key={concert.id}
              onClick={() => onSelectConcert(concert)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectConcert(concert);
                }
              }}
              className="group relative snap-start shrink-0 w-[264px] h-[200px] rounded-2xl overflow-hidden bg-[#17151B] border border-white/10 cursor-pointer active:scale-[0.98] transition-transform"
            >
              <img
                src={concert.poster}
                alt={`Affiche ${concert.title}`}
                loading="eager"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src !== concert.sourcePosterUrl) {
                    target.src = concert.sourcePosterUrl;
                  }
                }}
                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
              />

              {/* Dark gradient scrim for legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0A0D] via-[#0B0A0D]/45 to-black/15" />

              {/* Top pills */}
              <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-md border border-white/15 text-[11px] font-semibold text-white">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: venue?.accentColor || '#E85D4A' }}
                  />
                  {formatShortDate(concert.date)} · {concert.time}
                </span>

                <button
                  type="button"
                  aria-label={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(concert.id);
                  }}
                  className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <Heart
                    className={`w-4 h-4 transition-colors ${
                      isFav ? 'fill-[#E85D4A] text-[#E85D4A]' : 'text-white/90'
                    }`}
                  />
                </button>
              </div>

              {/* Bottom content */}
              <div className="absolute bottom-0 inset-x-0 p-3">
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {concert.genres.slice(0, 2).map((g) => (
                    <span
                      key={g}
                      className="px-2 py-0.5 rounded-md bg-white/12 backdrop-blur-sm text-[10px] font-medium text-[#F5EFE9]"
                    >
                      {g}
                    </span>
                  ))}
                </div>
                <h3 className="font-display text-[15px] font-bold leading-tight text-white line-clamp-2">
                  {concert.title}
                </h3>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-[#CFC7BE]">
                  <span className="truncate font-medium">{venue?.shortName}</span>
                  <a
                    href={concert.venueEventUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 shrink-0 text-[#F48A7B] hover:text-white font-semibold"
                  >
                    Salle
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
