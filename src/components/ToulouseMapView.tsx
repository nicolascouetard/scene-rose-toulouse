import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  ArrowRight,
  ExternalLink,
  LocateFixed,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  TrainFront,
} from 'lucide-react';
import {
  VENUE_GEO,
  type Concert,
  type Venue,
} from '../data/toulouseData';
import { formatShortDate, matchesPeriod } from '../utils/dates';
import { RoutePickerSheet } from './RoutePickerSheet';

interface ToulouseMapViewProps {
  venues: Venue[];
  concerts: Concert[];
  onFilterByVenue: (venueId: string) => void;
  onSelectConcert: (concert: Concert) => void;
}

// Coordonnées GPS réelles simplifiées des lignes structurantes Tisséo
const METRO_A_LATLNG: [number, number][] = [
  [43.5705, 1.3915], // Basso Cambo
  [43.5825, 1.4025], // Mirail / Bagatelle
  [43.5975, 1.4255], // Saint-Cyprien République
  [43.6003, 1.4418], // Esquirol
  [43.6045, 1.4442], // Capitole
  [43.6057, 1.4489], // Jean-Jaurès
  [43.6114, 1.4545], // Marengo-SNCF
  [43.6215, 1.4712], // Roseraie
  [43.6295, 1.4832], // Balma-Gramont
];

const METRO_B_LATLNG: [number, number][] = [
  [43.6406, 1.4526], // Borderouge
  [43.6328, 1.4465], // Trois Cocus
  [43.6208, 1.4368], // Barrière de Paris
  [43.6119, 1.4375], // Compans-Caffarelli
  [43.6089, 1.4455], // Jeanne d'Arc
  [43.6057, 1.4489], // Jean-Jaurès
  [43.6003, 1.4544], // François Verdier
  [43.5931, 1.4468], // Palais de Justice
  [43.5795, 1.4475], // Saint-Agne
  [43.5625, 1.4638], // Université Paul Sabatier
  [43.5554, 1.4765], // Ramonville
];

const TRAM_T1_LATLNG: [number, number][] = [
  [43.5931, 1.4468], // Palais de Justice
  [43.5882, 1.4352], // Fer à Cheval
  [43.5924, 1.4268], // Croix de Pierre / Avenue de Muret
  [43.5978, 1.4165], // Arènes
  [43.6005, 1.4092], // Zénith / Cartoucherie
  [43.6118, 1.3995], // Purpan
  [43.6238, 1.3924], // Ancely / Servanty
  [43.6352, 1.3845], // Odyssud / Blagnac
];

