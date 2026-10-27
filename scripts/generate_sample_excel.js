const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const rows = [
  // ─────────────────── Mathématiques (6e A) ───────────────────
  // Module 1 (Séquence 1)
  {
    Classe: "6e A",
    Matiere: "Mathématiques",
    Sequence: "Séquence 1",
    Module: "Module 1 : Nombres entiers et décimaux",
    Lecon: "Leçon 1 : Écriture et lecture des nombres entiers et décimaux",
    Objectifs: "Distinguer partie entière et partie décimale, décomposition décimale",
    Heures: 1,
  },
  {
    Classe: "6e A",
    Matiere: "Mathématiques",
    Sequence: "Séquence 1",
    Module: "Module 1 : Nombres entiers et décimaux",
    Lecon: "Leçon 2 : Comparaison et encadrement des décimaux",
    Objectifs: "Ranger des nombres par ordre croissant et décroissant, utiliser les symboles < et >",
    Heures: 1,
  },
  {
    Classe: "6e A",
    Matiere: "Mathématiques",
    Sequence: "Séquence 1",
    Module: "Module 1 : Nombres entiers et décimaux",
    Lecon: "Leçon 3 : Demi-droite graduée et repérage",
    Objectifs: "Placer l'abscisse d'un point et lire l'abscisse d'un point repéré",
    Heures: 2,
  },

  // Module 2 (Séquence 1)
  {
    Classe: "6e A",
    Matiere: "Mathématiques",
    Sequence: "Séquence 1",
    Module: "Module 2 : Droites perpendiculaires et parallèles",
    Lecon: "Leçon 1 : Droites sécantes et droites perpendiculaires",
    Objectifs: "Identifier et tracer des droites perpendiculaires avec la règle et l'équerre",
    Heures: 1,
  },
  {
    Classe: "6e A",
    Matiere: "Mathématiques",
    Sequence: "Séquence 1",
    Module: "Module 2 : Droites perpendiculaires et parallèles",
    Lecon: "Leçon 2 : Droites parallèles et propriétés géométriques",
    Objectifs: "Construire deux droites parallèles passant par un point donné",
    Heures: 2,
  },

  // Module 3 (Séquence 2)
  {
    Classe: "6e A",
    Matiere: "Mathématiques",
    Sequence: "Séquence 2",
    Module: "Module 3 : Opérations sur les décimaux",
    Lecon: "Leçon 1 : Addition et soustraction décimales",
    Objectifs: "Calcul posé avec retenues et alignement des virgules",
    Heures: 2,
  },
  {
    Classe: "6e A",
    Matiere: "Mathématiques",
    Sequence: "Séquence 2",
    Module: "Module 3 : Opérations sur les décimaux",
    Lecon: "Leçon 2 : Multiplication des décimaux et résolution de problèmes",
    Objectifs: "Multiplier un décimal par un entier, résoudre des problèmes concrets d'achat",
    Heures: 2,
  },

  // ─────────────────── Français (6e A) ───────────────────
  // Module 1 (Séquence 1)
  {
    Classe: "6e A",
    Matiere: "Français",
    Sequence: "Séquence 1",
    Module: "Module 1 : La vie scolaire et citoyenne",
    Lecon: "Leçon 1 : Vocabulaire de l'école et de la rentrée",
    Objectifs: "Enrichir le lexique lié au collège, aux fournitures et aux acteurs de l'école",
    Heures: 1,
  },
  {
    Classe: "6e A",
    Matiere: "Français",
    Sequence: "Séquence 1",
    Module: "Module 1 : La vie scolaire et citoyenne",
    Lecon: "Leçon 2 : La phrase simple et la ponctuation",
    Objectifs: "Identifier sujet, verbe et compléments essentiels ; maîtriser la ponctuation",
    Heures: 1,
  },
  {
    Classe: "6e A",
    Matiere: "Français",
    Sequence: "Séquence 1",
    Module: "Module 1 : La vie scolaire et citoyenne",
    Lecon: "Leçon 3 : Le récit au présent de l'indicatif",
    Objectifs: "Raconter une journée d'école en respectant la chronologie",
    Heures: 2,
  },

  // Module 2 (Séquence 1)
  {
    Classe: "6e A",
    Matiere: "Français",
    Sequence: "Séquence 1",
    Module: "Module 2 : Le conte traditionnel africain",
    Lecon: "Leçon 1 : Structure et schéma narratif du conte",
    Objectifs: "Situation initiale, élément modificateur, péripéties et dénouement",
    Heures: 2,
  },
  {
    Classe: "6e A",
    Matiere: "Français",
    Sequence: "Séquence 1",
    Module: "Module 2 : Le conte traditionnel africain",
    Lecon: "Leçon 2 : Les personnages fabuleux et la morale",
    Objectifs: "Comprendre le rôle des animaux symboliques (lièvre, tortue, hyène) et la leçon de vie",
    Heures: 2,
  },

  // ─────────────────── Anglais (6e A) ───────────────────
  // Module 1 (Séquence 1)
  {
    Classe: "6e A",
    Matiere: "Anglais",
    Sequence: "Séquence 1",
    Module: "Unit 1 : Alphabet, Greetings & Introductions",
    Lecon: "Lesson 1 : Formal and informal greetings (Hello, Good morning, Bye)",
    Objectifs: "Greet people according to time of day and status, polite expressions",
    Heures: 1,
  },
  {
    Classe: "6e A",
    Matiere: "Anglais",
    Sequence: "Séquence 1",
    Module: "Unit 1 : Alphabet, Greetings & Introductions",
    Lecon: "Lesson 2 : English alphabet and spelling names",
    Objectifs: "Pronounce the letters, spell personal first and last names",
    Heures: 1,
  },
  {
    Classe: "6e A",
    Matiere: "Anglais",
    Sequence: "Séquence 1",
    Module: "Unit 1 : Alphabet, Greetings & Introductions",
    Lecon: "Lesson 3 : Introducing oneself and asking 'What is your name?'",
    Objectifs: "State name, age, nationality and ask simple introductory questions",
    Heures: 2,
  },

  // Module 2 (Séquence 1)
  {
    Classe: "6e A",
    Matiere: "Anglais",
    Sequence: "Séquence 1",
    Module: "Unit 2 : Classroom Objects and Daily Routine",
    Lecon: "Lesson 1 : Identifying objects in the classroom (pen, ruler, desk, board)",
    Objectifs: "Use articles (a, an, the) and plural forms of school items",
    Heures: 2,
  },
  {
    Classe: "6e A",
    Matiere: "Anglais",
    Sequence: "Séquence 1",
    Module: "Unit 2 : Classroom Objects and Daily Routine",
    Lecon: "Lesson 2 : Giving and following classroom instructions",
    Objectifs: "Imperative mood (Stand up, Sit down, Open your book, Listen carefully)",
    Heures: 1,
  },

  // ─────────────────── Informatique (6e A) ───────────────────
  // Module 1 (Séquence 1)
  {
    Classe: "6e A",
    Matiere: "Informatique",
    Sequence: "Séquence 1",
    Module: "Module 1 : Notions de base de l'ordinateur",
    Lecon: "Leçon 1 : Définition de l'informatique et rôle de l'ordinateur",
    Objectifs: "Comprendre le traitement automatique de l'information",
    Heures: 1,
  },
  {
    Classe: "6e A",
    Matiere: "Informatique",
    Sequence: "Séquence 1",
    Module: "Module 1 : Notions de base de l'ordinateur",
    Lecon: "Leçon 2 : Matériel (Hardware) et périphériques (Entrée / Sortie)",
    Objectifs: "Identifier écran, clavier, souris, unité centrale, imprimante, clé USB",
    Heures: 1,
  },
  {
    Classe: "6e A",
    Matiere: "Informatique",
    Sequence: "Séquence 1",
    Module: "Module 1 : Notions de base de l'ordinateur",
    Lecon: "Leçon 3 : Démarrage, arrêt et manipulation de la souris",
    Objectifs: "Mise sous tension ordonnée, clic, double-clic, glisser-déposer",
    Heures: 2,
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
  { wch: 42 }, // Module
  { wch: 45 }, // Lecon
  { wch: 75 }, // Objectifs
  { wch: 10 }, // Heures
];

XLSX.utils.book_append_sheet(wb, ws, "Programmes_Officiels_6eA");

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
