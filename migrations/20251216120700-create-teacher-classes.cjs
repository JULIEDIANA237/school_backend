module.exports = {
  async up(db) {
    await db.createCollection("teacher_classes", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["teacherId", "classId", "subjectId"],
          properties: {
            teacherId: { bsonType: "objectId" },
            classId: { bsonType: "objectId" },
            subjectId: { bsonType: "objectId" },
            createdAt: { bsonType: "date" }
          }
        }
      }
    });

    await db.collection("teacher_classes").createIndexes([
      {
        key: { teacherId: 1, classId: 1, subjectId: 1 },
        unique: true,
        name: "unique_teacher_class_subject"
      }
    ]);
  },

  async down(db) {
    await db.collection("teacher_classes").drop();
  }
};
