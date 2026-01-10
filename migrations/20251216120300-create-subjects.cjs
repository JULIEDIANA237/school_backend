module.exports = {
  async up(db) {
    await db.createCollection("subjects", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["name", "code", "coefficient"],
          properties: {
            name: { bsonType: "string" },
            code: { bsonType: "string" },
            coefficient: { bsonType: "double" },
            createdAt: { bsonType: "date" },
            updatedAt: { bsonType: "date" }
          }
        }
      }
    });

    await db.collection("subjects").createIndexes([
      { key: { code: 1 }, unique: true, name: "unique_code" }
    ]);
  },

  async down(db) {
    await db.collection("subjects").drop();
  }
};
