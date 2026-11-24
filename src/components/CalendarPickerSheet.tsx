import { useEffect, useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
} from 'lucide-react';
import { TODAY_ISO, type Concert } from '../data/toulouseData';
import { useSwipeDownToClose } from '../hooks/useSwipeDownToClose';
import { formatShortDate } from '../utils/dates';

export interface CalendarSelection {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD (égal à startDate pour un jour unique)
  label: string;     // ex. "Sam. 12 déc." ou "12–15 déc." ou "Mars 2027"
}

interface CalendarPickerSheetProps {
  open: boolean;
  concerts: Concert[];
  selection: CalendarSelection | null;
  onApply: (selection: CalendarSelection | null) => void;
  onClose: () => void;
}

const WEEKDAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FULL_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];
const MONTHS_SHORT_FR = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

function toIso(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getEffectiveDate(c: Concert): string {
  return c.date < TODAY_ISO && c.endDate && c.endDate >= TODAY_ISO ? TODAY_ISO : c.date;
}

function formatRangeLabel(startIso: string, endIso: string): string {
  if (startIso === endIso) return formatShortDate(startIso);

  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);

  // Vérifie si la plage couvre exactement un mois calendaire entier
  const lastDayOfMonth = new Date(sy, sm, 0).getDate();
  if (sy === ey && sm === em && sd === 1 && ed === lastDayOfMonth) {
    return `${MONTHS_FULL_FR[sm - 1]} ${sy}`;
  }

  if (sy === ey && sm === em) {
    return `${sd}–${ed} ${MONTHS_SHORT_FR[sm - 1]}`;
  }
  return `${sd} ${MONTHS_SHORT_FR[sm - 1]} – ${ed} ${MONTHS_SHORT_FR[em - 1]}`;
}

