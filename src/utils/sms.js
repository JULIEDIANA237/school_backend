/**
 * Service d'envoi de SMS (Place-holder)
 * A remplacer par un vrai provider (Twilio, Vonage, SMS.to, etc.)
 */
const { isDryRun } = require("./mail");

const sendSMS = async ({ to, message }) => {
  if (isDryRun()) {
    console.log("[SMS_DRY_RUN] Envoi désactivé (MESSAGES_DRY_RUN), SMS non envoyé.");
    return { success: true, provider: "dry-run" };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  // Vérification que les identifiants Twilio sont réels (pas des placeholders)
  const isTwilioConfigured = sid && token && from && sid.startsWith("AC");

  try {
    if (isTwilioConfigured) {
      // Intégration Twilio réelle
      const client = require('twilio')(sid, token);
      const response = await client.messages.create({
        body: message,
        from: from,
        to: to
      });
      return { success: true, provider: "Twilio", sid: response.sid };
    } else {
      // Simulation d'envoi SMS (pas de credentials Twilio valides) — ni numéro ni contenu dans les logs
      console.log("[SMS_SIMULATION] Twilio non configuré (TWILIO_ACCOUNT_SID doit commencer par 'AC'), SMS non envoyé.");
      return { success: true, provider: "EduFlow-Mock" };
    }
  } catch (error) {
    console.error("[SMS_SEND_FAILURE]", error.message);
    return { success: false, error: error.message };
  }
};

module.exports = { sendSMS };
