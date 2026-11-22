import { AlertTriangle, Heart, Music2, Share2 } from 'lucide-react';
import type { Concert, Venue } from '../data/toulouseData';
import { ConcertCard } from './ConcertCard';

interface FavoritesViewProps {
  concerts: Concert[];
  venueMap: Record<string, Venue>;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onSelectConcert: (concert: Concert) => void;
  onGoExplore: () => void;
  onShareSelection: () => void;
}

export function FavoritesView({
  concerts,
  venueMap,
  favorites,
  onToggleFavorite,
  onSelectConcert,
  onGoExplore,
  onShareSelection,
}: FavoritesViewProps) {
  const saved = concerts.filter((c) => favorites.includes(c.id));
  const lastTicketsAlerts = saved.filter((c) => c.status === 'last-tickets');
  const soldOutAlerts = saved.filter((c) => c.status === 'sold-out');
  const hasAlerts = lastTicketsAlerts.length > 0 || soldOutAlerts.length > 0;

  if (saved.length === 0) {
    return (
      <div className="px-6 py-16 text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-[#19161E] border border-white/10 flex items-center justify-center mb-4">
          <Heart className="w-7 h-7 text-[#C85A6E]" />
        </div>
        <h2 className="font-display text-lg font-bold text-white">
          Aucun concert enregistré
        </h2>
        <p className="mt-1.5 text-sm text-[#9E968F] max-w-[280px] leading-relaxed">
          Appuie sur le cœur d’un concert pour suivre sa billetterie (alertes Dernières places / Complet) et partager ta liste avec tes amis.
        </p>
        <button
          type="button"
          onClick={onGoExplore}
          className="mt-5 px-5 py-2.5 rounded-xl bg-[#C85A6E] hover:bg-[#DA7083] text-white text-sm font-semibold active:scale-95 transition-transform inline-flex items-center gap-2"
        >
          <Music2 className="w-4 h-4" />
          Explorer les concerts
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 pt-3 pb-6 space-y-3.5">
      {/* Header + Share selection button */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-extrabold text-white">
            Mes favoris ({saved.length})
          </h2>
          <p className="text-xs text-[#9E968F] mt-0.5">
            Suivi billetterie en direct · sauvegardé hors-ligne
          </p>
        </div>

        <button
          type="button"
          onClick={onShareSelection}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#C85A6E]/18 hover:bg-[#C85A6E]/28 border border-[#C85A6E]/40 text-xs font-bold text-[#F2A9B6] active:scale-95 transition-all"
        >
          <Share2 className="w-3.5 h-3.5" />
          Partager
        </button>
      </div>

      {/* Smart ticketing alerts banner for saved concerts */}
      {hasAlerts && (
        <div className="rounded-2xl bg-gradient-to-r from-amber-500/15 to-rose-500/15 border border-amber-400/35 p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
            <span>Alerte billetterie sur tes favoris</span>
          </div>
          <div className="space-y-1.5">
            {lastTicketsAlerts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectConcert(c)}
                className="w-full text-left flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-black/30 hover:bg-black/45 transition-colors"
              >
                <span className="text-xs font-semibold text-white truncate">{c.title}</span>
                <span className="shrink-0 px-2 py-0.5 rounded bg-amber-500 text-[10px] font-bold uppercase text-[#130F09]">
                  Dernières places
                </span>
              </button>
            ))}
            {soldOutAlerts.map((c) => (
              <button
                key={c.id}
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

      {/* Saved concert cards */}
      <div className="space-y-2.5 md:space-y-0 md:grid md:grid-cols-2 md:gap-3">
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
  );
}
