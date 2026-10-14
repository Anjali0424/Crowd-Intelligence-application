import { useState } from "react";
import { mockHourlyCrowdData } from "../../data/mockHourlyCrowdData";

const LEVEL_COLORS = {
  LOW: "#16a34a",
  MODERATE: "#ca8a04",
  HIGH: "#dc2626",
  CRITICAL: "#991b1b",
};

function HourlyCrowdForecast() {
  const [selectedTime, setSelectedTime] = useState("3:00 PM");

  const selectedSlot = mockHourlyCrowdData.find(
    (item) => item.time === selectedTime
  );

  const maxPeople = Math.max(
    ...mockHourlyCrowdData.map((item) => item.expectedPeople)
  );

  return (
    <div className="admin-page-content">
      <div className="page-head">
        <h1>Hourly Crowd Forecast</h1>
        <p>View expected crowd levels at different times.</p>
      </div>

      {/* Selected Time */}
      <section className="modules-section">
        <h3 className="section-title">Select Time</h3>

        <select
          value={selectedTime}
          onChange={(event) => setSelectedTime(event.target.value)}
          style={{
            padding: "10px",
            borderRadius: "8px",
            width: "100%",
            maxWidth: "240px",
          }}
        >
          {mockHourlyCrowdData.map((item) => (
            <option key={item.time} value={item.time}>
              {item.time}
            </option>
          ))}
        </select>
      </section>

      {/* Summary Cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <h4>EXPECTED PEOPLE</h4>
          <h2>{selectedSlot.expectedPeople.toLocaleString()}</h2>
          <p>{selectedSlot.time}</p>
        </div>

        <div className="stat-card">
          <h4>EXPECTED ENTRIES</h4>
          <h2>{selectedSlot.expectedEntries.toLocaleString()}</h2>
          <p>{selectedSlot.time}</p>
        </div>

        <div className="stat-card">
          <h4>EXPECTED EXITS</h4>
          <h2>{selectedSlot.expectedExits.toLocaleString()}</h2>
          <p>{selectedSlot.time}</p>
        </div>
      </div>

      {/* Hourly Chart */}
      <section className="modules-section">
        <h3 className="section-title">Expected Crowd by Hour</h3>

        <div className="map-preview-card" style={{ padding: "20px" }}>
          {mockHourlyCrowdData.map((item) => (
            <div key={item.time} style={{ marginBottom: "20px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  marginBottom: "6px",
                }}
              >
                <span>{item.time}</span>
                <span>{item.expectedPeople.toLocaleString()} people</span>
              </div>

              <div
                style={{
                  height: "14px",
                  background: "#e5e7eb",
                  borderRadius: "8px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(item.expectedPeople / maxPeople) * 100}%`,
                    background: LEVEL_COLORS[item.crowdLevel],
                    borderRadius: "8px",
                  }}
                />
              </div>

              <small
                style={{
                  color: LEVEL_COLORS[item.crowdLevel],
                  fontWeight: 600,
                }}
              >
                {item.crowdLevel} CROWD
              </small>
            </div>
          ))}
        </div>
      </section>

      {/* Hourly Details Table */}
      <section className="modules-section">
        <h3 className="section-title">Hourly Details</h3>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "12px", textAlign: "left" }}>Time</th>
                <th style={{ padding: "12px", textAlign: "left" }}>People</th>
                <th style={{ padding: "12px", textAlign: "left" }}>Entries</th>
                <th style={{ padding: "12px", textAlign: "left" }}>Exits</th>
                <th style={{ padding: "12px", textAlign: "left" }}>Crowd</th>
              </tr>
            </thead>

            <tbody>
              {mockHourlyCrowdData.map((item) => (
                <tr key={item.time}>
                  <td style={{ padding: "12px" }}>{item.time}</td>
                  <td style={{ padding: "12px" }}>
                    {item.expectedPeople.toLocaleString()}
                  </td>
                  <td style={{ padding: "12px" }}>
                    {item.expectedEntries.toLocaleString()}
                  </td>
                  <td style={{ padding: "12px" }}>
                    {item.expectedExits.toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: "12px",
                      color: LEVEL_COLORS[item.crowdLevel],
                      fontWeight: 600,
                    }}
                  >
                    {item.crowdLevel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      
    </div>
  );
}

export default HourlyCrowdForecast;