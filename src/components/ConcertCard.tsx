import { Clock, ExternalLink, Heart, MapPin, Moon, Sparkles } from 'lucide-react';
import type { Concert, Venue } from '../data/toulouseData';
import { PosterImage } from './PosterImage';
import { formatShortDate, isRecentlyAdded } from '../utils/dates';

interface ConcertCardProps {
  concert: Concert;
  venue: Venue;
  isFavorite: boolean;
  viewMode: 'list' | 'grid';
  showDateBadge?: boolean;
  onToggleFavorite: (id: string) => void;
  onSelect: (concert: Concert) => void;
}

/**
 * Un statut billetterie n'est fiable que si la salle a répondu à une synchro récente.
 * Seuil volontairement haut (7 jours) : une simple synchro manquée (site en
 * maintenance un jour) ne doit pas polluer toutes les cartes. Au-delà, la salle
 * échoue de façon répétée et l'information devient réellement incertaine.
 */
const STALE_STATUS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Origine du statut billetterie :
 *  - 'fallback' : la date a été confirmée par une source externe, mais la salle
 *    n'a jamais communiqué de statut (Complet / Dernières places) → inconnu.
 *  - undefined  : statut collecté normalement auprès de la salle.
 */
function isStatusUnknown(concert: Pick<Concert, 'statusSource'>) {
  return concert.statusSource === 'fallback';
}

function isStatusStale(statusVerifiedAt?: string) {
  if (!statusVerifiedAt) return true;
  const verified = new Date(statusVerifiedAt).getTime();
  if (Number.isNaN(verified)) return true;
  return Date.now() - verified > STALE_STATUS_MS;
}

function StaleStatusBadge({ unknown = false }: { unknown?: boolean }) {
  return (
    <span
      title={
        unknown
          ? "Date confirmée, mais cette salle ne communique pas son statut billetterie : vérifie sur le site de la salle."
          : "La salle ne répond plus aux synchronisations : le statut billetterie date de plus d'une semaine."
      }
      aria-label={
        unknown
          ? 'Statut billetterie inconnu pour cette salle'
          : 'Statut billetterie non vérifié depuis plus d’une semaine'
      }
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-black/60 backdrop-blur-md border border-white/25 text-[10px] font-bold text-amber-200"
    >
      ?
    </span>
  );
}

function StatusPill({ status }: { status: Concert['status'] }) {
  if (status === 'sold-out') {
    return (
      <span className="px-1.5 py-0.5 rounded bg-[#F43F5E]/90 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
        Complet
      </span>
    );
  }
  if (status === 'last-tickets') {
    return (
      <span className="px-1.5 py-0.5 rounded bg-[#F59E0B]/95 text-[10px] font-bold uppercase tracking-wide text-[#130F09] shadow-sm">
        Dernières
      </span>
    );
  }
  if (status === 'free') {
    return (
      <span className="px-1.5 py-0.5 rounded bg-[#10B981]/95 text-[10px] font-bold uppercase tracking-wide text-[#071912] shadow-sm">
        Gratuit
      </span>
    );
  }
  return null;
}

