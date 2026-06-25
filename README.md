# Eduflow Backend - Documentation de Développement

Ce projet constitue l'API backend pour **Eduflow Pro**, une application de gestion scolaire et de génération de bulletins. Ce backend est développé en **Node.js** avec le framework **Express** et utilise **MongoDB** (via Mongoose) comme base de données principale.

---

## 🚀 Stack Technique

- **Runtime :** Node.js (CommonJS)
- **Framework :** Express.js
- **Base de données :** MongoDB avec l'ORM Mongoose
- **Sécurité :** JWT (JSON Web Tokens), Helmet, Express Rate Limit, Bcryptjs
- **Services tiers :** Nodemailer (envoi de mails), Twilio (envoi de SMS)
- **Outils de développement :** Nodemon, TypeScript & ts-node (uniquement pour les scripts de seed)

---

## ⚙️ Configuration Locale

### 1. Prérequis
- Node.js (v18+)
- Une instance locale de MongoDB ou un compte MongoDB Atlas

### 2. Installation des dépendances
Depuis la racine du dossier `school_backend` :
```bash
npm install
```

### 3. Variables d'environnement
Créez ou modifiez le fichier `.env` à la racine du projet `school_backend` :
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/report_card
JWT_SECRET=votre_secret_jwt_securise
FRONTEND_URL=http://localhost:8080

# Configuration SMTP (Emails)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=votre_email@gmail.com
MAIL_PASS=votre_mot_de_passe_application_gmail

# Configuration Twilio (SMS - Optionnel)
TWILIO_ACCOUNT_SID=votre_sid_twilio
TWILIO_AUTH_TOKEN=votre_token_auth_twilio
TWILIO_FROM_NUMBER=votre_numero_twilio
```

---

## 🗄️ Structure de la Base de Données

Le projet utilise **Mongoose** pour la modélisation des données. Les entités principales sont :

```mermaid
erDiagram
    SCHOOLYEAR ||--o{ PERIOD : "contient"
    PERIOD ||--o{ PERIOD : "parent de (ex: Trimestre contient Séquences)"
    CLASS }|--|| CYCLE : "appartient à"
    STUDENT }|--|| CLASS : "inscrit dans"
    USER ||--o{ TEACHER_ASSIGNMENT : "est enseignant"
    CLASS ||--o{ TEACHER_ASSIGNMENT : "a pour enseignant"
    SUBJECT ||--o{ TEACHER_ASSIGNMENT : "est enseignée par"
    CLASS ||--o{ EVALUATION : "concerne"
    SUBJECT ||--o{ EVALUATION : "évalue"
    PERIOD ||--o{ EVALUATION : "a lieu pendant"
    EVALUATION ||--o{ GRADE : "contient"
    STUDENT ||--o{ GRADE : "obtient"
    BULLETIN ||--|| STUDENT : "appartient à"
    BULLETIN ||--|| PERIOD : "généré pour"
```

### Modèles Principaux (`src/modules/*/`):
- **User (Utilisateurs/Auth) :** Gère les rôles (`ADMIN`, `TEACHER`, `STUDENT`, `PARENT`) et l'authentification.
- **SchoolYear (Années scolaires) :** Modélise l'année académique active (ex: `2024-2025`).
- **Period (Périodes) :** Gère les découpages académiques (`TRIMESTRE` ou `SEQUENCE`).
- **Cycle :** Cycles d'études (ex: `MATERNELLE`, `PRIMAIRE`, `SECONDAIRE`).
- **Class (Classes) :** Classes associées à un cycle.
- **Subject (Matières) :** Matières enseignées.
- **Student (Élèves) :** Données personnelles de l'étudiant et liaison à sa classe.
- **TeacherAssignment (Attributions) :** Table de liaison entre enseignant, classe et matière.
- **Evaluation :** Contrôles/Devoirs créés par les enseignants pour une classe, une matière et une période.
- **Grade (Notes) :** Notes individuelles des élèves liées à une évaluation.
- **Bulletin :** Moyennes globales calculées, classements, appréciations et décisions du conseil de classe.

---

## 🌱 Seeding (Données de test)

Un script complet de seeding est disponible pour initialiser la base de données avec des utilisateurs de test (Admin, Enseignants, Élèves), des classes, des matières, des évaluations et des notes.

Pour lancer le seeding :
```bash
npm run seed
```
*Le script est écrit en TypeScript et s'exécute via `ts-node`.*

---

## 🗂️ Architecture du Code (Modular MVC)

Le code est structuré de manière modulaire dans le dossier `src/modules/`. Chaque entité métier possède son propre sous-dossier contenant :
- `*.model.js` : Définition du schéma Mongoose et des index.
- `*.routes.js` : Définition des endpoints d'API Express et validation des rôles.
- `*.controller.js` : Réception des requêtes HTTP, appels aux services et formatage des réponses.
- `*.service.js` : Logique métier pure et requêtes MongoDB / Mongoose.
- `*.seed.ts` *(optionnel)* : Données de test spécifiques à l'entité.

### Exemple pour les Périodes :
```
src/modules/periods/
├── period.model.js
├── period.routes.js
├── period.controller.js
├── period.service.js
└── periods.seed.ts
```

---

## 🔌 API Endpoints & Authentification

### Authentification
Toutes les routes (sauf `/api/auth/login` et `/api/auth/register`) nécessitent un token JWT envoyé dans les headers HTTP :
`Authorization: Bearer <votre_token_jwt>`

### Liste des principaux préfixes d'API

| Route | Description | Rôles Autorisés (exemples) |
| :--- | :--- | :--- |
| `/api/auth` | Login, Register, profil utilisateur | Tous |
| `/api/users` | Gestion des utilisateurs | `ADMIN` |
| `/api/school-years` | Années scolaires actives | `ADMIN`, `TEACHER` (lecture) |
| `/api/periods` | Trimestres et séquences | `ADMIN`, `TEACHER` (lecture) |
| `/api/cycles` | Gestion des cycles | `ADMIN` |
| `/api/classes` | Classes et affectations | `ADMIN`, `TEACHER` |
| `/api/students` | Profils élèves et inscriptions | `ADMIN`, `TEACHER` |
| `/api/subjects` | Gestion des matières | `ADMIN` |
| `/api/teacher` | Affectation des profs aux classes/matières | `ADMIN` |
| `/api/evaluations` | Création de devoirs/évaluations | `TEACHER`, `ADMIN` |
| `/api/grades` | Enregistrement et modification de notes | `TEACHER`, `ADMIN` |
| `/api/bulletins` | Génération, publication et calculs de moyennes | `ADMIN` (génération/publication), `TEACHER` (commentaires) |
| `/api/notifications` | Notifications email / SMS aux parents/élèves | Tous |
| `/api/admin/dashboard` | Statistiques globales pour l'administration | `ADMIN` |

---

## 🛠️ Commandes Utiles

- **Lancer le serveur en mode développement (avec auto-reload via nodemon) :**
  ```bash
  npm run dev
  ```
- **Lancer le serveur en mode production :**
  ```bash
  npm start
  ```
- **Lancer le seed de données :**
  ```bash
  npm run seed
  ```
