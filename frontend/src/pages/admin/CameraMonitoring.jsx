import CameraCard from "../../components/admin/CameraCard";
import { mockAdminData } from "../../data/mockAdminData";

function CameraMonitoring() {
  const { cameras } = mockAdminData;

  return (
    <div className="admin-page-content">
      <div className="page-head">
        <h1>Camera Monitoring</h1>
        <p>
          {cameras.online} / {cameras.total} feeds online
        </p>
      </div>

      <div className="camera-grid">
        {cameras.list.map((camera) => (
          <CameraCard key={camera.id} camera={camera} />
        ))}
      </div>

      <div className="future-note">
        🤖 RTSP streaming, OpenCV and YOLOv11 inference will be connected
        here — coming later.
      </div>
    </div>
  );
}

export default CameraMonitoring;
