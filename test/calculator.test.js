const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const calc = require("../src/modules/bulletins/bulletin.calculator");

const MATH = "m".repeat(24);
const FR = "f".repeat(24);
const SVT = "s".repeat(24);

const classSubjects = [
  { subjectId: MATH, coefficient: 4, group: 1 },
  { subjectId: FR, coefficient: 2, group: 2 },
  { subjectId: SVT, coefficient: 2, group: 1 },
];

describe("computeSubjectAverage", () => {
  test("ramène chaque note sur 20 et pondère par le coefficient de l'évaluation", () => {
    const evaluations = [
      { _id: "e1", maxScore: 10, coefficient: 1 }, // 5/10 -> 10/20
      { _id: "e2", maxScore: 20, coefficient: 3 }, // 16/20
    ];
    const scores = new Map([["e1", 5], ["e2", 16]]);
    // (10*1 + 16*3) / 4 = 14.5
    assert.equal(calc.computeSubjectAverage(evaluations, scores), 14.5);
  });

  test("ignore les évaluations sans note et renvoie null sans aucune note", () => {
    const evaluations = [{ _id: "e1", maxScore: 20, coefficient: 1 }, { _id: "e2", maxScore: 20, coefficient: 1 }];
    assert.equal(calc.computeSubjectAverage(evaluations, new Map([["e1", 12]])), 12);
    assert.equal(calc.computeSubjectAverage(evaluations, new Map()), null);
  });

  test("une note de 0 compte (ce n'est pas une absence de note)", () => {
    const evaluations = [{ _id: "e1", maxScore: 20, coefficient: 1 }, { _id: "e2", maxScore: 20, coefficient: 1 }];
    assert.equal(calc.computeSubjectAverage(evaluations, new Map([["e1", 0], ["e2", 10]])), 5);
  });
});

describe("computeSequenceAverages / computeGeneralAverage", () => {
  test("une matière sans aucune note est non classée et n'entre pas dans la moyenne générale", () => {
    const evaluations = [
      { _id: "e1", subject: MATH, maxScore: 20, coefficient: 1 },
      { _id: "e2", subject: FR, maxScore: 20, coefficient: 1 },
      // aucune évaluation en SVT
    ];
    const grades = [
      { evaluation: "e1", score: 15 },
      { evaluation: "e2", score: 9 },
    ];
    const averages = calc.computeSequenceAverages({ classSubjects, evaluations, grades });
    assert.deepEqual(
      averages.map((a) => [a.subject, a.average, a.coefficient]),
      [[MATH, 15, 4], [FR, 9, 2], [SVT, null, 2]],
    );
    // (15*4 + 9*2) / 6 = 13 — l'ancien calcul comptait SVT à 0 : (60+18+0)/8 = 9.75
    assert.equal(calc.computeGeneralAverage(averages), 13);
  });

  test("un élève sans aucune note a une moyenne générale null", () => {
    const averages = calc.computeSequenceAverages({ classSubjects, evaluations: [], grades: [] });
    assert.equal(calc.computeGeneralAverage(averages), null);
  });
});

describe("computeTrimesterAverages", () => {
  test("moyenne des séquences disponibles, notes de séquence conservées", () => {
    const sequences = [
      { periodId: "s1", name: "Séquence 1", averages: [{ subject: MATH, average: 12 }, { subject: FR, average: 8 }, { subject: SVT, average: null }] },
      { periodId: "s2", name: "Séquence 2", averages: [{ subject: MATH, average: 15 }, { subject: FR, average: null }, { subject: SVT, average: null }] },
    ];
    const averages = calc.computeTrimesterAverages({ classSubjects, sequences });
    const byId = Object.fromEntries(averages.map((a) => [a.subject, a]));

    assert.equal(byId[MATH].average, 13.5); // (12 + 15) / 2
    assert.equal(byId[FR].average, 8); // seule la séquence 1 est notée : pas de 0 pour la séquence 2
    assert.equal(byId[SVT].average, null);
    assert.deepEqual(byId[MATH].sequenceMarks, [
      { period: "s1", name: "Séquence 1", average: 12 },
      { period: "s2", name: "Séquence 2", average: 15 },
    ]);
    // (13.5*4 + 8*2) / 6 = 11.67
    assert.equal(calc.computeGeneralAverage(averages), 11.67);
  });
});

describe("rankWithTies", () => {
  test("les ex æquo partagent le rang, le suivant saute, les non classés n'ont pas de rang", () => {
    const ranks = calc.rankWithTies([
      { key: "a", value: 12 },
      { key: "b", value: 15 },
      { key: "c", value: 12 },
      { key: "d", value: null },
      { key: "e", value: 9 },
    ]);
    assert.equal(ranks.get("b"), 1);
    assert.equal(ranks.get("a"), 2);
    assert.equal(ranks.get("c"), 2);
    assert.equal(ranks.get("e"), 4);
    assert.equal(ranks.has("d"), false);
    assert.equal(ranks.size, 4);
  });
});

describe("summarize", () => {
  test("ignore les valeurs null, y compris pour le minimum (plus de faux 0 ou 20)", () => {
    assert.deepEqual(calc.summarize([20, null, 10]), { count: 2, min: 10, max: 20, average: 15, above10: 2 });
    assert.deepEqual(calc.summarize([null]), { count: 0, min: null, max: null, average: null, above10: 0 });
  });
});
