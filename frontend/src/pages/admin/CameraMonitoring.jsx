import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import "./CameraMonitoring.css";
import { API_BASE, apiGet } from "../../services/api";


const streamUrl = (cameraId) =>
  `${API_BASE}/api/cameras/${encodeURIComponent(cameraId)}/stream`;


function CameraVideo({
  cameraId,
  className = "camera-video",
  onError,
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [cameraId]);

  const handleError = () => {
    setFailed(true);
    onError?.(cameraId);
  };

  if (failed) {
    return (
      <div className={`camera-video-fallback ${className}`}>
        Video stream unavailable
      </div>
    );
  }

  return (
    <div className="camera-video-wrapper">
      <img
        src={streamUrl(cameraId)}
        className={className}
        alt={`Annotated feed for ${cameraId}`}
        onError={handleError}
      />
    </div>
  );
}


function CameraSummary({ info = {} }) {
  const detections = Array.isArray(info.detections)
    ? info.detections
    : [];

  const trackedCount = detections.filter(
    (detection) =>
      detection.track_id !== null &&
      detection.track_id !== undefined
  ).length;

  return (
    <div className="camera-summary">
      <div className="camera-count">
        Detected people:{" "}
        <strong>{info.people_count ?? 0}</strong>
      </div>

      <div className="camera-tracking-summary">
        Tracked IDs: <strong>{trackedCount}</strong>
      </div>

      {info.fps !== undefined && (
        <div className="camera-tracking-summary">
          Detection FPS: <strong>{info.fps}</strong>
        </div>
      )}

      {info.error && (
        <div className="camera-error">
          {info.error}
        </div>
      )}
    </div>
  );
}


function MonitoringSection({ kind = "camera" }) {
  const isDrone = kind === "drone";

  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [counts, setCounts] = useState({});
  const [counting, setCounting] = useState({});
  const [videoErrors, setVideoErrors] = useState({});

  const autoStarted = useRef(new Set());

  // Load the available cameras.
  useEffect(() => {
    let mounted = true;

    async function loadCameras() {
      try {
        const response = await apiGet("/api/cameras");

        if (mounted) {
          setCameras(response.cameras || []);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err.message || "Failed to load cameras."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadCameras();

    return () => {
      mounted = false;
    };
  }, []);


  // Start the existing backend counting worker automatically.
  useEffect(() => {
    if (loading || cameras.length === 0) {
      return undefined;
    }

    let cancelled = false;

    async function startAvailableCameras() {
      const availableCameras = cameras.filter(
        (camera) =>
          (camera.kind || "camera") === kind &&
          camera.available
      );

      for (const camera of availableCameras) {
        if (cancelled) {
          break;
        }

        if (autoStarted.current.has(camera.id)) {
          continue;
        }

        autoStarted.current.add(camera.id);

        try {
          const response = await fetch(
            `${API_BASE}/api/cameras/${encodeURIComponent(
              camera.id
            )}/count/start`,
            {
              method: "POST",
            }
          );

          if (!response.ok) {
            const body = await response.json().catch(
              () => ({})
            );

            throw new Error(
              body.detail ||
              `Could not start counting (${response.status}).`
            );
          }

          if (!cancelled) {
            setCounting((previous) => ({
              ...previous,
              [camera.id]: true,
            }));
          }
        } catch (err) {
          autoStarted.current.delete(camera.id);

          if (!cancelled) {
            setError(
              `${camera.id}: ${err.message}`
            );
          }
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 1000)
        );
      }
    }

    startAvailableCameras();

    return () => {
      cancelled = true;
    };
  }, [cameras, loading, kind]);


  // Retrieve the latest backend counts and tracking results.
  useEffect(() => {
    let mounted = true;

    async function pollCounts() {
      try {
        const response = await apiGet(
          "/api/cameras/counts"
        );

        if (!mounted) {
          return;
        }

        const nextCounts = {};
        const nextCounting = {};

        for (const camera of response.cameras || []) {
          nextCounts[camera.camera_id] = camera;

          nextCounting[camera.camera_id] =
            Boolean(camera.processing);
        }

        setCounts(nextCounts);
        setCounting(nextCounting);
      } catch {
        // Preserve the last successful response.
      }
    }

    pollCounts();

    const timer = setInterval(pollCounts, 1000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);


  const handleVideoError = useCallback((cameraId) => {
    setVideoErrors((previous) => ({
      ...previous,
      [cameraId]: true,
    }));
  }, []);


  const visibleCameras = cameras.filter(
    (camera) =>
      (camera.kind || "camera") === kind
  );

  const trackingCount = visibleCameras.filter(
    (camera) => counting[camera.id]
  ).length;

  const playingCount = visibleCameras.filter(
    (camera) =>
      camera.available && !videoErrors[camera.id]
  ).length;


  function getStatus(camera) {
    if (!camera.available) {
      return "unavailable";
    }

    if (videoErrors[camera.id]) {
      return "error";
    }

    return "playing";
  }


  return (
    <section className="camera-page">
      <header className="camera-heading">
        <h2>
          {isDrone
            ? "Drone Monitoring"
            : "Camera Monitoring"}
        </h2>

        <p>
          {loading
            ? "Loading video feeds..."
            : `${playingCount} / ${visibleCameras.length} video feeds available · ${trackingCount} counting`}
        </p>

        <span className="camera-note">
          {isDrone
            ? "Recorded aerial video analysis — not a live drone feed"
            : "Recorded video analysis — not live CCTV"}
        </span>
      </header>


      {error && (
        <div className="camera-error">
          {error}
        </div>
      )}


      {!loading && visibleCameras.length === 0 && (
        <div className="camera-empty">
          No {isDrone ? "drone videos" : "cameras"} configured.
          Add video files to the backend/videos directory.
        </div>
      )}


      <div className="camera-grid">
        {visibleCameras.map((camera) => {
          const status = getStatus(camera);
          const info = counts[camera.id] || {};

          return (
            <article
              className="camera-card"
              key={camera.id}
            >
              <button
                type="button"
                className="camera-video-btn"
                onClick={() => setSelected(camera)}
                aria-label={`Open ${camera.id}, ${camera.name}`}
              >
                {camera.available ? (
                  <CameraVideo
                    cameraId={camera.id}
                    className="camera-video"
                    onError={handleVideoError}
                  />
                ) : (
                  <div className="camera-video-fallback camera-video">
                    Video unavailable
                  </div>
                )}
              </button>


              <div className="camera-info">
                <div className="camera-id">
                  {camera.id} · {camera.name}
                </div>

                <div className="camera-zone">
                  {camera.location || "Location unavailable"}
                </div>

                <div
                  className={`camera-status is-${status}`}
                >
                  {status.toUpperCase()}
                </div>
              </div>


              <CameraSummary info={info} />
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
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.name} camera details`}
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

            <p className="camera-zone">
              {selected.location || "Location unavailable"}
            </p>

            {selected.available ? (
              <CameraVideo
                cameraId={selected.id}
                className="camera-video-large"
                onError={handleVideoError}
              />
            ) : (
              <div className="camera-video-fallback camera-video-large">
                Video unavailable
              </div>
            )}

            <CameraSummary
              info={counts[selected.id] || {}}
            />
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
