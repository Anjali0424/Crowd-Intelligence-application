import { useCallback, useEffect, useState } from "react";

import StatCard from "../../components/admin/StatCard";
import TempleMap from "../../components/user/TempleMap";
import { mockAdminData } from "../../data/mockAdminData";
import {
  EXIT_STATUS_COLORS,
  EXIT_STATUSES,
  getExits,
  updateExit,
} from "../../services/exitService";
import "./EntryExit.css";

const EMOJI = {
  LOW: "🟢",
  MODERATE: "🟡",
  HIGH: "🔴",
  CRITICAL: "🔴",
};

const STATUS_TEXT_COLOR = {
  OPEN: "#ffffff",
  BUSY: "#422006",
  CLOSED: "#ffffff",
  UNKNOWN: "#1F2937",
};

function statusLabel(status) {
  if (status === "UNKNOWN") return "Status unknown";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function toNumberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function EntryExit() {
  const { entryExit } = mockAdminData;

  const [exits, setExits] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);
  const [edits, setEdits] = useState({});
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await getExits();
      const list = res?.exits || [];
      setExits(list);
      setEdits(
        Object.fromEntries(
          list.map((exit) => [
            exit.id,
            {
              status: exit.status === "UNKNOWN" ? "" : exit.status,
              closure_reason: exit.closure_reason || "",
              wait_minutes:
                exit.wait_minutes !== null && exit.wait_minutes !== undefined
                  ? String(exit.wait_minutes)
                  : "",
            },
          ])
        )
      );
      setLoadError(null);
    } catch (err) {
      setLoadError("Could not load exit points. Is the backend running?");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateEdit = (id, patch) => {
    setEdits((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  };

  const handleSave = async (exit) => {
    const edit = edits[exit.id] || {};
    setSaveMessage(null);
    setSavingId(exit.id);

    const payload = {
      wait_minutes: toNumberOrNull(edit.wait_minutes),
    };
    if (edit.status) payload.status = edit.status;
    if (edit.status === "CLOSED") {
      payload.closure_reason = edit.closure_reason.trim() || null;
    } else {
      payload.closure_reason = null;
    }

    try {
      await updateExit(exit.id, payload);
      setSaveMessage(`Saved status for ${exit.name}.`);
      load();
    } catch (err) {
      setSaveMessage(
        `Could not save ${exit.name}: ${err.message}. Staff access may require a valid admin token.`
      );
    } finally {
      setSavingId(null);
    }
  };

  const summary = exits.reduce(
    (acc, exit) => {
      acc[exit.status] = (acc[exit.status] || 0) + 1;
      return acc;
    },
    { OPEN: 0, BUSY: 0, CLOSED: 0, UNKNOWN: 0 }
  );

  return (
    <div className="admin-page-content">
      <div className="page-head">
        <h1>Entry / Exit Monitoring</h1>
        <p>Gate flow and inside-strength tracking</p>
      </div>

      {/* Existing Entry / Exit Statistics */}
      <div className="stat-grid">
        <StatCard
          icon="🚪"
          label="TODAY'S ENTRIES"
          value={entryExit.todayEntries.toLocaleString()}
          status="SINCE 6 AM"
          tone="neutral"
        />

        <StatCard
          icon="↩️"
          label="TODAY'S EXITS"
          value={entryExit.todayExits.toLocaleString()}
          status="SINCE 6 AM"
          tone="neutral"
        />

        <StatCard
          icon="🧑‍🤝‍🧑"
          label="CURRENTLY INSIDE"
          value={entryExit.inside.toLocaleString()}
          status="🟡 MANAGEABLE"
          tone="moderate"
          note="Auto-computed from entries − exits"
        />
      </div>

      {/* Exit status controls */}
      <section className="modules-section ee-section">
        <h3 className="section-title">Exit status control</h3>
        <p className="ee-intro">
          Set each exit as open, busy or closed and record why it is closed. This
          is exactly what devotees see on the Exit Points page. Nothing is
          guessed: an exit with no status shows as "Status unknown".
        </p>

        <div className="ee-summary">
          {["OPEN", "BUSY", "CLOSED", "UNKNOWN"].map((status) => (
            <span key={status} className="ee-summary-item">
              <span
                className="ee-dot"
                style={{ backgroundColor: EXIT_STATUS_COLORS[status] }}
              />
              {summary[status] || 0} {statusLabel(status).toLowerCase()}
            </span>
          ))}
        </div>

        {loadError && <div className="ee-message ee-message-error">{loadError}</div>}
        {saveMessage && <div className="ee-message">{saveMessage}</div>}

        <div className="ee-list">
          {exits.map((exit) => {
            const edit = edits[exit.id] || {
              status: "",
              closure_reason: "",
              wait_minutes: "",
            };
            return (
              <div key={exit.id} className="ee-row">
                <div className="ee-row-head">
                  <div>
                    <strong>{exit.name}</strong>
                    <span className="ee-meta">
                      {exit.id} · {exit.lat.toFixed(5)}, {exit.lng.toFixed(5)}
                      {exit.verified ? " · verified" : " · approximate"}
                    </span>
                  </div>
                  <span
                    className="ee-pill"
                    style={{
                      backgroundColor: EXIT_STATUS_COLORS[exit.status],
                      color: STATUS_TEXT_COLOR[exit.status] || "#ffffff",
                    }}
                  >
                    {statusLabel(exit.status)}
                  </span>
                </div>

                <div className="ee-form">
                  <label>
                    Status
                    <select
                      value={edit.status}
                      onChange={(event) =>
                        updateEdit(exit.id, { status: event.target.value })
                      }
                    >
                      <option value="">Status unknown</option>
                      {EXIT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {statusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Closure reason
                    <input
                      type="text"
                      value={edit.closure_reason}
                      placeholder="Shown only when closed"
                      disabled={edit.status !== "CLOSED"}
                      onChange={(event) =>
                        updateEdit(exit.id, { closure_reason: event.target.value })
                      }
                    />
                  </label>

                  <label>
                    Est. wait (min)
                    <input
                      type="number"
                      min="0"
                      value={edit.wait_minutes}
                      placeholder="optional"
                      onChange={(event) =>
                        updateEdit(exit.id, { wait_minutes: event.target.value })
                      }
                    />
                  </label>

                  <button
                    type="button"
                    className="ee-btn"
                    disabled={savingId === exit.id}
                    onClick={() => handleSave(exit)}
                  >
                    {savingId === exit.id ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Existing Gates Section */}
      <section className="modules-section">
        <h3 className="section-title">Gates</h3>

        <div className="risk-grid">
          {entryExit.gates.map((gate) => (
            <div key={gate.name} className="risk-card">
              <div className="risk-top">
                <span
                  className={`risk-level tone-${gate.level.toLowerCase()}`}
                >
                  {EMOJI[gate.level] || "⚪"} {gate.level}
                </span>

                <span className="risk-count">{gate.type}</span>
              </div>

              <span className="risk-title">{gate.name}</span>
              <span className="risk-detail">Mock gate status</span>
            </div>
          ))}
        </div>
      </section>

      {/* Added Interactive Temple Map */}
      <section className="modules-section">
        <h3 className="section-title">Temple Entry / Exit Map</h3>

        <div className="map-preview-card">
          <div className="temple-map-container">
            <TempleMap
              showUser={false}
              showFacilities={true}
              showRoute={true}
            />
          </div>
        </div>
      </section>

      {/* Existing Note Preserved */}
      <div className="future-note">
        🤖 Entry/exit counting will come from person re-identification across
        camera zones — coming later.
      </div>
    </div>
  );
}

export default EntryExit;
