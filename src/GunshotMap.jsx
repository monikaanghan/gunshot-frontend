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
  const date = new Date(tsMicro / 1000);  // microseconds to ms
  return date.toLocaleString();
}

function MapCenterUpdater({ center, zoom, userTriggered, setUserTriggeredCenter }) {
  const map = useMap();
  useEffect(() => {
    if (userTriggered) {
      map.flyTo(center, zoom, { animate: true, duration: 1.5 });
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
  const [highlightedGunshotId, setHighlightedGunshotId] = useState(null);

  const fetchSensors = async () => {
    try {
      const response = await fetch(`${BASE_URL}/get_sensors`);
      const data = await response.json();
      setSensors(data);
    } catch (error) {
      console.error("Failed to fetch sensors", error);
      setSensors([]);
    }
  };

  const fetchGunshotEvents = async () => {
    try {
      const response = await fetch(`${BASE_URL}/gunshot_events`);
      const data = await response.json();
      setGunshotLocations(data);
    } catch (error) {
      console.error("Failed to fetch gunshot events", error);
      setGunshotLocations([]);
    }
  };

  useEffect(() => {
    fetchSensors();
    fetchGunshotEvents();
    const interval = setInterval(fetchGunshotEvents, 10000);
    return () => clearInterval(interval);
  }, []);

  const now = Date.now();
  let startTs;

  if (filter === "2m") {
    startTs = now - 2 * 60 * 1000; // 2 minutes
  } else if (filter === "1h") {
    startTs = now - 1 * 60 * 60 * 1000; // 1 hour
  } else {
    startTs = now - 24 * 60 * 60 * 1000; // 24 hours
  }

  const endTs = now + 60 * 1000;

  const filteredSensors = sensors.filter(s =>
    s.registered_at ? (s.registered_at / 1000 >= startTs && s.registered_at / 1000 <= endTs) : true
  );

  const filteredEvents = gunshotLocations.filter(e =>
    e.timestamp / 1000 >= startTs && e.timestamp / 1000 <= endTs
  );

  const centerOnLocation = (lat, lon, id, zoom = 18) => {
    setMapCenter([lat, lon]);
    setMapZoom(zoom);
    setUserTriggeredCenter(true);
    setHighlightedGunshotId(id);
    setTimeout(() => setHighlightedGunshotId(null), 3000);
  };

  const estimateConfidenceRadius = () => {
    const speedOfSound = 343;
    const timeError = 0.1; // 100 ms
    return speedOfSound * timeError;
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <div style={{ width: "35vw", padding: "2rem 1rem", background: "#f7fafd", overflowY: "auto", boxShadow: "2px 0 8px #e0e7ef33" }}>
        <h1 style={{ fontWeight: "bold", fontSize: "2.6rem", textAlign: "center", color: "#223", marginBottom: "1rem" }}>Gunshot Events</h1>

        <div style={{ marginBottom: 16, textAlign: "center" }}>
          <label style={{ fontWeight: 600, fontSize: 18 }}>Sensors Table Filter: </label>
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="2m">Custom Time</option> {/* 🔥 NEW */}
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
            {filteredSensors.map(sensor => (
              <tr key={sensor.mic_id} style={{ cursor: "pointer", transition: "background 0.3s" }}
                onClick={() => centerOnLocation(sensor.lat, sensor.lon)}
                onMouseOver={e => e.currentTarget.style.background = "#f0f7ff"}
                onMouseOut={e => e.currentTarget.style.background = "#fff"}>
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
            {filteredEvents.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: "center", padding: 20 }}>No gunshots detected in the selected time window</td>
              </tr>
            ) : filteredEvents.map((event) => (
              <Fragment key={event.id}>
                <tr style={{ cursor: "pointer", transition: "background 0.3s" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    centerOnLocation(event.lat, event.lon, event.id)}}>
                  <td>{event.id}</td>
                  <td>{event.lat}</td>
                  <td>{event.lon}</td>
                  <td>{fmtTime(event.timestamp)}</td>
                  <td>{event.logs.length}</td>
                  <td>
                    <button onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(prev => ({ ...prev, [event.id]: !prev[event.id] }))
                    }}
                      style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #ccc", background: "#f0f0f0", cursor: "pointer" }}>
                      {expanded[event.id] ? "Hide" : "Expand"}
                    </button>
                  </td>
                </tr>
                {expanded[event.id] && (
                  <tr>
                    <td colSpan={6}>
                      <table style={{ width: "100%", border: "1px solid #eee", fontSize: "0.95rem", marginTop: 10 }}>
                        <thead>
                          <tr><th>Mic ID</th><th>Lat</th><th>Lon</th></tr>
                        </thead>
                        <tbody>
                          {event.logs.map((mic, idx) => (
                            <tr key={idx}>
                              <td>{mic.mic_id}</td>
                              <td>{mic.lat}</td>
                              <td>{mic.lon}</td>
                            </tr>
                          ))}
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
          {filteredEvents.map((event) => (
            <Fragment key={event.id}>
              <Marker position={[event.lat, event.lon]} icon={gunshotIcon}>
                <Popup>
                  Lat: {event.lat}<br />
                  Lon: {event.lon}
                </Popup>
              </Marker>
              <Circle center={[event.lat, event.lon]} radius={estimateConfidenceRadius()} pathOptions={{ color: "red", fillColor: "red", fillOpacity: 0.18 }} />
              {highlightedGunshotId === event.id && (
                <Circle center={[event.lat, event.lon]} radius={150} pathOptions={{
                  color: "blue",
                  dashArray: "10, 10",
                  weight: 2,
                  opacity: 0.7,
                  fillOpacity: 0.1
                }} />
              )}
            </Fragment>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

