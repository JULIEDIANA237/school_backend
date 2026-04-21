const nodemailer = require("nodemailer");

/**
 * Service d'envoi d'emails
 */
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || "smtp.gmail.com",
      port: process.env.MAIL_PORT || 587,
      secure: process.env.MAIL_PORT == 465,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"EduFlow Bulletin" <${process.env.MAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });

    console.log("   📧 Email envoyé: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("   ❌ Erreur d'envoi d'email:", error.message);
    throw error;
  }
};

module.exports = { sendEmail };
