const TeacherAssignment = require("./teacherAssignment.model");

const TeacherAssignmentService = {
  async assign(data) {
    return await TeacherAssignment.findOneAndUpdate(
      {
        teacherId: data.teacherId,
        classId: data.classId,
        subjectId: data.subjectId,
        schoolYearId: data.schoolYearId,
      },
      data,
      { upsert: true, new: true }
    );
  },

  async getAssignments(query) {
    return await TeacherAssignment.find(query)
      .populate("teacherId", "firstName lastName")
      .populate("classId", "name")
      .populate("subjectId", "name");
  },

  async removeAssignment(id) {
    return await TeacherAssignment.findByIdAndDelete(id);
  }
};

module.exports = TeacherAssignmentService;
