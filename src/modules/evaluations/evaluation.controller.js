const evalService = require("./evaluation.service");
const { sendError } = require("../../utils/httpError");

const handle = (fn, successStatus = 200) => async (req, res) => {
  try {
    res.status(successStatus).json(await fn(req));
  } catch (error) {
    sendError(res, error);
  }
};

const createEvaluation = handle(async (req) => ({
  message: "Evaluation created",
  data: await evalService.createEvaluation(req.body || {}, req.user.id),
}), 201);

const updateEvaluation = handle(async (req) => ({
  message: "Evaluation updated",
  data: await evalService.updateEvaluation(req.params.id, req.user.id, req.body || {}),
}));

const listEvaluations = handle(async (req) => ({
  data: await evalService.getEvaluationsByClass(req.params.classId, req.query.periodId, req.user),
}));

const publishEvaluation = handle(async (req) => ({
  message: "Evaluation published",
  data: await evalService.publishEvaluation(req.params.id, req.user.id),
}));

const unpublishEvaluation = handle(async (req) => ({
  message: "Evaluation unpublished",
  data: await evalService.unpublishEvaluation(req.params.id, req.user.id),
}));

const bulkUnpublish = async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length > 200) {
    return res.status(400).json({ error: "ids doit être un tableau (200 éléments maximum)" });
  }
  try {
    res.json(await evalService.unpublishManyEvaluations(ids, req.user.id));
  } catch (error) {
    sendError(res, error);
  }
};

const deleteEvaluation = handle((req) => evalService.deleteEvaluation(req.params.id, req.user.id));

module.exports = {
  createEvaluation,
  updateEvaluation,
  listEvaluations,
  publishEvaluation,
  unpublishEvaluation,
  bulkUnpublish,
  deleteEvaluation,
};
