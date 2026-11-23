import { useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Mail,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

interface NewsletterSheetProps {
  open: boolean;
  initialTab?: 'subscribe' | 'privacy';
  onClose: () => void;
}

export function NewsletterSheet({
  open,
  initialTab = 'subscribe',
  onClose,
}: NewsletterSheetProps) {
  const [tab, setTab] = useState<'subscribe' | 'privacy'>(initialTab);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setStatus('idle');
      setFeedback('');
      try {
        const saved =
          localStorage.getItem('scene_rose_remembered_email_v1') ||
          localStorage.getItem('scene_rose_fav_alert_email_v1') ||
          '';
        if (saved && !email) setEmail(saved);
      } catch {
        // ignore
      }
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleaned)) {
      setStatus('error');
      setFeedback('Entre une adresse email valide.');
      return;
    }
    if (!consent) {
      setStatus('error');
      setFeedback('Merci de cocher la case de consentement avant de t’inscrire.');
      return;
    }

    setStatus('submitting');
    setFeedback('');

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleaned, consent: true }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          'Service momentanément indisponible, réessaie dans quelques instants.'
        );
      }
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Inscription momentanément indisponible.');
      }
      setStatus('success');
      setFeedback(
        data.message || 'Inscription enregistrée ! Vérifie ta boîte mail pour confirmer.'
      );
      try {
        localStorage.setItem('scene_rose_remembered_email_v1', cleaned);
      } catch {
        // ignore
      }
      setEmail('');
      setConsent(false);
    } catch (err) {
      setStatus('error');
      setFeedback(
        err instanceof Error
          ? err.message
          : 'Impossible de finaliser l’inscription pour le moment.'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-6 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] md:max-w-md max-h-[86dvh] bg-[#141218] rounded-t-3xl md:rounded-3xl border-t border-x md:border border-white/12 shadow-2xl flex flex-col overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex md:hidden justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="px-4 pt-1 pb-3 border-b border-white/[0.08] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#C85A6E]/15 border border-[#C85A6E]/35 flex items-center justify-center">
              {tab === 'subscribe' ? (
                <Bell className="w-4 h-4 text-[#F2A9B6]" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              )}
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-white leading-tight">
                {tab === 'subscribe' ? 'Alerte hebdo concerts' : 'Confidentialité & RGPD'}
              </h3>
              <p className="text-[11px] text-[#9E968F]">
                {tab === 'subscribe'
                  ? '1 mail par semaine · zéro spam · désinscription 1 clic'
                  : 'Collecte minimale · serveurs UE (Brevo)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-[#CFC7BE]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto no-scrollbar p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-4">
          {tab === 'subscribe' ? (
            <>
              {/* Value props */}
              <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#F5EFE9]">
                  <Sparkles className="w-3.5 h-3.5 text-[#C85A6E]" />
                  <span>Dans ton mail du jeudi midi :</span>
                </div>
                <ul className="text-xs text-[#B8B0A7] space-y-1 pl-4 list-disc">
                  <li>Les nouvelles dates annoncées sur les 17 salles toulousaines</li>
                  <li>Les concerts immanquables du week-end à venir</li>
                  <li>Les alertes « Dernières places » avant complet</li>
                </ul>
              </div>

              {status === 'success' ? (
                <div className="rounded-2xl bg-emerald-500/12 border border-emerald-400/35 p-4 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-100 leading-relaxed">
                    <div className="font-bold text-white mb-0.5">C’est tout bon !</div>
                    {feedback}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3" noValidate>
                  <div>
                    <label
                      htmlFor="newsletter-email"
                      className="block text-[11px] font-bold uppercase tracking-wider text-[#9A9188] mb-1.5"
                    >
                      Ton adresse email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#8E8680] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="newsletter-email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="prenom@exemple.fr"
                        className="w-full pl-10 pr-3.5 py-3 rounded-xl bg-[#1A1720] border border-white/[0.1] text-sm text-white placeholder-[#7C756F] focus:outline-none focus:border-[#C85A6E]/70"
                      />
                    </div>
                  </div>

                  {/* RGPD Consent checkbox (unchecked by default) */}
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded accent-[#C85A6E] shrink-0"
                    />
                    <span className="text-[11.5px] leading-snug text-[#B8B0A7]">
                      J’accepte de recevoir l’alerte hebdomadaire Scène Rose par email (1 envoi par semaine). Je peux me désinscrire en 1 clic à tout moment depuis le pied de page de chaque mail.
                    </span>
                  </label>

                  {status === 'error' && feedback && (
                    <div className="rounded-xl bg-rose-500/12 border border-rose-400/30 px-3 py-2 text-xs text-rose-200">
                      {feedback}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={status === 'submitting'}
                    className="w-full py-3 rounded-2xl bg-[#C85A6E] hover:bg-[#DA7083] disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#C85A6E]/20 active:scale-[0.98] transition-all"
                  >
                    <Bell className="w-4 h-4" />
                    <span>
                      {status === 'submitting'
                        ? 'Inscription en cours…'
                        : 'Activer l’alerte hebdomadaire'}
                    </span>
                  </button>
                </form>
              )}

              <div className="pt-1 flex items-center justify-between text-[11px] text-[#8E8680]">
                <span>Aucune revente · hébergé en UE (Brevo)</span>
                <button
                  type="button"
                  onClick={() => setTab('privacy')}
                  className="text-[#F2A9B6] font-semibold hover:underline"
                >
                  Mentions RGPD
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3 text-xs text-[#CFC7BE] leading-relaxed">
              <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3.5 space-y-2">
                <p>
                  <strong className="text-white">Finalité :</strong> ton adresse email est collectée uniquement pour t’envoyer l’alerte hebdomadaire des nouveaux concerts à Toulouse (1 email par semaine).
                </p>
                <p>
                  <strong className="text-white">Base légale :</strong> consentement explicite (case à cocher non pré-cochée + confirmation par email / double opt-in).
                </p>
                <p>
                  <strong className="text-white">Données collectées :</strong> uniquement ton adresse email et la date de consentement. Aucun cookie publicitaire ni traceur tiers.
                </p>
                <p>
                  <strong className="text-white">Sous-traitants :</strong> Cloudflare Pages (hébergement) et Brevo (envoi d’emails & gestion des désinscriptions, société française, serveurs en Union européenne).
                </p>
                <p>
                  <strong className="text-white">Conservation & droits :</strong> tes données sont supprimées dès ta désinscription en 1 clic (lien présent en bas de chaque email) ou après 3 ans d’inactivité. Conformément au RGPD, tu peux demander l’accès, la rectification ou l’effacement de ton adresse à tout moment.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setTab('subscribe')}
                className="w-full py-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.11] text-white text-xs font-semibold"
              >
                ← Retour à l’inscription
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
