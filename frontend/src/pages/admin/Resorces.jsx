import ResourceCard from "../../components/admin/ResourceCard";
import { mockAdminData } from "../../data/mockAdminData";

function Resources() {
  const { resources } = mockAdminData;

  const totalAvailable = resources.reduce((sum, r) => sum + r.available, 0);

  return (
    <div className="admin-page-content">
      <div className="page-head">
        <h1>Emergency Resources</h1>
        <p>{totalAvailable} units available right now</p>
      </div>

      <div className="resource-list">
        {resources.map((resource) => (
          <ResourceCard key={resource.id} resource={resource} />
        ))}
      </div>

      <div className="future-note">
        🤖 Live resource dispatch and status updates will be connected to
        the backend later.
      </div>
    </div>
  );
}

export default Resources;
