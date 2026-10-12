require("dotenv").config();

const app = require("./app");
const { connectDatabase } = require("./utils/db");

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.on("error", (error) => {
  console.error("Server error:", error);
});

// Connexion ouverte dès le démarrage : la première requête n'attend pas la négociation avec MongoDB Atlas.
// En cas d'échec, chaque requête retente la connexion (voir app.js).
const started = Date.now();
connectDatabase()
  .then(() => {
    console.log(`MongoDB connecté (${Date.now() - started} ms)`);
    scheduleDeadlineReminders();
  })
  .catch((error) => console.error("MongoDB : connexion initiale impossible :", error.message));

// Rappels de clôture aux enseignants (J-7, J-3, J-1) : vérifiés au démarrage puis toutes les heures.
// Sur Vercel, la même vérification est déclenchée chaque jour par vercel.json (crons).
function scheduleDeadlineReminders() {
  const { runDeadlineReminders } = require("./modules/periods/deadlineReminder.service");
  const run = () =>
    runDeadlineReminders()
      .then((sent) => sent.forEach((r) => console.log(`[RAPPEL_CLOTURE] ${r.period} ${r.year} (J-${r.daysLeft}) : ${r.teachers} enseignant(s)`)))
      .catch((error) => console.error("[RAPPEL_CLOTURE] échec :", error.message));
  run();
  setInterval(run, 60 * 60 * 1000).unref();
}
