import { useState, useEffect } from "react";
import { getLiveCrowd } from "../../services/crowdService";
import TempleMap from "../../components/user/TempleMap";

function CrowdAreas() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFacilities, setShowFacilities] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [activeZone, setActiveZone] = useState(null);

  useEffect(() => {
    let mounted = true;
    let timer;

    async function fetchData() {
      try {
        const res = await getLiveCrowd();
        if (mounted) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message || "Failed to fetch live crowd data");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchData();
    timer = setInterval(fetchData, 1500);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const getLevelColor = (level) => {
    switch ((level || "").toUpperCase()) {
      case "LOW":
        return "#12805c";
      case "MODERATE":
        return "#9a6b00";
      case "HIGH":
        return "#d1481f";
      case "CRITICAL":
        return "#d92d20";
      default:
        return "#4a3a86";
    }
  };

  const getLevelIcon = (level) => {
    switch ((level || "").toUpperCase()) {
      case "LOW":
        return "🟢";
      case "MODERATE":
        return "🟡";
      case "HIGH":
        return "🟠";
      case "CRITICAL":
        return "🔴";
      default:
        return "🟢";
    }
  };

  const handleZoneClick = (zone) => {
    setActiveZone(zone);
  };

  return (
    <div className="page-placeholder" style={{ minHeight: "auto", padding: "20px", gap: "12px", alignItems: "stretch" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span className="placeholder-icon" style={{ width: "46px", height: "46px", fontSize: "24px", marginBottom: 0 }}>👥</span>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#2c1d63" }}>Live Crowd Monitoring</h2>
          <p style={{ margin: 0, fontSize: "12px", color: "#7a719b" }}>
            {data?.zone_name || "Main Darshan Gate"} {data?.source === "video" ? "• video" : data?.source === "webcam" ? "• webcam" : ""}
          </p>
        </div>
        <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.6px", color: "#12805c" }}>● LIVE</span>
      </div>

      {error && (
        <div style={{ background: "#ffe5e5", color: "#d92d20", border: "1px solid #ffd4cf", borderRadius: "12px", padding: "10px 12px", fontSize: "12px" }}>
          {error}
        </div>
      )}

      <div style={{ background: "white", border: "1px solid #eee9ff", borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 4px 14px rgba(57, 35, 120, 0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.6px", color: "#847aab" }}>CURRENT CROWD</div>
            <div style={{ fontSize: "42px", fontWeight: 800, color: "#2c1d63", lineHeight: "1.1" }}>
              {loading ? "..." : data?.people_count ?? 0}
            </div>
            <div style={{ fontSize: "12px", color: "#7a719b" }}>people detected</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "11px", color: "#847aab" }}>STATUS</div>
            <div style={{ fontSize: "14px", fontWeight: 800, color: getLevelColor(data?.level || "LOW") }}>
              {getLevelIcon(data?.level || "LOW")} {(data?.level || "LOW").toUpperCase()}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div style={{ background: "#f8f7ff", border: "1px solid #eee9ff", borderRadius: "12px", padding: "10px" }}>
            <div style={{ fontSize: "10px", color: "#9a92b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>Capacity</div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#2c1d63" }}>
              {loading ? "-" : `${data?.people_count ?? 0} / ${data?.capacity ?? 300}`}
            </div>
          </div>
          <div style={{ background: "#f8f7ff", border: "1px solid #eee9ff", borderRadius: "12px", padding: "10px" }}>
            <div style={{ fontSize: "10px", color: "#9a92b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>Density</div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#2c1d63" }}>
              {loading ? "-" : `${data?.density ?? 0}%`}
            </div>
          </div>
        </div>

        {activeZone && (
          <div style={{ background: "#f4f1ff", border: "1px solid #e9e3ff", borderRadius: "12px", padding: "10px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#6046e8" }}>{activeZone.name}</div>
            <div style={{ fontSize: "11px", color: "#4a3a86" }}>{activeZone.people} / {activeZone.capacity} people • {activeZone.density}% • {activeZone.level}</div>
          </div>
        )}

        <div style={{ fontSize: "11px", color: "#9a92b8" }}>
          Last updated: {loading ? "fetching..." : new Date((data?.timestamp || Date.now()) * 1000).toLocaleTimeString()}
        </div>

        <div style={{ fontSize: "11px", color: "#7a719b", background: "#f4f1ff", border: "1px dashed #d9d0ff", borderRadius: "10px", padding: "8px 10px" }}>
          AI Live Detection • real YOLOv11 person count from video source
        </div>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#2c1d63" }}>Live Temple Map</h3>
          <div style={{ fontSize: "10px", color: "#7a719b" }}>Sri Venkateswara Swamy Temple, Tirumala</div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          <button type="button" onClick={() => setShowUser((v) => !v)} className={`map-toggle ${showUser ? "active" : ""}`}>Your Location</button>
          <button type="button" onClick={() => setShowFacilities((v) => !v)} className={`map-toggle ${showFacilities ? "active" : ""}`}>Facilities</button>
          <button type="button" onClick={() => setShowRoute((v) => !v)} className={`map-toggle ${showRoute ? "active" : ""}`}>Recommended Route</button>
          <button type="button" onClick={() => setActiveZone(null)} className="map-toggle">Clear Info</button>
        </div>

        <div className="temple-map-container">
          <TempleMap liveData={data} showUser={showUser} showFacilities={showFacilities} showRoute={showRoute} onZoneClick={handleZoneClick} />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center", fontSize: "10px", color: "#7a719b" }}>
          <span>🟢 Low</span>
          <span>🟡 Moderate</span>
          <span>🟠 High</span>
          <span>🔴 Critical</span>
          <span>• LIVE Crowd zones</span>
          <span>• DEMO geometry</span>
        </div>
      </section>
    </div>
  );
}

export default CrowdAreas;
