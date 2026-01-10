const Service = require("./teacherAssignment.service");

const TeacherAssignmentController = {
  async assign(req, res) {
    try {
      const assignment = await Service.assignTeacher(req.body);
      res.status(201).json(assignment);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async unassign(req, res) {
    try {
      await Service.unassignTeacher(req.params.id);
      res.json({ message: "Affectation supprimée" });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async myClasses(req, res) {
  console.log("USER ID =", req.user.id);
  const data = await Service.getTeacherClasses(req.user.id);
  console.log("CLASSES TROUVÉES =", data);
  res.json(data);
},


  async classSubjects(req, res) {
    const data = await Service.getClassSubjects(req.params.classId);
    res.json(data);
  }
};

module.exports = TeacherAssignmentController;
