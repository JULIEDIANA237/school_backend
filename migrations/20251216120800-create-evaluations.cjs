module.exports = {
  async up(db) {
    await db.createCollection("evaluations", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["name", "subjectId", "classId", "periodId", "teacherId"],
          properties: {
            name: { bsonType: "string" },
            subjectId: { bsonType: "objectId" },
            classId: { bsonType: "objectId" },
            periodId: { bsonType: "objectId" },
            teacherId: { bsonType: "objectId" },
            maxScore: { bsonType: "double" },
            coefficient: { bsonType: "double" },
            date: { bsonType: "date" },
            isPublished: { bsonType: "bool" },
            createdAt: { bsonType: "date" },
            updatedAt: { bsonType: "date" }
          }
        }
      }
    });

    await db.collection("evaluations").createIndexes([
      { key: { classId: 1, periodId: 1 }, name: "index_eval_class_period" },
      { key: { teacherId: 1 }, name: "index_teacher" }
    ]);
  },

  async down(db) {
    await db.collection("evaluations").drop();
  }
};