const TOULOUSE_CENTER: [number, number] = [43.6045, 1.439];
const DEFAULT_ZOOM = 12;

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildVenueDivIcon(venue: Venue, count: number, isSelected: boolean): L.DivIcon {
  const size = isSelected ? 34 : 26;
  const bg = count > 0 || isSelected ? venue.accentColor : '#302C36';
  const textColor = count > 0 || isSelected ? '#0E0D10' : '#A9A097';
  const border = isSelected ? '2.5px solid #FFFFFF' : '2px solid #0E0D10';
  const labelHtml = isSelected
    ? `<div style="position:absolute;top:${size + 4}px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:2px 7px;border-radius:6px;background:rgba(14,13,16,0.94);border:1px solid ${venue.accentColor};color:#FFFFFF;font-size:10px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,0.55);pointer-events:none;">${escapeAttr(
        venue.shortName.slice(0, 20)
      )}</div>`
    : '';

  const pulseHtml = isSelected
    ? `<span class="sr-pin-pulse" style="position:absolute;inset:-4px;border-radius:9999px;background:${venue.accentColor};opacity:0.45;pointer-events:none;"></span>`
    : '';

  return L.divIcon({
    className: 'sr-venue-pin',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;">
      ${pulseHtml}
      <div style="position:relative;width:${size}px;height:${size}px;border-radius:9999px;background:${bg};border:${border};color:${textColor};font-size:${
        isSelected ? 12 : 10
      }px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,0.55);transition:transform 0.15s ease;">
        ${count}
      </div>
      ${labelHtml}
    </div>`,
  });
}

export function ToulouseMapView({
  venues,
  concerts,
  onFilterByVenue,
  onSelectConcert,
}: ToulouseMapViewProps) {
  const [selectedVenueId, setSelectedVenueId] = useState<string>(venues[0]?.id || 'le-bikini');
  const [mapPeriod, setMapPeriod] = useState<'all' | 'week' | 'today'>('all');
  const [showTransit, setShowTransit] = useState(true);
  const [routeVenue, setRouteVenue] = useState<Venue | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const transitLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const hasInteractedVenueRef = useRef(false);

  const filteredConcerts = useMemo(() => {
    return concerts.filter((c) => matchesPeriod(c, mapPeriod));
  }, [concerts, mapPeriod]);

  const concertsByVenue = useMemo(() => {
    const map: Record<string, Concert[]> = {};
    for (const v of venues) map[v.id] = [];
    for (const c of filteredConcerts) {
      if (!map[c.venueId]) map[c.venueId] = [];
      map[c.venueId].push(c);
    }
    return map;
  }, [venues, filteredConcerts]);

  const selectedVenue = venues.find((v) => v.id === selectedVenueId) || venues[0];
  const selectedVenueConcerts = concertsByVenue[selectedVenue.id] || [];

  // 1. Initialise la carte Leaflet OpenStreetMap sombre (pinch-to-zoom, drag, double-tap, molette)
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: TOULOUSE_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: 11,
      maxZoom: 18,
      zoomControl: false, // On affiche nos propres boutons dark cohérents avec Scène Rose
      attributionControl: true,
      tapHold: false,
    });

    // Fond sombre Esri World Dark Gray (0 €, sans clé API, sans filigrane) + noms des rues & quartiers
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: '&copy; Esri, HERE, Garmin, OpenStreetMap',
        maxNativeZoom: 16,
        maxZoom: 18,
      }
    ).addTo(map);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      {
        maxNativeZoom: 16,
        maxZoom: 18,
        pane: 'overlayPane',
        opacity: 0.9,
      }
    ).addTo(map);

    const transitLayer = L.layerGroup().addTo(map);
    const markersLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    transitLayerRef.current = transitLayer;
    markersLayerRef.current = markersLayer;

    // Ajuste les dimensions si le conteneur change de taille (ex: redimensionnement PC)
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 150);

    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      transitLayerRef.current = null;
      markersLayerRef.current = null;
      userMarkerRef.current = null;
    };
  }, []);

  // 2. Tracés Tisséo Métro A, B & Tram T1
  useEffect(() => {
    const layer = transitLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showTransit) return;

    L.polyline(METRO_A_LATLNG, {
      color: '#E53935',
      weight: 3,
      opacity: 0.72,
      dashArray: '6 5',
    }).addTo(layer);

    L.polyline(METRO_B_LATLNG, {
      color: '#F59E0B',
      weight: 3,
      opacity: 0.72,
      dashArray: '6 5',
    }).addTo(layer);

    L.polyline(TRAM_T1_LATLNG, {
      color: '#06B6D4',
      weight: 2.8,
      opacity: 0.75,
      dashArray: '3 5',
    }).addTo(layer);
  }, [showTransit]);

  // 3. Marqueurs des 17 salles (coordonnées GPS réelles)
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    venues.forEach((venue) => {
      const geo = VENUE_GEO[venue.id];
      if (!geo) return;
      const isSelected = venue.id === selectedVenue.id;
      const count = (concertsByVenue[venue.id] || []).length;

      const marker = L.marker([geo.lat, geo.lng], {
        icon: buildVenueDivIcon(venue, count, isSelected),
        zIndexOffset: isSelected ? 1000 : count > 0 ? 100 : 0,
      });

      marker.on('click', () => {
        hasInteractedVenueRef.current = true;
        setSelectedVenueId(venue.id);
      });

      marker.addTo(layer);
    });
  }, [venues, concertsByVenue, selectedVenue.id]);

  // 4. Recentrage doux sur la salle sélectionnée quand l'utilisateur clique une salle
  useEffect(() => {
    if (!hasInteractedVenueRef.current) return;
    const map = mapRef.current;
    const geo = VENUE_GEO[selectedVenue.id];
    if (!map || !geo) return;

    const targetZoom = Math.max(map.getZoom(), 13);
    map.flyTo([geo.lat, geo.lng], targetZoom, {
      duration: 0.45,
    });
  }, [selectedVenue.id]);

  const handleResetView = () => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo(TOULOUSE_CENTER, DEFAULT_ZOOM, { duration: 0.45 });
  };

  const handleLocateUser = () => {
    if (!navigator.geolocation) {
      setGeoError('Géolocalisation indisponible sur cet appareil.');
      return;
    }
    setGeoError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const map = mapRef.current;
        if (!map) return;
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];

        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng(coords);
        } else {
          userMarkerRef.current = L.circleMarker(coords, {
            radius: 7,
            color: '#FFFFFF',
            weight: 2.5,
            fillColor: '#38BDF8',
            fillOpacity: 1,
          }).addTo(map);
        }
        map.flyTo(coords, 14, { duration: 0.55 });
      },
      () => {
        setLocating(false);
        setGeoError('Position non autorisée.');
        window.setTimeout(() => setGeoError(null), 3000);
      },
      { enableHighAccuracy: false, timeout: 7000 }
    );
  };

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
            {venues.length} salles · zoom & navigation tactiles
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
        {/* Interactive OpenStreetMap Dark Map (Leaflet) */}
        <div className="md:col-span-7 relative rounded-2xl overflow-hidden bg-[#121017] border border-white/[0.1] shadow-xl isolate">
          {/* Map controls (top-right) */}
          <div className="absolute top-2.5 right-2.5 z-[400] flex flex-col gap-1.5">
            <button
              type="button"
              aria-label="Zoom avant"
              onClick={() => mapRef.current?.zoomIn()}
              className="w-8 h-8 rounded-xl bg-[#18151E]/92 backdrop-blur border border-white/15 flex items-center justify-center text-white hover:bg-[#24202C] active:scale-95 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Zoom arrière"
              onClick={() => mapRef.current?.zoomOut()}
              className="w-8 h-8 rounded-xl bg-[#18151E]/92 backdrop-blur border border-white/15 flex items-center justify-center text-white hover:bg-[#24202C] active:scale-95 transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Me localiser"
              title="Me localiser sur la carte"
              onClick={handleLocateUser}
              className={`w-8 h-8 rounded-xl bg-[#18151E]/92 backdrop-blur border border-white/15 flex items-center justify-center hover:bg-[#24202C] active:scale-95 transition-colors ${
                locating ? 'text-sky-300 animate-pulse' : 'text-sky-400'
              }`}
            >
              <LocateFixed className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Recentrer sur Toulouse"
              title="Vue d’ensemble Toulouse"
              onClick={handleResetView}
              className="w-8 h-8 rounded-xl bg-[#18151E]/92 backdrop-blur border border-white/15 flex items-center justify-center text-[#F2A9B6] hover:bg-[#24202C] active:scale-95 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Transit legend toggle (top-left) */}
          <button
            type="button"
            onClick={() => setShowTransit((v) => !v)}
            className={`absolute top-2.5 left-2.5 z-[400] px-2.5 py-1.5 rounded-xl backdrop-blur border text-[10.5px] font-semibold flex items-center gap-1.5 transition-colors ${
              showTransit
                ? 'bg-[#18151E]/92 border-white/15 text-white'
                : 'bg-[#18151E]/65 border-white/10 text-[#8E8680]'
            }`}
          >
            <TrainFront className="w-3 h-3 text-[#C85A6E]" />
            Métro / Tram
          </button>

          {/* Geo error pill */}
          {geoError && (
            <div className="absolute top-12 left-2.5 z-[400] px-2.5 py-1 rounded-lg bg-rose-950/90 border border-rose-400/35 text-[10.5px] font-semibold text-rose-200">
              {geoError}
            </div>
          )}

          {/* Transit color legend (bottom-left) */}
          {showTransit && (
            <div className="absolute bottom-2.5 left-2.5 z-[400] px-2.5 py-1 rounded-lg bg-[#0E0D10]/88 backdrop-blur border border-white/10 flex items-center gap-2.5 text-[9.5px] font-semibold text-[#CFC7BE] pointer-events-none">
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

          {/* Leaflet mount point */}
          <div
            ref={mapContainerRef}
            className="scene-rose-map w-full h-[380px] sm:h-[420px] md:h-[490px] lg:h-[530px]"
            aria-label="Carte interactive OpenStreetMap des 17 salles de concerts de Toulouse"
          />
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
                  onClick={() => {
                    hasInteractedVenueRef.current = true;
                    setSelectedVenueId(v.id);
                  }}
                  className={`shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all flex items-center gap-1.5 ${
                    active
                      ? 'bg-white/[0.12] border-white/30 text-white'
                      : 'bg-[#16141A] border-white/[0.07] text-[#A9A097] hover:text-white'
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
              <div className="flex md:grid md:grid-cols-3 gap-2.5 overflow-x-auto md:overflow-visible no-scrollbar">
                {selectedVenueConcerts.slice(0, 6).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelectConcert(c)}
                    className="shrink-0 w-[108px] md:w-auto text-left group"
                  >
                    <div className="relative w-[108px] md:w-full h-[72px] rounded-xl overflow-hidden bg-[#211E27] border border-white/[0.08]">
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
