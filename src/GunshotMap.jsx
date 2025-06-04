import React, { useEffect, useState, Fragment, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const BASE_URL = "http://127.0.0.1:8000";

const gunshotIcon = new L.Icon({
  iconUrl: "/images/marker-icon-red.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

function getMicColor(micId) {
  const colors = ["red", "blue", "green", "orange", "purple", "brown", "teal", "pink", "black", "lime", "gold"];
  return colors[(micId - 1) % colors.length];
}

function fmtTime(tsMicro) {
  if (!tsMicro) return "--";
  const date = new Date(tsMicro > 1e12 ? tsMicro / 1000 : tsMicro);
  return date.toLocaleString();
}

function MapCenterUpdater({ center, zoom, userTriggered, setUserTriggeredCenter }) {
  const map = useMap();
  useEffect(() => {
    if (userTriggered) {
      map.flyTo(center, zoom, { animate: true, duration: 1.5 }); // <-- Smooth fly animation
      setUserTriggeredCenter(false);
    }
  }, [center, zoom, userTriggered, setUserTriggeredCenter, map]);
  return null;
}

export default function GunshotMap() {
  const [sensors, setSensors] = useState([]);
  const [gunshotLocations, setGunshotLocations] = useState([]);
  const [mapCenter, setMapCenter] = useState([42.3351, -83.0469]);
  const [mapZoom, setMapZoom] = useState(15);
  const [userTriggeredCenter, setUserTriggeredCenter] = useState(false);
  const [filter, setFilter] = useState("1h");
  const [expanded, setExpanded] = useState({});
  const lastGunshotTimeRef = useRef(null);

  const fetchSensors = async () => {
    try {
      const response = await fetch(`${BASE_URL}/get_sensors`);
      if (!response.ok) throw new Error("Failed to fetch sensors");
      const data = await response.json();
      setSensors(data);
    } catch (error) {
      setSensors([]);
    }
  };

  useEffect(() => {
    fetchSensors();
    let ws;
    const connectWebSocket = () => {
      ws = new WebSocket(`ws://127.0.0.1:8000/ws`);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "sensor_update") setSensors(data.sensors);
        else if (data.gunshot_events) {
          if (data.gunshot_events.length > 0) {
            const newest = data.gunshot_events[data.gunshot_events.length - 1];
            if (!lastGunshotTimeRef.current || newest.estimated_location?.time > lastGunshotTimeRef.current) {
              lastGunshotTimeRef.current = newest.estimated_location?.time;
              if (newest.estimated_location?.lat && newest.estimated_location?.lon) {
                setMapCenter([newest.estimated_location.lat, newest.estimated_location.lon]);
                setMapZoom(18);
                setUserTriggeredCenter(true);
              }
            }
          }
          setGunshotLocations(data.gunshot_events);
        }
      };
      ws.onclose = () => setTimeout(connectWebSocket, 5000);
    };
    connectWebSocket();
    return () => { if (ws) ws.close(); };
  }, []);

  const now = Date.now();
  const startTs = now - (filter === "1h" ? 1 : 24) * 60 * 60 * 1000;
  const endTs = now + 60 * 1000;

  const filteredSensors = sensors.filter(s =>
    s.registered_at ? (s.registered_at / 1000 >= startTs && s.registered_at / 1000 <= endTs) : true
  );

  const filteredEvents = gunshotLocations.filter(e =>
    e.estimated_location?.time / 1000 >= startTs && e.estimated_location?.time / 1000 <= endTs
  );

  const centerOnLocation = (lat, lon, zoom = 18) => {
    setMapCenter([lat, lon]);
    setMapZoom(zoom);
    setUserTriggeredCenter(true);
  };

  const estimateConfidenceRadius = (gunshot) => {
    const speedOfSound = 343, timeError = 0.100;
    const radius = speedOfSound * timeError;
    const timestampMs = gunshot.estimated_location.time / 1000;
    const localTime = new Date(timestampMs).toLocaleString();
    return {
      lat: gunshot.estimated_location.lat,
      lon: gunshot.estimated_location.lon,
      confidenceRadius: radius,
      time: localTime,
    };
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <div style={{ width: "35vw", padding: "2rem 1rem", background: "#f7fafd", overflowY: "auto", boxShadow: "2px 0 8px #e0e7ef33" }}>
        <h1 style={{ fontWeight: "bold", fontSize: "2.6rem", textAlign: "center", color: "#223", marginBottom: "1rem" }}>Gunshot Events</h1>

        <div style={{ marginBottom: 16, textAlign: "center" }}>
          <label style={{ fontWeight: 600, fontSize: 18 }}>Sensors Table Filter: </label>
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="1h">Last 1 Hour</option>
            <option value="24h">Last 24 Hours</option>
          </select>
        </div>

        <h2 style={{ fontWeight: "bold", fontSize: "1.5rem", textAlign: "center" }}>Sensors Table</h2>
        <table style={{ width: "100%", background: "#fff", border: "1px solid #ccc", borderRadius: 8, marginBottom: 18, overflow: "hidden" }}>
          <thead style={{ background: "#e6ebf3" }}>
            <tr>
              <th>Mic ID</th><th>Lat</th><th>Lon</th>
            </tr>
          </thead>
          <tbody>
            {filteredSensors.map((sensor) => (
              <tr key={sensor.mic_id}
                style={{ cursor: "pointer", transition: "background 0.3s" }}
                onClick={() => centerOnLocation(sensor.lat, sensor.lon, 18)}
                onMouseOver={e => e.currentTarget.style.background = "#f0f7ff"}
                onMouseOut={e => e.currentTarget.style.background = "#fff"}
              >
                <td style={{ color: getMicColor(sensor.mic_id), fontWeight: 600 }}>{sensor.mic_id}</td>
                <td>{sensor.lat}</td>
                <td>{sensor.lon}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 style={{ fontWeight: "bold", fontSize: "1.5rem", textAlign: "center" }}>Gunshot Events</h2>
        <table style={{ width: "100%", background: "#fff", border: "1px solid #ccc", borderRadius: 8, overflow: "hidden" }}>
          <thead style={{ background: "#e6ebf3" }}>
            <tr>
              <th>ID</th><th>Lat</th><th>Lon</th><th>Timestamp</th><th>#Sensors</th><th>Expand</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.map((event, i) => (
              <Fragment key={i}>
                <tr 
                  style={{ cursor: "pointer", transition: "background 0.3s" }}
                  onClick={() => centerOnLocation(event.estimated_location.lat, event.estimated_location.lon, 18)}
                >
                  <td>{event.id}</td>
                  <td>{event.estimated_location?.lat}</td>
                  <td>{event.estimated_location?.lon}</td>
                  <td>{fmtTime(event.estimated_location?.time)}</td>
                  <td>{event.triggered_mics ? event.triggered_mics.length : 0}</td>
                  <td>
                    <button onClick={() => setExpanded(prev => ({ ...prev, [event.id]: !prev[event.id] }))}>
                      {expanded[event.id] ? "Hide" : "Expand"}
                    </button>
                  </td>
                </tr>
                {expanded[event.id] && (
                  <tr>
                    <td colSpan={6}>
                      <table style={{ width: "100%", border: "1px solid #eee", borderRadius: 6, fontSize: "0.95rem" }}>
                        <thead>
                          <tr><th>Mic ID</th><th>Lat</th><th>Lon</th></tr>
                        </thead>
                        <tbody>
                          {event.triggered_mics && event.triggered_mics.length > 0 ? (
                            event.triggered_mics.map((mic, idx) => (
                              <tr key={idx}>
                                <td>{mic.mic_id}</td>
                                <td>{mic.lat}</td>
                                <td>{mic.lon}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="3" style={{ textAlign: "center" }}>No triggered sensors</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ flex: 1, position: "relative" }}>
        <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: "100%", width: "100%" }}>
          <MapCenterUpdater center={mapCenter} zoom={mapZoom} userTriggered={userTriggeredCenter} setUserTriggeredCenter={setUserTriggeredCenter} />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {filteredSensors.map(sensor => (
            <Marker
              key={sensor.mic_id}
              position={[sensor.lat, sensor.lon]}
              icon={L.divIcon({
                className: "custom-marker",
                html: `<div style='background-color: ${getMicColor(sensor.mic_id)}; width: 16px; height: 16px; border-radius: 50%; border:2px solid #fff'></div>`
              })}
            >
              <Popup>
                <b>Mic {sensor.mic_id}</b><br />
                Lat: {sensor.lat}<br />
                Lon: {sensor.lon}
              </Popup>
            </Marker>
          ))}
          {filteredEvents.map((gunshot, i) => {
            if (!gunshot.estimated_location) return null;
            const { lat, lon, confidenceRadius } = estimateConfidenceRadius(gunshot);
            return (
              <Fragment key={i}>
                <Marker position={[lat, lon]} icon={gunshotIcon}>
                  <Popup>
                    Lat: {lat}<br />
                    Lon: {lon}
                  </Popup>
                </Marker>
                <Circle center={[lat, lon]} radius={confidenceRadius} pathOptions={{ color: "red", fillColor: "red", fillOpacity: 0.18 }} />
              </Fragment>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}

