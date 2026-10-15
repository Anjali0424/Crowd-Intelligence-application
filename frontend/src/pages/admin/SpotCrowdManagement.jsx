import { useCallback, useEffect, useState } from "react";

import TempleMap from "../../components/user/TempleMap";
import {
  createCrowdSpot,
  formatClock,
  getCrowdMap,
  saveCrowdObservation,
  sourceLabel,
  SPOT_SOURCES,
  updateCrowdSpot,
} from "../../services/crowdMapService";
import { getCrowdColor, getCrowdLabel } from "../../utils/crowdLevel";
import { TIRUMALA_CENTER } from "../../data/mockTempleMapData";
import "./SpotCrowdManagement.css";

const EMPTY_SPOT = {
  name: "",
  lat: String(TIRUMALA_CENTER.lat),
  lng: String(TIRUMALA_CENTER.lng),
  capacity: "",
  verified: false,
  notes: "",
};

function toNumberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function LevelPill({ level, hasData }) {
  const effective = hasData ? level : "NO_DATA";
  return (
    <span
      className="spot-pill"
      style={{
        backgroundColor: getCrowdColor(effective),
        color: effective === "MODERATE" ? "#422006" : "#ffffff",
      }}
    >
      {getCrowdLabel(effective)}
    </span>
  );
}

