module.exports = {
  async up(db) {
    await db.createCollection("parent_students", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["parentId", "studentId"],
          properties: {
            parentId: { bsonType: "objectId" },
            studentId: { bsonType: "objectId" },
            relationship: { bsonType: "string" },
            createdAt: { bsonType: "date" }
          }
        }
      }
    });

    await db.collection("parent_students").createIndexes([
      { key: { parentId: 1, studentId: 1 }, unique: true, name: "unique_parent_student" }
    ]);
  },

  async down(db) {
    await db.collection("parent_students").drop();
  }
};
