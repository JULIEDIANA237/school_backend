module.exports = {
  async up(db) {
    await db.createCollection("users", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["email", "passwordHash", "firstName", "lastName", "role"],
          properties: {
            email: { bsonType: "string" },
            passwordHash: { bsonType: "string" },
            firstName: { bsonType: "string" },
            lastName: { bsonType: "string" },
            avatarUrl: { bsonType: "string" },
            role: { enum: ["admin", "teacher", "parent"] }
          }
        }
      }
    });

    await db.collection("users").createIndexes([
      { key: { email: 1 }, unique: true, name: "unique_email" },
      { key: { role: 1 }, name: "role_index" }
    ]);
  },

  async down(db) {
    await db.collection("users").drop();
  }
};
