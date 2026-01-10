module.exports = {
  async up(db) {
    await db.createCollection("periods", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["name", "startDate", "endDate", "academicYear"],
          properties: {
            name: { bsonType: "string" },
            startDate: { bsonType: "date" },
            endDate: { bsonType: "date" },
            academicYear: { bsonType: "string" },
            isActive: { bsonType: "bool" },
            createdAt: { bsonType: "date" },
            updatedAt: { bsonType: "date" }
          }
        }
      }
    });
    await db.collection("periods").createIndexes([
      { key: { name: 1, academicYear: 1 }, unique: true, name: "unique_period_year" }
    ]);
  },
  async down(db) {
    await db.collection("periods").drop();
  }
};
