module.exports = {
  async up(db) {
    await db.createCollection("bulletins", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["studentId", "periodId", "classId"],
          properties: {
            studentId: { bsonType: "objectId" },
            periodId: { bsonType: "objectId" },
            classId: { bsonType: "objectId" },
            generalAverage: { bsonType: "double" },
            rank: { bsonType: "int" },
            teacherComment: { bsonType: "string" },
            principalComment: { bsonType: "string" },
            isPublished: { bsonType: "bool" },
            publishedAt: { bsonType: "date" },
            createdAt: { bsonType: "date" },
            updatedAt: { bsonType: "date" }
          }
        }
      }
    });

    await db.collection("bulletins").createIndexes([
      {
        key: { studentId: 1, periodId: 1 },
        unique: true,
        name: "unique_bulletin"
      }
    ]);
  },

  async down(db) {
    await db.collection("bulletins").drop();
  }
};
