import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  RefreshCw,
  Smartphone,
  Sparkles,
  Ticket,
  WifiOff,
  X,
} from 'lucide-react';
import type { SyncMeta } from '../data/toulouseData';
import { formatSyncTime } from '../utils/dates';

interface SyncStatusSheetProps {
  open: boolean;
  syncMeta: SyncMeta | null;
  isSyncing: boolean;
  isOffline: boolean;
  canInstallPwa: boolean;
  isInstalledPwa: boolean;
  onInstallPwa: () => void;
  onSyncNow: () => void;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  available: 'Disponible',
  'last-tickets': 'Dernières places',
  'sold-out': 'Complet',
  free: 'Gratuit',
};

export function SyncStatusSheet({
  open,
  syncMeta,
  isSyncing,
  isOffline,
  canInstallPwa,
  isInstalledPwa,
  onInstallPwa,
  onSyncNow,
  onClose,
}: SyncStatusSheetProps) {
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
        {/* Drag handle */}
        <div className="flex md:hidden items-center justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="px-5 pt-1 pb-3 border-b border-white/[0.08] flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Auto-Sync Quotidien
              </span>
            </div>
            <h2 className="mt-1.5 font-display text-lg font-extrabold text-white">
              Synchronisation des salles
            </h2>
            <p className="text-xs text-[#9E968F] mt-0.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#C85A6E]" />
              {syncMeta
                ? `Dernière vérif. : ${formatSyncTime(syncMeta.lastSyncedAt)}`
                : 'Prêt à synchroniser en direct'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 rounded-full bg-white/[0.07] hover:bg-white/[0.12] flex items-center justify-center text-[#CFC7BE]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {/* Manual trigger + Schedule card */}
          <div className="rounded-2xl bg-[#191620] border border-white/[0.08] p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[#A9A097]">Synchro auto (4× / jour)</span>
              <span className="font-semibold text-[#F5EFE9]">06h · 11h30 · 17h30 · 21h</span>
            </div>
            {syncMeta?.nextScheduledSync && (
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-[#8E867F]">Prochain créneau</span>
                <span className="font-medium text-emerald-300">{syncMeta.nextScheduledSync}</span>
              </div>
            )}
            <button
              type="button"
              onClick={onSyncNow}
              disabled={isSyncing}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#C85A6E] to-[#A84258] hover:brightness-110 disabled:opacity-60 active:scale-[0.98] transition-all text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#C85A6E]/25"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>
                {isSyncing
                  ? 'Actualisation en cours…'
                  : 'Actualiser les données maintenant'}
              </span>
            </button>
            <p className="text-[11px] text-[#8E867F] leading-snug">
              Synchronisation automatique des 17 salles 4 fois par jour à 06h, 11h30, 17h30 et 21h (statuts{' '}
              <span className="text-[#CFC7BE] font-medium">Complets</span>,{' '}
              <span className="text-[#CFC7BE] font-medium">Dernières places</span>,{' '}
              <span className="text-[#CFC7BE] font-medium">Annulés</span> & nouvelles dates). Ce bouton recharge immédiatement les données les plus fraîches.
            </p>
          </div>

          {/* Summary KPI grid */}
          {syncMeta && (
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-xl bg-[#191620] border border-white/[0.07] p-2.5 text-center">
                <p className="font-display text-lg font-extrabold text-emerald-300">
                  {syncMeta.availableCount}
                </p>
                <p className="text-[10px] text-[#9E968F] font-medium">Dispo</p>
              </div>
              <div className="rounded-xl bg-[#191620] border border-white/[0.07] p-2.5 text-center">
                <p className="font-display text-lg font-extrabold text-amber-300">
                  {syncMeta.lastTicketsCount}
                </p>
                <p className="text-[10px] text-[#9E968F] font-medium">Dernières</p>
              </div>
              <div className="rounded-xl bg-[#191620] border border-white/[0.07] p-2.5 text-center">
                <p className="font-display text-lg font-extrabold text-rose-300">
                  {syncMeta.soldOutCount}
                </p>
                <p className="text-[10px] text-[#9E968F] font-medium">Complets</p>
              </div>
              <div className="rounded-xl bg-[#191620] border border-white/[0.07] p-2.5 text-center">
                <p className="font-display text-lg font-extrabold text-sky-300">
                  {syncMeta.freeCount}
                </p>
                <p className="text-[10px] text-[#9E968F] font-medium">Gratuits</p>
              </div>
            </div>
          )}

          {/* Status changes detected */}
          {syncMeta && syncMeta.changes.length > 0 && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-400/25 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-200">
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {syncMeta.changes.length} changement{syncMeta.changes.length > 1 ? 's' : ''} de billetterie détecté
                  {syncMeta.changes.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-1.5">
                {syncMeta.changes.map((ch) => (
                  <div
                    key={`${ch.concertId}-${ch.detectedAt}`}
                    className="text-[11px] text-[#EFE8E1] flex items-center justify-between gap-2"
                  >
                    <span className="truncate font-medium">{ch.title}</span>
                    <span className="shrink-0 text-[10px] text-amber-200 font-semibold">
                      {STATUS_LABELS[ch.previousStatus] || ch.previousStatus} →{' '}
                      {STATUS_LABELS[ch.newStatus] || ch.newStatus}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-venue sync status */}
          {syncMeta && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Ticket className="w-3.5 h-3.5 text-[#C85A6E]" />
                  État par salle ({syncMeta.syncedVenuesOk}/{syncMeta.totalVenues} en direct)
                </span>
                <span className="text-[11px] text-[#8E867F]">
                  {(syncMeta.durationMs / 1000).toFixed(1)}s
                </span>
              </div>

              <div className="space-y-1.5">
                {syncMeta.venuesReport.map((v) => (
                  <div
                    key={v.venueId}
                    className="rounded-xl bg-[#191620] border border-white/[0.06] px-3 py-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {v.ok ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-white truncate">
                          {v.venueName}
                        </span>
                        {v.soldOutCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-[9px] font-bold text-rose-300 uppercase">
                            {v.soldOutCount} complet{v.soldOutCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[#8E867F] mt-0.5 truncate">
                        {v.note || `${v.checkedCount} dates`}
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-[#CFC7BE]">
                        {v.checkedCount}
                      </span>
                      <a
                        href={v.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Ouvrir ${v.venueName}`}
                        className="p-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-[#9E968F] hover:text-white"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mode App Mobile (PWA & Hors-ligne) */}
          <div className="rounded-2xl bg-[#191620] border border-white/[0.08] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Smartphone className="w-4 h-4 text-[#C85A6E]" />
                <span>Application mobile (PWA)</span>
              </div>
              {isOffline ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-300">
                  <WifiOff className="w-3 h-3" />
                  Hors-ligne
                </span>
              ) : isInstalledPwa ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-300">
                  Installée
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-white/[0.08] text-[10px] font-semibold text-[#CFC7BE]">
                  Hors-ligne prêt
                </span>
              )}
            </div>

            {canInstallPwa && !isInstalledPwa ? (
              <button
                type="button"
                onClick={onInstallPwa}
                className="w-full py-2.5 px-3 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] border border-white/15 text-xs font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <Download className="w-4 h-4 text-[#C85A6E]" />
                Installer Scène Rose sur l’écran d’accueil
              </button>
            ) : (
              <p className="text-[11px] text-[#9E968F] leading-snug">
                {isInstalledPwa
                  ? 'Scène Rose fonctionne comme une app native avec consultation hors-ligne dans le métro.'
                  : 'Sur iPhone : Safari → Partager → « Sur l’écran d’accueil ». Sur Android : menu navigateur → « Installer l’application ».'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
