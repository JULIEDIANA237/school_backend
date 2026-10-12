const BulletinService = require("./bulletin.service");
const Bulletin = require("./bulletin.model");
const { sendError, httpError } = require("../../utils/httpError");
const { assertClassAccess, isPrincipalTeacher, sameId } = require("../../utils/access");

const appreciationFor = (average) => {
  if (average === null || average === undefined) return "Non classé";
  if (average >= 16) return "Très Bien";
  if (average >= 14) return "Bien";
  if (average >= 12) return "Assez Bien";
  if (average >= 10) return "Passable";
  return "Insuffisant";
};

const studentLabel = (student, fallback) =>
  student ? `${String(student.lastName || "").toUpperCase()} ${student.firstName || ""}`.trim() : fallback;

const summaryOf = (b) => ({
  studentName: studentLabel(b.student, "Inconnu"),
  className: b.class?.name,
  periodName: b.period?.name,
  periodType: b.period?.type ?? null,
  year: b.period?.year || "N/A",
  average: b.generalAverage ?? null,
  rank: b.rank ?? null,
  classifiedCount: b.classifiedCount ?? null,
  status: b.isPublished ? "PUBLISHED" : "DRAFT",
});

const assertTeacherCanPublish = async (user, classId) => {
  if (user.role === "teacher" && !(await isPrincipalTeacher(user.id, classId))) {
    throw httpError(403, "Seul le professeur principal peut publier ces bulletins.");
  }
};

