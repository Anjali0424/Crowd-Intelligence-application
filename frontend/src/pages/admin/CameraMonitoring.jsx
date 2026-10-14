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

export default function CameraMonitoring() {
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
    const active = Object.keys(counting).filter((id) => counting[id]);
    if (active.length === 0) return undefined;

    const timer = setInterval(async () => {
      const results = await Promise.all(
        active.map(async (id) => {
          try {
            const res = await fetch(`${API_BASE}/api/cameras/${id}/count`);
            if (!res.ok) return null;
            const data = await res.json();
            return [id, data];
          } catch (err) {
            return null;
          }
        })
      );
      setCounts((prev) => {
        const next = { ...prev };
        for (const entry of results) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [counting]);

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

  const countedValues = Object.values(counts);
  const playingCount = cameras.filter(
    (c) => c.available && !videoErrors[c.id]
  ).length;

  return (
    <section className="camera-page">
      <header className="camera-heading">
        <h2>Camera Monitoring</h2>
        <p>
          {loading
            ? "Loading recorded video feeds..."
            : `${playingCount} / ${cameras.length} recorded video feeds · ${
                countedValues.length
              } tracking`}
        </p>
        <span className="camera-note">
          Recorded video analysis — not live CCTV
        </span>
      </header>

      {error && <div className="camera-error">{error}</div>}

      <div className="camera-grid">
        {cameras.map((camera) => {
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
