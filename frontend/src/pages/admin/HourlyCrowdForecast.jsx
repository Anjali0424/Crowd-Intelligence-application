import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./HourlyCrowdForecast.css";
import {
  getDarshanRecords,
  saveDarshanRecord,
  getDarshanStatus,
  runDarshanPrediction,
  getDarshanModel,
  trainDarshanModel,
  formatMinutes,
  formatClock,
  formatDataPoints,
  LEVEL_META,
} from "../../services/darshanService";

const DEFAULT_TIME_SLOTS = [
  "8:00 AM",
  "10:00 AM",
  "12:00 PM",
  "2:00 PM",
  "4:00 PM",
  "6:00 PM",
  "8:00 PM",
];

const EMPTY_ENTRY = {
  passesIssued: "",
  actualEntries: "",
  actualExits: "",
  queuePopulation: "",
  peopleInside: "",
  completedPerHour: "",
  observedWaitMinutes: "",
};

const formatTime = (value) => {
  if (!value) return "";
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutesText} ${period}`;
};

const timeToMinutes = (value) => {
  const match = value.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);
  if (!match) return 0;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (match[3] === "PM" && hours !== 12) hours += 12;
  if (match[3] === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
};

const toSlot = (label) => {
  const match = label.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);
  if (!match) return label;
  let hours = Number(match[1]);
  const minutes = match[2];
  if (match[3] === "PM" && hours !== 12) hours += 12;
  if (match[3] === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${minutes}`;
};

const asInt = (value) =>
  value === "" || value === null || value === undefined ? null : Number(value);

const methodLabel = (method) => {
  switch (method) {
    case "historical-ml":
      return "Historical ML model";
    case "combined":
      return "ML + queue baseline";
    default:
      return "Queue + service-rate baseline";
  }
};

const trendLabel = (trend) => {
  switch (trend) {
    case "increasing":
      return "↑ Queue growing";
    case "decreasing":
      return "↓ Queue easing";
    default:
      return "→ Stable";
  }
};

