export const CROWD_THRESHOLDS = {
  LOW: { min: 0, max: 40, color: "#22C55E", label: "Less crowded", pillBg: "#DCFCE7", pillText: "#065F46" },
  MODERATE: { min: 41, max: 70, color: "#EAB308", label: "Busy", pillBg: "#FEF3C7", pillText: "#78350F" },
  HIGH: { min: 71, max: 90, color: "#F97316", label: "Very busy", pillBg: "#FFEDD5", pillText: "#7C2D12" },
  CRITICAL: { min: 91, max: 100, color: "#DC2626", label: "Too crowded", pillBg: "#FEE2E2", pillText: "#7F1D1D" },
  NO_DATA: { color: "#9CA3AF", label: "No information", pillBg: "#F3F4F6", pillText: "#374151" },
};

export function getCrowdLevel(density) {
  if (density === null || density === undefined || Number.isNaN(density)) {
    return "NO_DATA";
  }
  const d = Math.max(0, Math.min(100, Number(density)));
  if (d <= 40) return "LOW";
  if (d <= 70) return "MODERATE";
  if (d <= 90) return "HIGH";
  return "CRITICAL";
}

export function getCrowdColor(level, { density } = {}) {
  if (level) {
    return CROWD_THRESHOLDS[level]?.color || CROWD_THRESHOLDS.NO_DATA.color;
  }
  return CROWD_THRESHOLDS[getCrowdLevel(density)]?.color || CROWD_THRESHOLDS.NO_DATA.color;
}

export function getCrowdLabel(level, { density } = {}) {
  if (level) {
    return CROWD_THRESHOLDS[level]?.label || CROWD_THRESHOLDS.NO_DATA.label;
  }
  return CROWD_THRESHOLDS[getCrowdLevel(density)]?.label || CROWD_THRESHOLDS.NO_DATA.label;
}

export function getCrowdCardColors(level) {
  const entry = CROWD_THRESHOLDS[level] || CROWD_THRESHOLDS.NO_DATA;
  return { backgroundColor: entry.pillBg, color: entry.pillText };
}

export function computeDensity(people, capacity) {
  if (!capacity || capacity <= 0) return null;
  if (people === null || people === undefined) return null;
  const p = Number(people);
  if (!Number.isFinite(p) || p < 0) return null;
  return Math.round((p / capacity) * 100);
}
