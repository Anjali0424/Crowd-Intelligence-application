import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./BarricadeMonitoring.css";
import { API_BASE, apiGet, apiPost } from "../../services/api";

const streamFeedUrl = (cameraId) =>
  `${API_BASE}/api/barricade/cameras/${encodeURIComponent(cameraId)}/feed`;

export default function BarricadeMonitoring() {
  const [cameras, setCameras] = useState([]);
  const [selectedId, setSelectedId] = useState("CAM-TEMPLE");
  const [guards, setGuards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Live telemetry for selected camera
  const [counts, setCounts] = useState({
    people_count: 0,
    entries_count: 0,
    exits_count: 0,
    current_inside: 0,
    fps: 0,
    processing: false,
    active_alert: null,
    active_alert_severity: null,
  });

  // Camera stream state
  const [streamError, setStreamError] = useState(false);
  const [monitoringLoading, setMonitoringLoading] = useState(false);

  // Editable configuration state
  const [lineY, setLineY] = useState(0.55);
  const [directionMode, setDirectionMode] = useState("top_to_bottom");
  const [maxOccupancy, setMaxOccupancy] = useState(15);
  const [wrongWayEnabled, setWrongWayEnabled] = useState(true);
  const [blockedExitEnabled, setBlockedExitEnabled] = useState(true);
  const [configSuccess, setConfigSuccess] = useState(false);

  // Events & Guard alerts
  const [events, setEvents] = useState([]);
  const [eventFilter, setEventFilter] = useState("ALL");
  const [resolvingEvent, setResolvingEvent] = useState(null);
  const [resolveNote, setResolveNote] = useState("");

  const wsRef = useRef(null);

  // Load initial cameras & guards
  const loadInitialData = useCallback(async () => {
    try {
      const [cRes, gRes, eRes] = await Promise.all([
        apiGet("/api/barricade/cameras"),
        apiGet("/api/barricade/guards"),
        apiGet("/api/barricade/events?limit=30"),
      ]);
      setCameras(cRes.cameras || []);
      setGuards(gRes.guards || []);
      setEvents(eRes.events || []);

      if (cRes.cameras && cRes.cameras.length > 0) {
        const found =
          cRes.cameras.find((c) => c.camera_id === selectedId) ||
          cRes.cameras.find((c) => c.camera_id === "CAM-TEMPLE") ||
          cRes.cameras[0];
        setSelectedId(found.camera_id);
        if (found.line_norm) setLineY(found.line_norm[1]);
        if (found.direction_mode) setDirectionMode(found.direction_mode);
        if (found.max_occupancy) setMaxOccupancy(found.max_occupancy);
      }
    } catch (err) {
      setError(err.message || "Failed to load barricade monitoring data");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Active camera details
  const currentCamera = useMemo(() => {
    return (
      cameras.find((c) => c.camera_id === selectedId) || {
        camera_id: selectedId,
        gate_name: "Gate " + selectedId,
        zone_name: "Main Darshan Gate",
        assigned_guard_id: "STAFF-07",
      }
    );
  }, [cameras, selectedId]);

  // Matched assigned guard
  const assignedGuard = useMemo(() => {
    const gid = currentCamera.assigned_guard_id;
    return guards.find((g) => g.id === gid) || guards[0] || null;
  }, [guards, currentCamera]);

  // Polling for live counts
  useEffect(() => {
    let mounted = true;
    const fetchCounts = async () => {
      if (!selectedId) return;
      try {
        const res = await apiGet(`/api/barricade/cameras/${encodeURIComponent(selectedId)}/counts`);
        if (!mounted) return;
        setCounts(res);
      } catch (err) {
        // ignore transient poll errors
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 1500);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [selectedId]);

  // WebSocket for instant guard notifications
  useEffect(() => {
    const wsUrl = `${API_BASE.replace(/^http/, "ws")}/api/barricade/ws`;
    let ws;
    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "SAFETY_EVENT" && msg.data) {
            setEvents((prev) => {
              const existingIdx = prev.findIndex((e) => e.id === msg.data.id);
              if (existingIdx >= 0) {
                const next = [...prev];
                next[existingIdx] = msg.data;
                return next;
              }
              return [msg.data, ...prev];
            });
          }
        } catch {
          // ignore malformed ws messages
        }
      };
    } catch {
      // ws fallback handled by periodic refresh
    }

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  // Handle camera switch
  const handleCameraChange = (e) => {
    const newId = e.target.value;
    setSelectedId(newId);
    setStreamError(false);
    const cam = cameras.find((c) => c.camera_id === newId);
    if (cam) {
      if (cam.line_norm) setLineY(cam.line_norm[1]);
      if (cam.direction_mode) setDirectionMode(cam.direction_mode);
      if (cam.max_occupancy) setMaxOccupancy(cam.max_occupancy);
    }
  };

  // Start / Stop monitoring controls
  const handleToggleMonitoring = async () => {
    setMonitoringLoading(true);
    try {
      const endpoint = counts.processing ? "/api/barricade/monitoring/stop" : "/api/barricade/monitoring/start";
      const res = await apiPost(endpoint, { camera_id: selectedId });
      setCounts((prev) => ({ ...prev, processing: res.processing }));
      setStreamError(false);
    } catch (err) {
      setError(err.message || "Failed to toggle monitoring");
    } finally {
      setMonitoringLoading(false);
    }
  };

  // Replay video from start
  const handleReplay = async () => {
    setMonitoringLoading(true);
    try {
      await apiPost(`/api/barricade/cameras/${encodeURIComponent(selectedId)}/replay`);
      setCounts((prev) => ({
        ...prev,
        processing: true,
        people_count: 0,
        entries_count: 0,
        exits_count: 0,
        current_inside: 0,
      }));
      setStreamError(false);
    } catch (err) {
      setError(err.message || "Failed to replay video");
    } finally {
      setMonitoringLoading(false);
    }
  };

  // Save Gate Configuration
  const handleSaveConfig = async () => {
    try {
      await apiPost(`/api/barricade/cameras/${encodeURIComponent(selectedId)}/config`, {
        line_x1: 0.05,
        line_y1: parseFloat(lineY),
        line_x2: 0.95,
        line_y2: parseFloat(lineY),
        direction_mode: directionMode,
        max_occupancy: parseInt(maxOccupancy, 10),
        wrong_way_enabled: wrongWayEnabled,
        blocked_exit_enabled: blockedExitEnabled,
      });
      setConfigSuccess(true);
      setTimeout(() => setConfigSuccess(false), 2500);
      loadInitialData();
    } catch (err) {
      setError(err.message || "Failed to save configuration");
    }
  };

  // Acknowledge Safety Alert
  const handleAcknowledge = async (eventId) => {
    try {
      const res = await apiPost(`/api/barricade/events/${encodeURIComponent(eventId)}/acknowledge`, {
        staff_name: assignedGuard ? assignedGuard.name : "Command Center Staff",
        notes: "Acknowledged via Command Center",
      });
      setEvents((prev) => prev.map((e) => (e.id === eventId ? res.event : e)));
    } catch (err) {
      setError(err.message || "Failed to acknowledge event");
    }
  };

  // Resolve Safety Alert
  const handleResolveConfirm = async () => {
    if (!resolvingEvent) return;
    try {
      const res = await apiPost(`/api/barricade/events/${encodeURIComponent(resolvingEvent.id)}/resolve`, {
        resolved_by: assignedGuard ? assignedGuard.name : "Command Center Staff",
        notes: resolveNote || "Incident safely cleared by security guard",
      });
      setEvents((prev) => prev.map((e) => (e.id === resolvingEvent.id ? res.event : e)));
      setResolvingEvent(null);
      setResolveNote("");
    } catch (err) {
      setError(err.message || "Failed to resolve event");
    }
  };

  // Filtered safety events
  const filteredEvents = useMemo(() => {
    if (eventFilter === "ALL") return events;
    return events.filter((e) => e.status === eventFilter);
  }, [events, eventFilter]);

  return (
    <div className="barricade-page">
      {/* 1. Header with Title & Notice */}
      <header className="barricade-header">
        <div className="barricade-header-top">
          <div className="barricade-title-wrap">
            <span className="barricade-badge-icon">🚧</span>
            <div>
              <h1 className="barricade-title">AI Barricade Gate Monitoring</h1>
              <p className="barricade-subtitle">
                Queue lane flow, crossing verification &amp; instant guard alerts
              </p>
            </div>
          </div>

          <div className="barricade-test-banner">
            📹 Authorized Recorded Video Test Footage — Not Live CCTV
          </div>
        </div>
      </header>

      {error && <div className="camera-error">⚠️ {error}</div>}

      {/* 2. Camera Selector Bar & Monitoring Action */}
      <section className="camera-select-bar">
        <div className="selector-left">
          <span className="selector-label">Select Monitored Gate:</span>
          <select
            className="gate-dropdown"
            value={selectedId}
            onChange={handleCameraChange}
            disabled={loading}
          >
            {cameras.map((c) => (
              <option key={c.camera_id} value={c.camera_id}>
                {c.camera_id} — {c.gate_name} ({c.zone_name})
              </option>
            ))}
          </select>
          {selectedId === "CAM-TEMPLE" && (
            <span className="preset-pill active" title="Active CCTV Footage">
              🎬 temple_civic_video.mp4
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            type="button"
            className="monitoring-toggle-btn"
            style={{ background: "#f8fafc", color: "#0f172a", border: "1px solid #cbd5e1" }}
            onClick={handleReplay}
            disabled={monitoringLoading}
            title="Restart video from beginning and reset counter"
          >
            🔁 Replay Video
          </button>

          <button
            type="button"
            className={`monitoring-toggle-btn ${
              counts.processing ? "is-stop" : "is-start"
            }`}
            onClick={handleToggleMonitoring}
            disabled={monitoringLoading}
          >
            {counts.processing ? "⏹ Stop Monitoring" : "▶ Start AI Monitoring"}
          </button>
        </div>
      </section>

      {/* 3. Live Video Stage with Overlaid Detections */}
      <section className="video-stage-card">
        <div className="video-container">
          {!streamError ? (
            <img
              key={`${selectedId}-${counts.processing}`}
              src={streamFeedUrl(selectedId)}
              alt={`Live AI Feed for ${currentCamera.gate_name}`}
              className="live-mjpeg-stream"
              onError={() => setStreamError(true)}
            />
          ) : (
            <div className="stream-disconnected-placeholder">
              <span className="icon">📡</span>
              <h3>Camera Stream Inactive or Processing Paused</h3>
              <p>Click "Start AI Monitoring" to initialize person detection.</p>
            </div>
          )}

          {/* Overlaid Badges */}
          {counts.processing && (
            <div className="stream-active-badge">
              <span className="pulse-dot"></span> AI DETECTOR ACTIVE
            </div>
          )}

          {counts.active_alert && (
            <div className="active-alert-pill">
              🚨 {counts.active_alert}
            </div>
          )}
        </div>

        {/* Real-time Telemetry Metrics Strip */}
        <div className="telemetry-grid">
          <div className="telemetry-cell">
            <span className="telemetry-label">Gate Occupancy</span>
            <span
              className={`telemetry-val ${
                counts.people_count >= currentCamera.max_occupancy ? "warn" : "highlight"
              }`}
            >
              {counts.people_count}
            </span>
            <span className="telemetry-sub">
              Limit: {currentCamera.max_occupancy || 15}
            </span>
          </div>

          <div className="telemetry-cell">
            <span className="telemetry-label">Total Entries</span>
            <span className="telemetry-val highlight">
              {counts.entries_count}
            </span>
            <span className="telemetry-sub">Line Crossed (In)</span>
          </div>

          <div className="telemetry-cell">
            <span className="telemetry-label">Total Exits</span>
            <span className="telemetry-val">{counts.exits_count}</span>
            <span className="telemetry-sub">Line Crossed (Out)</span>
          </div>

          <div className="telemetry-cell">
            <span className="telemetry-label">Currently Inside</span>
            <span className="telemetry-val highlight">
              {counts.current_inside}
            </span>
            <span className="telemetry-sub">Net devotees in zone</span>
          </div>

          <div className="telemetry-cell">
            <span className="telemetry-label">Detection FPS</span>
            <span className="telemetry-val">{counts.fps}</span>
            <span className="telemetry-sub">YOLOv11 ByteTrack</span>
          </div>
        </div>
      </section>

      {/* 4. Controls & Guard Notification Workspace */}
      <section className="barricade-workspace">
        {/* Left Column: Admin Virtual Line & Safety Rules */}
        <div className="panel-card">
          <div className="panel-header">
            <h3 className="panel-title">⚙️ Barricade &amp; Counting Settings</h3>
            {configSuccess && (
              <span className="guard-duty-badge">✓ Settings Saved</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">
              <span>Virtual Counting Line Position (Height)</span>
              <span>{Math.round(lineY * 100)}% of frame</span>
            </label>
            <div className="range-slider-wrap">
              <input
                type="range"
                min="0.2"
                max="0.85"
                step="0.05"
                value={lineY}
                onChange={(e) => setLineY(parseFloat(e.target.value))}
                className="range-slider"
              />
            </div>
            <div className="preset-pills">
              <button
                type="button"
                className={`preset-pill ${lineY === 0.35 ? "active" : ""}`}
                onClick={() => setLineY(0.35)}
              >
                Top Gate (35%)
              </button>
              <button
                type="button"
                className={`preset-pill ${lineY === 0.55 ? "active" : ""}`}
                onClick={() => setLineY(0.55)}
              >
                Middle Barricade (55%)
              </button>
              <button
                type="button"
                className={`preset-pill ${lineY === 0.7 ? "active" : ""}`}
                onClick={() => setLineY(0.7)}
              >
                Lower Turnstile (70%)
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Permitted Queue Direction</label>
            <select
              className="form-select"
              value={directionMode}
              onChange={(e) => setDirectionMode(e.target.value)}
            >
              <option value="top_to_bottom">
                Entry Only (Top → Bottom / Inward)
              </option>
              <option value="bottom_to_top">
                Exit Only (Bottom → Top / Outward)
              </option>
              <option value="bidirectional">
                Bidirectional (Entry &amp; Exit)
              </option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Max Safe Gate Occupancy</label>
            <input
              type="number"
              min="3"
              max="100"
              value={maxOccupancy}
              onChange={(e) => setMaxOccupancy(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="toggle-row">
            <span>Wrong-Direction Movement Alert</span>
            <input
              type="checkbox"
              checked={wrongWayEnabled}
              onChange={(e) => setWrongWayEnabled(e.target.checked)}
            />
          </div>

          <div className="toggle-row">
            <span>Blocked Gate / Obstruction Alert</span>
            <input
              type="checkbox"
              checked={blockedExitEnabled}
              onChange={(e) => setBlockedExitEnabled(e.target.checked)}
            />
          </div>

          <button
            type="button"
            className="save-config-btn"
            onClick={handleSaveConfig}
          >
            Save Gate Configuration
          </button>
        </div>

        {/* Right Column: Guard Assignment & Active Safety Events */}
        <div className="panel-card">
          <div className="panel-header">
            <h3 className="panel-title">👮 Assigned Guard &amp; Safety Events</h3>
            <div className="preset-pills">
              <button
                type="button"
                className={`preset-pill ${eventFilter === "ALL" ? "active" : ""}`}
                onClick={() => setEventFilter("ALL")}
              >
                All
              </button>
              <button
                type="button"
                className={`preset-pill ${eventFilter === "PENDING" ? "active" : ""}`}
                onClick={() => setEventFilter("PENDING")}
              >
                Active
              </button>
              <button
                type="button"
                className={`preset-pill ${eventFilter === "RESOLVED" ? "active" : ""}`}
                onClick={() => setEventFilter("RESOLVED")}
              >
                Resolved
              </button>
            </div>
          </div>

          {/* Assigned Guard Status Card */}
          {assignedGuard && (
            <div className="guard-card">
              <span className="guard-avatar">👮</span>
              <div className="guard-details">
                <h4 className="guard-name">
                  {assignedGuard.name} ({assignedGuard.id})
                </h4>
                <p className="guard-meta">
                  {assignedGuard.role} · {assignedGuard.phone} · Assigned:{" "}
                  {currentCamera.gate_name}
                </p>
              </div>
              <span className="guard-duty-badge">
                {assignedGuard.on_duty ? "🟢 ON DUTY" : "⚪ OFF DUTY"}
              </span>
            </div>
          )}

          {/* Event Stream */}
          <div className="alert-list-wrap">
            {filteredEvents.length === 0 ? (
              <div className="empty-alerts-placeholder">
                <span>🛡️</span>
                <p>No safety incidents recorded for this filter.</p>
                <small>Normal devotee passage produces no alerts.</small>
              </div>
            ) : (
              filteredEvents.map((evt) => (
                <div
                  key={evt.id}
                  className={`alert-card-item is-${evt.severity.toLowerCase()} ${
                    evt.status === "RESOLVED" ? "is-resolved" : ""
                  }`}
                >
                  <div className="alert-card-top">
                    <span
                      className={`alert-type-chip sev-${evt.severity.toLowerCase()}`}
                    >
                      {evt.severity} · {evt.event_type.replace(/_/g, " ")}
                    </span>
                    <span className="alert-time">
                      {evt.created_at ? new Date(evt.created_at).toLocaleTimeString() : "Just now"}
                    </span>
                  </div>

                  <h4 className="alert-title-line">{evt.title}</h4>
                  <p className="alert-reason-text">{evt.reason}</p>

                  <div className="alert-action-box">
                    👉 Action: {evt.recommended_action}
                  </div>

                  <div className="alert-delivery-status">
                    <span>
                      Guard: <b>{evt.assigned_guard_name || "Assigned"}</b>
                    </span>
                    <span className="delivery-badge">
                      {evt.status === "RESOLVED"
                        ? "✓ RESOLVED"
                        : evt.status === "ACKNOWLEDGED"
                        ? "👀 ACKNOWLEDGED"
                        : "🚨 SENT TO GUARD"}
                    </span>
                  </div>

                  {evt.status !== "RESOLVED" && (
                    <div className="alert-action-buttons">
                      {evt.status === "PENDING" && (
                        <button
                          type="button"
                          className="alert-btn-ack"
                          onClick={() => handleAcknowledge(evt.id)}
                        >
                          Acknowledge Alert
                        </button>
                      )}
                      <button
                        type="button"
                        className="alert-btn-res"
                        onClick={() => setResolvingEvent(evt)}
                      >
                        Resolve Incident
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* 5. Incident Resolution Modal */}
      {resolvingEvent && (
        <div
          className="barricade-modal-backdrop"
          onClick={() => setResolvingEvent(null)}
        >
          <div
            className="barricade-modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-title">Resolve Safety Incident</h3>
            <p className="guard-meta">
              Event: {resolvingEvent.title} ({resolvingEvent.id})
            </p>

            <div className="form-group">
              <label className="form-label">Resolution Notes / Action Taken</label>
              <textarea
                rows="3"
                className="form-input"
                placeholder="e.g. Guard held outer queue for 3 minutes. Crowd dispersed and normal flow resumed."
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
              />
            </div>

            <div className="alert-action-buttons">
              <button
                type="button"
                className="monitoring-toggle-btn is-stop"
                onClick={() => setResolvingEvent(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="monitoring-toggle-btn is-start"
                onClick={handleResolveConfirm}
              >
                Confirm Resolution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
