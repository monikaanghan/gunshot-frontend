import { useEffect, useState} from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from "react-leaflet";
import L from "leaflet"; // Import Leaflet for custom icons
import "leaflet/dist/leaflet.css";

const BASE_URL = "http://127.0.0.1:8000";

// Define custom icons
const eventIcon = new L.Icon({
  iconUrl: "/images/marker-icon.png", // Default marker icon
  iconSize: [25, 41], // Size of the icon
  iconAnchor: [12, 41], // Point of the icon which will correspond to marker's location
  popupAnchor: [1, -34], // Point from which the popup should open relative to the iconAnchor
});

const gunshotIcon = new L.Icon({
  iconUrl: "/images/marker-icon-red.png", // Red marker icon
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

export default function GunshotMap() {
  const [sensors, setSensors] = useState([]);
  const [gunshotLocations, setGunshotLocations] = useState([]);
  const [mapCenter, setMapCenter] = useState([37.7749, -122.4194]); // Default center
  const [userTriggeredCenter, setUserTriggeredCenter] = useState(false); // Track if user changed center
  const [websocket, setWebsocket] = useState(null); // WebSocket connection

  useEffect(() => {
    fetchSensors();
    let ws;
    const connectWebSocket = () => {
      ws = new WebSocket(`ws://127.0.0.1:8000/ws`);
  
      ws.onopen = () => console.log("WebSocket connected");
      ws.onmessage = (event) => {
        console.log("Message received:", event.data);
        const data = JSON.parse(event.data);
        if (data.type === "sensor_update") {
          setSensors(data.sensors);
        } else if (data.gunshot_events) {
          const currentTimeMicro = Date.now() * 1000;
          const recentEvents = data.gunshot_events.filter((event) => {
            const eventTimeMicro = event.estimated_location.time;
            return currentTimeMicro - eventTimeMicro <= 10 * 1_000_000;
          });

          // Filter out old events from the state before appending new ones
          setGunshotLocations((prevLocations) => {
            const filteredLocations = prevLocations.filter((gunshot) => {
              const eventTimeMicro = gunshot.estimated_location.time;
              return currentTimeMicro - eventTimeMicro <= 10 * 1_000_000;
            });
            return [...filteredLocations, ...recentEvents];
          });
        }
      };
      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
      ws.onclose = (event) => {
        console.log("WebSocket closed:", event.reason);
        setTimeout(connectWebSocket, 5000); // Reconnect after 5 seconds
      };
    };
  
    connectWebSocket();
  
    return () => {
      if (ws) ws.close();
    };
  }, []);

  const fetchSensors = async () => {
    try {
      const response = await fetch(`${BASE_URL}/get_sensors`);
      if (!response.ok) throw new Error("Failed to fetch sensors");
      const data = await response.json();
      setSensors(data);
    } catch (error) {
      console.error("Error fetching sensors:", error);
      setSensors([]); // Reset sensors state or set an error state
    }
  };

  const estimateConfidenceRadius = (gunshot) => {
    const speedOfSound = 343; // meters per second
    const timeError = 0.100; // 32 ms in seconds
    const radius = speedOfSound * timeError; // Confidence radius in meters

    // Convert microsecond timestamp to local time
    const timestampMs = gunshot.estimated_location.time / 1000; // Convert microseconds to milliseconds
    const localTime = new Date(timestampMs).toLocaleString(); // Convert to local time string

    return { 
      lat: gunshot.estimated_location.lat, 
      lon: gunshot.estimated_location.lon, 
      confidenceRadius: radius,
      time: localTime // Local time in human-readable format
    };
  };


  const updateMapCenter = () => {
    if (sensors.length === 0) return;

    const avgLat = sensors.reduce((sum, s) => sum + s.lat, 0) / sensors.length;
    const avgLon = sensors.reduce((sum, s) => sum + s.lon, 0) / sensors.length;

    setMapCenter([avgLat, avgLon]);
    setUserTriggeredCenter(true); // Mark that the user changed the center
  };

  function getMicColor(micId) {
    const colors = ["red", "blue", "green", "orange", "purple", "brown", "pink"];
    return colors[micId % colors.length];
  }

  function MapCenterUpdater({ center, userTriggered }) {
    const map = useMap();

    useEffect(() => {
      if (userTriggered) {
        map.setView(center, map.getZoom());
        setUserTriggeredCenter(false); // Reset the flag after updating the center
      }
    }, [center, userTriggered, map]);

    return null;
  }

  // Filter gunshotLocations to only include events from the past 10 seconds
  const currentTimeMicro = Date.now() * 1000; // Current time in microseconds
  const recentGunshotLocations = gunshotLocations.filter((gunshot) => {
    const eventTimeMicro = gunshot.estimated_location.time; // Event time is already in microseconds
    return currentTimeMicro - eventTimeMicro <= 10 * 1_000_000; // 10 seconds in microseconds
  }); 

  return (
    <div style={{ position: "relative", height: "100vh", width: "100vw", margin: 0, padding: 0, overflow: "hidden" }}>
      {/* Map container */}
      <MapContainer center={mapCenter} zoom={13} style={{ height: "100%", width: "100%" }}>
        <MapCenterUpdater center={mapCenter} userTriggered={userTriggeredCenter} />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {/* Sensor markers with different colors */}
        {sensors.map((sensor) => (
          <Marker key={sensor.mic_id} position={[sensor.lat, sensor.lon]} icon={L.divIcon({
            className: "custom-marker",
            html: `<div style='background-color: ${getMicColor(sensor.mic_id)}; width: 10px; height: 10px; border-radius: 50%'></div>`
          })}>
            <Popup>Mic {sensor.mic_id}</Popup>
          </Marker>
        ))}

        {/* Gunshot markers with confidence radius */}
        {recentGunshotLocations.map((gunshot, index) => {
          const { lat, lon, confidenceRadius, time } = estimateConfidenceRadius(gunshot);
          return (
            <div key={index}> {/* Use a div or React.Fragment with a key */}
              <Marker position={[lat, lon]} icon={gunshotIcon}>
                <Popup>Estimated Gunshot Location<br/>Confidence Radius: {confidenceRadius.toFixed(2)} m<br/>Time: {time}</Popup>
              </Marker>
              <Circle 
                center={[lat, lon]} 
                radius={confidenceRadius} 
                pathOptions={{ color: 'rgba(255, 0, 0, 0.5)', fillColor: 'rgba(255, 0, 0, 0.2)', fillOpacity: 0.4 }}
              />
            </div>
          );
        })}
      </MapContainer>

      {/* Button to manually update map center */}
      <button
        onClick={updateMapCenter}
        style={{
          position: "absolute",
          top: "10px",
          left: "70px",
          zIndex: 1000,
          padding: "8px 12px",
          backgroundColor: "#007BFF",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer"
        }}
      >
        Center Map
      </button>
    </div>
  );
}