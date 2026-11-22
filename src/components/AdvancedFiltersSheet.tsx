import { Check, Moon, Music, RotateCcw, Sparkles, Ticket, TrainFront, X } from 'lucide-react';
import { VENUE_GEO, type TransitLine, type Venue } from '../data/toulouseData';
import type { BudgetFilter, EventFormatFilter } from '../utils/dates';

interface AdvancedFiltersSheetProps {
  open: boolean;
  venues: Venue[];
  venueCounts: Record<string, number>;
  resultCount: number;
  eventFormat: EventFormatFilter;
  budget: BudgetFilter;
  hideSoldOut: boolean;
  onlyNew: boolean;
  selectedTransit: TransitLine[];
  selectedVenueIds: string[];
  onChangeFormat: (v: EventFormatFilter) => void;
  onChangeBudget: (v: BudgetFilter) => void;
  onToggleHideSoldOut: () => void;
  onToggleOnlyNew: () => void;
  onToggleTransit: (line: TransitLine) => void;
  onToggleVenue: (venueId: string) => void;
  onReset: () => void;
  onClose: () => void;
}

const TRANSIT_OPTIONS: { id: TransitLine; label: string; color: string }[] = [
  { id: 'M-A', label: 'Métro A', color: '#E53935' },
  { id: 'M-B', label: 'Métro B', color: '#F59E0B' },
  { id: 'T1', label: 'Tram T1', color: '#06B6D4' },
  { id: 'Bus', label: 'Bus / Linéo', color: '#A855F7' },
];

const BUDGET_OPTIONS: { id: BudgetFilter; label: string }[] = [
  { id: 'all', label: 'Tous prix' },
  { id: 'free', label: 'Gratuit' },
  { id: 'under15', label: '≤ 15 €' },
  { id: 'under25', label: '≤ 25 €' },
];

export function AdvancedFiltersSheet({
  open,
  venues,
  venueCounts,
  resultCount,
  eventFormat,
  budget,
  hideSoldOut,
  onlyNew,
  selectedTransit,
  selectedVenueIds,
  onChangeFormat,
  onChangeBudget,
  onToggleHideSoldOut,
  onToggleOnlyNew,
  onToggleTransit,
  onToggleVenue,
  onReset,
  onClose,
}: AdvancedFiltersSheetProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-6 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[440px] md:max-w-xl max-h-[88dvh] bg-[#121016] border-t border-x md:border border-white/[0.12] rounded-t-[28px] md:rounded-3xl overflow-hidden flex flex-col animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex md:hidden items-center justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="px-5 pt-1 pb-3 border-b border-white/[0.08] flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-extrabold text-white">
              Filtres avancés
            </h2>
            <p className="text-xs text-[#9E968F]">
              Format, budget, métro/tram & multi-salles
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-[11px] font-semibold text-[#CFC7BE]"
            >
              <RotateCcw className="w-3 h-3" />
              Effacer
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="w-8 h-8 rounded-full bg-white/[0.07] hover:bg-white/[0.12] flex items-center justify-center text-[#CFC7BE]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {/* Format: Concerts vs Nuits Club */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#9E968F] flex items-center gap-1.5 mb-2">
              <Music className="w-3.5 h-3.5 text-[#C85A6E]" />
              Format de sortie
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'all' as const, label: 'Tout', icon: null },
                { id: 'concerts' as const, label: 'Concerts', icon: Music },
                { id: 'club' as const, label: 'Nuits Club', icon: Moon },
              ].map((opt) => {
                const active = eventFormat === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeFormat(opt.id)}
                    className={`py-2.5 px-2 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                      active
                        ? 'bg-[#C85A6E] border-[#C85A6E] text-white shadow-sm shadow-[#C85A6E]/30'
                        : 'bg-[#191620] border-white/[0.08] text-[#CFC7BE]'
                    }`}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Budget */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#9E968F] flex items-center gap-1.5 mb-2">
              <Ticket className="w-3.5 h-3.5 text-[#C85A6E]" />
              Budget (tarif indicatif)
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {BUDGET_OPTIONS.map((opt) => {
                const active = budget === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeBudget(opt.id)}
                    className={`py-2 px-1.5 rounded-xl text-[11.5px] font-semibold border transition-all active:scale-95 ${
                      active
                        ? 'bg-[#F7F4EF] border-[#F7F4EF] text-[#110F14]'
                        : 'bg-[#191620] border-white/[0.08] text-[#CFC7BE]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick switches: Dispo & Nouveautés */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onToggleHideSoldOut}
              className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
                hideSoldOut
                  ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                  : 'bg-[#191620] border-white/[0.08] text-[#CFC7BE]'
              }`}
            >
              <span>Dispo uniquement</span>
              {hideSoldOut && <Check className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={onToggleOnlyNew}
              className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
                onlyNew
                  ? 'bg-violet-500/20 border-violet-400/45 text-violet-200'
                  : 'bg-[#191620] border-white/[0.08] text-[#CFC7BE]'
              }`}
            >
              <span className="inline-flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Nouveautés
              </span>
              {onlyNew && <Check className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Métro / Tram */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#9E968F] flex items-center gap-1.5 mb-2">
              <TrainFront className="w-3.5 h-3.5 text-[#C85A6E]" />
              Accès Tisséo (Métro / Tram)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TRANSIT_OPTIONS.map((t) => {
                const active = selectedTransit.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onToggleTransit(t.id)}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all active:scale-95 ${
                      active
                        ? 'bg-white/[0.12] border-white/30 text-white'
                        : 'bg-[#191620] border-white/[0.08] text-[#B7AFA6]'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      {t.label}
                    </span>
                    {active && <Check className="w-3.5 h-3.5 text-[#C85A6E]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Multi-salles */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#9E968F]">
                Salles ({selectedVenueIds.length > 0 ? `${selectedVenueIds.length} choisie${selectedVenueIds.length > 1 ? 's' : ''}` : 'Toutes'})
              </label>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {venues.map((v) => {
                const active = selectedVenueIds.includes(v.id);
                const count = venueCounts[v.id] || 0;
                const lines = VENUE_GEO[v.id]?.transitLines || [];
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onToggleVenue(v.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all active:scale-[0.98] ${
                      active
                        ? 'bg-[#C85A6E]/15 border-[#C85A6E]/50 text-white'
                        : 'bg-[#191620] border-white/[0.07] text-[#CFC7BE]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: v.accentColor }}
                        />
                        <span className="text-[11.5px] font-semibold truncate">
                          {v.shortName}
                        </span>
                      </div>
                      {active ? (
                        <Check className="w-3.5 h-3.5 text-[#C85A6E] shrink-0" />
                      ) : (
                        <span className="text-[10px] text-[#857D77] shrink-0">{count}</span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[9.5px] text-[#8E8680]">
                      <span>{lines.join(' · ')}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sticky CTA */}
        <div className="px-5 py-3.5 border-t border-white/[0.08] bg-[#121016]">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#C85A6E] to-[#A84258] hover:brightness-110 active:scale-[0.99] transition-all text-white text-sm font-bold shadow-lg shadow-[#C85A6E]/25"
          >
            Afficher {resultCount} concert{resultCount > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
