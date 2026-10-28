import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import templeImage from "../../assets/images/temple.jpg";
import { getCameraCounts } from "../../services/crowdService";
import { translateData } from "../../i18n";
import { getSpeechLang } from "../../services/chatbotService";
import {
  getDarshanCurrent,
  formatClock,
  predictDarshanArrival,
} from "../../services/darshanService";
import { getCrowdCardColors } from "../../utils/crowdLevel";
import "./UserHome.css";

const LEVEL_META = {
  LOW: { dot: "🟢" },
  MODERATE: { dot: "🟡" },
  HIGH: { dot: "🟠" },
  CRITICAL: { dot: "🔴" },
};

const CROWD_TEXT_KEY = {
  LOW: "levels.lessCrowded",
  MODERATE: "levels.busy",
  HIGH: "levels.veryCrowded",
  CRITICAL: "levels.tooCrowded",
};

function crowdText(t, level) {
  const key = CROWD_TEXT_KEY[level];
  return key ? t(key) : t("levels.noInfo");
}

function levelFromDensity(density) {
  if (density === null || density === undefined) return null;
  if (density < 40) return "LOW";
  if (density < 70) return "MODERATE";
  if (density < 90) return "HIGH";
  return "CRITICAL";
}

const DARSHAN_TYPES = [
  "Sarva Darshan",
  "Special Entry Darshan",
  "Divya Darshan",
];

