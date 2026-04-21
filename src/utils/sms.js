/**
 * Service d'envoi de SMS (Place-holder)
 * A remplacer par un vrai provider (Twilio, Vonage, SMS.to, etc.)
 */
const sendSMS = async ({ to, message }) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  try {
    if (sid && token && from) {
      // Intégration Twilio réelle
      const client = require('twilio')(sid, token);
      const response = await client.messages.create({
        body: message,
        from: from,
        to: to
      });
      console.log(`   📱 SMS [TWILIO] envoyé à ${to}: ${response.sid}`);
      return { success: true, provider: "Twilio", sid: response.sid };
    } else {
      // Simulation d'envoi SMS
      console.log(`   📱 SMS [SIMULATION] à ${to}: ${message}`);
      return { success: true, provider: "EduFlow-Mock" };
    }
  } catch (error) {
    console.error("   ❌ Erreur d'envoi SMS:", error.message);
    return { success: false, error: error.message };
  }
};

module.exports = { sendSMS };
