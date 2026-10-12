/**
 * Calcul des moyennes — fonctions pures, sans accès à la base.
 *
 * Règles :
 * - Une note est ramenée sur 20 (score / maxScore × 20) puis pondérée par le coefficient de l'évaluation.
 * - Une matière dans laquelle l'élève n'a AUCUNE note sur la période est « non classée » (moyenne null) :
 *   elle n'entre pas dans la moyenne générale et son coefficient n'est pas compté.
 * - Moyenne trimestrielle d'une matière = moyenne des séquences du trimestre où l'élève a une note.
 * - Un élève sans aucune matière classée a une moyenne générale null et n'est pas classé.
 * - Classement « compétition » : les ex æquo partagent le rang, le suivant saute (1, 1, 3).
 */

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const idOf = (value) => String(value?._id ?? value);

/**
 * @param {{_id, maxScore?, coefficient?}[]} evaluations évaluations d'une matière
 * @param {Map<string, number|null>} scoresByEvaluation notes de l'élève, indexées par id d'évaluation
 * @returns {number|null}
 */
const computeSubjectAverage = (evaluations, scoresByEvaluation) => {
  let weighted = 0;
  let totalCoef = 0;
  for (const evaluation of evaluations) {
    const score = scoresByEvaluation.get(idOf(evaluation._id));
    if (score === null || score === undefined || !Number.isFinite(Number(score))) continue;
    const maxScore = evaluation.maxScore > 0 ? evaluation.maxScore : 20;
    const coefficient = evaluation.coefficient > 0 ? evaluation.coefficient : 1;
    weighted += (Number(score) / maxScore) * 20 * coefficient;
    totalCoef += coefficient;
  }
  return totalCoef ? round2(weighted / totalCoef) : null;
};

/** Moyenne générale pondérée par les coefficients des matières classées. */
const computeGeneralAverage = (averages) => {
  let weighted = 0;
  let totalCoef = 0;
  for (const a of averages) {
    if (a.average === null || a.average === undefined) continue;
    const coefficient = a.coefficient > 0 ? a.coefficient : 1;
    weighted += a.average * coefficient;
    totalCoef += coefficient;
  }
  return totalCoef ? round2(weighted / totalCoef) : null;
};

const subjectMeta = (classSubject) => ({
  subject: idOf(classSubject.subjectId),
  coefficient: classSubject.coefficient > 0 ? classSubject.coefficient : 1,
  group: classSubject.group || 1,
});

/**
 * Moyennes d'une séquence pour un élève.
 * @param {object} p
 * @param {{subjectId, coefficient, group}[]} p.classSubjects matières de la classe
 * @param {{_id, subject, maxScore, coefficient}[]} p.evaluations évaluations de la classe sur la séquence
 * @param {{evaluation, score}[]} p.grades notes de l'élève
 */
const computeSequenceAverages = ({ classSubjects, evaluations, grades }) => {
  const scores = new Map(grades.map((g) => [idOf(g.evaluation), g.score]));
  return classSubjects.map((cs) => {
    const meta = subjectMeta(cs);
    const subjectEvaluations = evaluations.filter((e) => idOf(e.subject) === meta.subject);
    return { ...meta, average: computeSubjectAverage(subjectEvaluations, scores) };
  });
};

/**
 * Moyennes d'un trimestre à partir des moyennes de ses séquences.
 * @param {object} p
 * @param {{subjectId, coefficient, group}[]} p.classSubjects
 * @param {{periodId, name, averages: {subject, average}[]}[]} p.sequences séquences du trimestre, dans l'ordre
 */
const computeTrimesterAverages = ({ classSubjects, sequences }) =>
  classSubjects.map((cs) => {
    const meta = subjectMeta(cs);
    const sequenceMarks = sequences.map((seq) => {
      const match = seq.averages.find((a) => idOf(a.subject) === meta.subject);
      return { period: seq.periodId, name: seq.name, average: match ? match.average ?? null : null };
    });
    const available = sequenceMarks.filter((m) => m.average !== null);
    const average = available.length
      ? round2(available.reduce((sum, m) => sum + m.average, 0) / available.length)
      : null;
    return { ...meta, average, sequenceMarks };
  });

/**
 * Classement avec ex æquo. Les valeurs null ne sont pas classées.
 * @param {{key: string, value: number|null}[]} entries
 * @returns {Map<string, number>} rang par clé (absent = non classé)
 */
const rankWithTies = (entries) => {
  const ranks = new Map();
  const sorted = entries
    .filter((e) => e.value !== null && e.value !== undefined)
    .sort((a, b) => b.value - a.value);
  let previous = null;
  let rank = 0;
  sorted.forEach((entry, index) => {
    if (previous === null || entry.value < previous) {
      rank = index + 1;
      previous = entry.value;
    }
    ranks.set(entry.key, rank);
  });
  return ranks;
};

/** Statistiques d'une série de moyennes (valeurs null ignorées). */
const summarize = (values) => {
  const list = values.filter((v) => v !== null && v !== undefined);
  if (!list.length) return { count: 0, min: null, max: null, average: null, above10: 0 };
  const sum = list.reduce((s, v) => s + v, 0);
  return {
    count: list.length,
    min: Math.min(...list),
    max: Math.max(...list),
    average: round2(sum / list.length),
    above10: list.filter((v) => v >= 10).length,
  };
};

module.exports = {
  round2,
  computeSubjectAverage,
  computeGeneralAverage,
  computeSequenceAverages,
  computeTrimesterAverages,
  rankWithTies,
  summarize,
};
