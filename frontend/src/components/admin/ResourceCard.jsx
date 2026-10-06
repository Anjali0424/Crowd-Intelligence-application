function ResourceCard({ resource }) {
  return (
    <div className="resource-card">
      <span className="resource-icon">{resource.icon}</span>

      <div className="resource-info">
        <span className="resource-name">{resource.name}</span>
        <span className="resource-count">
          {resource.available} Available
        </span>
      </div>

      <span className="resource-total">
        {resource.available}/{resource.total}
      </span>
    </div>
  );
}

export default ResourceCard;