export function ConcertCard({
  concert,
  venue,
  isFavorite,
  viewMode,
  showDateBadge = false,
  onToggleFavorite,
  onSelect,
}: ConcertCardProps) {
  const isNew = isRecentlyAdded(concert);

  if (viewMode === 'grid') {
    return (
      <article
        onClick={() => onSelect(concert)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(concert);
          }
        }}
        className="group relative flex flex-col rounded-2xl overflow-hidden bg-[#16141A] border border-white/[0.08] active:scale-[0.98] transition-all cursor-pointer"
      >
        <div className="relative aspect-[4/4.4] w-full overflow-hidden bg-[#1E1B24]">
          <PosterImage
            concert={concert}
            width={600}
            height={660}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#16141A] via-transparent to-black/30" />

          <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1">
            <div className="flex flex-col gap-1 items-start">
              {showDateBadge && (
                <span className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-semibold text-white">
                  {formatShortDate(concert.date)}
                </span>
              )}
              <StatusPill status={concert.status} />
              {(isStatusUnknown(concert) || isStatusStale(concert.statusVerifiedAt)) && (
                <StaleStatusBadge unknown={isStatusUnknown(concert)} />
              )}
              {isNew && concert.status === 'available' && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-600/90 text-[9.5px] font-bold uppercase tracking-wide text-white shadow-sm">
                  <Sparkles className="w-2.5 h-2.5" />
                  Nouveau
                </span>
              )}
            </div>

            <button
              type="button"
              aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(concert.id);
              }}
              className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center active:scale-90 transition-transform"
            >
              <Heart
                className={`w-3.5 h-3.5 ${
                  isFavorite ? 'fill-[#C85A6E] text-[#C85A6E]' : 'text-white/90'
                }`}
              />
            </button>
          </div>

          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-medium text-[#F4ECE4] truncate max-w-[75%]">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: venue.accentColor }}
              />
              <span className="truncate">{venue.shortName}</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-md text-[10px] font-semibold text-white/90">
              {concert.time}
            </span>
          </div>
        </div>

        <div className="p-2.5 flex-1 flex flex-col justify-between gap-2">
          <div>
            <h3 className="font-display text-[13px] font-bold leading-snug text-[#F7F4EF] line-clamp-2">
              {concert.title}
            </h3>
            <p className="mt-1 text-[11px] text-[#9E968F] truncate">
              {concert.genres.slice(0, 2).join(' · ')}
            </p>
          </div>

          <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.06]">
            <span className="text-[11px] font-semibold text-[#E8DFD6]">
              {concert.status === 'sold-out'
                ? 'Complet'
                : concert.price || 'Voir tarif'}
            </span>
            <a
              href={concert.venueEventUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#C85A6E] hover:text-[#EE9EAB]"
            >
              Site
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      onClick={() => onSelect(concert)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(concert);
        }
      }}
      className="group relative flex gap-3 p-2.5 rounded-2xl bg-[#16141A] hover:bg-[#1B1821] border border-white/[0.07] active:scale-[0.99] transition-all cursor-pointer"
    >
      {/* Poster */}
      <div className="relative shrink-0 w-[96px] h-[116px] rounded-xl overflow-hidden bg-[#211E27] border border-white/[0.06]">
        <PosterImage
          concert={concert}
          width={192}
          height={232}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
          <StatusPill status={concert.status} />
          {(isStatusUnknown(concert) || isStatusStale(concert.statusVerifiedAt)) && (
            <StaleStatusBadge unknown={isStatusUnknown(concert)} />
          )}
          {isNew && concert.status === 'available' && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-600/90 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm">
              <Sparkles className="w-2.5 h-2.5" />
              Nouveau
            </span>
          )}
        </div>
        {concert.isClubNight && (
          <div
            title="Soirée Club"
            className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm flex items-center gap-0.5 text-[9px] font-semibold text-[#D8B4FE]"
          >
            <Moon className="w-2.5 h-2.5" />
            Club
          </div>
        )}
      </div>

      {/* Info column */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          {/* Top metadata row: Venue + Time + Heart */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: venue.accentColor }}
              />
              <span className="text-[11px] font-semibold text-[#DDD5CC] truncate">
                {venue.shortName}
              </span>
              <span className="text-[#5B5550]">·</span>
              <span className="inline-flex items-center gap-0.5 text-[11px] text-[#9E968F] shrink-0">
                <Clock className="w-3 h-3" />
                {concert.time}
              </span>
            </div>

            <button
              type="button"
              aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(concert.id);
              }}
              className="shrink-0 p-1 -mr-1 -mt-1 rounded-full active:scale-90 transition-transform"
            >
              <Heart
                className={`w-4 h-4 transition-colors ${
                  isFavorite
                    ? 'fill-[#C85A6E] text-[#C85A6E]'
                    : 'text-[#77706A] hover:text-white'
                }`}
              />
            </button>
          </div>

          {showDateBadge && (
            <div className="mt-0.5 text-[11px] font-semibold text-[#C85A6E]">
              {formatShortDate(concert.date)}
            </div>
          )}

          {/* Concert Title */}
          <h3 className="mt-1 font-display text-[14.5px] font-bold leading-snug text-[#F7F4EF] line-clamp-2">
            {concert.title}
          </h3>

          {/* Genre Badges */}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {concert.genres.slice(0, 3).map((genre) => (
              <span
                key={genre}
                className="px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.05] text-[10.5px] font-medium text-[#C5BDB4]"
              >
                {genre}
              </span>
            ))}
          </div>
        </div>

        {/* Footer row: Price / District + Direct Venue Link */}
        <div className="mt-2 pt-1.5 border-t border-white/[0.05] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 text-[11px]">
            {concert.price ? (
              <span className="font-semibold text-[#F5EFE9] shrink-0">
                {concert.price}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[#8E8680] truncate">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{venue.district.split('·')[0].trim()}</span>
              </span>
            )}
          </div>

          <a
            href={concert.venueEventUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#C85A6E]/14 hover:bg-[#C85A6E]/25 border border-[#C85A6E]/30 text-[11px] font-semibold text-[#F2A9B6] hover:text-white shrink-0 transition-colors"
          >
            Site salle
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </article>
  );
}
