import { useCallback, useEffect, useState } from "react";
import "./CameraMonitoring.css";
import { API_BASE, apiGet } from "../../services/api";

const streamUrl = (cameraId) =>
  `${API_BASE}/api/cameras/${encodeURIComponent(cameraId)}/stream`;

function CameraVideo({ camera, className, failure, onError }) {
  if (!camera.available || failure) {
    return (
      <div className={`${className} camera-video-fallback`}>
        {failure || camera.missing_reason || "Video unavailable"}
      </div>
    );
  }
  return (
    <video
      className={className}
      src={streamUrl(camera.id)}
      muted
      playsInline
      autoPlay
      loop
      controls={className === "camera-video-large"}
      onError={() => onError(camera.id)}
    />
  );
}

function MonitoringSection({ kind = "camera" }) {
  const isDrone = kind === "drone";
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [counts, setCounts] = useState({});
  const [counting, setCounting] = useState({});
  const [videoErrors, setVideoErrors] = useState({});

  useEffect(() => {
    let mounted = true;
    apiGet("/api/cameras")
      .then((res) => {
        if (mounted) setCameras(res.cameras || []);
      })
      .catch((err) => {
        if (mounted) setError(err.message || "Failed to load cameras");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const res = await apiGet("/api/cameras/counts");
        if (!mounted) return;
        const nextCounts = {};
        const nextCounting = {};
        for (const cam of res.cameras || []) {
          nextCounts[cam.camera_id] = cam;
          if (cam.processing) nextCounting[cam.camera_id] = true;
        }
        setCounts(nextCounts);
        setCounting(nextCounting);
      } catch (err) {
        // transient error — keep last known state
      }
    };

    poll();
    const timer = setInterval(poll, 1500);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const startCounting = useCallback(async (camera) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/cameras/${encodeURIComponent(camera.id)}/count/start`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Start failed (${res.status})`);
      }
      setCounting((prev) => ({ ...prev, [camera.id]: true }));
      setError(null);
    } catch (err) {
      setError(`${camera.id}: ${err.message}`);
    }
  }, []);

  const stopCounting = useCallback(async (camera) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/cameras/${encodeURIComponent(camera.id)}/count/stop`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error(`Stop failed (${res.status})`);
      setCounting((prev) => ({ ...prev, [camera.id]: false }));
    } catch (err) {
      setError(`${camera.id}: ${err.message}`);
    }
  }, []);

  const handleVideoError = useCallback(
    (cameraId) =>
      setVideoErrors((prev) => ({ ...prev, [cameraId]: "Video failed to load" })),
    []
  );

  const visible = cameras.filter((c) => (c.kind || "camera") === kind);
  const trackingCount = visible.filter((c) => counting[c.id]).length;
  const playingCount = visible.filter(
    (c) => c.available && !videoErrors[c.id]
  ).length;

  return (
    <section className="camera-page">
      <header className="camera-heading">
        <h2>{isDrone ? "Drone Monitoring" : "Camera Monitoring"}</h2>
        <p>
          {loading
            ? "Loading recorded video feeds..."
            : `${playingCount} / ${visible.length} recorded video feeds · ${
                trackingCount
              } tracking`}
        </p>
        <span className="camera-note">
          {isDrone
            ? "Recorded aerial video analysis — not a live drone feed"
            : "Recorded video analysis — not live CCTV"}
        </span>
      </header>

      {error && <div className="camera-error">{error}</div>}

      {!loading && !error && visible.length === 0 && (
        <div className="camera-error">
          No {isDrone ? "drone videos" : "cameras"} configured. Add video files
          in backend/videos.
        </div>
      )}

      <div className="camera-grid">
        {visible.map((camera) => {
          const info = counts[camera.id] || {};
          const isCounting = !!counting[camera.id];
          const status = !camera.available
            ? "unavailable"
            : videoErrors[camera.id]
            ? "error"
            : "playing";
          return (
            <article className="camera-card" key={camera.id}>
              <button
                type="button"
                className="camera-video-btn"
                onClick={() => setSelected(camera)}
                aria-label={`Open ${camera.id} ${camera.name}`}
              >
                <CameraVideo
                  camera={camera}
                  className="camera-video"
                  failure={videoErrors[camera.id]}
                  onError={handleVideoError}
                />
              </button>

              <div className="camera-info">
                <div className="camera-id">
                  {camera.id} · {camera.name}
                </div>
                <div className="camera-zone">{camera.location}</div>
                <div className={`camera-status is-${status}`}>
                  {status.toUpperCase()}
                </div>
              </div>

              <div className="camera-count">
                Detected people:{" "}
                <strong>{info.people_count ?? 0}</strong>
                {isCounting ? " (counting)" : ""}
              </div>

              <div className="camera-actions">
                <button
                  type="button"
                  className="camera-action"
                  disabled={isCounting || !camera.available}
                  onClick={() => startCounting(camera)}
                >
                  {isCounting ? "Counting..." : "Count People"}
                </button>
                <button
                  type="button"
                  className="camera-stop"
                  disabled={!isCounting}
                  onClick={() => stopCounting(camera)}
                >
                  Stop
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {selected && (
        <div
          className="camera-modal-backdrop"
          onClick={() => setSelected(null)}
        >
          <section
            className="camera-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="camera-close"
              onClick={() => setSelected(null)}
            >
              Close ✕
            </button>

            <h2>
              {selected.id} — {selected.name}
            </h2>

            <CameraVideo
              camera={selected}
              className="camera-video-large"
              failure={videoErrors[selected.id]}
              onError={handleVideoError}
            />

            <h3>
              People detected:{" "}
              {(counts[selected.id] || {}).people_count ?? 0}
            </h3>

            <div className="camera-actions">
              <button
                type="button"
                className="camera-action"
                disabled={!!counting[selected.id] || !selected.available}
                onClick={() => startCounting(selected)}
              >
                Start Counting
              </button>
              <button
                type="button"
                className="camera-stop"
                disabled={!counting[selected.id]}
                onClick={() => stopCounting(selected)}
              >
                Stop Counting
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export function DroneMonitoring() {
  return <MonitoringSection kind="drone" />;
}

export default function CameraMonitoring() {
  return <MonitoringSection kind="camera" />;
}