function formatHm(value) {
  if (!value || typeof value !== "string") return "—";
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(2000, 0, 1, Number(match[1]), Number(match[2]));
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatIsoDate(value) {
  if (!value || typeof value !== "string") return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDuration(t, value) {
  if (value === null || value === undefined) return "—";
  const total = Math.round(Number(value));
  if (!Number.isFinite(total)) return "—";
  if (total < 60) return t("home.time.durMin", { count: total });
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (minutes === 0) return t("home.time.durHour", { count: hours });
  return t("home.time.durHourMin", { hours, minutes });
}

function UserHome() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [crowd, setCrowd] = useState(null);
  const [darshan, setDarshan] = useState(null);
  const [darshanLoading, setDarshanLoading] = useState(true);
  const [darshanStale, setDarshanStale] = useState(false);
  const [darshanError, setDarshanError] = useState("");
  const [showDarshanTimePicker, setShowDarshanTimePicker] = useState(false);
  const [selectedDarshanTime, setSelectedDarshanTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;
  });
  const [selectedDarshanType, setSelectedDarshanType] = useState("Sarva Darshan");
  const [selectedTimePrediction, setSelectedTimePrediction] = useState(null);
  const [selectedTimePredictionLoading, setSelectedTimePredictionLoading] = useState(false);
  const [selectedTimePredictionError, setSelectedTimePredictionError] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [speakError, setSpeakError] = useState(false);

  const darshanRef = useRef(null);
  const darshanRequest = useRef(0);

  const loadDarshan = useCallback(async () => {
    const requestId = darshanRequest.current + 1;
    darshanRequest.current = requestId;
    setDarshanLoading(true);
    try {
      const res = await getDarshanCurrent();
      if (requestId !== darshanRequest.current) return;
      const prediction =
        res?.prediction && typeof res.prediction === "object"
          ? res.prediction
          : null;
      setDarshan(prediction);
      setDarshanStale(false);
      setDarshanError("");
    } catch (err) {
      if (requestId !== darshanRequest.current) return;
      setDarshanStale(true);
      setDarshanError(
        err?.message || ""
      );
    } finally {
      if (requestId === darshanRequest.current) setDarshanLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDarshan();
    const timer = setInterval(loadDarshan, 60000);
    return () => clearInterval(timer);
  }, [loadDarshan]);

  useEffect(() => {
    let mounted = true;
    let timer;

    async function load() {
      try {
        const res = await getCameraCounts();
        if (!mounted) return;
        const zones = {};
        for (const camera of res.cameras || []) {
          if (!camera.zone_id || !(camera.available && camera.has_count)) {
            continue;
          }
          const capacity = camera.capacity || 0;
          const density = capacity
            ? Math.round(((camera.people_count || 0) / capacity) * 100)
            : 0;
          if (!zones[camera.zone_id] || density > zones[camera.zone_id].density) {
            zones[camera.zone_id] = {
              area: camera.zone_name,
              people: camera.people_count,
              capacity,
              density,
            };
          }
        }
        const best = Object.values(zones).sort(
          (a, b) => b.density - a.density
        )[0];
        setCrowd(best || null);
      } catch (err) {
        if (!mounted) return;
        setCrowd(null);
      }
    }

    load();
    timer = setInterval(load, 12000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const appLang = (i18n.language || "en").slice(0, 2);
  const languageCode = ["en", "hi", "mr", "te"].includes(appLang)
    ? appLang
    : "en";

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch (err) {
          /* ignore */
        }
      }
    };
  }, []);

  const crowdLevel = darshan?.available ? darshan.crowd_level : null;

  const speechSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const buildEstimateSpeech = () => {
    if (!darshan || !darshan.available) return "";
    const parts = [t("home.time.title")];
    if (darshan.wait_minutes !== null && darshan.wait_minutes !== undefined) {
      parts.push(
        `${t("home.time.waiting")}: ${formatDuration(t, darshan.wait_minutes)}`
      );
    }
    if (darshan.total_minutes !== null && darshan.total_minutes !== undefined) {
      parts.push(
        `${t("home.time.total")}: ${formatDuration(t, darshan.total_minutes)}`
      );
    }
    if (darshan.expected_completion) {
      parts.push(
        `${t("home.time.finish")} ${formatClock(darshan.expected_completion)}`
      );
    }
    if (darshan.crowd_level) {
      parts.push(
        `${t("home.time.crowd")}: ${crowdText(t, darshan.crowd_level)}`
      );
    }
    return parts.join(". ");
  };

  const stopSpeaking = () => {
    if (speechSupported) {
      try {
        window.speechSynthesis.cancel();
      } catch (err) {
        /* ignore */
      }
    }
    setSpeaking(false);
  };

  const toggleSpeech = () => {
    if (!speechSupported) {
      setSpeakError(true);
      return;
    }
    if (speaking) {
      stopSpeaking();
      return;
    }
    setSpeakError(false);
    const text = buildEstimateSpeech();
    if (!text) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = getSpeechLang(languageCode);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      setSpeaking(false);
      setSpeakError(true);
    }
  };

  const handleSelectedTimePrediction = async () => {
    if (!selectedDarshanTime) {
      setSelectedTimePredictionError("Please select an arrival time.");
      return;
    }
    if (!selectedDarshanType) {
      setSelectedTimePredictionError("Please select a darshan type.");
      return;
    }

    setSelectedTimePredictionLoading(true);
    setSelectedTimePredictionError("");
    setSelectedTimePrediction(null);

    try {
      const res = await predictDarshanArrival({
        arrivalTime: selectedDarshanTime,
        darshanType: selectedDarshanType,
      });

      const totalMinutes = Number(res?.total_time_minutes);
      if (!res?.available || !Number.isFinite(totalMinutes)) {
        setSelectedTimePredictionError(
          res?.message ||
            "A prediction is not available for that arrival. Please choose another time."
        );
        return;
      }

      setSelectedTimePrediction({
        arrivalTime: formatHm(res.arrival_time),
        arrivalDate: formatIsoDate(res.arrival_date),
        darshanType: res.darshan_type,
        totalMinutes: res.total_time_minutes,
        waitMinutes: res.queue_wait_minutes,
        durationMinutes: res.darshan_duration_minutes,
        completionTime: formatHm(res.expected_completion),
        crossesMidnight: Boolean(res.crosses_midnight),
        warning: res.demo_warning,
      });
      setShowDarshanTimePicker(false);
    } catch (err) {
      setSelectedTimePredictionError(
        err?.message || "Unable to get a prediction right now. Please try again."
      );
    } finally {
      setSelectedTimePredictionLoading(false);
    }
  };

  const scrollToDarshan = () => {
    if (darshanRef.current) {
      darshanRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const services = [
    {
      id: "darshan",
      icon: "⏱️",
      name: t("home.svcDarshan"),
      action: scrollToDarshan,
    },
    { id: "crowd", icon: "👥", name: t("home.svcCrowd"), to: "/user/crowd" },
    { id: "map", icon: "🗺️", name: t("home.svcMap"), to: "/user/map" },
    {
      id: "navigation",
      icon: "🧭",
      name: t("home.svcNavigate"),
      to: "/user/navigation",
    },
    { id: "route", icon: "🛣️", name: t("home.svcRoute"), to: "/user/route" },
    { id: "entries", icon: "🚪", name: t("home.svcEntry"), to: "/user/entries" },
    { id: "exits", icon: "🚪", name: t("home.svcExit"), to: "/user/exits" },
    { id: "alerts", icon: "🚨", name: t("home.svcAlerts"), to: "/user/alerts" },
    {
      id: "profile",
      icon: "👤",
      name: t("home.svcProfile"),
      to: "/user/profile",
    },
  ];

  return (
    <div className="dh-home">
      <section className="dh-hero">
        <img
          className="dh-hero-img"
          src={templeImage}
          alt=""
          aria-hidden="true"
        />
        <div className="dh-hero-overlay" aria-hidden="true" />

        <div className="dh-hero-content">
          <p className="dh-hero-kicker">{t("home.heroKicker")}</p>
          <h1 className="dh-hero-title">{t("home.greeting")}</h1>
          <p className="dh-hero-sub">{t("home.greetingSub")}</p>
        </div>

        <button
          type="button"
          className="dh-hero-crowd"
          onClick={() => navigate("/user/crowd")}
          aria-label={t("home.viewCrowd")}
        >
          <span className="dh-hero-crowd-label">{t("home.liveCrowd")}</span>
          <span className="dh-hero-crowd-status">
            {levelFromDensity(crowd?.density)
              ? `${LEVEL_META[levelFromDensity(crowd.density)].dot} ${t(
                  "levels." + levelFromDensity(crowd.density)
                )}`
              : t("home.noData")}
          </span>
          <span className="dh-hero-crowd-area">
            {crowd ? translateData(t, crowd.area) : t("home.monitoringStatus")}
          </span>
          <span className="dh-hero-crowd-meta">
            {crowd
              ? t("home.peopleFull", {
                  people: crowd.people,
                  capacity: crowd.capacity,
                  density: crowd.density,
                })
              : t("home.countingNotActive")}
          </span>
        </button>
      </section>

      <section className="dh-actions dh-tirupati-ai-section" aria-label={t("home.askTitle")}>
        <button
          type="button"
          className="dh-tirupati-ai-button"
          onClick={() => navigate("/user/ai-chat")}
          aria-label={t("home.askTitle")}
        >
          <span className="dh-tirupati-ai-robot" aria-hidden="true">
            🤖
          </span>
          <span className="dh-tirupati-ai-title">{t("home.askTitle")}</span>
          <span className="dh-tirupati-ai-subtitle">{t("home.askSubtitle")}</span>
        </button>
      </section>

      <section className="dh-services">
        <div className="dh-section-head">
          <h2 className="dh-section-title">{t("home.servicesTitle")}</h2>
          {/* <h1
            className="dh-section-title dh-section-title-large"
            aria-hidden="true"
          >
            {t("home.servicesTitle")}
          </h1> */}
          <span className="dh-section-sub">{t("home.servicesSub")}</span>
        </div>

        <div className="dh-service-grid">
          {services.map((service) => (
            <button
              key={service.id}
              type="button"
              className="dh-service-card"
              onClick={() =>
                service.action ? service.action() : navigate(service.to)
              }
            >
              <span className="dh-service-icon" aria-hidden="true">
                {service.icon}
              </span>
              <span className="dh-service-name">{service.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section
        className="dh-darshan"
        aria-labelledby="dh-darshan-title"
        ref={darshanRef}
      >
        <div className="dh-darshan-head">
          <div className="dh-darshan-title-wrap">
            <span className="dh-darshan-icon" aria-hidden="true">
              🛕
            </span>
            <div>
              <h3 id="dh-darshan-title" className="dh-darshan-title">
                {t("home.time.title")}
              </h3>
              <p className="dh-darshan-subtitle">{t("home.time.subtitle")}</p>
            </div>
          </div>
        </div>

        {darshanLoading && !darshan ? (
          <p className="dh-darshan-state">{t("common.loading")}</p>
        ) : darshan && darshan.available ? (
          <>
            <div className="dh-time-hero">
              <span className="dh-time-hero-label">
                {crowdLevel ? `${LEVEL_META[crowdLevel].dot} ` : ""}
                {t("home.time.finish")}
              </span>
              <b className="dh-time-hero-value">
                {formatClock(darshan.expected_completion)}
              </b>
            </div>

            <div className="dh-darshan-grid">
              <div className="dh-darshan-metric">
                <span>⏳ {t("home.time.waiting")}</span>
                <b>{formatDuration(t, darshan.wait_minutes)}</b>
              </div>
              <div className="dh-darshan-metric">
                <span>🕒 {t("home.time.darshan")}</span>
                <b>{formatDuration(t, darshan.darshan_minutes)}</b>
              </div>
              <div className="dh-darshan-metric">
                <span>⏱️ {t("home.time.total")}</span>
                <b>{formatDuration(t, darshan.total_minutes)}</b>
              </div>
              <div
                className="dh-darshan-metric"
                style={crowdLevel ? getCrowdCardColors(crowdLevel) : undefined}
              >
                <span>👥 {t("home.time.crowd")}</span>
                <b>{crowdLevel ? crowdText(t, crowdLevel) : "—"}</b>
              </div>
            </div>

            <div className="dh-time-actions">
              <button
                type="button"
                className="dh-time-btn"
                onClick={loadDarshan}
                disabled={darshanLoading}
              >
                🔄 {t("home.time.refresh")}
              </button>
              <button
                type="button"
                className="dh-time-btn"
                onClick={() => navigate("/user/crowd")}
              >
                🗺️ {t("home.time.map")}
              </button>
              <button
                type="button"
                className="dh-time-btn"
                onClick={() => {
                  setShowDarshanTimePicker((open) => !open);
                  setSelectedTimePredictionError("");
                }}
              >
                💬 {t("home.time.ask")}
              </button>
              {speechSupported ? (
                <button
                  type="button"
                  className="dh-time-btn"
                  onClick={toggleSpeech}
                >
                  {speaking
                    ? `⏹️ ${t("home.time.stop")}`
                    : `🔊 ${t("home.time.listen")}`}
                </button>
              ) : null}
            </div>

            {speakError ? (
              <p className="dh-darshan-hint">{t("home.time.speechUnsupported")}</p>
            ) : null}

            <p className="dh-darshan-note">
              {darshan.generated_at
                ? t("home.time.updated", {
                    time: formatClock(darshan.generated_at),
                  })
                : t("home.darshanNote")}
              {darshanLoading ? ` · ${t("common.loading")}` : ""}
              {darshanStale ? ` · ${t("home.time.outdated")}` : ""}
              {" "}
              {darshan.method === "historical-ml"
                ? t("home.time.estimateModel")
                : darshan.method === "combined"
                  ? t("home.time.estimateCombined")
                  : t("home.time.estimateQueue")}
              {darshanError ? ` ${darshanError}` : ""}
            </p>
          </>
        ) : (
          <>
            <p className="dh-darshan-state">{t("home.time.unavailable")}</p>
            <span className="dh-darshan-hint">
              {darshanError || t("home.time.unavailableHint")}
            </span>
            <div className="dh-time-actions">
              <button
                type="button"
                className="dh-time-btn"
                onClick={loadDarshan}
                disabled={darshanLoading}
              >
                🔄 {t("home.time.refresh")}
              </button>
              <button
                type="button"
                className="dh-time-btn"
                onClick={() => navigate("/user/crowd")}
              >
                🗺️ {t("home.time.map")}
              </button>
              <button
                type="button"
                className="dh-time-btn"
                onClick={() => {
                  setShowDarshanTimePicker((open) => !open);
                  setSelectedTimePredictionError("");
                }}
              >
                💬 {t("home.time.ask")}
              </button>
            </div>
          </>
        )}

        {showDarshanTimePicker && (
          <div
            className="dh-darshan-time-picker"
            style={{
              marginTop: "14px",
              padding: "16px",
              borderRadius: "14px",
              border: "1px solid #d4eadb",
              background: "#f4fbf6",
            }}
          >
            <label
              htmlFor="planned-darshan-type"
              style={{
                display: "block",
                marginBottom: "8px",
                color: "#14532d",
                fontWeight: 700,
              }}
            >
              Darshan type
            </label>
            <select
              id="planned-darshan-type"
              value={selectedDarshanType}
              onChange={(event) => setSelectedDarshanType(event.target.value)}
              style={{
                display: "block",
                width: "100%",
                minHeight: "46px",
                boxSizing: "border-box",
                marginBottom: "14px",
                padding: "10px 12px",
                border: "1px solid #b8dcc5",
                borderRadius: "10px",
                background: "#ffffff",
                color: "#14532d",
                fontSize: "16px",
              }}
            >
              {DARSHAN_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <label
              htmlFor="planned-darshan-time"
              style={{
                display: "block",
                marginBottom: "10px",
                color: "#14532d",
                fontWeight: 700,
              }}
            >
              Select your planned arrival time
            </label>
            <input
              id="planned-darshan-time"
              type="time"
              value={selectedDarshanTime}
              onChange={(event) => setSelectedDarshanTime(event.target.value)}
              style={{
                display: "block",
                width: "100%",
                minHeight: "46px",
                boxSizing: "border-box",
                padding: "10px 12px",
                border: "1px solid #b8dcc5",
                borderRadius: "10px",
                background: "#ffffff",
                color: "#14532d",
                fontSize: "16px",
              }}
            />
            <p
              style={{
                margin: "10px 0 0",
                color: "#537568",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              Selected time: {selectedDarshanTime
                ? formatClock(`2000-01-01T${selectedDarshanTime}:00`)
                : "Choose a time"}
            </p>
            <button
              type="button"
              className="dh-time-btn"
              style={{ marginTop: "12px", width: "100%" }}
              onClick={handleSelectedTimePrediction}
              disabled={selectedTimePredictionLoading || !selectedDarshanTime}
            >
              {selectedTimePredictionLoading
                ? "Predicting darshan time…"
                : selectedTimePredictionError
                  ? "Retry"
                  : "Done"}
            </button>
            {selectedTimePredictionLoading ? (
              <p className="dh-darshan-state" role="status">
                Predicting darshan time…
              </p>
            ) : null}
            {selectedTimePredictionError ? (
              <p className="dh-darshan-hint" role="alert">
                {selectedTimePredictionError}
              </p>
            ) : null}
          </div>
        )}

        {selectedTimePrediction ? (
          <div className="dh-darshan-time-picker" style={{
            marginTop: "14px",
            padding: "16px",
            borderRadius: "14px",
            border: "1px solid #d4eadb",
            background: "#f4fbf6",
          }} role="status">
            <h4 style={{ margin: "0 0 10px", color: "#14532d" }}>
              🛕 Your Darshan Time Estimate
            </h4>
            <p style={{ margin: "6px 0" }}>
              <strong>Planned arrival:</strong>{" "}
              {selectedTimePrediction.arrivalDate
                ? `${selectedTimePrediction.arrivalTime}, ${selectedTimePrediction.arrivalDate}`
                : selectedTimePrediction.arrivalTime}
            </p>
            {selectedTimePrediction.darshanType ? (
              <p style={{ margin: "6px 0" }}>
                <strong>Darshan type:</strong> {selectedTimePrediction.darshanType}
              </p>
            ) : null}
            {selectedTimePrediction.waitMinutes !== null ? (
              <p style={{ margin: "6px 0" }}>
                <strong>Estimated queue wait:</strong>{" "}
                {formatDuration(t, selectedTimePrediction.waitMinutes)}
              </p>
            ) : null}
            {selectedTimePrediction.durationMinutes !== null &&
            selectedTimePrediction.durationMinutes !== undefined ? (
              <p style={{ margin: "6px 0" }}>
                <strong>Darshan duration:</strong>{" "}
                {formatDuration(t, selectedTimePrediction.durationMinutes)}
              </p>
            ) : null}
            <p style={{ margin: "6px 0" }}>
              <strong>Total time required:</strong>{" "}
              {formatDuration(t, selectedTimePrediction.totalMinutes)}
            </p>
            <p style={{ margin: "6px 0" }}>
              <strong>Expected completion:</strong>{" "}
              {selectedTimePrediction.completionTime}
              {selectedTimePrediction.crossesMidnight ? " (next day)" : ""}
            </p>
            {selectedTimePrediction.warning ? (
              <p style={{ margin: "10px 0 0", color: "#537568", fontSize: "12px" }}>
                {selectedTimePrediction.warning}
              </p>
            ) : null}
            <button
              type="button"
              className="dh-time-btn"
              style={{ marginTop: "12px", width: "100%" }}
              onClick={() => {
                setSelectedTimePrediction(null);
                setShowDarshanTimePicker(true);
              }}
            >
              Change time
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default UserHome;
