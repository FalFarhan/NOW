import { useState, useEffect } from 'react';
import { Search, Map as MapIcon, CloudLightning, Mountain, Navigation, Plus, Minus, Wind, Droplets, Thermometer, Plane, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Flight } from './Map';
import { FlightRoute } from '../App';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface WeatherData {
  temp: number;
  condition: string;
  wind: number;
  humidity: number;
}

interface UIOverlayProps {
  layer: 'dark' | 'satellite' | 'terrain';
  setLayer: (layer: 'dark' | 'satellite' | 'terrain') => void;
  showWeather: boolean;
  setShowWeather: (show: boolean) => void;
  showSunMoon: boolean;
  setShowSunMoon: (show: boolean) => void;
  selectedFlight: Flight | null;
  onCloseFlight: () => void;
  mapCenter: { lat: number, lng: number } | null;
  onZoomIn: () => void;
  onZoomOut: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  flightRoute?: FlightRoute | null;
}

export default function UIOverlay({
  layer, setLayer, showWeather, setShowWeather, showSunMoon, setShowSunMoon,
  selectedFlight, onCloseFlight, mapCenter,
  onZoomIn, onZoomOut, searchQuery, setSearchQuery, flightRoute
}: UIOverlayProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [locationName, setLocationName] = useState<string>('Unknown Location');
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);

  // Fetch weather for map center
  useEffect(() => {
    if (!mapCenter) return;
    
    const fetchWeather = async () => {
      try {
        // Using Open-Meteo for free weather data
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${mapCenter.lat}&longitude=${mapCenter.lng}&current_weather=true&hourly=relativehumidity_2m`);
        const data = await res.json();
        
        if (data && data.current_weather) {
          setWeather({
            temp: Math.round(data.current_weather.temperature),
            condition: getWeatherCondition(data.current_weather.weathercode),
            wind: Math.round(data.current_weather.windspeed),
            humidity: data.hourly?.relativehumidity_2m?.[0] || 50
          });
        }
      } catch (err) {
        console.error("Failed to fetch weather", err);
      }
    };

    const fetchLocation = async () => {
      try {
        const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${mapCenter.lat}&longitude=${mapCenter.lng}&localityLanguage=en`);
        const data = await res.json();
        if (data && data.city) {
          setLocationName(`${data.city}, ${data.countryCode}`);
        } else if (data && data.countryName) {
          setLocationName(data.countryName);
        } else {
          setLocationName('Unknown Location');
        }
      } catch (err) {
        console.error("Failed to fetch location", err);
      }
    };

    const timeoutId = setTimeout(() => {
      fetchWeather();
      fetchLocation();
    }, 1000); // Debounce
    return () => clearTimeout(timeoutId);
  }, [mapCenter]);

  return (
    <div className="absolute inset-0 z-[1000] pointer-events-none flex flex-col justify-between p-4 sm:p-6">
      {/* Top Bar */}
      <div className="flex justify-between items-start gap-4">
        {/* Search */}
        <div className="flex-1 flex gap-4 items-center">
          <div className="glass-panel-dark rounded-2xl px-4 py-3 flex items-center justify-center pointer-events-auto">
            <span className="text-xl font-black tracking-tighter text-white bg-clip-text text-transparent bg-gradient-to-br from-white to-white/50">NOW</span>
          </div>
          <div className="glass-panel-dark rounded-2xl p-2 flex items-center gap-3 w-full max-w-md pointer-events-auto transition-all hover:bg-black/40">
            <Search className="w-5 h-5 text-white/70 ml-2" />
            <input 
              type="text" 
              placeholder="Search flights..." 
              className="bg-transparent border-none outline-none text-white placeholder:text-white/50 w-full text-sm font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Weather Widget */}
        {weather && (
          <div className="glass-panel-dark rounded-2xl p-4 hidden sm:flex items-center gap-6 pointer-events-auto">
            <div className="flex flex-col">
              <span className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-1">Location</span>
              <span className="text-white font-bold text-sm max-w-[150px] truncate" title={locationName}>{locationName}</span>
            </div>
            <div className="h-8 w-px bg-white/20"></div>
            <div className="flex items-center gap-3">
              <Thermometer className="w-6 h-6 text-blue-400" />
              <div>
                <div className="text-2xl font-bold text-white leading-none">{weather.temp}°</div>
                <div className="text-xs text-white/60 font-medium mt-1">{weather.condition}</div>
              </div>
            </div>
            <div className="h-8 w-px bg-white/20"></div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-xs text-white/80">
                <Wind className="w-3 h-3 text-white/50" /> {weather.wind} km/h
              </div>
              <div className="flex items-center gap-2 text-xs text-white/80">
                <Droplets className="w-3 h-3 text-white/50" /> {weather.humidity}%
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Area */}
      <div className="flex justify-between items-end gap-4">
        {/* Left: Flight Details or Empty */}
        <div className="w-full max-w-sm pointer-events-auto">
          {selectedFlight && (
            <div className="glass-panel-dark rounded-3xl relative overflow-hidden animate-in slide-in-from-left-4 duration-300 flex flex-col">
              {/* Header / Collapse Toggle */}
              <div 
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors border-b border-white/5"
                onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
              >
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500/20 p-2 rounded-xl border border-blue-500/30">
                    <Plane className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white tracking-tight leading-none">{selectedFlight.callsign || selectedFlight.icao24}</div>
                    <div className="text-xs text-white/60 font-medium mt-1">{selectedFlight.origin_country}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white">
                    {isPanelCollapsed ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onCloseFlight(); }}
                    className="p-1.5 rounded-full bg-white/10 hover:bg-red-500/80 transition-colors text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Collapsible Content */}
              {!isPanelCollapsed && (
                <div className="p-6 pt-4 grid grid-cols-2 gap-4 bg-black/20">
                  {flightRoute && (
                    <div className="col-span-2 bg-blue-500/10 rounded-2xl p-4 border border-blue-500/20">
                      <div className="flex justify-between items-center mb-2">
                        <div className="text-xs text-blue-300 uppercase tracking-wider font-semibold">Route</div>
                        <div className="text-xs text-blue-300/60">ETA: {flightRoute.eta}</div>
                      </div>
                      <div className="flex items-center justify-between text-white font-bold">
                        <div className="text-sm">{flightRoute.origin?.city || 'Unknown'}</div>
                        <div className="text-blue-400">→</div>
                        <div className="text-sm">{flightRoute.destination?.city || 'Unknown'}</div>
                      </div>
                    </div>
                  )}
                  <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                    <div className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1">Altitude</div>
                    <div className="text-lg font-bold text-white">{Math.round(selectedFlight.baro_altitude || 0)} <span className="text-sm text-white/50 font-medium">m</span></div>
                  </div>
                  <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                    <div className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1">Speed</div>
                    <div className="text-lg font-bold text-white">{Math.round((selectedFlight.velocity || 0) * 3.6)} <span className="text-sm text-white/50 font-medium">km/h</span></div>
                  </div>
                  <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                    <div className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1">Heading</div>
                    <div className="text-lg font-bold text-white">{Math.round(selectedFlight.true_track || 0)}°</div>
                  </div>
                  <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                    <div className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-1">Status</div>
                    <div className="text-sm font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                      {selectedFlight.on_ground ? 'Grounded' : 'In Air'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Controls */}
        <div className="flex flex-col gap-4 pointer-events-auto items-end">
          {/* Layer Selector */}
          <div className="relative">
            {isLayerMenuOpen && (
              <div className="absolute bottom-full right-0 mb-4 glass-panel-dark rounded-2xl p-2 flex flex-col gap-2 min-w-[160px] animate-in fade-in slide-in-from-bottom-2">
                <button 
                  onClick={() => { setLayer('dark'); setIsLayerMenuOpen(false); }}
                  className={cn("flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors", layer === 'dark' ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white")}
                >
                  <MapIcon className="w-4 h-4" /> Dark Map
                </button>
                <button 
                  onClick={() => { setLayer('satellite'); setIsLayerMenuOpen(false); }}
                  className={cn("flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors", layer === 'satellite' ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white")}
                >
                  <Navigation className="w-4 h-4" /> Satellite
                </button>
                <button 
                  onClick={() => { setLayer('terrain'); setIsLayerMenuOpen(false); }}
                  className={cn("flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors", layer === 'terrain' ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white")}
                >
                  <Mountain className="w-4 h-4" /> Terrain
                </button>
                <div className="h-px bg-white/10 my-1"></div>
                <button 
                  onClick={() => { setShowWeather(!showWeather); setIsLayerMenuOpen(false); }}
                  className={cn("flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors", showWeather ? "bg-blue-500/30 text-blue-300" : "text-white/70 hover:bg-white/10 hover:text-white")}
                >
                  <CloudLightning className="w-4 h-4" /> Weather Radar
                </button>
                <button 
                  onClick={() => { setShowSunMoon(!showSunMoon); setIsLayerMenuOpen(false); }}
                  className={cn("flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors", showSunMoon ? "bg-yellow-500/30 text-yellow-300" : "text-white/70 hover:bg-white/10 hover:text-white")}
                >
                  <div className="w-4 h-4 rounded-full bg-gradient-to-r from-yellow-400 to-indigo-400"></div> Sun/Moon Radar
                </button>
              </div>
            )}
            <button 
              onClick={() => setIsLayerMenuOpen(!isLayerMenuOpen)}
              className="glass-panel-dark p-3 rounded-2xl hover:bg-white/20 transition-colors"
            >
              <MapIcon className="w-6 h-6 text-white" />
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="glass-panel-dark rounded-2xl flex flex-col overflow-hidden">
            <button 
              onClick={onZoomIn}
              className="p-3 hover:bg-white/20 transition-colors border-b border-white/10"
            >
              <Plus className="w-6 h-6 text-white" />
            </button>
            <button 
              onClick={onZoomOut}
              className="p-3 hover:bg-white/20 transition-colors"
            >
              <Minus className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper to convert WMO weather codes to text
function getWeatherCondition(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code === 1 || code === 2 || code === 3) return 'Partly cloudy';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code >= 71 && code <= 75) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Unknown';
}
