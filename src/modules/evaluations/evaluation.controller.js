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

/* ============================
   ✏️ ÉDITION D’UNE ÉVALUATION
============================ */
const updateEvaluation = async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.user.id;

    const evaluation = await evalService.updateEvaluation(
      id,
      teacherId,
      req.body
    );

    return res.status(200).json({
      message: "Evaluation updated",
      data: evaluation
    });

  } catch (error) {
    console.error("🔥 BACK ERROR:", error);
  return res.status(400).json({ error: error.message });
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
    
    const teacherId = req.user && req.user.role === "teacher" ? req.user.id : undefined;

    console.log("🧪 classId =", classId);
    console.log("🧪 periodId =", periodId);
    console.log("🧪 teacherId =", teacherId);

    const evaluations =
      await evalService.getEvaluationsByClass(classId, periodId, teacherId);

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

const unpublishEvaluation = async (req, res) => {
  try {
    const evaluation = await evalService.unpublishEvaluation(req.params.id, req.user.id);
    res.json({ message: "Evaluation unpublished", data: evaluation });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const bulkUnpublish = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: "ids must be an array" });
    }
    const result = await evalService.unpublishManyEvaluations(ids, req.user.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const addGrade = async (req, res) => {
  console.log("📥 [EvaluationController] addGrade called with body:", req.body, "params:", req.params);
  try {
    const { score, comment, studentId } = req.body;
    if (!studentId || score === undefined) {
      return res.status(400).json({ error: "studentId and score are required" });
    }
    
    // req.user.id is the teacher's ID from JWT middleware
    const grade = await evalService.addGrade(req.params.id, req.user.id, studentId, score, comment);
    console.log("✅ [EvaluationController] grade added:", grade);
    res.status(201).json({ message: "Grade added", data: grade });
  } catch (error) {
    console.error("❌ [EvaluationController] addGrade error:", error.message);
    res.status(400).json({ error: error.message });
  }
};

const deleteEvaluation = async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.user.id;
    const result = await evalService.deleteEvaluation(id, teacherId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  createEvaluation,
  updateEvaluation,
  listEvaluations,
  publishEvaluation,
  unpublishEvaluation,
  bulkUnpublish,
  addGrade,
  deleteEvaluation
};
