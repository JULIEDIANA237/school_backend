module.exports = {
  async up(db) {
    await db.createCollection("grades", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["evaluationId", "studentId"],
          properties: {
            evaluationId: { bsonType: "objectId" },
            studentId: { bsonType: "objectId" },
            score: { bsonType: "double" },
            comment: { bsonType: "string" },
            createdAt: { bsonType: "date" },
            updatedAt: { bsonType: "date" }
          }
        }
      }
    });

    await db.collection("grades").createIndexes([
      {
        key: { evaluationId: 1, studentId: 1 },
        unique: true,
        name: "unique_grade"
      }
    ]);
  },

  async down(db) {
    await db.collection("grades").drop();
  }
};
