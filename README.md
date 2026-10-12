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
Copiez `.env.example` en `.env` à la racine de `school_backend` et remplissez les valeurs (chaque variable y est commentée). Générez `JWT_SECRET` et `BULLETIN_VERIFY_SECRET` avec :
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Hors production (`NODE_ENV` différent de `production`), l'API autorise en plus les origines locales `http://localhost:8080`, `http://localhost:4173`, `http://localhost:4174` et leurs équivalents `127.0.0.1`. En production, seules les origines listées dans `FRONTEND_URL` (séparées par des virgules, sans chemin final) sont acceptées ; la première sert aux liens envoyés par email.

Ne publiez jamais le fichier `.env` ni les valeurs réelles de ces variables. Si des identifiants ou une URI MongoDB ont déjà été poussés sur GitHub, remplacez-les (notamment le mot de passe MongoDB) et retirez les secrets du dépôt et de son historique.

---

## ☁️ Déploiement sur Vercel

L'API est exposée à Vercel par `api/index.js`, qui exporte l'application Express sans démarrer de serveur avec `app.listen()`. Le fichier `vercel.json` redirige les requêtes vers cette fonction.

### 1. Préparer MongoDB

Configurez une base MongoDB Atlas accessible depuis Vercel et récupérez son URI de connexion. L'application lit l'URI depuis `MONGO_URI` et établit la connexion à la base à la demande.

### 2. Importer le projet

1. Poussez le projet sur GitHub sans inclure `.env`.
2. Dans Vercel, choisissez **Add New → Project**, puis importez le dépôt.
3. Pour ce dépôt backend seul, utilisez la racine du dépôt comme **Root Directory**.
4. Laissez Vercel détecter le projet Node.js et installer les dépendances depuis `package-lock.json`.

### 3. Ajouter les variables d'environnement

Dans **Project → Settings → Environment Variables**, ajoutez au minimum :

| Variable | Valeur |
| --- | --- |
| `MONGO_URI` | URI de connexion MongoDB Atlas |
| `JWT_SECRET` | Secret JWT long, aléatoire et privé |
| `FRONTEND_URL` | Origine de l'application frontend, par exemple `https://mon-frontend.vercel.app` |
| `BULLETIN_VERIFY_SECRET` | Secret des QR codes de vérification (à ne plus changer une fois des bulletins imprimés) |
| `NODE_ENV` | `production` |

Ajoutez aussi les variables `MAIL_*` et `TWILIO_*` si les fonctionnalités email ou SMS sont utilisées. L'identité de l'établissement (nom, logo, coordonnées, modèle de bulletin) est enregistrée en base (`GET`/`PUT /api/school`) et se renseigne dans l'application, page Établissement ; une base de données par établissement. Après toute modification des variables, redéployez le projet pour les appliquer.

Les emails et SMS de publication des bulletins partent après la réponse HTTP grâce à `waitUntil` (`@vercel/functions`) : la fonction reste active jusqu'à la fin des envois. Les compteurs de limitation de débit sont stockés dans MongoDB (collection `ratelimits`, purgée automatiquement), car la mémoire n'est pas partagée entre les instances serverless.

### 4. Déployer et vérifier

Cliquez sur **Deploy**, puis testez une route de l'API avec son URL Vercel, par exemple `https://mon-api.vercel.app/api/auth`. Les logs d'exécution sont disponibles dans l'onglet **Deployments → Functions**.

Vercel exécute le backend sous forme de fonctions serverless : il ne faut pas appeler `app.listen()` dans le point d'entrée `api/index.js`. Pour des tâches longues ou exécutées en continu, utilisez plutôt un hébergeur qui fournit un serveur persistant.

L'inscription publique crée uniquement des comptes parents (`POST /api/auth/register`). La récupération de mot de passe utilise `POST /api/auth/forgot-password` puis `POST /api/auth/reset-password`; le jeton envoyé par email est à usage unique et expire après une heure. Configurez `MAIL_USER`, `MAIL_PASS` et `FRONTEND_URL` pour que les liens soient effectivement envoyés. Les endpoints de récupération sont limités en fréquence et la demande répond de manière identique, que l'adresse existe ou non.

---

## 🔐 Comptes et sécurité

