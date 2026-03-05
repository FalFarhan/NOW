import React, { useEffect, useRef, useState } from 'react';
import 'ol/ol.css';
import OLMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import proj4 from 'proj4';
import { register } from 'ol/proj/proj4';
import Projection from 'ol/proj/Projection';
import { fromLonLat, transform } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import Polygon from 'ol/geom/Polygon';
import { Style, Icon, Stroke, Circle as CircleStyle, Fill } from 'ol/style';
import { FlightRoute } from '../App';

// Define the Alexander Gleason map projection (North Pole Azimuthal Equidistant)
proj4.defs('ESRI:102016', '+proj=aeqd +lat_0=90 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs');
register(proj4);

const gleasonProjection = new Projection({
  code: 'ESRI:102016',
  extent: [-20015000, -20015000, 20015000, 20015000],
  worldExtent: [-180, -90, 180, 90],
});

export interface Flight {
  icao24: string;
  callsign: string;
  origin_country: string;
  time_position: number;
  last_contact: number;
  longitude: number;
  latitude: number;
  baro_altitude: number;
  on_ground: boolean;
  velocity: number;
  true_track: number;
  vertical_rate: number;
  sensors: number[];
  geo_altitude: number;
  squawk: string;
  spi: boolean;
  position_source: number;
}