function SpotCrowdManagement() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

  const [newSpot, setNewSpot] = useState(EMPTY_SPOT);
  const [obsFor, setObsFor] = useState(null);
  const [obs, setObs] = useState({ people_count: "", capacity: "", source: "staff", notes: "" });
  const [editFor, setEditFor] = useState(null);
  const [edit, setEdit] = useState({ name: "", capacity: "", verified: false });

  const load = useCallback(async () => {
    try {
      const res = await getCrowdMap();
      setData(res);
      setError(null);
    } catch (err) {
      setError("Could not load crowd map data. Is the backend running?");
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const spots = data?.spots || [];
  const paths = data?.paths || [];

  const handleCreateSpot = async (event) => {
    event.preventDefault();
    setStatus(null);
    try {
      await createCrowdSpot({
        name: newSpot.name.trim(),
        lat: Number(newSpot.lat),
        lng: Number(newSpot.lng),
        capacity: toNumberOrNull(newSpot.capacity),
        verified: Boolean(newSpot.verified),
        notes: newSpot.notes.trim() || undefined,
      });
      setNewSpot(EMPTY_SPOT);
      setStatus("Spot created.");
      load();
    } catch (err) {
      setStatus(`Could not create spot: ${err.message}`);
    }
  };

  const openObservation = (spot) => {
    setEditFor(null);
    setObsFor(spot.id);
    setObs({
      people_count: "",
      capacity: spot.capacity != null ? String(spot.capacity) : "",
      source: "staff",
      notes: "",
    });
  };

  const handleObservation = async (event, spotId) => {
    event.preventDefault();
    setStatus(null);
    const payload = {
      people_count: Number(obs.people_count),
      source: obs.source,
      notes: obs.notes.trim() || undefined,
    };
    const capacity = toNumberOrNull(obs.capacity);
    if (capacity !== null) payload.capacity = capacity;

    try {
      await saveCrowdObservation(spotId, payload);
      setObsFor(null);
      setStatus("Observation saved.");
      load();
    } catch (err) {
      setStatus(`Could not save observation: ${err.message}`);
    }
  };

  const openEdit = (spot) => {
    setObsFor(null);
    setEditFor(spot.id);
    setEdit({
      name: spot.name,
      capacity: spot.capacity != null ? String(spot.capacity) : "",
      verified: Boolean(spot.verified),
    });
  };

  const handleEdit = async (event, spotId) => {
    event.preventDefault();
    setStatus(null);
    try {
      await updateCrowdSpot(spotId, {
        name: edit.name.trim(),
        capacity: toNumberOrNull(edit.capacity),
        verified: Boolean(edit.verified),
      });
      setEditFor(null);
      setStatus("Spot updated.");
      load();
    } catch (err) {
      setStatus(`Could not update spot: ${err.message}`);
    }
  };

  return (
    <div className="admin-page-content">
      <div className="page-head">
        <h1>Spot-wise Crowd Management</h1>
        <p>Record crowd counts per location. Devotees see the same colours on the map.</p>
      </div>

      {error && <div className="spot-error">{error}</div>}
      {status && <div className="spot-status">{status}</div>}

      <section className="spot-section">
        <h3 className="section-title">Add a spot</h3>
        <form className="spot-form" onSubmit={handleCreateSpot}>
          <label>
            Name
            <input
              type="text"
              value={newSpot.name}
              required
              onChange={(event) => setNewSpot((s) => ({ ...s, name: event.target.value }))}
            />
          </label>
          <label>
            Latitude
            <input
              type="number"
              step="any"
              value={newSpot.lat}
              required
              onChange={(event) => setNewSpot((s) => ({ ...s, lat: event.target.value }))}
            />
          </label>
          <label>
            Longitude
            <input
              type="number"
              step="any"
              value={newSpot.lng}
              required
              onChange={(event) => setNewSpot((s) => ({ ...s, lng: event.target.value }))}
            />
          </label>
          <label>
            Capacity (optional)
            <input
              type="number"
              min="1"
              value={newSpot.capacity}
              placeholder="Leave blank if unknown"
              onChange={(event) => setNewSpot((s) => ({ ...s, capacity: event.target.value }))}
            />
          </label>
          <label className="spot-checkbox">
            <input
              type="checkbox"
              checked={newSpot.verified}
              onChange={(event) => setNewSpot((s) => ({ ...s, verified: event.target.checked }))}
            />
            Capacity verified
          </label>
          <button type="submit" className="spot-btn">
            Add spot
          </button>
        </form>
        <p className="spot-hint">
          Only enter a capacity when it is a real, verified maximum. Without it the
          spot is shown as "No information" (gray) instead of a guessed colour.
        </p>
      </section>

      <section className="spot-section">
        <h3 className="section-title">Spots ({spots.length})</h3>

        <div className="spot-list">
          {spots.map((spot) => (
            <div key={spot.id} className="spot-row">
              <div className="spot-row-main">
                <div className="spot-row-info">
                  <strong>{spot.name}</strong>
                  <span className="spot-meta">
                    {spot.lat.toFixed(5)}, {spot.lng.toFixed(5)}
                    {spot.capacity != null ? ` · capacity ${spot.capacity}` : " · no capacity"}
                    {spot.verified ? " · verified" : ""}
                  </span>
                </div>

                <div className="spot-row-status">
                  <LevelPill level={spot.level} hasData={spot.has_data} />
                  {spot.has_data ? (
                    <span className="spot-meta">
                      {spot.people_count} people · {spot.density_percent}% ·{" "}
                      {sourceLabel(spot.source)} · {formatClock(spot.observed_at)}
                    </span>
                  ) : spot.stale ? (
                    <span className="spot-meta">
                      {spot.people_count} people · data may be old ({formatClock(spot.observed_at)})
                    </span>
                  ) : (
                    <span className="spot-meta">No observation yet</span>
                  )}
                </div>

                <div className="spot-row-actions">
                  <button type="button" className="spot-btn ghost" onClick={() => openObservation(spot)}>
                    Record count
                  </button>
                  <button type="button" className="spot-btn ghost" onClick={() => openEdit(spot)}>
                    Edit
                  </button>
                </div>
              </div>

              {obsFor === spot.id && (
                <form className="spot-inline-form" onSubmit={(event) => handleObservation(event, spot.id)}>
                  <label>
                    People
                    <input
                      type="number"
                      min="0"
                      value={obs.people_count}
                      required
                      onChange={(event) => setObs((o) => ({ ...o, people_count: event.target.value }))}
                    />
                  </label>
                  <label>
                    Capacity
                    <input
                      type="number"
                      min="1"
                      value={obs.capacity}
                      placeholder="optional"
                      onChange={(event) => setObs((o) => ({ ...o, capacity: event.target.value }))}
                    />
                  </label>
                  <label>
                    Source
                    <select
                      value={obs.source}
                      onChange={(event) => setObs((o) => ({ ...o, source: event.target.value }))}
                    >
                      {SPOT_SOURCES.map((source) => (
                        <option key={source} value={source}>
                          {sourceLabel(source)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Notes
                    <input
                      type="text"
                      value={obs.notes}
                      onChange={(event) => setObs((o) => ({ ...o, notes: event.target.value }))}
                    />
                  </label>
                  <div className="spot-inline-actions">
                    <button type="submit" className="spot-btn">Save</button>
                    <button type="button" className="spot-btn ghost" onClick={() => setObsFor(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {editFor === spot.id && (
                <form className="spot-inline-form" onSubmit={(event) => handleEdit(event, spot.id)}>
                  <label>
                    Name
                    <input
                      type="text"
                      value={edit.name}
                      onChange={(event) => setEdit((s) => ({ ...s, name: event.target.value }))}
                    />
                  </label>
                  <label>
                    Capacity
                    <input
                      type="number"
                      min="1"
                      value={edit.capacity}
                      placeholder="blank = unknown"
                      onChange={(event) => setEdit((s) => ({ ...s, capacity: event.target.value }))}
                    />
                  </label>
                  <label className="spot-checkbox">
                    <input
                      type="checkbox"
                      checked={edit.verified}
                      onChange={(event) => setEdit((s) => ({ ...s, verified: event.target.checked }))}
                    />
                    Verified
                  </label>
                  <div className="spot-inline-actions">
                    <button type="submit" className="spot-btn">Save</button>
                    <button type="button" className="spot-btn ghost" onClick={() => setEditFor(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="spot-section">
        <h3 className="section-title">Path status</h3>
        <div className="spot-path-list">
          {paths.map((path) => (
            <div key={path.id} className="spot-path-row">
              <LevelPill level={path.level} hasData={!path.stale && path.people_count != null} />
              <span className="spot-path-name">{path.name}</span>
              <span className="spot-meta">
                {Array.isArray(path.geometry) && path.geometry.length >= 2
                  ? `route mapped (${path.geometry_source || "unknown"})`
                  : "route not mapped yet"}
                {" · "}
                {path.density_percent != null ? `${path.density_percent}%` : "no density"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="spot-section">
        <h3 className="section-title">Map preview</h3>
        <div className="crowd-map-shell">
          <TempleMap spots={spots} paths={paths} />
        </div>
        <p className="spot-hint">{data?.note}</p>
      </section>
    </div>
  );
}

export default SpotCrowdManagement;