export function CalendarPickerSheet({
  open,
  concerts,
  selection,
  onApply,
  onClose,
}: CalendarPickerSheetProps) {
  const todayParts = TODAY_ISO.split('-').map(Number);
  const initialDateStr = selection?.startDate || TODAY_ISO;
  const [initY, initM] = initialDateStr.split('-').map(Number);

  const [viewYear, setViewYear] = useState(initY);
  const [viewMonth, setViewMonth] = useState(initM - 1); // 0-indexed
  const [draftStart, setDraftStart] = useState<string | null>(selection?.startDate || null);
  const [draftEnd, setDraftEnd] = useState<string | null>(selection?.endDate || null);
  const [showMonthJump, setShowMonthJump] = useState(false);

  const { scrollRef, sheetStyle, backdropOpacity, handlers } = useSwipeDownToClose({
    onClose,
  });

  // Synchronise le brouillon à chaque ouverture
  useEffect(() => {
    if (!open) return;
    const base = selection?.startDate || TODAY_ISO;
    const [y, m] = base.split('-').map(Number);
    setViewYear(y);
    setViewMonth(m - 1);
    setDraftStart(selection?.startDate || null);
    setDraftEnd(selection?.endDate || null);
    setShowMonthJump(false);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, selection, onClose]);

  // Nombre de concerts par jour (YYYY-MM-DD -> count)
  const countsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of concerts) {
      if ((c.endDate || c.date) < TODAY_ISO) continue;
      const d = getEffectiveDate(c);
      map.set(d, (map.get(d) || 0) + 1);
    }
    return map;
  }, [concerts]);

  // Liste des mois disponibles (pour saut rapide d'année/mois)
  const monthsWithConcerts = useMemo(() => {
    const map = new Map<string, number>();
    for (const [iso, count] of countsByDate.entries()) {
      const ym = iso.slice(0, 7);
      map.set(ym, (map.get(ym) || 0) + count);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, count]) => {
        const [y, m] = ym.split('-').map(Number);
        return {
          ym,
          year: y,
          monthIndex: m - 1,
          label: `${MONTHS_SHORT_FR[m - 1].replace(/\.$/, '')} ${y}`,
          count,
        };
      });
  }, [countsByDate]);

  // Compte des concerts dans le mois affiché
  const viewedMonthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  const viewedMonthCount = useMemo(() => {
    let total = 0;
    for (const [iso, count] of countsByDate.entries()) {
      if (iso.startsWith(viewedMonthPrefix)) total += count;
    }
    return total;
  }, [countsByDate, viewedMonthPrefix]);

  // Compte des concerts dans la sélection en cours
  const draftCount = useMemo(() => {
    if (!draftStart) return concerts.length;
    const end = draftEnd || draftStart;
    let total = 0;
    for (const [iso, count] of countsByDate.entries()) {
      if (iso >= draftStart && iso <= end) total += count;
    }
    return total;
  }, [countsByDate, concerts.length, draftStart, draftEnd]);

  if (!open) return null;

  // Construction de la grille calendrier (lundi = colonne 0, dimanche = colonne 6)
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // 0=Lun..6=Dim
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isPrevDisabled =
    viewYear < todayParts[0] ||
    (viewYear === todayParts[0] && viewMonth <= todayParts[1] - 1);

  const goPrevMonth = () => {
    if (isPrevDisabled) return;
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleDayClick = (iso: string) => {
    if (iso < TODAY_ISO) return;
    // 1er tap ou si une plage est déjà complète -> nouvelle date unique
    if (!draftStart || (draftStart && draftEnd && draftStart !== draftEnd)) {
      setDraftStart(iso);
      setDraftEnd(iso);
      return;
    }
    // 2e tap sur le même jour -> désélectionne
    if (draftStart === iso) {
      setDraftStart(null);
      setDraftEnd(null);
      return;
    }
    // 2e tap sur un autre jour -> crée une plage ordonnée
    if (iso < draftStart) {
      setDraftEnd(draftStart);
      setDraftStart(iso);
    } else {
      setDraftEnd(iso);
    }
  };

  const handleSelectWholeMonth = () => {
    const start = toIso(viewYear, viewMonth, 1);
    const end = toIso(viewYear, viewMonth, daysInMonth);
    onApply({
      startDate: start,
      endDate: end,
      label: `${MONTHS_FULL_FR[viewMonth]} ${viewYear}`,
    });
    onClose();
  };

  const handleConfirm = () => {
    if (!draftStart) {
      onApply(null);
    } else {
      const end = draftEnd || draftStart;
      onApply({
        startDate: draftStart,
        endDate: end,
        label: formatRangeLabel(draftStart, end),
      });
    }
    onClose();
  };

  const effectiveEnd = draftEnd || draftStart;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-6 bg-black/75 backdrop-blur-sm animate-fade-in"
      style={{ opacity: backdropOpacity }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[440px] md:max-w-md max-h-[90dvh] rounded-t-3xl md:rounded-3xl bg-[#141219] border-t border-x md:border border-white/12 shadow-2xl flex flex-col overflow-hidden animate-sheet-up"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
        {...handlers}
      >
        {/* Drag handle mobile */}
        <div
          data-swipe-handle="true"
          className="md:hidden flex justify-center pt-2.5 pb-1"
        >
          <div className="w-11 h-1.5 rounded-full bg-white/30" />
        </div>

        {/* Header */}
        <div
          data-swipe-handle="true"
          className="px-5 pt-3 pb-3 border-b border-white/[0.08] flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#C85A6E]/18 border border-[#C85A6E]/35 flex items-center justify-center">
              <CalendarIcon className="w-4 h-4 text-[#F2A9B6]" />
            </div>
            <div>
              <h2 className="font-display text-base font-extrabold text-white leading-tight">
                Choisir une date
              </h2>
              <p className="text-[11px] text-[#9E968F]">
                1 tap = un jour · 2 taps = une plage de dates
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le calendrier"
            className="w-8 h-8 rounded-full bg-white/[0.07] hover:bg-white/[0.12] flex items-center justify-center text-[#DDD5CC] active:scale-95 transition-transform"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div ref={scrollRef} className="overflow-y-auto no-scrollbar p-4 space-y-3.5">
          {/* Month Navigation Bar */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={goPrevMonth}
              disabled={isPrevDisabled}
              aria-label="Mois précédent"
              className="w-9 h-9 rounded-xl bg-[#1D1A24] hover:bg-[#272330] disabled:opacity-30 border border-white/[0.08] flex items-center justify-center text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowMonthJump((v) => !v)}
              className="px-3.5 py-1.5 rounded-xl bg-[#1D1A24] hover:bg-[#272330] border border-white/[0.08] text-sm font-bold text-white flex items-center gap-1.5 transition-colors"
            >
              <span>
                {MONTHS_FULL_FR[viewMonth]} {viewYear}
              </span>
              <span className="text-[11px] font-semibold text-[#F2A9B6]">
                ({viewedMonthCount})
              </span>
            </button>

            <button
              type="button"
              onClick={goNextMonth}
              aria-label="Mois suivant"
              className="w-9 h-9 rounded-xl bg-[#1D1A24] hover:bg-[#272330] border border-white/[0.08] flex items-center justify-center text-white transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Month/Year Jump Drawer (optional 1-tap jump to 2027/2028) */}
          {showMonthJump && monthsWithConcerts.length > 0 && (
            <div className="p-2.5 rounded-2xl bg-[#1A1721] border border-white/[0.08] grid grid-cols-3 gap-1.5 animate-fade-in">
              {monthsWithConcerts.map((m) => {
                const isCurrent = m.year === viewYear && m.monthIndex === viewMonth;
                return (
                  <button
                    key={m.ym}
                    type="button"
                    onClick={() => {
                      setViewYear(m.year);
                      setViewMonth(m.monthIndex);
                      setShowMonthJump(false);
                    }}
                    className={`px-2 py-1.5 rounded-xl text-[11px] font-semibold flex items-center justify-between gap-1 capitalize transition-colors ${
                      isCurrent
                        ? 'bg-[#C85A6E] text-white'
                        : 'bg-white/[0.04] hover:bg-white/[0.09] text-[#DDD5CC]'
                    }`}
                  >
                    <span className="truncate">{m.label}</span>
                    <span className={`text-[10px] ${isCurrent ? 'text-white/90' : 'text-[#8E8680]'}`}>
                      {m.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS_FR.map((day) => (
              <div
                key={day}
                className="text-[10.5px] font-bold uppercase tracking-wider text-[#8E8680] py-1"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="h-11" />;
              }

              const iso = toIso(viewYear, viewMonth, day);
              const isPast = iso < TODAY_ISO;
              const isToday = iso === TODAY_ISO;
              const count = countsByDate.get(iso) || 0;
              const isStart = draftStart === iso;
              const isEnd = effectiveEnd === iso;
              const isInRange = Boolean(
                draftStart && effectiveEnd && iso > draftStart && iso < effectiveEnd
              );
              const isEdge = isStart || isEnd;

              return (
                <button
                  key={iso}
                  type="button"
                  disabled={isPast}
                  onClick={() => handleDayClick(iso)}
                  aria-label={`${day} ${MONTHS_FULL_FR[viewMonth]} ${viewYear} — ${count} concert${count > 1 ? 's' : ''}`}
                  className={`relative h-11 rounded-xl flex flex-col items-center justify-center transition-all ${
                    isPast
                      ? 'text-[#4E4844] opacity-40 cursor-not-allowed'
                      : isEdge
                        ? 'bg-[#C85A6E] text-white font-extrabold shadow-md shadow-[#C85A6E]/35 scale-[1.02]'
                        : isInRange
                          ? 'bg-[#C85A6E]/24 text-white font-semibold'
                          : count > 0
                            ? 'bg-white/[0.045] hover:bg-white/[0.11] text-white font-semibold'
                            : 'text-[#8E8680] hover:bg-white/[0.04]'
                  } ${
                    isToday && !isEdge
                      ? 'ring-1 ring-[#F2A9B6]/80'
                      : ''
                  }`}
                >
                  <span className="text-[13px] leading-none">{day}</span>
                  {count > 0 && !isPast && (
                    <span
                      className={`mt-1 text-[9px] leading-none font-bold ${
                        isEdge
                          ? 'text-white/95'
                          : count >= 5
                            ? 'text-[#F2A9B6]'
                            : 'text-[#C85A6E]'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Whole Month shortcut + Legend */}
          <div className="pt-1 flex items-center justify-between gap-2">
            <span className="text-[10.5px] text-[#8E8680]">
              Chiffre rose = concerts ce jour
            </span>
            {viewedMonthCount > 0 && (
              <button
                type="button"
                onClick={handleSelectWholeMonth}
                className="text-[11.5px] font-bold text-[#F2A9B6] hover:text-white underline underline-offset-2 transition-colors"
              >
                Tout {MONTHS_FULL_FR[viewMonth].toLowerCase()} ({viewedMonthCount})
              </button>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-white/[0.08] bg-[#121017] flex items-center gap-2">
          {(draftStart || selection) && (
            <button
              type="button"
              onClick={() => {
                setDraftStart(null);
                setDraftEnd(null);
                onApply(null);
                onClose();
              }}
              className="px-3.5 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] text-xs font-semibold text-[#DDD5CC] inline-flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Effacer
            </button>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 py-3 px-4 rounded-xl bg-[#C85A6E] hover:bg-[#DA7083] text-white text-xs font-bold shadow-lg shadow-[#C85A6E]/25 active:scale-[0.98] transition-all"
          >
            {draftStart
              ? `Voir ${formatRangeLabel(draftStart, effectiveEnd || draftStart)} (${draftCount} concert${draftCount > 1 ? 's' : ''})`
              : `Afficher toutes les dates (${concerts.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
