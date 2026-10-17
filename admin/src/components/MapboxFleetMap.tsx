'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Navigation, Compass, Layers, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { api } from '@/lib/api';
import { useTheme } from '@/components/ThemeProvider';

export interface LiveDriver {
  id: string;
  full_name?: string;
  name?: string;
  phone?: string;
  role?: string;
  rating?: number;
  is_online: boolean;
  is_available?: boolean;
  current_lat: number | string;
  current_lng: number | string;
  heading?: number | string;
  speed?: number;
  accuracy?: number;
  battery_level?: number;
  vehicle_plate?: string;
  registration_plate?: string;
  make?: string;
  model?: string;
  tier?: string;
  active_trip_id?: string;
  active_trip_pickup?: string;
  active_trip_status?: string;
}

interface MapboxFleetMapProps {
  drivers: any[];
  selectedDriver: any | null;
  onSelectDriver: (driver: any) => void;
  historicalTrail?: Array<{ lat: number; lng: number }>;
  height?: string;
}

type MapStyleOption = 'streets-v12' | 'light-v11' | 'dark-v11' | 'navigation-night-v1' | 'satellite-streets-v12';

export default function MapboxFleetMap({
  drivers,
  selectedDriver,
  onSelectDriver,
  historicalTrail,
  height = '540px',
}: MapboxFleetMapProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<{ [key: string]: any }>({});
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [activeToken, setActiveToken] = useState<string>('');
  const [showTokenPrompt, setShowTokenPrompt] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyleOption>(isLight ? 'streets-v12' : 'dark-v11');

  // Sync map style automatically when theme toggles between light and dark
  useEffect(() => {
    setMapStyle((prev) => {
      if (isLight && (prev === 'dark-v11' || prev === 'navigation-night-v1')) {
        return 'streets-v12';
      }
      if (!isLight && (prev === 'streets-v12' || prev === 'light-v11')) {
        return 'dark-v11';
      }
      return prev;
    });
  }, [isLight]);

  // Fetch master Mapbox token from backend database on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('safaris_mapbox_token');
    }

    api.getConfig().then((config) => {
      if (config && config.mapboxAccessToken) {
        const token = String(config.mapboxAccessToken).trim();
        setActiveToken(token || '');
      } else {
        setActiveToken('');
      }
    }).catch((err) => {
      console.warn('[MapboxFleetMap] Could not fetch remote config token from database:', err);
    });
  }, []);

  // Initialize or reload Mapbox GL instance
  useEffect(() => {
    if (!mapContainerRef.current || !activeToken) return;

    let isMounted = true;

    async function initMapbox() {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        
        if (!document.getElementById('mapbox-gl-css')) {
          const link = document.createElement('link');
          link.id = 'mapbox-gl-css';
          link.rel = 'stylesheet';
          link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.css';
          document.head.appendChild(link);
        }

        mapboxgl.accessToken = activeToken;

        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        const map = new mapboxgl.Map({
          container: mapContainerRef.current!,
          style: 'mapbox://styles/mapbox/' + mapStyle,
          center: [32.5811, 0.3476], // Kampala CBD
          zoom: 7.2,
          minZoom: 5.0,
          maxZoom: 18.0,
          attributionControl: false,
        });

        map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

        map.on('load', () => {
          if (!isMounted) return;
          mapRef.current = map;
          setIsMapLoaded(true);

          map.addSource('route-trail', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: [],
              },
            },
          });

          map.addLayer({
            id: 'route-trail-casing',
            type: 'line',
            source: 'route-trail',
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': isLight ? '#0f172a' : '#000000',
              'line-width': 6,
              'line-opacity': 0.75,
            },
          });

          map.addLayer({
            id: 'route-trail-line',
            type: 'line',
            source: 'route-trail',
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#E5A93C',
              'line-width': 3.5,
              'line-opacity': 0.95,
            },
          });
        });

        map.on('error', (e: any) => {
          console.warn('[MapboxFleetMap] Mapbox GL runtime notice:', e.error?.message || e);
        });
      } catch (err) {
        console.warn('[MapboxFleetMap] Failed to initialize Mapbox GL:', err);
      }
    }

    initMapbox();

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [activeToken, mapStyle, isLight]);

  // Update vehicle markers whenever drivers change
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      const currentIds = new Set<string>();

      drivers.forEach((driver) => {
        const id = driver.id;
        currentIds.add(id);
        const lat = parseFloat(String(driver.current_lat || '0.3136'));
        const lng = parseFloat(String(driver.current_lng || '32.5811'));
        const heading = parseFloat(String(driver.heading || '0'));
        const isOnline = Boolean(driver.is_online);
        const isAvailable = Boolean(driver.is_available);
        const hasActiveTrip = Boolean(driver.active_trip_id);
        const isStale = Boolean(driver.is_stale);

        let pinColor = '#64748B';
        if (isOnline && !isStale) {
          if (hasActiveTrip) {
            pinColor = '#2563EB';
          } else if (isAvailable) {
            pinColor = '#10B981';
          }
        }

        if (markersRef.current[id]) {
          markersRef.current[id].setLngLat([lng, lat]);
          const el = markersRef.current[id].getElement();
          const markerIcon = el.querySelector('.marker-heading-icon') as HTMLElement;
          if (markerIcon) {
            markerIcon.style.transform = 'rotate(' + heading + 'deg)';
            markerIcon.setAttribute('stroke', pinColor);
          }
          const container = el.querySelector('.marker-container') as HTMLElement;
          if (container) {
            container.style.borderColor = pinColor;
            container.style.backgroundColor = isLight ? '#ffffff' : '#141518';
          }
        } else {
          const el = document.createElement('div');
          el.className = 'safaris-mapbox-marker cursor-pointer group relative';
          el.style.width = '36px';
          el.style.height = '36px';

          const label = driver.vehicle_plate || driver.registration_plate || driver.full_name || driver.name || 'SAFARI';
          const pinBg = isLight ? '#ffffff' : '#141518';
          const tagBg = isLight ? 'rgba(255,255,255,0.95)' : 'rgba(15,23,42,0.9)';
          const tagText = isLight ? '#0f172a' : '#ffffff';
          const tagBorder = isLight ? '#cbd5e1' : 'rgba(255,255,255,0.2)';

          el.innerHTML = [
            '<div style="width:32px;height:32px;background-color:' + pinBg + ';border:2.5px solid ' + pinColor + ';border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(15,23,42,0.28);transition:transform 0.2s ease;" class="marker-container">',
            '  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + pinColor + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="marker-heading-icon" style="transform: rotate(' + heading + 'deg); transition: transform 0.3s ease;">',
            '    <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>',
            '  </svg>',
            '</div>',
            '<div style="position:absolute;bottom:-19px;left:50%;transform:translateX(-50%);background:' + tagBg + ';border:1px solid ' + tagBorder + ';border-radius:4px;padding:1px 5px;font-family:monospace;font-weight:700;font-size:8.5px;color:' + tagText + ';white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.12);">',
            '  ' + label,
            '</div>',
          ].join('');

          el.addEventListener('click', () => {
            onSelectDriver(driver);
          });

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(mapRef.current);

          markersRef.current[id] = marker;
        }
      });

      Object.keys(markersRef.current).forEach((id) => {
        if (!currentIds.has(id)) {
          markersRef.current[id].remove();
          delete markersRef.current[id];
        }
      });
    });
  }, [drivers, isMapLoaded, selectedDriver, onSelectDriver, isLight]);

  // Smoothly fly camera to selected driver
  useEffect(() => {
    if (!mapRef.current || !selectedDriver || !isMapLoaded) return;
    const lat = parseFloat(String(selectedDriver.current_lat || '0.3136'));
    const lng = parseFloat(String(selectedDriver.current_lng || '32.5811'));

    if (!isNaN(lat) && !isNaN(lng)) {
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: 12.5,
        speed: 1.4,
        curve: 1.2,
        essential: true,
      });
    }
  }, [selectedDriver, isMapLoaded]);

  // Update historical trail layer if provided
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;
    const source = mapRef.current.getSource('route-trail');
    if (!source) return;

    if (historicalTrail && historicalTrail.length > 0) {
      const coordinates: [number, number][] = historicalTrail.map((pt) => [pt.lng, pt.lat]);
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates,
        },
      });

      import('mapbox-gl').then(({ default: mapboxgl }) => {
        const bounds = new mapboxgl.LngLatBounds();
        coordinates.forEach((coord) => bounds.extend(coord));
        mapRef.current.fitBounds(bounds, { padding: 50, maxZoom: 14 });
      });
    } else {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [],
        },
      });
    }
  }, [historicalTrail, isMapLoaded]);

  const handleSaveToken = async () => {
    const clean = tokenInput.trim();
    if (clean) {
      setShowTokenPrompt(false);
      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('safaris_mapbox_token');
        }
        const updated = await api.updateConfig({ mapboxAccessToken: clean });
        const savedToken = updated?.mapboxAccessToken || clean;
        setActiveToken(savedToken);
      } catch (err) {
        console.error('[MapboxFleetMap] Failed to save token to database:', err);
      }
    }
  };

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border shadow-sm ${
        isLight ? 'bg-slate-50 border-slate-300' : 'bg-[#0C0D10] border-white/15'
      }`}
      style={{ height }}
    >
      {/* Mapbox Canvas Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* When token is not configured yet */}
      {!activeToken && (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center p-8 text-center space-y-5 z-20 ${
            isLight
              ? 'bg-gradient-to-b from-white via-slate-50 to-slate-100 text-slate-900'
              : 'bg-[#0C0D10]/95 text-white'
          }`}
        >
          <div
            className={`w-14 h-14 rounded-2xl border flex items-center justify-center shadow-sm ${
              isLight
                ? 'bg-amber-50 border-amber-200 text-amber-600'
                : 'bg-white/[0.04] border-white/15 text-[#E5A93C]'
            }`}
          >
            <Compass className="w-7 h-7" />
          </div>
          <div className="max-w-md space-y-2">
            <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Connect Mapbox GL Cartography
            </h3>
            <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-white/60'}`}>
              Enter your Mapbox Public Access Token (<code className="font-mono font-bold">pk.xxx</code>) to activate real-time WebGL street &amp; terrain maps. Your token is AES-256 encrypted and stored permanently in PostgreSQL, or switch to <strong>Vector Radar</strong> in the toolbar above.
            </p>
          </div>
          <div className="flex w-full max-w-sm gap-2">
            <input
              type="text"
              placeholder="pk.eyJ1IjoibXVtd2VzYWZhcm..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className={`flex-1 rounded-xl px-3.5 py-2.5 text-xs font-mono border focus:outline-none ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-slate-900'
                  : 'bg-[#141518] border-white/20 text-white placeholder:text-white/30 focus:border-[#E5A93C]'
              }`}
            />
            <button
              onClick={handleSaveToken}
              className={`px-5 py-2.5 font-bold text-xs rounded-xl transition-colors shadow-sm ${
                isLight
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : 'bg-white text-black hover:bg-white/90'
              }`}
            >
              Connect
            </button>
          </div>
        </div>
      )}

      {/* Floating Map Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        {[
          {
            title: 'Reset View to Uganda',
            icon: RotateCcw,
            onClick: () => mapRef.current?.flyTo({ center: [32.5811, 0.3476], zoom: 7.2, curve: 1.2 }),
          },
          {
            title: 'Zoom In',
            icon: ZoomIn,
            onClick: () => mapRef.current?.zoomIn(),
          },
          {
            title: 'Zoom Out',
            icon: ZoomOut,
            onClick: () => mapRef.current?.zoomOut(),
          },
          {
            title: 'Cycle Map Style (Streets / Light / Satellite / Dark)',
            icon: Layers,
            onClick: () => {
              const order: MapStyleOption[] = ['streets-v12', 'light-v11', 'satellite-streets-v12', 'dark-v11'];
              const idx = order.indexOf(mapStyle);
              setMapStyle(order[(idx + 1) % order.length]);
            },
          },
        ].map((btn, i) => {
          const Icon = btn.icon;
          return (
            <button
              key={i}
              onClick={btn.onClick}
              title={btn.title}
              className={`w-9 h-9 rounded-xl backdrop-blur-md border flex items-center justify-center transition-all shadow-sm ${
                isLight
                  ? 'bg-white/95 border-slate-300 text-slate-700 hover:text-slate-950 hover:bg-white hover:border-slate-400'
                  : 'bg-black/80 border-white/20 text-white/70 hover:text-white hover:border-white/40'
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>

      {/* Map Header Status Badge */}
      <div
        className={`absolute top-4 left-4 z-10 backdrop-blur-md border px-3.5 py-2 rounded-xl flex items-center gap-2.5 shadow-sm ${
          isLight
            ? 'bg-white/95 border-slate-300 text-slate-900'
            : 'bg-black/80 border-white/15 text-white/90'
        }`}
      >
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs font-mono font-bold">
          Live Fleet Radar ({drivers.length} Approved Units)
        </span>
      </div>

      {/* Persistent On-Map Visual Legend Box */}
      <div
        className={`absolute top-16 left-4 z-10 backdrop-blur-md border px-3.5 py-3 rounded-xl flex flex-col gap-2 shadow-md select-none ${
          isLight
            ? 'bg-white/95 border-slate-300 text-slate-800'
            : 'bg-black/85 border-white/15 text-white/90'
        }`}
      >
        <div
          className={`text-[10px] uppercase tracking-wider font-mono font-bold pb-1.5 border-b ${
            isLight ? 'text-slate-500 border-slate-200' : 'text-white/40 border-white/10'
          }`}
        >
          Fleet Status Legend
        </div>
        <div className="flex items-center gap-2.5 text-[11px] font-semibold">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10B981]" />
          <span>Available (Approved, Ready)</span>
        </div>
        <div className="flex items-center gap-2.5 text-[11px] font-semibold">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-[0_0_6px_#2563EB]" />
          <span>In Field (Active Safari/Trip)</span>
        </div>
        <div className={`flex items-center gap-2.5 text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-white/50'}`}>
          <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
          <span>Offline / Stale (&gt;15m)</span>
        </div>
      </div>

      {/* Map Footer Bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 backdrop-blur-md border-t px-4 py-2.5 flex items-center justify-between text-xs z-10 ${
          isLight
            ? 'bg-white/95 border-slate-200 text-slate-600'
            : 'bg-[#090A0D]/90 border-white/10 text-white/50'
        }`}
      >
        <div className="flex items-center gap-2 font-medium">
          <Navigation className="w-3.5 h-3.5 text-amber-600" />
          <span>Cartography: Mapbox {mapStyle}</span>
        </div>
        <button
          onClick={() => setShowTokenPrompt(true)}
          className={`font-semibold underline underline-offset-2 transition-colors ${
            isLight ? 'text-slate-600 hover:text-slate-950' : 'text-white/50 hover:text-white'
          }`}
        >
          Token Settings
        </button>
      </div>

      {/* Token Modal when requested */}
      {showTokenPrompt && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-30 flex items-center justify-center p-4">
          <div
            className={`border rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl ${
              isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#141518] border-white/20 text-white'
            }`}
          >
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider">Mapbox Access Token</h4>
              <p className={`text-[11px] mt-1 ${isLight ? 'text-slate-500' : 'text-white/50'}`}>
                Encrypted with AES-256 and saved permanently to server database.
              </p>
            </div>
            <input
              type="text"
              placeholder="pk.xxx"
              defaultValue={activeToken}
              onChange={(e) => setTokenInput(e.target.value)}
              className={`w-full border rounded-xl px-3.5 py-2 text-xs font-mono ${
                isLight
                  ? 'bg-slate-50 border-slate-300 text-slate-900'
                  : 'bg-black border-white/20 text-white'
              }`}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowTokenPrompt(false)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg ${
                  isLight ? 'text-slate-600 hover:bg-slate-100' : 'text-white/60 hover:text-white'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveToken}
                className={`px-4 py-1.5 font-bold text-xs rounded-lg ${
                  isLight ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-black'
                }`}
              >
                Save Token
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
