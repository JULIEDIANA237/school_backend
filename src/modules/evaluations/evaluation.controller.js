const evalService = require("./evaluation.service");

const createEvaluation = async (req, res) => {
  try {
    const data = {
      ...req.body,
      teacher: req.user.id // du middleware JWT
    };
    const evaluation = await evalService.createEvaluation(data);
    res.status(201).json({ message: "Evaluation created", data: evaluation });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// evaluation.controller.js
const listEvaluations = async (req, res) => {
  try {
    console.log("🎮 CONTROLLER listEvaluations");
    console.log("➡️ req.params =", req.params);
    console.log("➡️ req.query =", req.query);

    const { classId } = req.params;
    const { periodId } = req.query;

    console.log("🧪 classId =", classId);
    console.log("🧪 periodId =", periodId);

    const evaluations =
      await evalService.getEvaluationsByClass(classId, periodId);

    res.json({ data: evaluations });
  } catch (error) {
    console.error("❌ CONTROLLER ERROR =", error.message);
    res.status(400).json({ error: error.message });
  }
};



const publishEvaluation = async (req, res) => {
  try {
    const evaluation = await evalService.publishEvaluation(req.params.id);
    res.json({ message: "Evaluation published", data: evaluation });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const addGrade = async (req, res) => {
  try {
    const { score, comment } = req.body;
    const grade = await evalService.addGrade(req.params.id, req.body.studentId, score, comment);
    res.status(201).json({ message: "Grade added", data: grade });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  createEvaluation,
  listEvaluations,
  publishEvaluation,
  addGrade
};