const BulletinController = {
  // Recalcule un bulletin (et donc sa classe, pour des rangs cohérents)
  async createOrUpdate(req, res) {
    try {
      const { studentId, classId, periodId } = req.body || {};
      const bulletin = await BulletinService.calculateBulletin(studentId, classId, periodId);
      res.status(200).json({ message: "Bulletin généré", data: bulletin });
    } catch (error) {
      sendError(res, error);
    }
  },

  async getByClass(req, res) {
    try {
      const { classId, periodId } = req.params;
      res.status(200).json(await BulletinService.getBulletinsByClass(classId, periodId));
    } catch (error) {
      sendError(res, error, 500);
    }
  },

  async publish(req, res) {
    try {
      const bulletin = await Bulletin.findById(req.params.bulletinId).select("class").lean();
      if (!bulletin) return res.status(404).json({ error: "Bulletin introuvable" });
      await assertTeacherCanPublish(req.user, bulletin.class);
      const published = await BulletinService.publishBulletin(req.params.bulletinId);
      res.status(200).json({ message: "Bulletin publié", data: published });
    } catch (error) {
      sendError(res, error, 500);
    }
  },

  async getPublishedForParent(req, res) {
    try {
      const bulletins = await BulletinService.getPublishedByParent(req.user.id, req.query.periodId);
      res.status(200).json(bulletins.map((b) => ({ ...b, ...summaryOf(b), status: "PUBLISHED" })));
    } catch (error) {
      sendError(res, error, 500);
    }
  },

  async getAll(req, res) {
    try {
      const { period, class: classId } = req.query;
      const bulletins = await BulletinService.getAllBulletins(period, classId);
      res.status(200).json(
        bulletins.map((b) => ({
          _id: b._id,
          student: b.student?._id,
          period: b.period?._id,
          ...summaryOf(b),
          studentName: studentLabel(b.student, "Étudiant inconnu"),
          className: b.class ? b.class.name : "Classe inconnue",
          periodName: b.period ? b.period.name : "Période inconnue",
        })),
      );
    } catch (error) {
      sendError(res, error, 500);
    }
  },

  async getById(req, res) {
    try {
      const bulletin = await BulletinService.getBulletinById(req.params.bulletinId);
      if (!bulletin) return res.status(404).json({ error: "Bulletin introuvable" });

      if (req.user.role === "parent") {
        const isOwner = (bulletin.student?.parents || []).some((p) => sameId(p, req.user.id));
        if (!isOwner || !bulletin.isPublished) return res.status(404).json({ error: "Bulletin introuvable" });
      } else if (req.user.role === "teacher") {
        await assertClassAccess(req.user, bulletin.class?._id);
      }

      const sequenceMarks = {};
      for (const a of bulletin.averages || []) {
        if (!a.sequenceMarks?.length) continue;
        sequenceMarks[String(a.subject?._id || a.subject)] = Object.fromEntries(
          a.sequenceMarks.map((m) => [m.name || "Seq", m.average]),
        );
      }
      // Anciens bulletins : notes de séquence lues dans les bulletins de séquence
      for (const sb of bulletin.childBulletins || []) {
        const seqName = sb.period?.name || "Seq";
        for (const avg of sb.averages || []) {
          if (!avg.subject) continue;
          const sid = String(avg.subject._id || avg.subject);
          sequenceMarks[sid] = { ...(sequenceMarks[sid] || {}), [seqName]: avg.average };
        }
      }

      const { childBulletins, ...rest } = bulletin;
      res.status(200).json({
        ...rest,
        ...summaryOf(bulletin),
        matricule: bulletin.student?.matricule,
        photo: bulletin.student?.photo,
        principalTeacher: bulletin.class?.principalTeacher,
        isClosed: bulletin.period?.isClosed ?? false,
        grades: (bulletin.averages || []).map((a) => {
          const sid = String(a.subject?._id || a.subject);
          return {
            subject: sid,
            subjectName: a.subject?.name,
            coefficient: a.coefficient,
            group: a.group || 1,
            average: a.average ?? null,
            min: a.min,
            max: a.max,
            rank: a.rank,
            classAverage: a.classAverage,
            teacherName: a.teacherName,
            sequenceMarks: sequenceMarks[sid] || {},
            appreciation: appreciationFor(a.average),
          };
        }),
      });
    } catch (error) {
      sendError(res, error, 500);
    }
  },

  // Génère les bulletins d'une classe sans effacer les appréciations ni les décisions
  async generateForClass(req, res) {
    try {
      const { classId, periodId, template } = req.body || {};
      if (!classId || !periodId) return res.status(400).json({ error: "classId et periodId sont requis." });

      const result = await BulletinService.generateForClass(classId, periodId, template);
      const notes = [];
      if (result.unclassified) notes.push(`${result.unclassified} élève(s) sans aucune note (non classés)`);
      if (result.skipped) notes.push(`${result.skipped} élève(s) ignoré(s) : bulletin déjà publié dans une autre classe`);
      if (result.unpublishedEvaluations) notes.push(`${result.unpublishedEvaluations} évaluation(s) encore non publiée(s) incluse(s)`);

      res.status(200).json({
        message: `${result.generated} bulletins générés (${result.periodType} - ${result.periodName}) avec rangs.${
          notes.length ? ` ${notes.join(" ; ")}.` : ""
        }`,
        ...result,
      });
    } catch (error) {
      sendError(res, error, 500);
    }
  },

  async updateDetails(req, res) {
    try {
      const { teacherComment, decisions } = req.body || {};
      const bulletin = await BulletinService.updateDetails(req.params.bulletinId, { teacherComment, decisions }, req.user);
      res.status(200).json({ message: "Détails mis à jour", data: bulletin });
    } catch (error) {
      sendError(res, error, 500);
    }
  },

  async bulkPublish(req, res) {
    try {
      const { classId, periodId } = req.body || {};
      if (!classId || !periodId) return res.status(400).json({ error: "classId et periodId sont requis." });
      await assertTeacherCanPublish(req.user, classId);
      const count = await BulletinService.bulkPublishBulletins(classId, periodId);
      res.status(200).json({ message: `${count} bulletins publiés avec succès.` });
    } catch (error) {
      sendError(res, error, 500);
    }
  },

  async unpublish(req, res) {
    try {
      const bulletin = await BulletinService.unpublishBulletin(req.params.bulletinId);
      res.status(200).json({ message: "Bulletin dépublié", data: bulletin });
    } catch (error) {
      sendError(res, error, 500);
    }
  },

  async bulkUnpublish(req, res) {
    try {
      const { classId, periodId } = req.body || {};
      if (!classId || !periodId) return res.status(400).json({ error: "classId et periodId sont requis." });
      const count = await BulletinService.bulkUnpublishBulletins(classId, periodId);
      res.status(200).json({ message: `${count} bulletins dépubliés avec succès.` });
    } catch (error) {
      sendError(res, error, 500);
    }
  },

  // Vérification publique d'un QR code de bulletin
  async verify(req, res) {
    try {
      const result = await BulletinService.verifyBulletin(req.params.bulletinId, req.params.code);
      res.status(result.valid ? 200 : 404).json(result);
    } catch (error) {
      sendError(res, error, 500);
    }
  },
};

module.exports = BulletinController;