function HourlyCrowdForecast() {
  const [entries, setEntries] = useState(() =>
    Object.fromEntries(
      DEFAULT_TIME_SLOTS.map((time) => [time, { ...EMPTY_ENTRY }])
    )
  );
  const [customSlots, setCustomSlots] = useState([]);
  const [newTime, setNewTime] = useState("");

  const [recordDate, setRecordDate] = useState(() => {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [recordCount, setRecordCount] = useState(0);

  const [selectedTime, setSelectedTime] = useState("4:00 PM");
  const [recordedUntil, setRecordedUntil] = useState("8:00 PM");
  const [queuePopulation, setQueuePopulation] = useState("");
  const [peopleInside, setPeopleInside] = useState("");
  const [processingCapacity, setProcessingCapacity] = useState("");
  const [entryRate, setEntryRate] = useState("");

  const [prediction, setPrediction] = useState(null);
  const [predicting, setPredicting] = useState(false);
  const [predictionMessage, setPredictionMessage] = useState("");
  const [liveInfo, setLiveInfo] = useState(null);

  const [model, setModel] = useState(null);
  const [training, setTraining] = useState(false);
  const [modelMessage, setModelMessage] = useState("");
  const predictRequest = useRef(0);

  const timeSlots = useMemo(
    () =>
      [...DEFAULT_TIME_SLOTS, ...customSlots].sort(
        (a, b) => timeToMinutes(a) - timeToMinutes(b)
      ),
    [customSlots]
  );

  const loadRecords = useCallback(async (date) => {
    try {
      const res = await getDarshanRecords(date);
      const rows = res?.records || [];
      const next = Object.fromEntries(
        DEFAULT_TIME_SLOTS.map((time) => [time, { ...EMPTY_ENTRY }])
      );
      for (const record of rows) {
        const label = formatTime(record.slot_time);
        next[label] = {
          passesIssued: record.passes_issued ?? "",
          actualEntries: record.actual_entries ?? "",
          actualExits: record.actual_exits ?? "",
          queuePopulation: record.queue_population ?? "",
          peopleInside: record.people_inside ?? "",
          completedPerHour: record.completed_per_hour ?? "",
          observedWaitMinutes: record.observed_wait_minutes ?? "",
        };
      }
      setRecordCount(rows.length);
      setEntries(next);
    } catch (err) {
      setRecordCount(0);
    }
  }, []);

  useEffect(() => {
    loadRecords(recordDate);
  }, [recordDate, loadRecords]);

  useEffect(() => {
    getDarshanModel()
      .then((res) => setModel(res))
      .catch(() => setModel(null));
  }, []);

  const updateEntry = (time, field, value) => {
    if (value !== "" && (!/^\d+$/.test(value) || Number(value) < 0)) {
      return;
    }
    setEntries((previous) => ({
      ...previous,
      [time]: {
        ...(previous[time] || EMPTY_ENTRY),
        [field]: value,
      },
    }));
    setPrediction(null);
    setPredictionMessage("");
  };

  const [saveErrorText, setSaveErrorText] = useState("");
  const [saveSuccessText, setSaveSuccessText] = useState("");

  const addTimeSlot = () => {
    if (!newTime) {
      setSaveErrorText("Please select a time slot first.");
      return;
    }

    const formattedTime = formatTime(newTime);

    if (timeSlots.includes(formattedTime)) {
      setSaveErrorText("That time slot is already in the list.");
      return;
    }

    setCustomSlots((previous) => [...previous, formattedTime]);
    setEntries((previous) => ({
      ...previous,
      [formattedTime]: { ...EMPTY_ENTRY },
    }));
    setNewTime("");
    setSaveErrorText("");
    setSaveSuccessText("");
  };

  const saveAll = async (event) => {
    event.preventDefault();

    const payloads = [];
    for (const time of timeSlots) {
      const row = entries[time] || EMPTY_ENTRY;
      const hasValue = Object.values(row).some((v) => v !== "");
      if (!hasValue) continue;
      payloads.push({
        record_date: recordDate,
        slot_time: toSlot(time),
        source: "staff",
        passes_issued: asInt(row.passesIssued),
        actual_entries: asInt(row.actualEntries),
        actual_exits: asInt(row.actualExits),
        queue_population: asInt(row.queuePopulation),
        people_inside: asInt(row.peopleInside),
        completed_per_hour: asInt(row.completedPerHour),
        observed_wait_minutes: asInt(row.observedWaitMinutes),
        notes: notes || null,
      });
    }

    if (payloads.length === 0) {
      setSaveErrorText("Enter at least one value before saving.");
      setSaveSuccessText("");
      return;
    }

    setSaving(true);
    setSaveErrorText("");
    setSaveSuccessText("");
    try {
      await Promise.all(payloads.map((payload) => saveDarshanRecord(payload)));
      setSaveSuccessText(
        `Saved ${payloads.length} time-slot record${
          payloads.length === 1 ? "" : "s"
        } for ${recordDate} to the database.`
      );
      await loadRecords(recordDate);
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message;
      setSaveErrorText(
        typeof detail === "string" ? detail : "Could not save records."
      );
    } finally {
      setSaving(false);
    }
  };

  const fillFromLive = async () => {
    try {
      const status = await getDarshanStatus();
      setLiveInfo(status);
      if (status.queue_population != null) {
        setQueuePopulation(String(status.queue_population));
      }
      if (status.people_inside != null) {
        setPeopleInside(String(status.people_inside));
      }
      if (status.processing_rate_per_hour != null) {
        setProcessingCapacity(String(Math.round(status.processing_rate_per_hour)));
      }
      setPredictionMessage("");
    } catch (err) {
      setPredictionMessage(
        err?.message || "Live camera counts are unavailable right now."
      );
    }
  };

  const clearPrediction = () => {
    predictRequest.current += 1;
    setPrediction(null);
    setPredictionMessage("");
  };

  const generatePrediction = async (event) => {
    event.preventDefault();
    setPredictionMessage("");

    if (
      processingCapacity !== "" &&
      (!Number.isFinite(Number(processingCapacity)) ||
        Number(processingCapacity) <= 0)
    ) {
      setPrediction(null);
      setPredictionMessage("Processing capacity must be greater than zero.");
      return;
    }

    const requestId = predictRequest.current + 1;
    predictRequest.current = requestId;
    setPredicting(true);
    setPrediction(null);
    try {
      const result = await runDarshanPrediction({
        queue_population: asInt(queuePopulation),
        people_inside: asInt(peopleInside),
        processing_rate_per_hour:
          processingCapacity === "" ? null : Number(processingCapacity),
        entry_rate_per_hour: entryRate === "" ? null : Number(entryRate),
        target_time: toSlot(selectedTime),
        target_date: recordDate,
        use_live: queuePopulation === "" && peopleInside === "",
        persist: true,
      });
      if (requestId !== predictRequest.current) return;
      if (!result || typeof result !== "object") {
        setPredictionMessage(
          "The prediction service returned an unexpected response."
        );
        return;
      }
      setPrediction(result);
      if (!result.available) {
        const missing = Array.isArray(result.missing)
          ? result.missing.join(", ")
          : "";
        setPredictionMessage(
          missing
            ? `Not enough data yet. Missing ${missing}. Enter those values or start camera counting.`
            : "Not enough live data yet. Enter the queue count and processing capacity, or start camera counting."
        );
      }
    } catch (err) {
      if (requestId !== predictRequest.current) return;
      setPrediction(null);
      const detail = err?.response?.data?.detail || err?.message;
      setPredictionMessage(
        typeof detail === "string" && detail
          ? detail
          : "Prediction could not be generated."
      );
    } finally {
      if (requestId === predictRequest.current) setPredicting(false);
    }
  };

  const handleTrain = async () => {
    setTraining(true);
    setModelMessage("");
    try {
      const metrics = await trainDarshanModel();
      if (metrics.trained) {
        setModel({ ...metrics, available: true });
        setModelMessage(
          `Model trained on ${metrics.records} records. Mean error ${metrics.mae_minutes} min.`
        );
      } else {
        setModel({ available: false, ...metrics });
        setModelMessage(
          metrics.reason === "insufficient_data"
            ? `Need at least ${metrics.required} labelled records (with a recorded waiting time). Currently ${metrics.labelled_records}.`
            : "The ML library is unavailable, so the queue baseline will be used."
        );
      }
    } catch (err) {
      setModelMessage(
        err?.response?.data?.detail || err?.message || "Training failed."
      );
    } finally {
      setTraining(false);
    }
  };

  const maxCount = Math.max(
    1,
    ...timeSlots.map((time) => {
      const row = entries[time] || EMPTY_ENTRY;
      return Math.max(
        Number(row.passesIssued) || 0,
        Number(row.actualEntries) || 0
      );
    })
  );

  const crowdLevel = prediction?.crowd_level;
  const crowdDot = crowdLevel ? LEVEL_META[crowdLevel]?.dot : "";

  return (
    <div className="admin-page-content hourly-forecast-page">
      <header className="page-head">
        <h1>Darshan Pass &amp; Crowd Prediction</h1>
        <p>
          Record pass and crowd data, then generate a real Darshan waiting-time
          estimate for devotees.
        </p>
      </header>

      <section className="modules-section forecast-section">
        <div className="forecast-section-heading">
          <div>
            <h3 className="section-title">Darshan Data Entry</h3>
            <p className="forecast-description">
              Enter the values available to you. Empty fields are left unknown —
              nothing is invented. Passes issued are authorized passes, not
              attendance.
            </p>
          </div>
          <span className="forecast-tag">Staff input</span>
        </div>

        <form onSubmit={saveAll}>
          <div className="forecast-field forecast-date-field">
            <label htmlFor="forecast-date">Record date</label>
            <input
              id="forecast-date"
              type="date"
              value={recordDate}
              onChange={(event) => {
                setRecordDate(event.target.value);
                setPrediction(null);
              }}
              required
            />
          </div>

          <div className="pass-entry-list scrollable">
            <div className="pass-entry-header wide">
              <span>Time</span>
              <span>Passes issued</span>
              <span>Actual entries</span>
              <span>Actual exits</span>
              <span>Queue waiting</span>
              <span>People inside</span>
              <span>Completed / hr</span>
              <span>Recorded wait (min)</span>
            </div>

            {timeSlots.map((time) => {
              const row = entries[time] || EMPTY_ENTRY;
              return (
                <div className="pass-entry-row wide" key={time}>
                  <label className="pass-time" htmlFor={`p-${toSlot(time)}`}>
                    {time}
                  </label>
                  <input
                    id={`p-${toSlot(time)}`}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="—"
                    value={row.passesIssued}
                    onChange={(e) =>
                      updateEntry(time, "passesIssued", e.target.value)
                    }
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="—"
                    value={row.actualEntries}
                    onChange={(e) =>
                      updateEntry(time, "actualEntries", e.target.value)
                    }
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="—"
                    value={row.actualExits}
                    onChange={(e) =>
                      updateEntry(time, "actualExits", e.target.value)
                    }
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="—"
                    value={row.queuePopulation}
                    onChange={(e) =>
                      updateEntry(time, "queuePopulation", e.target.value)
                    }
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="—"
                    value={row.peopleInside}
                    onChange={(e) =>
                      updateEntry(time, "peopleInside", e.target.value)
                    }
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="—"
                    value={row.completedPerHour}
                    onChange={(e) =>
                      updateEntry(time, "completedPerHour", e.target.value)
                    }
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="—"
                    value={row.observedWaitMinutes}
                    onChange={(e) =>
                      updateEntry(time, "observedWaitMinutes", e.target.value)
                    }
                  />
                </div>
              );
            })}
          </div>

          <div className="forecast-field forecast-full-width">
            <label htmlFor="forecast-notes">Notes (optional)</label>
            <input
              id="forecast-notes"
              type="text"
              placeholder="Anything unusual about this day?"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <div className="add-time-slot">
            <label htmlFor="add-time-slot">Add another time slot</label>
            <div className="add-time-slot-controls">
              <input
                id="add-time-slot"
                type="time"
                value={newTime}
                onChange={(event) => setNewTime(event.target.value)}
              />
              <button
                type="button"
                className="forecast-secondary-button"
                onClick={addTimeSlot}
              >
                + Add slot
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="forecast-primary-button"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save to database"}
          </button>
        </form>

        {saveErrorText && (
          <div className="forecast-message" role="alert">
            {saveErrorText}
          </div>
        )}

        {saveSuccessText && (
          <div className="forecast-success" role="status">
            <strong>{saveSuccessText}</strong>
            <p>Stored in the backend database and usable for training.</p>
          </div>
        )}

        {recordCount > 0 && (
          <p className="forecast-description">
            {recordCount} saved record{recordCount === 1 ? "" : "s"} for{" "}
            {recordDate}.
          </p>
        )}
      </section>

      <section className="modules-section forecast-section">
        <h3 className="section-title">Darshan Time Prediction</h3>
        <p className="forecast-description">
          The engine combines the live queue with the service rate. With enough
          historical records it also uses a trained model.
        </p>

        <form onSubmit={generatePrediction}>
          <div className="forecast-form-grid">
            <div className="forecast-field">
              <label htmlFor="predict-time">Predict darshan for</label>
              <select
                id="predict-time"
                value={selectedTime}
                onChange={(event) => {
                  setSelectedTime(event.target.value);
                  clearPrediction();
                }}
              >
                {timeSlots.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>

            <div className="forecast-field">
              <label htmlFor="recorded-until">Recorded data until</label>
              <select
                id="recorded-until"
                value={recordedUntil}
                onChange={(event) => setRecordedUntil(event.target.value)}
              >
                {timeSlots.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>

            <div className="forecast-field">
              <label htmlFor="queue-population">People waiting in queue</label>
              <input
                id="queue-population"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="Enter known count"
                value={queuePopulation}
                onChange={(event) => {
                  setQueuePopulation(event.target.value);
                  clearPrediction();
                }}
              />
            </div>

            <div className="forecast-field">
              <label htmlFor="people-inside">People inside darshan area</label>
              <input
                id="people-inside"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="Enter known count"
                value={peopleInside}
                onChange={(event) => {
                  setPeopleInside(event.target.value);
                  clearPrediction();
                }}
              />
            </div>

            <div className="forecast-field">
              <label htmlFor="processing-capacity">
                Processing capacity (people / hour)
              </label>
              <input
                id="processing-capacity"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder="Enter known rate"
                value={processingCapacity}
                onChange={(event) => {
                  setProcessingCapacity(event.target.value);
                  clearPrediction();
                }}
              />
            </div>

            <div className="forecast-field">
              <label htmlFor="entry-rate">
                Additional arrivals / hour (optional)
              </label>
              <input
                id="entry-rate"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="Enter measured rate"
                value={entryRate}
                onChange={(event) => {
                  setEntryRate(event.target.value);
                  clearPrediction();
                }}
              />
            </div>
          </div>

          <div className="forecast-button-row">
            <button
              type="button"
              className="forecast-secondary-button"
              onClick={fillFromLive}
            >
              Use live camera counts
            </button>
            <button
              type="submit"
              className="forecast-primary-button"
              disabled={predicting}
            >
              {predicting ? "Predicting…" : "Generate prediction"}
            </button>
          </div>
        </form>

        {liveInfo && (
          <p className="forecast-description">
            Live source: {liveInfo.source || "unavailable"}
            {liveInfo.queue_population != null
              ? ` · queue ${liveInfo.queue_population}`
              : ""}
            {liveInfo.people_inside != null
              ? ` · inside ${liveInfo.people_inside}`
              : ""}
            {liveInfo.processing_rate_basis
              ? ` · rate basis ${liveInfo.processing_rate_basis}`
              : ""}
          </p>
        )}

        {predictionMessage && (
          <div className="forecast-message" role="alert">
            {predictionMessage}
          </div>
        )}

        {prediction && prediction.available && (
          <div className="darshan-result">
            <div className="darshan-result-head">
              <span className="forecast-tag">
                {prediction.data_source === "camera"
                  ? "Live camera counts"
                  : prediction.data_source === "hybrid"
                    ? "Camera and staff data"
                    : prediction.data_source === "staff"
                      ? "Staff records"
                      : "Available inputs only"}
              </span>
              {crowdLevel && (
                <span className="darshan-level">
                  {crowdDot} {crowdLevel} crowd
                </span>
              )}
            </div>

            <div className="darshan-result-grid">
              <div className="darshan-metric">
                <span>Queue waiting</span>
                <b>{formatMinutes(prediction.wait_minutes)}</b>
              </div>
              <div className="darshan-metric">
                <span>Darshan stage</span>
                <b>{formatMinutes(prediction.darshan_minutes)}</b>
              </div>
              <div className="darshan-metric highlight">
                <span>Total estimated time</span>
                <b>{formatMinutes(prediction.total_minutes)}</b>
              </div>
              <div className="darshan-metric">
                <span>Expected completion</span>
                <b>{formatClock(prediction.expected_completion)}</b>
              </div>
              <div className="darshan-metric">
                <span>Likely range</span>
                <b>
                  {formatMinutes(prediction.range?.low_minutes)} –{" "}
                  {formatMinutes(prediction.range?.high_minutes)}
                </b>
              </div>
              <div className="darshan-metric">
                <span>Confidence</span>
                <b>{prediction.confidence}</b>
              </div>
            </div>

            <p className="forecast-description">
              Method: {methodLabel(prediction.method)} · Data points:{" "}
              {formatDataPoints(prediction.historical_records)} · Queue trend:{" "}
              {prediction.queue_trend || "stable"}
              {prediction.model_mae_minutes != null
                ? ` · Model error ±${prediction.model_mae_minutes} min`
                : ""}
            </p>
            <p className="forecast-description">
              {prediction.forecast_note ||
                "This is a waiting-time estimate for the queue count supplied. It is not a forecast of future attendance."}{" "}
              Selected start: {selectedTime}.
            </p>
          </div>
        )}
      </section>

      <section className="modules-section forecast-section">
        <div className="forecast-section-heading">
          <div>
            <h3 className="section-title">Prediction Model</h3>
            <p className="forecast-description">
              The model trains only when enough records with a recorded waiting
              time exist. Otherwise the transparent queue baseline is used.
            </p>
          </div>
          <span className="forecast-tag">Admin</span>
        </div>

        <div className="forecast-button-row">
          <button
            type="button"
            className="forecast-secondary-button"
            onClick={handleTrain}
            disabled={training}
          >
            {training ? "Training…" : "Train model"}
          </button>
        </div>

        {model?.available ? (
          <p className="forecast-description">
            Model ready · trained on {model.records} records · mean error{" "}
            {model.mae_minutes} min · fallback error{" "}
            {model.fallback_mae_minutes} min ·{" "}
            {model.beats_fallback ? "beats baseline" : "baseline preferred"}
          </p>
        ) : (
          <p className="forecast-description">
            No trained model yet — the queue baseline will be used.
          </p>
        )}

        {modelMessage && (
          <div className="forecast-notice" role="status">
            {modelMessage}
          </div>
        )}
      </section>

      <section className="modules-section forecast-section">
        <h3 className="section-title">Darshan Time by Hour</h3>
        <p className="forecast-description">
          Recorded passes and entries. These bars are saved counts, not a
          predicted crowd. The highlighted column is the selected start time.
        </p>

        <div className="darshan-timeline">
          {timeSlots
            .filter((time) => timeToMinutes(time) <= timeToMinutes(recordedUntil))
            .map((time) => {
            const row = entries[time] || EMPTY_ENTRY;
            const passes = Number(row.passesIssued) || 0;
            const actualEntries = Number(row.actualEntries) || 0;
            const isTarget = time === selectedTime;
            return (
              <div
                className={`darshan-timeline-col ${
                  isTarget ? "is-target" : ""
                }`}
                key={time}
              >
                <div className="darshan-timeline-bars">
                  <div
                    className="darshan-bar darshan-bar-passes"
                    style={{ height: `${(passes / maxCount) * 100}%` }}
                    title={`Passes issued: ${passes}`}
                  ></div>
                  <div
                    className="darshan-bar darshan-bar-entries"
                    style={{ height: `${(actualEntries / maxCount) * 100}%` }}
                    title={`Actual entries: ${actualEntries}`}
                  ></div>
                </div>
                <span className="darshan-timeline-label">{time}</span>
              </div>
            );
          })}
        </div>
        <div className="darshan-legend">
          <span>
            <i className="darshan-dot darshan-dot-passes"></i> Passes issued
          </span>
          <span>
            <i className="darshan-dot darshan-dot-entries"></i> Actual entries
          </span>
        </div>
      </section>

      <section className="modules-section forecast-info">
        <h3>How the prediction works</h3>
        <p>
          Queue waiting time = people waiting ÷ processing rate. The darshan
          stage time = people inside ÷ processing rate, or the historical
          average darshan duration when available. The total is added to the
          selected start time. It does not predict a future crowd size. Passes issued show
          authorized entries, not how many devotees are inside. When enough
          staff-recorded waiting times exist, a Random Forest model is trained
          and blended with the baseline.
        </p>
      </section>
    </div>
  );
}

export default HourlyCrowdForecast;
