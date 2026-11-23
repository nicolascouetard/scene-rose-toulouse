import { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  Calendar,
  CheckCircle2,
  Clock,
  Heart,
  Loader2,
  MapPin,
  Music2,
  Share2,
  Tent,
} from 'lucide-react';
import { TODAY_ISO, type Concert, type Venue } from '../data/toulouseData';
import { formatFestivalDates, type Festival } from '../data/festivalsData';
import { daysUntilConcert } from '../utils/dates';
import { ConcertCard } from './ConcertCard';

interface FavoritesViewProps {
  concerts: Concert[];
  venueMap: Record<string, Venue>;
  favorites: string[];
  festivals?: Festival[];
  favoriteFestivals?: string[];
  favAlertEmail: string | null;
  onSaveFavAlertEmail: (email: string | null) => void;
  onToggleFavorite: (id: string) => void;
  onToggleFavoriteFestival?: (id: string) => void;
  onSelectConcert: (concert: Concert) => void;
  onSelectFestival?: (festival: Festival) => void;
  onGoExplore: () => void;
  onShareSelection: () => void;
  onNotify: (msg: string) => void;
}

export function FavoritesView({
  concerts,
  venueMap,
  favorites,
  festivals = [],
  favoriteFestivals = [],
  favAlertEmail,
  onSaveFavAlertEmail,
  onToggleFavorite,
  onToggleFavoriteFestival,
  onSelectConcert,
  onSelectFestival,
  onGoExplore,
  onShareSelection,
  onNotify,
}: FavoritesViewProps) {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailInput, setEmailInput] = useState(() => {
    if (favAlertEmail) return favAlertEmail;
    try {
      return localStorage.getItem('scene_rose_remembered_email_v1') || '';
    } catch {
      return '';
    }
  });
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saved = concerts.filter((c) => favorites.includes(c.id));
  const savedFestivals = festivals.filter((f) => favoriteFestivals.includes(f.id));
  const totalSaved = saved.length + savedFestivals.length;

  const lastTicketsAlerts = saved.filter((c) => c.status === 'last-tickets');
  const soldOutAlerts = saved.filter((c) => c.status === 'sold-out');
  const soonAlerts = saved
    .map((c) => ({ concert: c, days: daysUntilConcert(c.date, TODAY_ISO) }))
    .filter(({ concert, days }) => days >= 0 && days <= 7 && concert.status !== 'sold-out')
    .sort((a, b) => a.days - b.days);

  const hasAlerts =
    lastTicketsAlerts.length > 0 || soldOutAlerts.length > 0 || soonAlerts.length > 0;

  const handleActivateEmailAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleaned = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleaned)) {
      setErrorMsg('Merci de saisir une adresse e-mail valide.');
      return;
    }
    if (!consent) {
      setErrorMsg('Merci de cocher la case de consentement RGPD.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/favorites-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleaned,
          favoriteIds: favorites,
          enabled: true,
          consent: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || 'Impossible d’activer les alertes pour le moment.');
        return;
      }
      onSaveFavAlertEmail(cleaned);
      try {
        localStorage.setItem('scene_rose_remembered_email_v1', cleaned);
      } catch {
        // ignore
      }
      setShowEmailForm(false);
      onNotify(data.message || 'Alertes J-7 & Dernières places activées !');
    } catch {
      setErrorMsg('Erreur réseau — vérifie ta connexion et réessaie.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisableEmailAlerts = async () => {
    if (!favAlertEmail) return;
    setSubmitting(true);
    try {
      await fetch('/api/favorites-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: favAlertEmail,
          favoriteIds: [],
          enabled: false,
          consent: false,
        }),
      });
    } catch {
      // ignore network error on local disable
    } finally {
      onSaveFavAlertEmail(null);
      setSubmitting(false);
      onNotify('Alertes e-mail sur tes favoris désactivées');
    }
  };

  if (totalSaved === 0) {
    return (
      <div className="px-6 py-16 text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-[#19161E] border border-white/10 flex items-center justify-center mb-4">
          <Heart className="w-7 h-7 text-[#C85A6E]" />
        </div>
        <h2 className="font-display text-lg font-bold text-white">
          Aucun favori enregistré
        </h2>
        <p className="mt-1.5 text-sm text-[#9E968F] max-w-[300px] leading-relaxed">
          Appuie sur le cœur d’un concert ou d’un festival pour suivre sa billetterie (rappels J-7, Dernières places) et partager ta liste avec tes amis.
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
    <div className="px-4 md:px-6 pt-3 pb-6 space-y-4">
      {/* Header + Share selection button */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-extrabold text-white">
            Mes favoris ({totalSaved})
          </h2>
          <p className="text-xs text-[#9E968F] mt-0.5">
            Suivi billetterie en direct · rappels J-7 & Dernières places
          </p>
        </div>

        {saved.length > 0 && (
          <button
            type="button"
            onClick={onShareSelection}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#C85A6E]/18 hover:bg-[#C85A6E]/28 border border-[#C85A6E]/40 text-xs font-bold text-[#F2A9B6] active:scale-95 transition-all"
          >
            <Share2 className="w-3.5 h-3.5" />
            Partager
          </button>
        )}
      </div>

      {/* Option 1: Smart in-app alerts (J-7 upcoming + Last tickets + Sold out) */}
      {hasAlerts && (
        <div className="rounded-2xl bg-gradient-to-r from-amber-500/14 via-[#C85A6E]/14 to-rose-500/14 border border-amber-400/35 p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
            <span>Rappels & alertes sur tes favoris</span>
          </div>
          <div className="space-y-1.5">
            {lastTicketsAlerts.map((c) => (
              <button
                key={`last-${c.id}`}
                type="button"
                onClick={() => onSelectConcert(c)}
                className="w-full text-left flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-black/30 hover:bg-black/45 transition-colors"
              >
                <span className="text-xs font-semibold text-white truncate">{c.title}</span>
                <span className="shrink-0 px-2 py-0.5 rounded bg-amber-500 text-[10px] font-bold uppercase text-[#130F09]">
                  Dernières places
                </span>
              </button>
            ))}

            {soonAlerts.map(({ concert: c, days }) => {
              const countdown =
                days === 0 ? 'Ce soir !' : days === 1 ? 'Demain' : `Dans ${days} jours`;
              return (
                <button
                  key={`soon-${c.id}`}
                  type="button"
                  onClick={() => onSelectConcert(c)}
                  className="w-full text-left flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-black/30 hover:bg-black/45 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">{c.title}</div>
                    <div className="text-[10.5px] text-[#CFC7BE] truncate">
                      {venueMap[c.venueId]?.shortName} · Pense à tes places !
                    </div>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#C85A6E] text-[10px] font-bold uppercase text-white">
                    <Clock className="w-3 h-3" />
                    {countdown}
                  </span>
                </button>
              );
            })}

            {soldOutAlerts.map((c) => (
              <button
                key={`sold-${c.id}`}
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

      {/* Option 2: Automated Brevo email reminders (J-7 & Last Tickets) */}
      {saved.length > 0 && (
        <div className="rounded-2xl bg-[#16141B] border border-white/[0.09] p-3.5">
          {favAlertEmail ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white">
                    Alertes e-mail actives ({saved.length} concert{saved.length > 1 ? 's' : ''} suivi{saved.length > 1 ? 's' : ''})
                  </div>
                  <p className="text-[11px] text-[#9E968F] truncate">
                    Rappel J-7 & Dernières places envoyé à <strong className="text-[#E5DFD8]">{favAlertEmail}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={handleDisableEmailAlerts}
                className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] text-[11px] font-semibold text-[#CFC7BE] transition-colors"
              >
                <BellOff className="w-3.5 h-3.5" />
                Désactiver
              </button>
            </div>
          ) : !showEmailForm ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#C85A6E]/15 border border-[#C85A6E]/35 flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4 text-[#F2A9B6]" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">
                    Recevoir un rappel par e-mail sur mes favoris
                  </div>
                  <p className="text-[11px] text-[#9E968F] mt-0.5 leading-snug">
                    Alerte automatique <strong>7 jours avant</strong> un concert favori ou s’il passe en <strong>Dernières places</strong> (0 € · sans spam).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEmailForm(true)}
                className="shrink-0 px-3.5 py-2 rounded-xl bg-[#C85A6E] hover:bg-[#DA7083] text-white text-xs font-bold active:scale-95 transition-all"
              >
                Activer
              </button>
            </div>
          ) : (
            <form onSubmit={handleActivateEmailAlerts} className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-[#F2A9B6]" />
                  Alertes e-mail J-7 & Dernières places
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowEmailForm(false);
                    setErrorMsg(null);
                  }}
                  className="text-[11px] text-[#9E968F] hover:text-white"
                >
                  Annuler
                </button>
              </div>

              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="ton.email@exemple.fr"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F0D13] border border-white/12 focus:border-[#C85A6E] outline-none text-sm text-white placeholder:text-[#6D665F]"
              />

              <label className="flex items-start gap-2 text-[11px] text-[#ABA39B] cursor-pointer leading-snug">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 accent-[#C85A6E]"
                />
                <span>
                  J’accepte de recevoir uniquement des rappels (J-7 & Dernières places) sur mes concerts favoris via Brevo (UE). <strong>Indépendant de la newsletter du jeudi</strong> · désactivation en 1 clic.
                </span>
              </label>

              {errorMsg && (
                <p className="text-[11px] text-rose-300 font-medium">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-[#C85A6E] hover:bg-[#DA7083] disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Synchronisation...
                  </>
                ) : (
                  <>Activer sur mes {saved.length} favori{saved.length > 1 ? 's' : ''}</>
                )}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Followed Occitanie Festivals */}
      {savedFestivals.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#A9A097]">
            <Tent className="w-3.5 h-3.5 text-[#C85A6E]" />
            <span>Festivals suivis ({savedFestivals.length})</span>
          </div>
          <div className="space-y-2.5 md:space-y-0 md:grid md:grid-cols-2 md:gap-3">
            {savedFestivals.map((f) => (
              <div
                key={f.id}
                onClick={() => onSelectFestival?.(f)}
                className="cursor-pointer rounded-2xl bg-[#16141A] hover:bg-[#1B1821] border border-white/[0.08] p-3.5 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                      style={{ backgroundColor: `${f.accentColor}CC` }}
                    >
                      {f.editionYear}
                    </span>
                    <span className="text-sm font-bold text-white truncate">{f.name}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-[#A9A097]">
                    <span className="inline-flex items-center gap-1 text-[#F2A9B6] font-semibold">
                      <Calendar className="w-3 h-3" />
                      {formatFestivalDates(f)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#C85A6E]" />
                      {f.city} ({f.departmentCode})
                    </span>
                  </div>
                </div>
                {onToggleFavoriteFestival && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavoriteFestival(f.id);
                    }}
                    aria-label="Retirer ce festival"
                    className="w-8 h-8 rounded-full bg-white/[0.05] flex items-center justify-center shrink-0"
                  >
                    <Heart className="w-4 h-4 fill-[#C85A6E] text-[#C85A6E]" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved concert cards */}
      {saved.length > 0 && (
        <div className="space-y-2.5">
          {savedFestivals.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#A9A097]">
              <Music2 className="w-3.5 h-3.5 text-[#C85A6E]" />
              <span>Concerts à Toulouse ({saved.length})</span>
            </div>
          )}
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
      )}
    </div>
  );
}
