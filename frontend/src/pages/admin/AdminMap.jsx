
import { mockAdminData } from "../../data/mockAdminData";
import TempleMap from "../../components/user/TempleMap";

const EMOJI = {
  LOW: "🟢",
  MODERATE: "🟡",
  HIGH: "🔴",
  CRITICAL: "🔴",
};

function AdminMap() {
  const { mapZones, crowd } = mockAdminData;

  return (
    <div className="admin-page-content">
      <div className="page-head">
        <h1>Temple Crowd Map</h1>
        <p>Crowd density across the complete temple path</p>
      </div>

      {/* Existing schematic preview retained */}
      <div className="map-preview-card">
        <span className="mock-badge">SCHEMATIC PREVIEW</span>

        <div className="map-schematic map-schematic-full">
          {mapZones.map((zone, i) => {
            const zoneData = crowd.zones.find(
              (z) =>
                z.name.startsWith(zone.name) ||
                zone.name.startsWith(z.name)
            );

            return (
              <span key={zone.name} className="map-schematic-line">
                <span
                  className={`map-node lvl lvl-${zone.level.toLowerCase()}`}
                >
                  {zone.name} {EMOJI[zone.level]}
                </span>

                {zoneData && (
                  <span className="map-node-count">
                    {zoneData.people} people
                  </span>
                )}

                {i < mapZones.length - 1 && (
                  <span className="map-down">↓</span>
                )}
              </span>
            );
          })}
        </div>
      </div>

      {/* Existing devotee map reused in admin */}
      <div className="map-preview-card">
        <span className="mock-badge">INTERACTIVE TEMPLE MAP</span>

        <div className="temple-map-container">
          <TempleMap
            showUser={false}
            showFacilities={true}
            showRoute={true}
          />
        </div>
      </div>

      {/* Existing note retained */}
      <div className="future-note">
        🗺️ Interactive temple map reused from the devotee dashboard.
      </div>
    </div>
  );
}

export default AdminMap;
