'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Navigation, Compass, Layers, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { api } from '@/lib/api';

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

export default function MapboxFleetMap({
  drivers,
  selectedDriver,
  onSelectDriver,
  historicalTrail,
  height = '540px',
}: MapboxFleetMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<{ [key: string]: any }>({});
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [activeToken, setActiveToken] = useState<string>('');
  const [showTokenPrompt, setShowTokenPrompt] = useState(false);
  const [mapStyle, setMapStyle] = useState<'dark-v11' | 'navigation-night-v1' | 'satellite-streets-v12'>('dark-v11');

  // Fetch master Mapbox token from backend database on mount
  useEffect(() => {
    // Purge browser local storage token so admin exclusively relies on the database
    if (typeof window !== 'undefined') {
      localStorage.removeItem('safaris_mapbox_token');
    }

    api.getConfig().then((config) => {
      if (config && config.mapboxAccessToken) {
        const token = String(config.mapboxAccessToken).trim();
        if (token) {
          setActiveToken(token);
        } else {
          setActiveToken('');
        }
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
        
        // Dynamic import Mapbox CSS
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

          // Add Historical Trail Source and Layer
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
              'line-color': '#000000',
              'line-width': 6,
              'line-opacity': 0.8,
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
  }, [activeToken, mapStyle]);

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

        // Marker Color Rules:
        // - Green marker (#10B981): Available driver (approved, online, available, recent ping < 15m)
        // - Blue marker (#3B82F6): Driver in field (approved, active trip)
        // - Gray marker (#6B7280): Offline / stale driver
        let pinColor = '#6B7280';
        if (isOnline && !isStale) {
          if (hasActiveTrip) {
            pinColor = '#3B82F6';
          } else if (isAvailable) {
            pinColor = '#10B981';
          }
        }

        const isSelected = selectedDriver?.id === id;

        if (markersRef.current[id]) {
          // Update position and rotation smoothly
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
          }
        } else {
          // Create custom dark safari marker DOM element
          const el = document.createElement('div');
          el.className = 'safaris-mapbox-marker cursor-pointer group relative';
          el.style.width = '36px';
          el.style.height = '36px';

          const label = driver.vehicle_plate || driver.registration_plate || driver.full_name || driver.name || 'SAFARI';

          el.innerHTML = [
            '<div style="width:32px;height:32px;background-color:#141518;border:2px solid ' + pinColor + ';border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.6);transition:transform 0.2s ease;" class="marker-container">',
            '  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + pinColor + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="marker-heading-icon" style="transform: rotate(' + heading + 'deg); transition: transform 0.3s ease;">',
            '    <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>',
            '  </svg>',
            '</div>',
            '<div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:1px 4px;font-family:monospace;font-size:8px;color:white;white-space:nowrap;">',
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

      // Remove markers of deleted/missing drivers
      Object.keys(markersRef.current).forEach((id) => {
        if (!currentIds.has(id)) {
          markersRef.current[id].remove();
          delete markersRef.current[id];
        }
      });
    });
  }, [drivers, isMapLoaded, selectedDriver, onSelectDriver]);

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

      // Fit bounds to trail
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
        // Save permanently to PostgreSQL database (AES-256 encrypted)
        const updated = await api.updateConfig({ mapboxAccessToken: clean });
        const savedToken = updated?.mapboxAccessToken || clean;
        setActiveToken(savedToken);
        console.log('[MapboxFleetMap] Token saved encrypted to server database.');
      } catch (err) {
        console.error('[MapboxFleetMap] Failed to save token to database:', err);
      }
    }
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-white/15 bg-[#0C0D10]" style={{ height }}>
      {/* Mapbox Canvas Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* When token is not configured yet */}
      {!activeToken && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 text-center space-y-4 z-20">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/15 flex items-center justify-center">
            <Compass className="w-6 h-6 text-[#E5A93C]" />
          </div>
          <div className="max-w-md space-y-2">
            <h3 className="text-sm font-semibold text-white">Connect Mapbox Token (Saved to Database)</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              To activate real-time WebGL vector cartography, provide your Mapbox Public Access Token (<code className="text-white/80 font-mono">pk.xxx</code>). 
              Your token is encrypted using AES-256 and stored permanently in the server database, shared across Admin and Mobile applications.
            </p>
          </div>
          <div className="flex w-full max-w-sm gap-2">
            <input
              type="text"
              placeholder="pk.eyJ1IjoibXVtd2VzYWZhcm..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="flex-1 bg-[#141518] border border-white/20 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/30 font-mono focus:outline-none focus:border-[#E5A93C]"
            />
            <button
              onClick={handleSaveToken}
              className="px-4 py-2 bg-white text-black font-semibold text-xs rounded-xl hover:bg-white/90 transition-colors"
            >
              Connect
            </button>
          </div>
        </div>
      )}

      {/* Floating Map Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button
          onClick={() => {
            if (mapRef.current) {
              mapRef.current.flyTo({ center: [32.5811, 0.3476], zoom: 7.2, curve: 1.2 });
            }
          }}
          title="Reset View to Uganda"
          className="w-8 h-8 rounded-lg bg-black/80 backdrop-blur-md border border-white/20 flex items-center justify-center text-white/70 hover:text-white hover:border-white/40 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => {
            if (mapRef.current) {
              mapRef.current.zoomIn();
            }
          }}
          title="Zoom In"
          className="w-8 h-8 rounded-lg bg-black/80 backdrop-blur-md border border-white/20 flex items-center justify-center text-white/70 hover:text-white hover:border-white/40 transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => {
            if (mapRef.current) {
              mapRef.current.zoomOut();
            }
          }}
          title="Zoom Out"
          className="w-8 h-8 rounded-lg bg-black/80 backdrop-blur-md border border-white/20 flex items-center justify-center text-white/70 hover:text-white hover:border-white/40 transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        {/* Style Selector */}
        <button
          onClick={() => {
            const nextStyle =
              mapStyle === 'dark-v11'
                ? 'navigation-night-v1'
                : mapStyle === 'navigation-night-v1'
                ? 'satellite-streets-v12'
                : 'dark-v11';
            setMapStyle(nextStyle);
          }}
          title="Toggle Map Style (Dark / Navigation / Satellite)"
          className="w-8 h-8 rounded-lg bg-black/80 backdrop-blur-md border border-white/20 flex items-center justify-center text-white/70 hover:text-white hover:border-white/40 transition-colors"
        >
          <Layers className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Map Header Status Badge */}
      <div className="absolute top-4 left-4 z-10 bg-black/80 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-lg flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
        <span className="text-[11px] font-mono text-white/90">
          Live Fleet Radar ({drivers.length} Approved Units)
        </span>
      </div>

      {/* Persistent On-Map Visual Legend Box */}
      <div className="absolute top-14 left-4 z-10 bg-black/85 backdrop-blur-md border border-white/15 px-3 py-2.5 rounded-lg flex flex-col gap-1.5 shadow-lg select-none">
        <div className="text-[9px] uppercase tracking-wider text-white/40 font-mono font-semibold pb-1 border-b border-white/10">
          Fleet Legend
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/90">
          <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] shadow-[0_0_6px_#10B981]" />
          <span>Available (Approved, Ready)</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/90">
          <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] shadow-[0_0_6px_#3B82F6]" />
          <span>In Field (Active Trip)</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/50">
          <span className="w-2.5 h-2.5 rounded-full bg-[#6B7280]" />
          <span>Offline / Stale (&gt;15m)</span>
        </div>
      </div>

      {/* Map Footer Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-[#090A0D]/90 backdrop-blur-md border-t border-white/10 px-4 py-2 flex items-center justify-between text-[11px] text-white/50 z-10">
        <div className="flex items-center gap-2">
          <Navigation className="w-3 h-3 text-[#E5A93C]" />
          <span>Style: Mapbox {mapStyle}</span>
        </div>
        <button
          onClick={() => setShowTokenPrompt(true)}
          className="text-white/40 hover:text-white/70 underline underline-offset-2"
        >
          Token Settings
        </button>
      </div>

      {/* Token Modal when requested */}
      {showTokenPrompt && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-30 flex items-center justify-center p-4">
          <div className="bg-[#141518] border border-white/20 rounded-2xl p-5 max-w-sm w-full space-y-3">
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Mapbox Access Token</h4>
              <p className="text-[10px] text-white/50 mt-0.5">Encrypted with AES-256 and saved permanently to server database.</p>
            </div>
            <input
              type="text"
              placeholder="pk.xxx"
              defaultValue={activeToken}
              onChange={(e) => setTokenInput(e.target.value)}
              className="w-full bg-black border border-white/20 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowTokenPrompt(false)}
                className="px-3 py-1.5 text-xs text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveToken}
                className="px-3 py-1.5 bg-white text-black font-semibold text-xs rounded-lg"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
