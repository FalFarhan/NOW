import { useState, useEffect, useRef, useCallback } from 'react';
import Map, { Flight } from './components/Map';
import UIOverlay from './components/UIOverlay';

export interface Airport {
  icao: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
}

export interface FlightRoute {
  origin: Airport | null;
  destination: Airport | null;
  eta?: string;
}

export default function App() {
  const [layer, setLayer] = useState<'dark' | 'satellite' | 'terrain'>('dark');
  const [showWeather, setShowWeather] = useState(false);
  const [showSunMoon, setShowSunMoon] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number, lng: number } | null>(null);
  const [mapBounds, setMapBounds] = useState<{ getSouthWest: () => {lat: number, lng: number}, getNorthEast: () => {lat: number, lng: number} } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [flightRoute, setFlightRoute] = useState<FlightRoute | null>(null);
  
  // To control map zoom from UIOverlay
  const mapRef = useRef<any>(null);

  const handleZoomIn = () => {
    if (mapRef.current) {
      const view = mapRef.current.getView();
      view.setZoom((view.getZoom() || 0) + 1);
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) {
      const view = mapRef.current.getView();
      view.setZoom((view.getZoom() || 0) - 1);
    }
  };

  // Fetch flights based on bounds
  useEffect(() => {
    const fetchFlights = async (retryWider = false) => {
      try {
        let url = 'https://opensky-network.org/api/states/all';
        
        if (mapBounds && !retryWider) {
          const sw = mapBounds.getSouthWest();
          const ne = mapBounds.getNorthEast();
          
          const lamin = Math.max(-90, Math.min(sw.lat, ne.lat));
          const lamax = Math.min(90, Math.max(sw.lat, ne.lat));
          const lomin = Math.max(-180, Math.min(sw.lng, ne.lng));
          const lomax = Math.min(180, Math.max(sw.lng, ne.lng));

          if (!isNaN(lamin) && !isNaN(lamax) && !isNaN(lomin) && !isNaN(lomax)) {
            url += `?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
          }
        }

        const res = await fetch(url);
        
        if (!res.ok) {
          if (res.status === 429) {
            console.warn("OpenSky API rate limited.");
          }
          return;
        }

        const data = await res.json();
        console.log('Fetched flights data:', data);
        
        if (data && data.states && data.states.length > 0) {
          const parsedFlights: Flight[] = data.states.map((state: any) => ({
            icao24: state[0],
            callsign: state[1]?.trim(),
            origin_country: state[2],
            time_position: state[3],
            last_contact: state[4],
            longitude: state[5],
            latitude: state[6],
            baro_altitude: state[7],
            on_ground: state[8],
            velocity: state[9],
            true_track: state[10],
            vertical_rate: state[11],
            sensors: state[12],
            geo_altitude: state[13],
            squawk: state[14],
            spi: state[15],
            position_source: state[16]
          })).filter((f: Flight) => f.latitude != null && f.longitude != null);

          setFlights(parsedFlights);
        } else if (!retryWider) {
          // If no flights found in bounds, try fetching all
          fetchFlights(true);
        } else {
          setFlights([]);
        }
      } catch (err) {
        console.error("Failed to fetch flights", err);
      }
    };

    fetchFlights();
    const intervalId = setInterval(() => fetchFlights(), 30000);

    return () => clearInterval(intervalId);
  }, [mapBounds]);

  // Fetch route when selectedFlight changes
  useEffect(() => {
    if (!selectedFlight) {
      setFlightRoute(null);
      return;
    }

    const fetchRoute = async () => {
      try {
        const callsign = selectedFlight.callsign?.trim();
        if (!callsign) return;

        const routeRes = await fetch(`https://opensky-network.org/api/routes?callsign=${callsign}`);
        if (!routeRes.ok) return;
        const routeData = await routeRes.json();

        if (routeData && routeData.route && routeData.route.length >= 2) {
          const originIcao = routeData.route[0];
          const destIcao = routeData.route[1];

          // Fetch airport details
          const fetchAirport = async (icao: string): Promise<Airport | null> => {
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${icao}+airport&format=json&limit=1`);
              const data = await res.json();
              if (data && data.length > 0) {
                const parts = data[0].display_name.split(',');
                return {
                  icao,
                  name: data[0].name || parts[0],
                  city: parts[1]?.trim() || parts[0],
                  lat: parseFloat(data[0].lat),
                  lng: parseFloat(data[0].lon)
                };
              }
            } catch (e) {
              console.error(e);
            }
            return { icao, name: icao, city: 'Unknown', lat: 0, lng: 0 }; // Fallback
          };

          const origin = await fetchAirport(originIcao);
          const destination = await fetchAirport(destIcao);

          // Calculate ETA
          let eta = 'Unknown';
          if (destination && destination.lat !== 0 && selectedFlight.latitude && selectedFlight.longitude && selectedFlight.velocity) {
            // Haversine distance
            const R = 6371e3; // metres
            const φ1 = selectedFlight.latitude * Math.PI/180;
            const φ2 = destination.lat * Math.PI/180;
            const Δφ = (destination.lat - selectedFlight.latitude) * Math.PI/180;
            const Δλ = (destination.lng - selectedFlight.longitude) * Math.PI/180;

            const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                      Math.cos(φ1) * Math.cos(φ2) *
                      Math.sin(Δλ/2) * Math.sin(Δλ/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const d = R * c; // in metres

            const timeSeconds = d / selectedFlight.velocity;
            const arrivalDate = new Date(Date.now() + timeSeconds * 1000);
            eta = arrivalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }

          setFlightRoute({ origin, destination, eta });
        }
      } catch (err) {
        console.error("Failed to fetch route", err);
      }
    };

    fetchRoute();
  }, [selectedFlight]);

  // Filter flights based on search query
  const filteredFlights = flights.filter(f => 
    searchQuery === '' || 
    f.callsign?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.origin_country?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-900">
      <Map 
        flights={filteredFlights}
        selectedFlight={selectedFlight}
        onSelectFlight={setSelectedFlight}
        layer={layer}
        showWeather={showWeather}
        showSunMoon={showSunMoon}
        onBoundsChange={setMapBounds}
        onCenterChange={setMapCenter}
        mapRef={mapRef}
        flightRoute={flightRoute}
      />
      
      <UIOverlay 
        layer={layer}
        setLayer={setLayer}
        showWeather={showWeather}
        setShowWeather={setShowWeather}
        showSunMoon={showSunMoon}
        setShowSunMoon={setShowSunMoon}
        selectedFlight={selectedFlight}
        onCloseFlight={() => setSelectedFlight(null)}
        mapCenter={mapCenter}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        flightRoute={flightRoute}
      />
    </div>
  );
}
