import { useEffect, useState } from 'react';
import {
  Bike,
  Car,
  Check,
  Copy,
  ExternalLink,
  Footprints,
  MapPin,
  Navigation,
  TrainFront,
  X,
} from 'lucide-react';
import { VENUE_GEO, type Venue } from '../data/toulouseData';

export type TravelMode = 'transit' | 'bicycling' | 'walking' | 'driving';

const STORAGE_KEY = 'scene_rose_travel_mode_v1';

interface RoutePickerSheetProps {
  venue: Venue | null;
  onClose: () => void;
}

const TRAVEL_MODES: {
  id: TravelMode;
  label: string;
  googleMode: string;
  appleDirFlg: string;
  icon: typeof TrainFront;
}[] = [
  {
    id: 'transit',
    label: 'Transports',
    googleMode: 'transit',
    appleDirFlg: 'r',
    icon: TrainFront,
  },
  {
    id: 'bicycling',
    label: 'Vélo',
    googleMode: 'bicycling',
    appleDirFlg: 'c',
    icon: Bike,
  },
  {
    id: 'walking',
    label: 'À pied',
    googleMode: 'walking',
    appleDirFlg: 'w',
    icon: Footprints,
  },
  {
    id: 'driving',
    label: 'Voiture',
    googleMode: 'driving',
    appleDirFlg: 'd',
    icon: Car,
  },
];

function getInitialMode(): TravelMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as TravelMode | null;
    if (saved && TRAVEL_MODES.some((m) => m.id === saved)) return saved;
  } catch {
    // ignore storage errors
  }
  return 'transit';
}

export function RoutePickerSheet({ venue, onClose }: RoutePickerSheetProps) {
  const [mode, setMode] = useState<TravelMode>(getInitialMode);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!venue) return;
    setCopied(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [venue, onClose]);

  if (!venue) return null;

  const geo = VENUE_GEO[venue.id];
  const activeMode = TRAVEL_MODES.find((m) => m.id === mode) || TRAVEL_MODES[0];

  const handleModeChange = (nextMode: TravelMode) => {
    setMode(nextMode);
    try {
      localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // ignore
    }
  };

  const destinationParam = geo
    ? `${geo.lat},${geo.lng}`
    : encodeURIComponent(`${venue.name} ${venue.address}`);

  // 1. Google Maps (Universal link — opens native app on iOS/Android with exact travelmode)
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destinationParam}&travelmode=${activeMode.googleMode}`;

  // 2. Apple Plans (Universal link — opens Apple Maps on iPhone/iPad/Mac with exact dirflg)
  const appleMapsUrl = geo
    ? `https://maps.apple.com/?daddr=${geo.lat},${geo.lng}&q=${encodeURIComponent(venue.name)}&dirflg=${activeMode.appleDirFlg}`
    : `https://maps.apple.com/?daddr=${encodeURIComponent(`${venue.name}, ${venue.address}`)}&dirflg=${activeMode.appleDirFlg}`;

  // 3. Waze (Universal link — opens Waze turn-by-turn driving navigation)
  const wazeUrl = geo
    ? `https://waze.com/ul?ll=${geo.lat},${geo.lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(`${venue.name}, ${venue.address}`)}&navigate=yes`;

  const handleCopyAddress = async () => {
    const fullAddress = `${venue.name}, ${venue.address}`;
    try {
      await navigator.clipboard.writeText(fullAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] bg-[#141218] rounded-t-3xl border-t border-x border-white/12 shadow-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="px-4 pt-1 pb-3 border-b border-white/[0.08] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-[#E85D4A] shrink-0" />
              <h3 className="font-display text-base font-bold text-white truncate">
                Itinéraire · {venue.shortName}
              </h3>
            </div>
            <p className="mt-1 text-xs text-[#A9A097] flex items-center gap-1.5 truncate">
              <MapPin className="w-3 h-3 text-[#E85D4A] shrink-0" />
              <span className="truncate">{venue.address}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-[#CFC7BE] flex items-center gap-1.5">
              <TrainFront className="w-3 h-3 text-sky-400 shrink-0" />
              <span>{venue.transit}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-[#CFC7BE] shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-4">
          {/* Step 1: Travel Mode */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#9A9188] mb-2">
              1. Choisis ton moyen de transport
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {TRAVEL_MODES.map((item) => {
                const Icon = item.icon;
                const active = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleModeChange(item.id)}
                    className={`py-2.5 px-1.5 rounded-xl border flex flex-col items-center gap-1 text-[11px] font-semibold transition-all active:scale-95 ${
                      active
                        ? 'bg-[#E85D4A]/20 border-[#E85D4A]/65 text-white shadow-sm shadow-[#E85D4A]/15'
                        : 'bg-white/[0.04] border-white/[0.08] text-[#B3ABA2]'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 ${active ? 'text-[#F69587]' : 'text-[#8E8680]'}`}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: App selector */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#9A9188] mb-2">
              2. Ouvrir l’itinéraire dans
            </div>
            <div className="space-y-2">
              {/* Google Maps */}
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.09] active:scale-[0.99] transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-emerald-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white">Google Maps</div>
                    <div className="text-[11px] text-[#A9A097] truncate">
                      Mode {activeMode.label.toLowerCase()} · iOS, Android & web
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-[#8E8680] shrink-0" />
              </a>

              {/* Apple Plans */}
              <a
                href={appleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.09] active:scale-[0.99] transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center shrink-0">
                    <Navigation className="w-4 h-4 text-sky-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white">Apple Plans</div>
                    <div className="text-[11px] text-[#A9A097] truncate">
                      Mode {activeMode.label.toLowerCase()} · idéal sur iPhone & Mac
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-[#8E8680] shrink-0" />
              </a>

              {/* Waze */}
              <a
                href={wazeUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className={`flex items-center justify-between gap-3 p-3 rounded-2xl border active:scale-[0.99] transition-all ${
                  mode === 'driving'
                    ? 'bg-cyan-500/12 hover:bg-cyan-500/18 border-cyan-400/40'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center shrink-0">
                    <Car className="w-4 h-4 text-cyan-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white">Waze</span>
                      {mode !== 'driving' && (
                        <span className="px-1.5 py-0.5 rounded bg-white/[0.07] text-[9.5px] font-semibold text-[#CFC7BE]">
                          Voiture uniquement
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#A9A097] truncate">
                      Guidage voiture · trafic toulousain en direct
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-[#8E8680] shrink-0" />
              </a>
            </div>
          </div>

          {/* Copy address helper */}
          <button
            type="button"
            onClick={handleCopyAddress}
            className="w-full py-2.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-[#DDD5CC] flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Adresse copiée dans le presse-papiers</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#9A9188]" />
                <span>Copier l’adresse exacte</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
