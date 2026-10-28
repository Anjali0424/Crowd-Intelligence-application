import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import StatCard from "../../components/admin/StatCard";
import mockAdminData from "../../data/mockAdminData";
import { apiGet } from "../../services/api";

const REFRESH_INTERVAL = 3000;

function getCrowdTone(level) {
const normalized = String(level || "").toUpperCase();

if (normalized === "CRITICAL" || normalized === "HIGH") {
return "critical";
}

if (normalized === "MODERATE") {
return "moderate";
}

return "low";
}

function isResolvedEvent(event) {
const status = String(event?.status || "").toUpperCase();

return ["RESOLVED", "CLOSED", "DISMISSED", "COMPLETED"].includes(status);
}

function getSeverity(event) {
return String(
event?.severity || event?.level || event?.risk_level || ""
).toUpperCase();
}

function AdminDashboard() {
const navigate = useNavigate();

const [crowd, setCrowd] = useState(null);
const [cameras, setCameras] = useState([]);
const [prediction, setPrediction] = useState(null);

// Use the same alert data currently displayed by the Active Alerts page.
const [alerts, setAlerts] = useState(() =>
mockAdminData.alerts.list.filter((alert) => !isResolvedEvent(alert))
);

const [alertSource, setAlertSource] = useState("demo");
const [loading, setLoading] = useState(true);
const [lastUpdated, setLastUpdated] = useState(null);

const [errors, setErrors] = useState({
crowd: "",
cameras: "",
alerts: "",
prediction: "",
});

const fetchDashboardData = useCallback(async () => {
const results = await Promise.allSettled([
apiGet("/api/crowd/live"),
apiGet("/api/cameras/counts"),
apiGet("/api/barricade/events"),
apiGet("/api/darshan/prediction"),
]);


const nextErrors = {
  crowd: "",
  cameras: "",
  alerts: "",
  prediction: "",
};

// LIVE CROWD
if (results[0].status === "fulfilled") {
  setCrowd(results[0].value);
} else {
  nextErrors.crowd =
    results[0].reason?.message || "Crowd API unavailable";
}

// CAMERAS
if (results[1].status === "fulfilled") {
  const response = results[1].value;

  const cameraList = Array.isArray(response)
    ? response
    : Array.isArray(response?.cameras)
      ? response.cameras
      : [];

  setCameras(cameraList);
} else {
  nextErrors.cameras =
    results[1].reason?.message || "Camera API unavailable";
}

// ALERTS
if (results[2].status === "fulfilled") {
  const response = results[2].value;

  const backendEvents = Array.isArray(response)
    ? response
    : Array.isArray(response?.events)
      ? response.events
      : [];

  if (backendEvents.length > 0) {
    // Use real backend events when they exist.
    setAlerts(backendEvents.filter((event) => !isResolvedEvent(event)));
    setAlertSource("backend");
  } else {
    // The backend currently returns {"events":[]}.
    // Keep the dashboard consistent with the existing Active Alerts
    // page, which displays mockAdminData.alerts.list.
    setAlerts(
      mockAdminData.alerts.list.filter(
        (alert) => !isResolvedEvent(alert)
      )
    );
    setAlertSource("demo");
  }
} else {
  nextErrors.alerts =
    results[2].reason?.message || "Alerts API unavailable";

  // Keep the existing Active Alerts page data visible if the API fails.
  setAlerts(
    mockAdminData.alerts.list.filter(
      (alert) => !isResolvedEvent(alert)
    )
  );
  setAlertSource("demo");
}

// AI FORECAST
if (results[3].status === "fulfilled") {
  setPrediction(results[3].value);
} else {
  nextErrors.prediction =
    results[3].reason?.message || "Prediction API unavailable";
}

setErrors(nextErrors);
setLastUpdated(new Date());
setLoading(false);


}, []);

useEffect(() => {
fetchDashboardData();


const intervalId = setInterval(
  fetchDashboardData,
  REFRESH_INTERVAL
);

return () => clearInterval(intervalId);


}, [fetchDashboardData]);

// LIVE CROWD CARD
const crowdCount =
crowd?.people_count !== undefined &&
crowd?.people_count !== null &&
Number.isFinite(Number(crowd.people_count))
? Number(crowd.people_count)
: null;

const crowdLevel = crowd?.level || "NO DATA";

const crowdNote = crowd?.zone_name
? `Zone: ${crowd.zone_name}`
: crowd?.source
? `Source: ${crowd.source}`
: "Latest crowd processor reading";

// CAMERA CARD
const totalCameras = cameras.length;

const activeCameras = cameras.filter(
(camera) =>
camera.processing === true &&
camera.has_count === true &&
camera.error == null
);

const cameraStatus =
totalCameras === 0
? loading
? "LOADING"
: "NO DATA"
: activeCameras.length > 0
? "PROCESSING"
: "NO ACTIVE COUNTS";

// ALERT CARD
const criticalAlerts = alerts.filter(
(alert) => getSeverity(alert) === "CRITICAL"
).length;

const highAlerts = alerts.filter(
(alert) => getSeverity(alert) === "HIGH"
).length;

const alertStatus =
alerts.length === 0
? "ALL CLEAR"
: criticalAlerts > 0
? `${criticalAlerts} Critical`
: highAlerts > 0
? `${highAlerts} High`
: "MONITORING";

const alertTone =
criticalAlerts > 0
? "critical"
: highAlerts > 0
? "high"
: alerts.length > 0
? "moderate"
: "low";

// AI FORECAST CARD
const predictedValue = prediction
? prediction.predicted_count ??
prediction.predictedCount ??
prediction.predicted_people ??
prediction.predicted_population ??
prediction.forecast?.predicted_count ??
prediction.prediction?.predicted_count
: null;

const hasPrediction =
prediction?.available === true &&
predictedValue !== null &&
predictedValue !== undefined &&
Number.isFinite(Number(predictedValue));

const predictionLevel =
prediction?.crowd_level ||
prediction?.level ||
prediction?.prediction?.crowd_level ||
"NO DATA";

const predictionNote = errors.prediction
? "Unable to connect to prediction API"
: prediction?.missing?.length
? `Missing input: ${prediction.missing.join(", ")}`
: prediction?.reason === "missing_inputs"
? "Required prediction inputs are unavailable"
: hasPrediction
? "Forecast from the darshan prediction service"
: "A valid forecast is not currently available";

return ( <div className="admin-home"> <div className="page-head"> <h1>Admin Dashboard</h1>


    <p>
      {lastUpdated
        ? `Last updated: ${lastUpdated.toLocaleTimeString()}`
        : "Connecting to monitoring system..."}
      {" · "}
      Auto-refresh every 3 seconds
    </p>
  </div>

  <section className="stat-grid">
    {/* LIVE CROWD */}
    <StatCard
      icon="👥"
      label="LIVE CROWD"
      value={
        crowdCount !== null
          ? crowdCount.toLocaleString()
          : loading
            ? "Loading..."
            : "Unavailable"
      }
      status={errors.crowd ? "API ERROR" : crowdLevel}
      tone={getCrowdTone(crowdLevel)}
      note={
        errors.crowd
          ? "Unable to retrieve crowd data"
          : crowdNote
      }
    />

    {/* CAMERAS */}
    <StatCard
      icon="📹"
      label="CAMERAS"
      value={
        errors.cameras
          ? "Unavailable"
          : totalCameras > 0
            ? `${activeCameras.length} / ${totalCameras}`
            : loading
              ? "Loading..."
              : "No data"
      }
      status={cameraStatus}
      tone={activeCameras.length > 0 ? "low" : "moderate"}
      note={
        errors.cameras
          ? "Unable to retrieve camera data"
          : `${totalCameras} camera sources returned by the API`
      }
    />

    {/* ACTIVE ALERTS */}
    <StatCard
      icon="🚨"
      label="ACTIVE ALERTS"
      value={alerts.length}
      status={alertStatus}
      tone={alertTone}
      note={
        alertSource === "demo"
          ? `${criticalAlerts} critical · Demo alert data`
          : `${criticalAlerts} critical · Live backend events`
      }
    />

    {/* AI FORECAST */}
    <StatCard
      icon="🔮"
      label="AI FORECAST"
      value={
        hasPrediction
          ? Number(predictedValue).toLocaleString()
          : "Unavailable"
      }
      status={
        errors.prediction
          ? "API ERROR"
          : hasPrediction
            ? predictionLevel
            : "WAITING FOR DATA"
      }
      tone={getCrowdTone(predictionLevel)}
      note={predictionNote}
    />
  </section>

  {/* COMMAND MODULES */}
  <section className="modules-section">
    <h3 className="section-title">Command Modules</h3>

    <div className="adm-modules">
      <button
        type="button"
        className="adm-module adm-module-compact"
        onClick={() => navigate("/admin/crowd")}
      >
        <span className="adm-module-icon">👥</span>
        <h4>Live Crowd Intelligence</h4>
      </button>

      <button
        type="button"
        className="adm-module adm-module-compact"
        onClick={() => navigate("/admin/cameras")}
      >
        <span className="adm-module-icon">📹</span>
        <h4>Camera Monitoring</h4>
      </button>

      <button
        type="button"
        className="adm-module adm-module-compact module-highlight"
        onClick={() => navigate("/admin/barricade")}
      >
        <span className="adm-module-icon">🚧</span>
        <h4>AI Barricade Monitoring</h4>
      </button>

      <button
        type="button"
        className="adm-module adm-module-compact"
        onClick={() => navigate("/admin/map")}
      >
        <span className="adm-module-icon">🗺️</span>
        <h4>Temple Crowd Map</h4>
      </button>

      <button
        type="button"
        className="adm-module adm-module-compact"
        onClick={() => navigate("/admin/prediction")}
      >
        <span className="adm-module-icon">🔮</span>
        <h4>AI Crowd Prediction</h4>
      </button>

      <button
        type="button"
        className="adm-module adm-module-compact"
        onClick={() => navigate("/admin/hourly-crowd")}
      >
        <span className="adm-module-icon">🕒</span>
        <h4>Hourly Crowd Forecast</h4>
      </button>

      <button
        type="button"
        className="adm-module adm-module-compact module-highlight"
        onClick={() => navigate("/admin/civic-sense")}
      >
        <span className="adm-module-icon icon-alert">🚨</span>
        <h4>Civic Sense Intelligence</h4>
      </button>

      <button
        type="button"
        className="adm-module adm-module-compact"
        onClick={() => navigate("/admin/staff")}
      >
        <span className="adm-module-icon">👮</span>
        <h4>Staff Assignment</h4>
      </button>

      <button
        type="button"
        className="adm-module adm-module-compact"
        onClick={() => navigate("/admin/entry-exit")}
      >
        <span className="adm-module-icon">🚪</span>
        <h4>Entry / Exit Monitoring</h4>
      </button>

      <button
        type="button"
        className="adm-module adm-module-compact"
        onClick={() => navigate("/admin/resources")}
      >
        <span className="adm-module-icon">🚑</span>
        <h4>Emergency Resources</h4>
      </button>

      <button
        type="button"
        className="adm-module adm-module-compact"
        onClick={() => navigate("/admin/analytics")}
      >
        <span className="adm-module-icon">📊</span>
        <h4>Analytics &amp; Reports</h4>
      </button>
    </div>
  </section>
</div>


);
}

export default AdminDashboard;
