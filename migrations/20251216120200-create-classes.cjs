module.exports = {
  async up(db) {
    await db.createCollection("classes", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["name", "level", "academicYear"],
          properties: {
            name: { bsonType: "string" },
            level: { bsonType: "string" },
            academicYear: { bsonType: "string" },
            createdAt: { bsonType: "date" },
            updatedAt: { bsonType: "date" }
          }
        }
      }
    });

    await db.collection("classes").createIndexes([
      { key: { name: 1, academicYear: 1 }, unique: true, name: "unique_class_year" }
    ]);
  },

  async down(db) {
    await db.collection("classes").drop();
  }
};