- **Aucun mot de passe par défaut.** Tout compte créé par un tiers (création par l'administration, import d'enseignants, import d'élèves pour les parents) reçoit un **mot de passe provisoire unique**, renvoyé une seule fois dans la réponse (`temporaryPassword` ou liste `credentials` des imports) pour être transmis à l'intéressé.
- Ces comptes ont `mustChangePassword: true` : tant que le mot de passe n'est pas changé (`PUT /api/users/me/password`), toutes les autres routes répondent `403` avec `code: "PASSWORD_CHANGE_REQUIRED"`.
- À chaque requête, l'utilisateur est rechargé depuis la base : un compte supprimé perd l'accès immédiatement, le rôle utilisé est celui de la base, et un jeton émis avant un changement de mot de passe est refusé.
- Contrôles d'accès : un enseignant n'accède qu'aux classes où il est affecté (ou dont il est professeur principal), ne modifie que ses propres évaluations, et seul le professeur principal peut rédiger l'appréciation et publier les bulletins de sa classe. Un parent ne voit que les bulletins **publiés** de ses enfants.
- Les comptes existants créés avec l'ancien mot de passe par défaut doivent être signalés : voir `scripts/flag-default-passwords.js`.

## 🧮 Règles de calcul des bulletins

- Chaque note est ramenée sur 20 puis pondérée par le coefficient de l'évaluation.
- Une matière où l'élève n'a **aucune note** sur la période est **non classée** : elle n'entre pas dans la moyenne générale (son coefficient n'est pas compté).
- Moyenne trimestrielle d'une matière = moyenne des séquences du trimestre où l'élève a une note ; les notes de chaque séquence sont figées dans le bulletin trimestriel.
- Classement avec ex æquo (1, 1, 3). Un élève sans aucune note n'est pas classé.
- `POST /api/bulletins/generate` recalcule une classe **sans effacer** les appréciations ni les décisions. Il est refusé (`409`) si un bulletin de la classe est déjà publié pour la période : dépubliez d'abord.
- Une période clôturée (`PATCH /api/periods/:id/closure`), ou une séquence dont le trimestre est clôturé, n'accepte plus aucune modification de notes ni d'évaluations.
- Chaque bulletin publié porte un QR code pointant vers `GET /api/bulletins/verify/:id/:code` (public), qui confirme son authenticité.

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

`npm run seed` crée les données de base si elles n'existent pas : l'année scolaire courante (ou `SEED_SCHOOL_YEAR`), les deux cycles, les trois trimestres et leurs six séquences (la séquence et le trimestre en cours sont activés), et un premier compte administrateur (`SEED_ADMIN_EMAIL`) dont le mot de passe provisoire est affiché une seule fois. Le script est idempotent.

Pour tester sans toucher aux données réelles, pointez `MONGO_URI` vers une base dédiée (par exemple `…/school_api_test?…`) et ajoutez `MESSAGES_DRY_RUN=true` : aucun email ni SMS ne part, l'envoi est seulement journalisé.

```bash
npm run seed
```

## ✅ Tests

```bash
npm test
```

Les tests utilisent le lanceur intégré de Node (`node --test`), `supertest` et une base MongoDB en mémoire (`mongodb-memory-server`, téléchargée au premier lancement). Ils couvrent le calcul des bulletins (`test/calculator.test.js`) et les autorisations, la génération et la publication des bulletins, la clôture des périodes et les imports (`test/api.test.js`).

---

## 🗂️ Architecture du Code (Modular MVC)

Le code est structuré de manière modulaire dans le dossier `src/modules/`. Chaque entité métier possède son propre sous-dossier contenant :
- `*.model.js` : Définition du schéma Mongoose et des index.
- `*.routes.js` : Définition des endpoints d'API Express et validation des rôles.
- `*.controller.js` : Réception des requêtes HTTP, appels aux services et formatage des réponses.
- `*.service.js` : Logique métier et requêtes MongoDB / Mongoose.

Le calcul des moyennes est isolé dans `src/modules/bulletins/bulletin.calculator.js` (fonctions pures, sans base). Les utilitaires partagés sont dans `src/utils/` : contrôle d'accès (`access.js`), erreurs HTTP (`httpError.js`), lecture des fichiers Excel (`excel.js`), mots de passe (`password.js`), limitation de débit (`rateLimit.js`).

---

## 🔌 API Endpoints & Authentification

### Authentification
Toutes les routes, sauf `/api/auth/*` et la vérification publique `GET /api/bulletins/verify/:id/:code`, nécessitent un token JWT envoyé dans les headers HTTP :
`Authorization: Bearer <votre_token_jwt>`

### Liste des principaux préfixes d'API

| Route | Description | Rôles autorisés |
| :--- | :--- | :--- |
| `/api/auth` | Connexion, inscription parent, mot de passe oublié | Public |
| `/api/users` | Gestion des utilisateurs ; `/me` et `/me/password` pour soi-même | `admin`, `secretary` (parents uniquement) |
| `/api/school-years` | Années scolaires : création, modification, année courante | Lecture : tous ; écriture : `admin`, `secretary` |
| `/api/periods` | Trimestres et séquences, activation, clôture | Lecture : tous ; écriture : `admin`, `secretary` |
| `/api/cycles` | Cycles | `admin`, `secretary` |
| `/api/classes` | Classes, élèves et enseignants d'une classe | `admin`, `secretary` ; `teacher` pour ses classes |
| `/api/class-subjects` | Coefficients par classe | `admin`, `secretary` ; `teacher` en lecture pour ses classes |
| `/api/students` | Élèves, inscriptions, import | `admin`, `secretary` ; `teacher` (ses classes) ; `parent` (`/parent/me`) |
| `/api/subjects` | Matières | `admin`, `secretary` ; `teacher` en lecture |
| `/api/teacher` | Affectations enseignant / classe / matière | `admin`, `secretary` ; `teacher` (`/me`) |
| `/api/evaluations` | Évaluations | `teacher` (les siennes) ; lecture `admin`, `secretary` |
| `/api/grades` | Notes et moyennes calculées à la volée | `teacher` (ses classes), `admin`, `secretary` |
| `/api/bulletins` | Génération, publication, appréciations, vérification | `admin`, `secretary` ; professeur principal ; `parent` (bulletins publiés de ses enfants) |
| `/api/notifications` | Notifications de l'utilisateur connecté | Tous |
| `/api/admin/dashboard` | Statistiques de l'administration | `admin`, `secretary` |

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
