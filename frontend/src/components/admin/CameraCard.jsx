function CameraCard({ camera }) {
  const isAlert = camera.status === "ALERT";

  return (
    <div className={`camera-card ${isAlert ? "camera-alert" : ""}`}>
      <div className="camera-thumb">
        <span className="camera-ico">📹</span>
        <span
          className={`camera-dot ${isAlert ? "offline" : "online"}`}
        ></span>
      </div>

      <div className="camera-info">
        <span className="camera-id">{camera.id}</span>
        <span className="camera-zone">{camera.zone}</span>
      </div>

      <span
        className={`camera-status ${isAlert ? "is-alert" : "is-online"}`}
      >
        {isAlert ? "ALERT" : "ONLINE"}
      </span>
    </div>
  );
}

export default CameraCard;
