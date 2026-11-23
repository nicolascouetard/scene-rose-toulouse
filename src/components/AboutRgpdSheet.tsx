import { useEffect } from 'react';
import { X, ShieldCheck, Music2, RefreshCw, Mail, Heart } from 'lucide-react';

interface AboutRgpdSheetProps {
  open: boolean;
  venueCount: number;
  concertCount: number;
  festivalCount: number;
  onClose: () => void;
  onOpenNewsletter: () => void;
}

export function AboutRgpdSheet({
  open,
  venueCount,
  concertCount,
  festivalCount,
  onClose,
  onOpenNewsletter,
}: AboutRgpdSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-6 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[440px] md:max-w-lg max-h-[90dvh] rounded-t-3xl md:rounded-3xl bg-[#131117] border-t border-x md:border border-white/12 shadow-2xl flex flex-col overflow-hidden animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#C85A6E]/15 border border-[#C85A6E]/30 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-[#F2A9B6]" />
            </div>
            <div>
              <h2 className="font-display text-[17px] font-bold text-[#F7F4EF]">
                À propos & Confidentialité
              </h2>
              <p className="text-[11px] text-[#9A938B]">Scène Rose · Toulouse & Occitanie</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[#CFC8C0] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto no-scrollbar px-5 py-4 space-y-3.5 text-[12.5px] leading-relaxed text-[#CFC8C0]">
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-1.5">
            <div className="flex items-center gap-2 text-[#F7F4EF] font-semibold text-[13px]">
              <Music2 className="w-4 h-4 text-[#F2A9B6]" />
              Projet indépendant & 100 % gratuit
            </div>
            <p className="text-[#AFA8A0]">
              Scène Rose est un agenda musical indépendant conçu pour Toulouse et l’Occitanie :{' '}
              <strong className="text-[#F7F4EF]">{venueCount} salles</strong> ({concertCount} concerts actifs) et{' '}
              <strong className="text-[#F7F4EF]">{festivalCount} grands festivals d’Occitanie</strong>, sans publicité
              ni commission sur les billets.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-1.5">
            <div className="flex items-center gap-2 text-[#F7F4EF] font-semibold text-[13px]">
              <RefreshCw className="w-4 h-4 text-[#F2A9B6]" />
              Billetteries officielles & transparence
            </div>
            <p className="text-[#AFA8A0]">
              Les dates, affiches, tarifs et statuts (disponible, dernières places, complet) proviennent directement des
              sites et billetteries officiels des salles et festivals, synchronisés 4 fois par jour. Chaque bouton de
              réservation vous renvoie vers la billetterie officielle.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-1.5">
            <div className="flex items-center gap-2 text-[#F7F4EF] font-semibold text-[13px]">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Vie privée & conformité RGPD
            </div>
            <ul className="space-y-1 text-[#AFA8A0] list-disc pl-4">
              <li>
                <strong className="text-[#F7F4EF]">Aucun traceur publicitaire</strong> ni cookie tiers de pistage.
              </li>
              <li>
                Vos <strong className="text-[#F7F4EF]">concerts & festivals favoris</strong> sont stockés uniquement
                en local dans votre navigateur.
              </li>
              <li>
                Si vous vous abonnez à l’<strong className="text-[#F7F4EF]">alerte hebdomadaire</strong> (jeudi midi),
                votre adresse e-mail est enregistrée avec consentement explicite (Double Opt-In) chez{' '}
                <strong className="text-[#F7F4EF]">Brevo (serveurs UE)</strong>, jamais revendue, avec désinscription
                en 1 clic en bas de chaque e-mail.
              </li>
            </ul>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenNewsletter();
              }}
              className="flex-1 py-2.5 px-3 rounded-xl bg-[#C85A6E]/15 hover:bg-[#C85A6E]/25 border border-[#C85A6E]/35 text-[#F2A9B6] font-semibold text-[12px] flex items-center justify-center gap-1.5 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              Alerte hebdo gratuite
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] text-[#E5DFD8] font-semibold text-[12px] transition-colors"
            >
              Fermer
            </button>
          </div>

          <p className="text-center text-[11px] text-[#7D766F] flex items-center justify-center gap-1 pt-1">
            Fait avec <Heart className="w-3 h-3 text-[#C85A6E] fill-[#C85A6E]" /> pour la scène live toulousaine
          </p>
        </div>
      </div>
    </div>
  );
}
