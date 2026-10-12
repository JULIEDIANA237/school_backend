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
let transporter;
let transporterKey;

const getTransporter = (user, pass) => {
  const port = parseInt(process.env.MAIL_PORT || "587", 10);
  const key = `${process.env.MAIL_HOST}|${port}|${user}|${pass}`;
  if (!transporter || transporterKey !== key) {
    transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    transporterKey = key;
  }
  return transporter;
};

const isMailConfigured = () =>
  Boolean(process.env.MAIL_USER && process.env.MAIL_PASS && process.env.MAIL_USER !== "your_email@gmail.com");

/** MESSAGES_DRY_RUN=true : aucun email ni SMS ne part (tests en local avec des contacts fictifs). */
const isDryRun = () => process.env.MESSAGES_DRY_RUN === "true";

/**
 * Domaines réservés aux exemples et aux tests (RFC 2606 / 6761) et comptes sans email réel
 * (@eduflow.local) : un envoi n'aboutirait jamais et reviendrait en erreur dans la boîte de l'école.
 */
const RESERVED_DOMAIN = /(^|\.)(test|example|invalid|localhost|local)$|(^|\.)example\.(com|net|org)$/i;
const isReservedAddress = (to) => RESERVED_DOMAIN.test(String(to || "").split("@").pop().trim());

/**
 * @param {{ to: string, subject: string, html?: string, text?: string, attachments?: object[], fromName?: string }} message
 *   fromName : nom affiché de l'expéditeur (celui de l'établissement)
 */
const sendEmail = async ({ to, subject, html, text, attachments, fromName = "EduBulletin" }) => {
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;

  if (isDryRun()) {
    console.log(`[MAIL_DRY_RUN] Envoi désactivé (MESSAGES_DRY_RUN) : « ${subject} » non envoyé.`);
    return { messageId: "dry-run-" + Date.now() };
  }
  if (isReservedAddress(to)) {
    console.log(`[MAIL_SKIPPED] Adresse de test ou fictive : « ${subject} » non envoyé.`);
    return { messageId: "skipped-reserved-domain" };
  }

  // Si les identifiants ne sont pas configurés, simuler l'envoi (sans journaliser le destinataire)
  if (!isMailConfigured()) {
    console.log("[MAIL_SIMULATION] MAIL_USER / MAIL_PASS non configurés, email non envoyé.");
    return { messageId: "simulation-" + Date.now() };
  }

  try {
    return await getTransporter(user, pass).sendMail({
      from: { name: String(fromName).replace(/["\r\n]/g, ""), address: user },
      to,
      subject,
      text,
      html,
      attachments,
    });
  } catch (error) {
    console.error("[MAIL_SEND_FAILURE]", error.message);
    if (error.message.includes("BadCredentials") || error.message.includes("Username and Password")) {
      console.error("Gmail nécessite un 'App Password'. Voir les instructions dans src/utils/mail.js");
    }
    throw error;
  }
};

module.exports = { sendEmail, isMailConfigured, isDryRun };
