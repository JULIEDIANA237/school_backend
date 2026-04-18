const BulletinService = require("./bulletin.service");

const BulletinController = {
  // Créer ou mettre à jour un bulletin (individuel)
  async createOrUpdate(req, res) {
    try {
      const { studentId, classId, periodId } = req.body;
      const bulletin = await BulletinService.calculateBulletin(studentId, classId, periodId);
      res.status(200).json({ message: "Bulletin généré", data: bulletin });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message || "Erreur lors de la création du bulletin" });
    }
  },

  // Récupérer tous les bulletins d'une classe pour une période
  async getByClass(req, res) {
    try {
      const { classId, periodId } = req.params;
      const bulletins = await BulletinService.getBulletinsByClass(classId, periodId);
      res.status(200).json(bulletins);
    } catch (error) {
      res.status(500).json({ error: "Erreur lors de la récupération des bulletins" });
    }
  },

  // Publier un bulletin
  async publish(req, res) {
    try {
      const { bulletinId } = req.params;
      if (req.user.role === "teacher") {
        const bulletinBefore = await require("./bulletin.model").findById(bulletinId).populate("class");
        if (!bulletinBefore) return res.status(404).json({ error: "Bulletin introuvable" });
        if (bulletinBefore.class.principalTeacher?.toString() !== req.user.id) {
          return res.status(403).json({ error: "Seul le professeur principal peut publier ce bulletin." });
        }
      }
      const bulletin = await BulletinService.publishBulletin(bulletinId);
      res.status(200).json({ message: "Bulletin publié", data: bulletin });
    } catch (error) {
      res.status(500).json({ error: "Erreur lors de la publication du bulletin" });
    }
  },

  // Récupérer les bulletins publiés pour les parents
  async getPublishedForParent(req, res) {
    try {
      const parentId = req.user.id;
      const { periodId } = req.query;
      const bulletins = await BulletinService.getPublishedByParent(parentId, periodId);
      res.status(200).json(bulletins);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erreur lors de la récupération des bulletins publiés" });
    }
  },

  // Récupérer tous les bulletins (admin/secrétariat)
  async getAll(req, res) {
    try {
      const { period, class: classId } = req.query;
      const bulletins = await BulletinService.getAllBulletins(period, classId);
      const mapped = bulletins.map(b => ({
        _id: b._id,
        student: b.student?._id,
        studentName: b.student ? `${b.student.lastName.toUpperCase()} ${b.student.firstName}` : "Étudiant inconnu",
        className: b.class ? b.class.name : "Classe inconnue",
        period: b.period?._id,
        periodName: b.period ? b.period.name : "Période inconnue",
        periodType: b.period ? b.period.type : null,
        year: "2024-2025",
        average: b.generalAverage || 0,
        rank: b.rank || 0,
        status: b.isPublished ? "PUBLISHED" : "DRAFT"
      }));
      res.status(200).json(mapped);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erreur lors de la récupération de tous les bulletins" });
    }
  },

  // Récupérer un bulletin détaillé
  async getById(req, res) {
    try {
      const { bulletinId } = req.params;
      const bulletin = await BulletinService.getBulletinById(bulletinId);
      if (!bulletin) return res.status(404).json({ error: "Bulletin introuvable" });

      const isTrimestre = bulletin.period?.type === "TRIMESTRE";
      const sequenceMarks = {};

      if (isTrimestre && bulletin.childBulletins) {
        bulletin.childBulletins.forEach(sb => {
          const seqName = sb.period?.name || "Seq";
          if (!sb.averages) return;
          sb.averages.forEach(avg => {
            if (!avg.subject) return;
            const sid = (avg.subject._id || avg.subject).toString();
            if (!sequenceMarks[sid]) sequenceMarks[sid] = {};
            sequenceMarks[sid][seqName] = avg.average;
          });
        });
      }

      const mapped = {
        ...bulletin,
        studentName: bulletin.student
          ? `${bulletin.student.lastName.toUpperCase()} ${bulletin.student.firstName}`
          : "Inconnu",
        matricule: bulletin.student?.matricule,
        photo: bulletin.student?.photo,
        className: bulletin.class?.name,
        periodName: bulletin.period?.name,
        periodType: bulletin.period?.type,
        year: "2024-2025",
        average: bulletin.generalAverage || 0,
        rank: bulletin.rank || 0,
        status: bulletin.isPublished ? "PUBLISHED" : "DRAFT",
        grades: (bulletin.averages || []).map(a => {
          const sid = (a.subject?._id || a.subject)?.toString();
          return {
            subject: sid,
            subjectName: a.subject?.name,
            coefficient: a.coefficient,
            average: a.average,
            sequenceMarks: sequenceMarks[sid] || {},
            appreciation:
              a.average >= 16 ? "Très Bien" :
              a.average >= 14 ? "Bien" :
              a.average >= 12 ? "Assez Bien" :
              a.average >= 10 ? "Passable" : "Insuffisant"
          };
        })
      };

      res.status(200).json(mapped);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erreur lors de la récupération du bulletin" });
    }
  },

  // ============================================================
  // Générer les bulletins pour toute une classe
  // - Supprime d'abord les anciens bulletins de la période
  // - Régénère avec la liste complète des matières (ClassSubject)
  // - Calcule les rangs
  // ============================================================
  async generateForClass(req, res) {
    try {
      const { classId, periodId } = req.body;
      if (!classId || !periodId) {
        return res.status(400).json({ error: "classId et periodId sont requis." });
      }

      const Period = require("../periods/period.model");
      const period = await Period.findById(periodId);
      if (!period) return res.status(404).json({ error: "Période introuvable." });

      const Bulletin = require("./bulletin.model");
      const Student = require("../students/student.model");

      // Vérification: si TRIMESTRE, les séquences enfants doivent avoir des bulletins
      if (period.type === "TRIMESTRE") {
        const childSeqs = await Period.find({ parentPeriod: periodId, type: "SEQUENCE" });
        if (!childSeqs.length) {
          return res.status(400).json({
            error: `Aucune SÉQUENCE rattachée au TRIMESTRE '${period.name}'. Vérifiez la configuration des périodes.`
          });
        }
        const firstStudent = await Student.findOne({ class: classId });
        if (firstStudent) {
          const seqBulletinCount = await Bulletin.countDocuments({
            student: firstStudent._id,
            period: { $in: childSeqs.map(s => s._id) }
          });
          if (seqBulletinCount === 0) {
            return res.status(400).json({
              error: `⚠️ Générez d'abord les SÉQUENCES (${childSeqs.map(s => s.name).join(', ')}) avant le TRIMESTRE.`
            });
          }
        }
      }

      const students = await Student.find({ class: classId });
      console.log(`🚀 Génération ${period.type} '${period.name}' - ${students.length} élèves`);

      if (students.length === 0) {
        return res.status(400).json({ error: "Aucun élève trouvé pour cette classe." });
      }

      // 🗑️ Supprimer les anciens bulletins pour forcer une régénération complète avec 14 matières
      const deleteResult = await Bulletin.deleteMany({ class: classId, period: periodId });
      console.log(`🗑️ ${deleteResult.deletedCount} anciens bulletins supprimés - régénération en cours...`);

      const results = [];
      const errors = [];
      for (const student of students) {
        try {
          const b = await BulletinService.calculateBulletin(student._id, classId, periodId);
          results.push(b);
        } catch (err) {
          errors.push({ student: student._id, name: `${student.lastName} ${student.firstName}`, error: err.message });
          console.error(`❌ Échec pour ${student.lastName} ${student.firstName}: ${err.message}`);
        }
      }

      // Calcul des rangs après génération
      if (results.length > 0) {
        await BulletinService.calculateRanksForClass(classId, periodId);
        console.log(`🏆 Rangs calculés pour ${results.length} bulletins`);
      }

      res.status(200).json({
        message: `${results.length} bulletins générés (${period.type} - ${period.name}) avec rangs.`,
        errors: errors.length ? errors : undefined
      });
    } catch (error) {
      console.error("❌ Erreur generateForClass:", error);
      res.status(500).json({ error: "Erreur: " + error.message });
    }
  }
};

module.exports = BulletinController;
