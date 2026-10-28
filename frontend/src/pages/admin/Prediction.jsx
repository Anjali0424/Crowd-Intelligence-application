import { useCallback, useEffect, useRef, useState } from "react";

import { apiGet } from "../../services/api";
import { formatClock, formatMinutes } from "../../services/darshanService";

function sourceLabel(source) {
  if (source === "camera") return "Live camera measurement";
  if (source === "hybrid") return "Camera counts and staff records";
  if (source === "staff") return "Staff record";
  return "Not measured";
}

function methodLabel(method) {
  if (method === "historical-ml") return "Historical model";
  if (method === "combined") return "Model and queue estimate";
  if (method === "queue-baseline") return "Queue estimate";
  return "No estimate";
}

function Prediction() {
  const [prediction, setPrediction] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    try {
      const [currentResult, historyResult] = await Promise.all([
        apiGet("/api/darshan/prediction"),
        apiGet("/api/darshan/history?limit=12"),
      ]);
      if (requestId !== requestRef.current) return;

      setPrediction(
        currentResult && typeof currentResult === "object" ? currentResult : null
      );
      const rows = Array.isArray(historyResult?.predictions)
        ? historyResult.predictions
        : [];
      setHistory(rows);
      setError("");
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setPrediction(null);
      setHistory([]);
      setError(
        err?.message ||
          "The prediction service did not respond. Please try again in a minute."
      );
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const available = prediction?.available === true;
  const waitMinutes = Number(prediction?.wait_minutes);
  const totalMinutes = Number(prediction?.total_minutes);
  const hasWait = available && Number.isFinite(waitMinutes);
  const hasTotal = available && Number.isFinite(totalMinutes);
  const queueCount = Number(prediction?.queue_population);
  const hasQueue = Number.isFinite(queueCount);
  const points = history
    .filter((item) => Number.isFinite(Number(item?.total_minutes)))
    .slice()
    .reverse();
  const maxMinutes = Math.max(
    1,
    ...points.map((item) => Number(item.total_minutes))
  );

  let note = "Checking the prediction service…";
  if (error) {
    note = error;
  } else if (!loading && prediction?.missing?.length) {
    note = `A waiting-time estimate needs ${prediction.missing.join(
      " and "
    )}. No number was filled in.`;
  } else if (!loading && prediction?.available === false) {
    note =
      "A waiting-time estimate is not available. The queue count or processing rate is missing.";
  } else if (hasTotal) {
    note = `${methodLabel(prediction.method)} from ${sourceLabel(
      prediction.data_source
    ).toLowerCase()}. The crowd level is the measured queue, not a forecast of future attendance.`;
  } else if (!loading) {
    note = "A valid waiting-time estimate is not currently available.";
  }

  return (
    <div className="admin-page-content">
      <div className="page-head">
        <h1>AI Crowd Prediction</h1>
        <p>Waiting-time estimate from the current queue and service rate</p>
      </div>

      <div className="prediction-card">
        {loading && !prediction && !error ? (
          <p>Loading the latest estimate…</p>
        ) : null}

        <div className="mini-stats">
          <div className="mini-stat">
            <span>Queue now</span>
            <b>{hasQueue ? queueCount.toLocaleString() : "Not measured"}</b>
          </div>
          <div className="mini-stat">
            <span>Waiting time</span>
            <b>{hasWait ? formatMinutes(waitMinutes) : "Unavailable"}</b>
          </div>
          <div className="mini-stat">
            <span>Total estimate</span>
            <b>{hasTotal ? formatMinutes(totalMinutes) : "Unavailable"}</b>
          </div>
          <div className="mini-stat">
            <span>Measured crowd</span>
            <b>{prediction?.crowd_level || "No data"}</b>
          </div>
        </div>

        {points.length > 0 ? (
          <div className="bar-chart" aria-label="Stored waiting-time estimates">
            {points.map((item) => (
              <div key={item.id || item.created_at} className="bar-col">
                <div
                  className="bar"
                  style={{
                    height: `${Math.round(
                      (Number(item.total_minutes) / maxMinutes) * 100
                    )}%`,
                  }}
                ></div>
                <span className="bar-label">
                  {formatClock(item.created_at)}
                </span>
              </div>
            ))}
          </div>
        ) : !loading ? (
          <p>
            {error
              ? "Stored estimates could not be loaded."
              : "No stored estimates yet. The figures above are the current calculation, not a saved forecast."}
          </p>
        ) : null}
      </div>

      <div className="future-note" role={error ? "alert" : "status"}>
        {note}
        {hasTotal
          ? ` Finish around ${formatClock(prediction.expected_completion)}.`
          : ""}
      </div>
    </div>
  );
}

export default Prediction;