const LAYERS = {
  dark: {
    url: 'https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  },
  terrain: {
    url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
  }
};

interface MapProps {
  flights: Flight[];
  selectedFlight: Flight | null;
  onSelectFlight: (flight: Flight | null) => void;
  layer: keyof typeof LAYERS;
  showWeather: boolean;
  showSunMoon: boolean;
  onBoundsChange: (bounds: any) => void;
  onCenterChange: (center: { lat: number, lng: number }) => void;
  mapRef: React.MutableRefObject<OLMap | null>;
  flightRoute?: FlightRoute | null;
}

export default function OpenLayersMap({ flights, selectedFlight, onSelectFlight, layer, showWeather, showSunMoon, onBoundsChange, onCenterChange, mapRef, flightRoute }: MapProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<OLMap | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const flightsSourceRef = useRef<VectorSource>(new VectorSource());
  const selectedFlightSourceRef = useRef<VectorSource>(new VectorSource());
  const sunMoonSourceRef = useRef<VectorSource>(new VectorSource());
  const radarSourceRef = useRef<XYZ | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapElement.current) return;

    const baseLayer = new TileLayer({
      source: new XYZ({
        url: LAYERS[layer].url,
        crossOrigin: 'anonymous',
        projection: 'EPSG:3857',
      }),
    });

    const radarLayer = new TileLayer({
      source: new XYZ({
        url: '', // Will be updated
        crossOrigin: 'anonymous',
        projection: 'EPSG:3857',
      }),
      opacity: 0.6,
      zIndex: 10,
      visible: false,
    });

    const flightsLayer = new VectorLayer({
      source: flightsSourceRef.current,
      zIndex: 20,
    });

    const selectedFlightLayer = new VectorLayer({
      source: selectedFlightSourceRef.current,
      zIndex: 30,
    });

    const sunMoonLayer = new VectorLayer({
      source: sunMoonSourceRef.current,
      zIndex: 15,
      visible: showSunMoon,
    });

    const initialMap = new OLMap({
      target: mapElement.current,
      layers: [baseLayer, radarLayer, sunMoonLayer, flightsLayer, selectedFlightLayer],
      view: new View({
        projection: gleasonProjection,
        center: fromLonLat([0, 90], gleasonProjection), // Center on North Pole
        zoom: 2,
        maxZoom: 10,
        minZoom: 1,
      }),
      controls: [], // Remove default controls
    });

    setMap(initialMap);
    mapRef.current = initialMap;

    const updateBoundsAndCenter = () => {
      const view = initialMap.getView();
      const center = view.getCenter();
      if (center) {
        const lonLat = transform(center, gleasonProjection, 'EPSG:4326');
        if (!isNaN(lonLat[0]) && !isNaN(lonLat[1])) {
          onCenterChange({ lng: lonLat[0], lat: lonLat[1] });
        }
      }
      
      const extent = view.calculateExtent(initialMap.getSize());
      const bl = transform([extent[0], extent[1]], gleasonProjection, 'EPSG:4326');
      const tr = transform([extent[2], extent[3]], gleasonProjection, 'EPSG:4326');
      
      onBoundsChange({
        getSouthWest: () => ({ lat: bl ? bl[1] : -90, lng: bl ? bl[0] : -180 }),
        getNorthEast: () => ({ lat: tr ? tr[1] : 90, lng: tr ? tr[0] : 180 }),
      });
    };

    initialMap.on('moveend', updateBoundsAndCenter);
    // Call once to initialize
    setTimeout(updateBoundsAndCenter, 100);

    // Handle clicks on flights
    initialMap.on('click', (evt) => {
      const feature = initialMap.forEachFeatureAtPixel(evt.pixel, (feat) => feat);
      if (feature) {
        const flightData = feature.get('flight');
        if (flightData) {
          onSelectFlight(flightData);
        }
      } else {
        onSelectFlight(null);
      }
    });

    // Handle pointer cursor
    initialMap.on('pointermove', (e) => {
      const pixel = initialMap.getEventPixel(e.originalEvent);
      const hit = initialMap.hasFeatureAtPixel(pixel);
      initialMap.getTargetElement().style.cursor = hit ? 'pointer' : '';
    });

    return () => {
      initialMap.setTarget(undefined);
    };
  }, []);

  // Effect to update sunMoonLayer visibility
  useEffect(() => {
    if (map) {
      const layers = map.getLayers().getArray();
      const sunMoonLayer = layers.find(l => l.getSource() === sunMoonSourceRef.current);
      if (sunMoonLayer) {
        sunMoonLayer.setVisible(showSunMoon);
      }
    }
  }, [showSunMoon, map]);

  // Update Base Layer
  useEffect(() => {
    if (!map) return;
    const layers = map.getLayers().getArray();
    const baseLayer = layers[0] as TileLayer<XYZ>;
    baseLayer.setSource(new XYZ({
      url: LAYERS[layer].url,
      crossOrigin: 'anonymous',
      projection: 'EPSG:3857',
    }));
  }, [layer, map]);

  // Update Weather Radar
  useEffect(() => {
    if (!map) return;
    const layers = map.getLayers().getArray();
    const radarLayer = layers[1] as TileLayer<XYZ>;
    
    if (showWeather) {
      fetch('https://api.rainviewer.com/public/weather-maps.json')
        .then(res => res.json())
        .then(data => {
          if (data && data.radar && data.radar.past && data.radar.past.length > 0) {
            const radarTime = data.radar.past[data.radar.past.length - 1].time;
            radarLayer.setSource(new XYZ({
              url: `https://tilecache.rainviewer.com/v2/radar/${radarTime}/256/{z}/{x}/{y}/2/1_1.png`,
              crossOrigin: 'anonymous',
              projection: 'EPSG:3857',
            }));
            radarLayer.setVisible(true);
          }
        })
        .catch(console.error);
    } else {
      radarLayer.setVisible(false);
    }
  }, [showWeather, map]);

  // Update Sun/Moon Radar
  useEffect(() => {
    if (!map || !showSunMoon) return;
    const source = sunMoonSourceRef.current;
    source.clear();

    const features: Feature[] = [];
    
    // 1. Equator
    const equatorCoords = [];
    for (let i = 0; i <= 360; i += 5) {
      equatorCoords.push(transform([i - 180, 0], 'EPSG:4326', gleasonProjection));
    }
    features.push(new Feature({
      geometry: new LineString(equatorCoords),
      style: new Style({ stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.2)', width: 1, lineDash: [5, 5] }) })
    }));

    // 2. Tropics
    const tropics = [23.436, -23.436];
    tropics.forEach(lat => {
      const coords = [];
      for (let i = 0; i <= 360; i += 5) {
        coords.push(transform([i - 180, lat], 'EPSG:4326', gleasonProjection));
      }
      features.push(new Feature({
        geometry: new LineString(coords),
        style: new Style({ stroke: new Stroke({ color: 'rgba(255, 100, 100, 0.2)', width: 1 }) })
      }));
    });

    // 3. Sun/Moon Positions
    const now = currentTime;
    const dayOfYear = (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000;
    
    // Sun
    const sunDeclination = 23.44 * Math.sin((2 * Math.PI / 365.25) * (dayOfYear - 80));
    const sunLon = -(now.getUTCHours() - 12 + now.getUTCMinutes() / 60) * 15;

    // Sun Icon with Glow
    features.push(new Feature({
      geometry: new Point(transform([sunLon, sunDeclination], 'EPSG:4326', gleasonProjection)),
      style: new Style({ 
        image: new CircleStyle({ 
          radius: 35, 
          fill: new Fill({ color: '#FFD700' }), // Bright yellow
          stroke: new Stroke({ color: 'rgba(255, 215, 0, 0.7)', width: 30 }) // Very pronounced glow
        }) 
      })
    }));

    // Moon with Glow
    const moonLon = sunLon + 180; 
    const moonLat = -sunDeclination;
    features.push(new Feature({
      geometry: new Point(transform([moonLon, moonLat], 'EPSG:4326', gleasonProjection)),
      style: new Style({ 
        image: new CircleStyle({ 
          radius: 26, 
          fill: new Fill({ color: '#F0F8FF' }), // AliceBlue for moon
          stroke: new Stroke({ color: 'rgba(240, 248, 255, 0.6)', width: 20 }) // Very pronounced glow
        }) 
      })
    }));
    
    source.addFeatures(features);
  }, [showSunMoon, map, currentTime]);

  // Update Flights
  useEffect(() => {
    if (!map) return;
    const source = flightsSourceRef.current;
    source.clear();

    const features = flights.map(flight => {
      const coords = transform([flight.longitude, flight.latitude], 'EPSG:4326', gleasonProjection);
      console.log('Flight coords:', coords, flight);
      const feature = new Feature({
        geometry: new Point(coords),
        flight: flight,
      });

      // SVG Plane Icon
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${selectedFlight?.icao24 === flight.icao24 ? '#3b82f6' : '#ffffff'}" stroke="${selectedFlight?.icao24 === flight.icao24 ? '#3b82f6' : '#ffffff'}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.2-1.1.6L3 8l6 5-3.5 3.5L3 16l-1 1 4 1 1 4 1-1-1-2.5L11.5 15 16 21l1.8-.7c.4-.2.7-.6.6-1.1z"/></svg>`;
      
      feature.setStyle(new Style({
        image: new Icon({
          src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
          rotation: (flight.true_track || 0) * Math.PI / 180,
          scale: selectedFlight?.icao24 === flight.icao24 ? 1.5 : 1,
          anchor: [0.5, 0.5],
        })
      }));

      return feature;
    });

    source.addFeatures(features);
  }, [flights, selectedFlight, map]);

  // Update Selected Flight Path
  useEffect(() => {
    if (!map) return;
    const source = selectedFlightSourceRef.current;
    source.clear();

    if (flightRoute && flightRoute.origin && flightRoute.destination && flightRoute.origin.lat !== 0 && flightRoute.destination.lat !== 0) {
      const originCoords = transform([flightRoute.origin.lng, flightRoute.origin.lat], 'EPSG:4326', gleasonProjection);
      const destCoords = transform([flightRoute.destination.lng, flightRoute.destination.lat], 'EPSG:4326', gleasonProjection);

      const routeFeature = new Feature({
        geometry: new LineString([originCoords, destCoords])
      });

      routeFeature.setStyle(new Style({
        stroke: new Stroke({
          color: '#3b82f6',
          width: 2,
          lineDash: [5, 5]
        })
      }));

      // Add origin and destination markers
      const originMarker = new Feature({ geometry: new Point(originCoords) });
      originMarker.setStyle(new Style({
        image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#ef4444' }) })
      }));

      const destMarker = new Feature({ geometry: new Point(destCoords) });
      destMarker.setStyle(new Style({
        image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#22c55e' }) })
      }));

      source.addFeatures([routeFeature, originMarker, destMarker]);
    } else if (selectedFlight && selectedFlight.latitude && selectedFlight.longitude) {
      // Fetch track history to connect previous position to current
      fetch(`https://opensky-network.org/api/tracks/all?icao24=${selectedFlight.icao24}&time=0`)
        .then(res => res.json())
        .then(data => {
          if (data && data.path && data.path.length >= 2) {
            // Get last two points
            const lastTwoPoints = data.path.slice(-2);
            const coords = lastTwoPoints.map((p: any) => transform([p[2], p[1]], 'EPSG:4326', gleasonProjection));
            
            const lineFeature = new Feature({
              geometry: new LineString(coords),
            });

            lineFeature.setStyle(new Style({
              stroke: new Stroke({
                color: '#3b82f6',
                width: 2,
                lineDash: [5, 5], // Dashed line
              })
            }));
            source.addFeature(lineFeature);
          } else {
            // Fallback to simple direction line if no track history
            const p1 = fromLonLat([
              selectedFlight.longitude - (Math.sin((selectedFlight.true_track || 0) * Math.PI / 180) * 2),
              selectedFlight.latitude - (Math.cos((selectedFlight.true_track || 0) * Math.PI / 180) * 2)
            ], gleasonProjection);
            
            const p2 = fromLonLat([selectedFlight.longitude, selectedFlight.latitude], gleasonProjection);
            
            const p3 = fromLonLat([
              selectedFlight.longitude + (Math.sin((selectedFlight.true_track || 0) * Math.PI / 180) * 0.5),
              selectedFlight.latitude + (Math.cos((selectedFlight.true_track || 0) * Math.PI / 180) * 0.5)
            ], gleasonProjection);

            const lineFeature = new Feature({
              geometry: new LineString([p1, p2, p3]),
            });

            lineFeature.setStyle(new Style({
              stroke: new Stroke({
                color: '#3b82f6',
                width: 3,
                lineDash: [5, 10],
              })
            }));

            source.addFeature(lineFeature);
          }
        })
        .catch(() => {});
    }
  }, [selectedFlight, flightRoute, map]);

  return (
    <div ref={mapElement} className="absolute inset-0 z-0 bg-[#0f172a]" />
  );
}
