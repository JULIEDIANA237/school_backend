const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const rows = [
  // ─────────────────── Mathématiques (6e A) ───────────────────
  {
    Classe: "6e A",
    Matiere: "Mathématiques",
    Sequence: "Séquence 1",
    Ordre: 1,
    Titre: "Chapitre 1 : Nombres entiers et décimaux",
    Objectifs: "Écriture, comparaison, encadrement et repérage sur une demi-droite graduée",
    Seances: 4,
  },
  {
    Classe: "6e A",
    Matiere: "Mathématiques",
    Sequence: "Séquence 1",
    Ordre: 2,
    Titre: "Chapitre 2 : Droites perpendiculaires et droites parallèles",
    Objectifs: "Notion de droites sécantes, perpendiculaires, parallèles et tracés à la règle et à l'équerre",
    Seances: 3,
  },
  {
    Classe: "6e A",
    Matiere: "Mathématiques",
    Sequence: "Séquence 2",
    Ordre: 3,
    Titre: "Chapitre 3 : Addition, soustraction et multiplication décimales",
    Objectifs: "Techniques opératoires, calcul posé, calcul mental et résolution de problèmes de la vie courante",
    Seances: 4,
  },
  {
    Classe: "6e A",
    Matiere: "Mathématiques",
    Sequence: "Séquence 2",
    Ordre: 4,
    Titre: "Chapitre 4 : Segments, cercles et triangles",
    Objectifs: "Mesure de longueurs, milieu d'un segment, construction de triangles et report au compas",
    Seances: 3,
  },
  {
    Classe: "6e A",
    Matiere: "Mathématiques",
    Sequence: "Séquence 3",
    Ordre: 5,
    Titre: "Chapitre 5 : Fractions et partages",
    Objectifs: "Notion de quotient, écriture fractionnaire, fractions décimales et égalité de fractions",
    Seances: 4,
  },

  // ─────────────────── Français (6e A) ───────────────────
  {
    Classe: "6e A",
    Matiere: "Français",
    Sequence: "Séquence 1",
    Ordre: 1,
    Titre: "Module 1 : La rentrée des classes et la vie scolaire",
    Objectifs: "Lexique de l'école, phrase simple, ponctuation et récit au présent",
    Seances: 4,
  },
  {
    Classe: "6e A",
    Matiere: "Français",
    Sequence: "Séquence 1",
    Ordre: 2,
    Titre: "Module 2 : Le conte traditionnel africain",
    Objectifs: "Schéma narratif, personnages merveilleux, temps du récit (passé simple et imparfait)",
    Seances: 4,
  },
  {
    Classe: "6e A",
    Matiere: "Français",
    Sequence: "Séquence 2",
    Ordre: 3,
    Titre: "Module 3 : La description d'un lieu et de la nature",
    Objectifs: "Vocabulaire des sensations, adjectifs qualificatifs et organisation spatiale",
    Seances: 3,
  },

  // ─────────────────── Anglais (6e A) ───────────────────
  {
    Classe: "6e A",
    Matiere: "Anglais",
    Sequence: "Séquence 1",
    Ordre: 1,
    Titre: "Unit 1 : Alphabet, Greetings and Introductions",
    Objectifs: "Say hello/goodbye, spell your name, introduce yourself and others",
    Seances: 4,
  },
  {
    Classe: "6e A",
    Matiere: "Anglais",
    Sequence: "Séquence 1",
    Ordre: 2,
    Titre: "Unit 2 : School and Classroom Objects",
    Objectifs: "Identify objects in the classroom, use articles (a, an, the) and basic prepositions",
    Seances: 3,
  },
  {
    Classe: "6e A",
    Matiere: "Anglais",
    Sequence: "Séquence 2",
    Ordre: 3,
    Titre: "Unit 3 : Family Members and Relationships",
    Objectifs: "Talk about family tree, use possessive adjectives (my, your, his, her)",
    Seances: 4,
  },

  // ─────────────────── Informatique (6e A) ───────────────────
  {
    Classe: "6e A",
    Matiere: "Informatique",
    Sequence: "Séquence 1",
    Ordre: 1,
    Titre: "Notions de base de l'ordinateur et périphériques",
    Objectifs: "Distinguer matériel et logiciel, identifier l'unité centrale, écran, clavier, souris",
    Seances: 2,
  },
  {
    Classe: "6e A",
    Matiere: "Informatique",
    Sequence: "Séquence 1",
    Ordre: 2,
    Titre: "Démarrage, manipulation de la souris et clavier",
    Objectifs: "Allumage sécurisé, clic, double-clic, glisser-déposer et saisie de texte simple",
    Seances: 2,
  },
];

// Créer le classeur Excel
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(rows);

// Largeurs de colonnes pour une belle présentation dans Excel
ws["!cols"] = [
  { wch: 10 }, // Classe
  { wch: 18 }, // Matiere
  { wch: 15 }, // Sequence
  { wch: 8 },  // Ordre
  { wch: 45 }, // Titre
  { wch: 75 }, // Objectifs
  { wch: 10 }, // Seances
];

XLSX.utils.book_append_sheet(wb, ws, "Programmes_6eA");

// Cibles de sauvegarde
const target1 = path.resolve(__dirname, "../../Programme_Officiel_6eA_Test.xlsx");
const target2 = path.resolve(__dirname, "../../eduflow-pro/public/Programme_Officiel_6eA_Test.xlsx");

XLSX.writeFile(wb, target1);
console.log("Fichier Excel généré avec succès dans :", target1);

try {
  const publicDir = path.dirname(target2);
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  XLSX.writeFile(wb, target2);
  console.log("Copie dans eduflow-pro/public :", target2);
} catch (e) {
  console.warn("Notice copie public :", e.message);
}

