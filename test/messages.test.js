const test = require("node:test");
const assert = require("node:assert/strict");

test("MESSAGES_DRY_RUN=true : aucun email ni SMS n'est envoyé, même avec des identifiants configurés", async () => {
  Object.assign(process.env, {
    MESSAGES_DRY_RUN: "true",
    MAIL_USER: "ecole@example.com",
    MAIL_PASS: "mot-de-passe-application",
    MAIL_HOST: "smtp.invalid",
    TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
    TWILIO_AUTH_TOKEN: "jeton",
    TWILIO_FROM_NUMBER: "+15550000000",
  });
  const { sendEmail } = require("../src/utils/mail");
  const { sendSMS } = require("../src/utils/sms");

  const mail = await sendEmail({ to: "parent@example.com", subject: "Bulletin disponible", html: "<p>x</p>" });
  assert.match(mail.messageId, /^dry-run-/);

  const sms = await sendSMS({ to: "+237699000001", message: "Bulletin disponible" });
  assert.equal(sms.provider, "dry-run");
});

test("adresses de test ou fictives jamais contactées, même hors MESSAGES_DRY_RUN", async () => {
  delete process.env.MESSAGES_DRY_RUN;
  const { sendEmail } = require("../src/utils/mail");
  for (const to of ["parent@parents.test", "prof@cedeve.test", "699000001@eduflow.local", "a@example.com"]) {
    const result = await sendEmail({ to, subject: "Note publiée", html: "<p>x</p>" });
    assert.equal(result.messageId, "skipped-reserved-domain", to);
  }
});

test("liens des emails : PUBLIC_APP_URL prioritaire sur FRONTEND_URL", () => {
  const { frontendUrl } = require("../src/utils/school");
  process.env.FRONTEND_URL = "http://localhost:8080,https://autre.example";
  delete process.env.PUBLIC_APP_URL;
  assert.equal(frontendUrl(), "http://localhost:8080");
  process.env.PUBLIC_APP_URL = "http://192.168.1.177:8080/";
  assert.equal(frontendUrl(), "http://192.168.1.177:8080");
  delete process.env.PUBLIC_APP_URL;
});
