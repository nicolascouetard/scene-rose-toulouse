import {
  ArrowRight,
  ExternalLink,
  MapPin,
  RefreshCw,
  TrainFront,
  Users,
} from 'lucide-react';
import type { Concert, SyncMeta, Venue } from '../data/toulouseData';
import { formatSyncTime } from '../utils/dates';

interface VenuesViewProps {
  venues: Venue[];
  concerts: Concert[];
  syncMeta: SyncMeta | null;
  isSyncing: boolean;
  onOpenSyncSheet: () => void;
  onFilterByVenue: (venueId: string) => void;
  onSelectConcert: (concert: Concert) => void;
}

export function VenuesView({
  venues,
  concerts,
  syncMeta,
  isSyncing,
  onOpenSyncSheet,
  onFilterByVenue,
  onSelectConcert,
}: VenuesViewProps) {
  return (
    <div className="px-4 md:px-6 pt-3 pb-6 space-y-3.5">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-extrabold text-white">
            Les salles de Toulouse
          </h2>
          <p className="text-xs text-[#9E968F] mt-0.5">
            {venues.length} lieux de concerts agrégés · accès direct aux sites officiels
          </p>
        </div>
      </div>

      {/* Live Daily Sync Banner */}
      <button
        type="button"
        onClick={onOpenSyncSheet}
        className="w-full text-left rounded-2xl bg-gradient-to-r from-[#191620] to-[#1D1720] border border-emerald-500/25 p-3.5 flex items-center justify-between gap-3 hover:border-emerald-400/45 transition-colors active:scale-[0.99]"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-xs font-bold text-white">
              Sync auto 4× / jour (06h · 11h30 · 17h30 · 21h)
            </span>
          </div>
          <p className="text-[11px] text-[#9E968F] mt-0.5 truncate">
            {syncMeta
              ? `Vérifié ${formatSyncTime(syncMeta.lastSyncedAt)} · ${syncMeta.soldOutCount} complets · ${syncMeta.availableCount} dispo`
              : 'Statuts billetterie vérifiés en direct'}
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/[0.08] text-[11px] font-semibold text-emerald-300">
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          Détails
        </span>
      </button>

      <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4">
        {venues.map((venue) => {
          const venueConcerts = concerts.filter((c) => c.venueId === venue.id);
          const soldOutCount = venueConcerts.filter((c) => c.status === 'sold-out').length;
          const preview = venueConcerts.slice(0, 4);

          return (
            <div
              key={venue.id}
              className="rounded-2xl bg-[#16141A] border border-white/[0.08] overflow-hidden"
            >
              <div className="p-3.5">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: venue.accentColor }}
                      />
                      <h3 className="font-display text-[15px] font-bold text-white truncate">
                        {venue.name}
                      </h3>
                    </div>
                    <p className="mt-1 text-xs text-[#A9A097] leading-snug">
                      {venue.vibe}
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="px-2.5 py-1 rounded-full bg-white/[0.07] text-[11px] font-bold text-[#F5EFE9]">
                      {venueConcerts.length} date{venueConcerts.length > 1 ? 's' : ''}
                    </span>
                    {soldOutCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-[9.5px] font-bold text-rose-300">
                        {soldOutCount} complet{soldOutCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Metadata pills */}
                <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] text-[#BFB6AD]">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.05]">
                    <MapPin className="w-3 h-3 text-[#C85A6E]" />
                    {venue.district}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.05]">
                    <TrainFront className="w-3 h-3 text-[#C85A6E]" />
                    {venue.transit}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.05]">
                    <Users className="w-3 h-3 text-[#9E968F]" />
                    {venue.capacity}
                  </span>
                </div>

                {/* Mini poster strip of upcoming shows */}
                {preview.length > 0 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
                    {preview.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onSelectConcert(c)}
                        className="shrink-0 w-[68px] text-left group"
                      >
                        <div className="w-[68px] h-[68px] rounded-xl overflow-hidden bg-[#211E27] border border-white/[0.08]">
                          <img
                            src={c.poster}
                            alt={c.title}
                            loading="lazy"
                            onError={(e) => {
                              const target = e.currentTarget;
                              if (target.src !== c.sourcePosterUrl) {
                                target.src = c.sourcePosterUrl;
                              }
                            }}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>
                        <p className="mt-1 text-[10px] font-medium text-[#CFC7BE] truncate">
                          {c.title}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-3 pt-3 border-t border-white/[0.06] grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onFilterByVenue(venue.id)}
                    className="py-2 px-3 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] active:scale-[0.98] transition-all text-xs font-semibold text-white flex items-center justify-center gap-1.5"
                  >
                    <span>Voir l’agenda</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <a
                    href={venue.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-3 rounded-xl bg-[#C85A6E]/15 hover:bg-[#C85A6E]/25 border border-[#C85A6E]/35 active:scale-[0.98] transition-all text-xs font-semibold text-[#F2A9B6] flex items-center justify-center gap-1.5"
                  >
                    <span>Site officiel</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
