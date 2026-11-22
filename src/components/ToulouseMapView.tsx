import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ExternalLink,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  TrainFront,
} from 'lucide-react';
import { TODAY_ISO, VENUE_GEO, type Concert, type Venue } from '../data/toulouseData';
import { diffDays, formatShortDate } from '../utils/dates';
import { RoutePickerSheet } from './RoutePickerSheet';

interface ToulouseMapViewProps {
  venues: Venue[];
  concerts: Concert[];
  onFilterByVenue: (venueId: string) => void;
  onSelectConcert: (concert: Concert) => void;
}

type MapPeriod = 'today' | 'week' | 'all';

// Geographic bounding box covering Blagnac -> Balma and Ramonville -> Borderouge
const BOUNDS = {
  minLng: 1.372,
  maxLng: 1.502,
  minLat: 43.538,
  maxLat: 43.652,
};

function project(lat: number, lng: number) {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 400;
  const y = ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 460;
  return { x, y };
}

function polylinePoints(coords: [number, number][]) {
  return coords
    .map(([lat, lng]) => {
      const p = project(lat, lng);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');
}

// Stylized real-coordinate paths for Toulouse geography & transit
const GARONNE_PATH = polylinePoints([
  [43.538, 1.434],
  [43.558, 1.433],
  [43.576, 1.436],
  [43.591, 1.440],
  [43.600, 1.440],
  [43.606, 1.434],
  [43.611, 1.422],
  [43.621, 1.414],
  [43.635, 1.404],
  [43.652, 1.398],
]);

const CANAL_MIDI_PATH = polylinePoints([
  [43.542, 1.488],
  [43.562, 1.474],
  [43.583, 1.464],
  [43.601, 1.458],
  [43.611, 1.451],
  [43.613, 1.434],
  [43.617, 1.421],
  [43.635, 1.415],
  [43.652, 1.411],
]);

const METRO_A_PATH = polylinePoints([
  [43.570, 1.392], // Basso Cambo
  [43.589, 1.415], // Patte d'Oie
  [43.598, 1.431], // Saint-Cyprien
  [43.604, 1.444], // Capitole
  [43.609, 1.454], // Marengo
  [43.621, 1.472], // Argoulets
  [43.629, 1.484], // Balma-Gramont
]);

const METRO_B_PATH = polylinePoints([
  [43.641, 1.452], // Borderouge
  [43.625, 1.444], // Barrière de Paris
  [43.611, 1.437], // Compans
  [43.606, 1.449], // Jean Jaurès
  [43.600, 1.452], // François Verdier
  [43.584, 1.448], // Empalot
  [43.561, 1.464], // Université Paul Sabatier
  [43.555, 1.476], // Ramonville
]);

const TRAM_T1_PATH = polylinePoints([
  [43.639, 1.380], // Blagnac
  [43.626, 1.391], // Ancely
  [43.609, 1.404], // Purpan
  [43.601, 1.408], // Cartoucherie / Zénith
  [43.592, 1.419], // Arènes
  [43.585, 1.428], // Croix de Pierre
  [43.592, 1.444], // Palais de Justice
]);

const DISTRICT_LABELS: { name: string; lat: number; lng: number }[] = [
  { name: 'CAPITOLE', lat: 43.605, lng: 1.446 },
  { name: 'CARTOUCHERIE', lat: 43.595, lng: 1.402 },
  { name: 'BLAGNAC', lat: 43.641, lng: 1.387 },
  { name: 'BORDEROUGE', lat: 43.645, lng: 1.456 },
  { name: 'BALMA', lat: 43.623, lng: 1.488 },
  { name: 'RAMONVILLE', lat: 43.544, lng: 1.475 },
];

export function ToulouseMapView({
  venues,
  concerts,
  onFilterByVenue,
  onSelectConcert,
}: ToulouseMapViewProps) {
  const [mapPeriod, setMapPeriod] = useState<MapPeriod>('all');
  const [selectedVenueId, setSelectedVenueId] = useState<string>('le-bikini');
  const [zoom, setZoom] = useState<number>(1);
  const [showTransit, setShowTransit] = useState<boolean>(true);
  const [routeVenue, setRouteVenue] = useState<Venue | null>(null);

  const filteredConcerts = useMemo(() => {
    return concerts.filter((c) => {
      const delta = diffDays(c.date, TODAY_ISO);
      if (mapPeriod === 'today') return delta === 0;
      if (mapPeriod === 'week') return delta >= 0 && delta <= 7;
      return true;
    });
  }, [concerts, mapPeriod]);

  const concertsByVenue = useMemo(() => {
    const map: Record<string, Concert[]> = {};
    for (const c of filteredConcerts) {
      if (!map[c.venueId]) map[c.venueId] = [];
      map[c.venueId].push(c);
    }
    return map;
  }, [filteredConcerts]);

  const todayVenues = useMemo(() => {
    const set = new Set<string>();
    for (const c of concerts) {
      if (diffDays(c.date, TODAY_ISO) === 0) set.add(c.venueId);
    }
    return set;
  }, [concerts]);

  const selectedVenue = venues.find((v) => v.id === selectedVenueId) || venues[0];
  const selectedVenueConcerts = concertsByVenue[selectedVenue.id] || [];

  // Compute SVG viewBox centered around selected venue when zoomed in
  const selectedGeo = VENUE_GEO[selectedVenue.id] || { lat: 43.604, lng: 1.444 };
  const centerPt = project(selectedGeo.lat, selectedGeo.lng);
  const vbW = 400 / zoom;
  const vbH = 460 / zoom;
  const vbX = Math.max(0, Math.min(400 - vbW, (zoom === 1 ? 200 : centerPt.x) - vbW / 2));
  const vbY = Math.max(0, Math.min(460 - vbH, (zoom === 1 ? 230 : centerPt.y) - vbH / 2));

  return (
    <div className="px-4 md:px-6 pt-3 pb-6 space-y-3">
      {/* Header + Period toggle */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-extrabold text-white">
            Carte de Toulouse
          </h2>
          <p className="text-[11px] text-[#9E968F]">
            {filteredConcerts.length} concert{filteredConcerts.length > 1 ? 's' : ''} sur{' '}
            {venues.length} salles · dispo hors-ligne
          </p>
        </div>

        <div className="flex items-center p-0.5 rounded-xl bg-[#18151D] border border-white/[0.08]">
          {[
            { id: 'today' as const, label: 'Ce soir' },
            { id: 'week' as const, label: '7j' },
            { id: 'all' as const, label: 'Tout' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMapPeriod(opt.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                mapPeriod === opt.id
                  ? 'bg-[#C85A6E] text-white'
                  : 'text-[#9E968F] hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Responsive 2-column layout on desktop: Map left, Venue selector + card right */}
      <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-12 md:gap-5 md:items-start">
      {/* Interactive Dark Vector Map of Toulouse */}
      <div className="md:col-span-7 relative rounded-2xl overflow-hidden bg-[#121017] border border-white/[0.1] shadow-xl">
        {/* Map controls */}
        <div className="absolute top-2.5 right-2.5 z-10 flex flex-col gap-1.5">
          <button
            type="button"
            aria-label="Zoom avant"
            onClick={() => setZoom((z) => Math.min(2.4, Number((z + 0.45).toFixed(2))))}
            className="w-8 h-8 rounded-xl bg-[#18151E]/90 backdrop-blur border border-white/15 flex items-center justify-center text-white active:scale-95"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Zoom arrière"
            onClick={() => setZoom((z) => Math.max(1, Number((z - 0.45).toFixed(2))))}
            className="w-8 h-8 rounded-xl bg-[#18151E]/90 backdrop-blur border border-white/15 flex items-center justify-center text-white active:scale-95"
          >
            <Minus className="w-4 h-4" />
          </button>
          {zoom > 1 && (
            <button
              type="button"
              aria-label="Réinitialiser la vue"
              onClick={() => setZoom(1)}
              className="w-8 h-8 rounded-xl bg-[#18151E]/90 backdrop-blur border border-white/15 flex items-center justify-center text-[#C85A6E] active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Transit legend toggle */}
        <button
          type="button"
          onClick={() => setShowTransit((v) => !v)}
          className={`absolute top-2.5 left-2.5 z-10 px-2.5 py-1.5 rounded-xl backdrop-blur border text-[10.5px] font-semibold flex items-center gap-1.5 transition-colors ${
            showTransit
              ? 'bg-[#18151E]/90 border-white/15 text-white'
              : 'bg-[#18151E]/60 border-white/10 text-[#8E8680]'
          }`}
        >
          <TrainFront className="w-3 h-3 text-[#C85A6E]" />
          Métro / Tram
        </button>

        {/* Legend bottom-left */}
        {showTransit && (
          <div className="absolute bottom-2.5 left-2.5 z-10 px-2.5 py-1 rounded-lg bg-[#0E0D10]/85 backdrop-blur border border-white/10 flex items-center gap-2.5 text-[9.5px] font-semibold text-[#CFC7BE]">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-0.5 rounded bg-[#E53935]" /> A
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-0.5 rounded bg-[#F59E0B]" /> B
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-0.5 rounded bg-[#06B6D4]" /> T1
            </span>
          </div>
        )}

        <svg
          viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
          className="w-full h-[360px] select-none transition-all duration-300"
          role="img"
          aria-label="Carte interactive des 15 salles de concerts de Toulouse"
        >
          {/* Subtle grid */}
          <defs>
            <pattern id="roseGrid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path
                d="M 32 0 L 0 0 0 32"
                fill="none"
                stroke="rgba(255,255,255,0.035)"
                strokeWidth="0.8"
              />
            </pattern>
            <radialGradient id="cityGlow" cx="52%" cy="46%" r="48%">
              <stop offset="0%" stopColor="#C85A6E" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#0E0D10" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect x="0" y="0" width="400" height="460" fill="url(#roseGrid)" />
          <rect x="0" y="0" width="400" height="460" fill="url(#cityGlow)" />

          {/* Ring road / Périphérique stylized ellipse */}
          <ellipse
            cx="215"
            cy="210"
            rx="118"
            ry="128"
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="2"
            strokeDasharray="5 5"
          />

          {/* La Garonne */}
          <polyline
            points={GARONNE_PATH}
            fill="none"
            stroke="#1E3A5F"
            strokeWidth="11"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.72"
          />
          <polyline
            points={GARONNE_PATH}
            fill="none"
            stroke="#38BDF8"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.32"
          />

          {/* Canal du Midi */}
          <polyline
            points={CANAL_MIDI_PATH}
            fill="none"
            stroke="#1E3A5F"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.65"
          />

          {/* Transit lines */}
          {showTransit && (
            <g opacity="0.65">
              <polyline
                points={METRO_A_PATH}
                fill="none"
                stroke="#E53935"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points={METRO_B_PATH}
                fill="none"
                stroke="#F59E0B"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points={TRAM_T1_PATH}
                fill="none"
                stroke="#06B6D4"
                strokeWidth="2"
                strokeDasharray="4 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )}

          {/* District labels */}
          {DISTRICT_LABELS.map((d) => {
            const p = project(d.lat, d.lng);
            return (
              <text
                key={d.name}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                fill="rgba(255,255,255,0.22)"
                fontSize={8 / Math.sqrt(zoom)}
                fontWeight="700"
                letterSpacing="1.2"
              >
                {d.name}
              </text>
            );
          })}

          {/* Venue markers */}
          {venues.map((venue) => {
            const geo = VENUE_GEO[venue.id];
            if (!geo) return null;
            const p = project(geo.lat, geo.lng);
            const count = (concertsByVenue[venue.id] || []).length;
            const isSelected = venue.id === selectedVenue.id;
            const hasToday = todayVenues.has(venue.id);
            const scale = 1 / Math.sqrt(zoom);
            const r = (isSelected ? 15 : count > 0 ? 11.5 : 8.5) * scale;

            return (
              <g
                key={venue.id}
                transform={`translate(${p.x}, ${p.y})`}
                onClick={() => setSelectedVenueId(venue.id)}
                style={{ cursor: 'pointer' }}
              >
                {/* Pulse ring for today's venues or active selection */}
                {(isSelected || hasToday) && (
                  <circle
                    r={(isSelected ? 22 : 16) * scale}
                    fill={venue.accentColor}
                    opacity={isSelected ? 0.25 : 0.16}
                  />
                )}

                {/* Marker circle */}
                <circle
                  r={r}
                  fill={count > 0 || isSelected ? venue.accentColor : '#2B2735'}
                  stroke={isSelected ? '#FFFFFF' : '#0E0D10'}
                  strokeWidth={(isSelected ? 2.6 : 1.8) * scale}
                />

                {/* Count label */}
                <text
                  y={3.5 * scale}
                  textAnchor="middle"
                  fill={count > 0 || isSelected ? '#0E0D10' : '#9E968F'}
                  fontSize={(isSelected ? 10 : 8.5) * scale}
                  fontWeight="800"
                >
                  {count}
                </text>

                {/* Venue short name under selected marker */}
                {isSelected && (
                  <g transform={`translate(0, ${24 * scale})`}>
                    <rect
                      x={-48 * scale}
                      y={-8 * scale}
                      width={96 * scale}
                      height={15 * scale}
                      rx={5 * scale}
                      fill="rgba(14,13,16,0.92)"
                      stroke={venue.accentColor}
                      strokeWidth={0.9 * scale}
                    />
                    <text
                      y={2.5 * scale}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize={8 * scale}
                      fontWeight="700"
                    >
                      {venue.shortName.slice(0, 18)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Right column on desktop: Quick venue switcher + Selected venue card */}
      <div className="md:col-span-5 space-y-3">
      {/* Quick venue switcher strip */}
      <div className="flex md:flex-wrap items-center gap-1.5 overflow-x-auto md:overflow-visible no-scrollbar">
        {venues.map((v) => {
          const active = v.id === selectedVenue.id;
          const count = (concertsByVenue[v.id] || []).length;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelectedVenueId(v.id)}
              className={`shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all flex items-center gap-1.5 ${
                active
                  ? 'bg-white/[0.12] border-white/30 text-white'
                  : 'bg-[#16141A] border-white/[0.07] text-[#A9A097]'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: v.accentColor }}
              />
              <span>{v.shortName}</span>
              <span className="text-[10px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Selected Venue Detail Card */}
      <div className="rounded-2xl bg-[#16141A] border border-white/[0.09] p-3.5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: selectedVenue.accentColor }}
              />
              <h3 className="font-display text-[15px] font-bold text-white truncate">
                {selectedVenue.name}
              </h3>
            </div>
            <p className="mt-1 text-[11.5px] text-[#A9A097] flex items-center gap-1.5">
              <MapPin className="w-3 h-3 text-[#C85A6E] shrink-0" />
              <span className="truncate">{selectedVenue.district}</span>
              <span>·</span>
              <span className="text-[#DDD5CC] shrink-0">{selectedVenue.transit}</span>
            </p>
          </div>
          <span className="shrink-0 px-2.5 py-1 rounded-full bg-white/[0.07] text-[11px] font-bold text-white">
            {selectedVenueConcerts.length} date{selectedVenueConcerts.length > 1 ? 's' : ''}
          </span>
        </div>

        {/* Upcoming concerts preview at this venue */}
        {selectedVenueConcerts.length > 0 ? (
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
            {selectedVenueConcerts.slice(0, 5).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectConcert(c)}
                className="shrink-0 w-[108px] text-left group"
              >
                <div className="relative w-[108px] h-[72px] rounded-xl overflow-hidden bg-[#211E27] border border-white/[0.08]">
                  <img
                    src={c.poster}
                    alt={c.title}
                    loading="lazy"
                    onError={(e) => {
                      const t = e.currentTarget;
                      if (t.src !== c.sourcePosterUrl) t.src = c.sourcePosterUrl;
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-[9.5px] font-semibold text-white">
                    {formatShortDate(c.date)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] font-semibold text-[#F5EFE9] truncate">
                  {c.title}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#8E8680] py-1">
            Aucun concert sur cette période dans cette salle. Essaie « Tout » !
          </p>
        )}

        {/* Actions */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            type="button"
            onClick={() => onFilterByVenue(selectedVenue.id)}
            className="py-2 px-2 rounded-xl bg-[#C85A6E] hover:bg-[#DA7083] text-white text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform"
          >
            <span>Agenda</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setRouteVenue(selectedVenue)}
            className="py-2 px-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-[#F5EFE9] text-[11px] font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform"
          >
            <Navigation className="w-3.5 h-3.5 text-[#C85A6E]" />
            <span>Itinéraire</span>
          </button>

          <a
            href={selectedVenue.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="py-2 px-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-[#F5EFE9] text-[11px] font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform"
          >
            <span>Site</span>
            <ExternalLink className="w-3 h-3 text-[#C85A6E]" />
          </a>
        </div>
      </div>
      </div>
      </div>

      {/* Route Picker Sheet (Google Maps · Apple Plans · Waze) */}
      <RoutePickerSheet venue={routeVenue} onClose={() => setRouteVenue(null)} />
    </div>
  );
}
