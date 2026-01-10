module.exports = {
  async up(db) {
    await db.createCollection("students", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["firstName", "lastName", "dateOfBirth"],
          properties: {
            firstName: { bsonType: "string" },
            lastName: { bsonType: "string" },
            dateOfBirth: { bsonType: "date" },
            classId: { bsonType: "objectId" },
            photoUrl: { bsonType: "string" },
            createdAt: { bsonType: "date" },
            updatedAt: { bsonType: "date" }
          }
        }
      }
    });
    await db.collection("students").createIndexes([
      { key: { classId: 1 }, name: "index_class" }
    ]);
  },
  async down(db) {
    await db.collection("students").drop();
  }
};
