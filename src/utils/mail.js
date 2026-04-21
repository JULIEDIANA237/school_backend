const nodemailer = require("nodemailer");

/**
 * Service d'envoi d'emails
 * 
 * CONFIGURATION GMAIL :
 * Pour utiliser Gmail, vous devez créer un "App Password" (Mot de passe d'application) :
 * 1. Aller sur https://myaccount.google.com/security
 * 2. Activer la validation en 2 étapes
 * 3. Chercher "Mots de passe des applications" et créer un pour "Mail"
 * 4. Utiliser ce mot de passe de 16 caractères comme MAIL_PASS dans le .env
 * 
 * Variables .env requises :
 *  MAIL_HOST=smtp.gmail.com
 *  MAIL_PORT=587
 *  MAIL_USER=votre.adresse@gmail.com
 *  MAIL_PASS=votre_app_password_16_caracteres
 */
const sendEmail = async ({ to, subject, html, text }) => {
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;

  // Si les identifiants ne sont pas configurés, simuler l'envoi
  if (!user || !pass || user === "your_email@gmail.com") {
    console.log(`   📧 Email [SIMULATION] à ${to}: Sujet: ${subject}`);
    console.log(`   ⚠️  Pour de vrais emails, configurez MAIL_USER et MAIL_PASS dans le .env`);
    console.log(`   ⚠️  Avec Gmail, utilisez un "App Password" (16 caractères) et non votre mot de passe normal.`);
    return { messageId: "simulation-" + Date.now() };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || "smtp.gmail.com",
      port: parseInt(process.env.MAIL_PORT || "587"),
      secure: process.env.MAIL_PORT == 465,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false,
      },
    });

    const info = await transporter.sendMail({
      from: `"EduFlow Bulletin" <${user}>`,
      to,
      subject,
      text,
      html,
    });

    console.log(`   📧 Email envoyé à ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error("   ❌ Erreur d'envoi d'email:", error.message);
    // Ne pas bloquer le reste des notifications
    if (error.message.includes("BadCredentials") || error.message.includes("Username and Password")) {
      console.error("   💡 ASTUCE: Gmail nécessite un 'App Password'. Voir les instructions dans src/utils/mail.js");
    }
    throw error;
  }
};

module.exports = { sendEmail };
