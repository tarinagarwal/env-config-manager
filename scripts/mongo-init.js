// MongoDB initialization script for Docker deployment
db = db.getSiblingDB("env-config-manager");

// Create collections with validation
db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["email", "createdAt"],
      properties: {
        email: {
          bsonType: "string",
          pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
        },
      },
    },
  },
});

// Create indexes for performance
db.users.createIndex({ email: 1 }, { unique: true });
db.projects.createIndex({ ownerId: 1 });
db.environments.createIndex({ projectId: 1 });
db.variables.createIndex({ environmentId: 1 });
db.variables.createIndex({ deletedAt: 1 });
db.auditLogs.createIndex({ userId: 1 });
db.auditLogs.createIndex({ createdAt: -1 });
db.auditLogs.createIndex({ resourceType: 1, resourceId: 1 });

print("MongoDB initialization completed successfully");
