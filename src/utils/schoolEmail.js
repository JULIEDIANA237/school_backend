const { escapeHtml } = require("./text");

const LOGO_CID = "logo@etablissement";

/** Pièce jointe intégrée (cid) : les messageries bloquent les images en data URL. */
const logoAttachment = (logo) => {
  const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(logo || "");
  if (!match) return null;
  return { filename: `logo.${match[1] === "jpeg" ? "jpg" : match[1]}`, content: match[2], encoding: "base64", cid: LOGO_CID };
};

const contactLines = (profile) =>
  [
    [profile.poBox && `BP ${profile.poBox}`, profile.city, profile.countryName].filter(Boolean).join(" – "),
    [profile.phone && `Tél. ${profile.phone}`, profile.email, profile.website].filter(Boolean).join(" · "),
  ].filter(Boolean);

/**
 * Email aux couleurs de l'établissement : en-tête (logo, nom, devise), message, bouton, coordonnées.
 * Renvoie les champs à passer à sendEmail : html, text, attachments et nom d'expéditeur.
 *
 * @param {object} profile profil de l'établissement (school.service)
 * @param {{ title: string, greeting?: string, paragraphs?: string[], items?: string[], highlight?: string[], cta?: { label: string, url: string } }} content
 */
const buildSchoolEmail = (profile, { title, greeting, paragraphs = [], items = [], highlight = [], cta }) => {
  const name = profile.name || "Votre établissement";
  const color = profile.primaryColor || "#1e3a8a";
  const logo = logoAttachment(profile.logo);
  const contacts = contactLines(profile);

  const html = `
<div style="background:#f3f4f6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${color};color:#ffffff;">
      <tr>
        ${logo ? `<td width="64" style="padding:16px 0 16px 20px;"><img src="cid:${LOGO_CID}" width="48" height="48" alt="" style="display:block;border-radius:8px;background:#ffffff;"></td>` : ""}
        <td style="padding:16px 20px;">
          <div style="font-size:17px;font-weight:bold;">${escapeHtml(name)}</div>
          ${profile.motto ? `<div style="font-size:12px;opacity:0.85;">${escapeHtml(profile.motto)}</div>` : ""}
        </td>
      </tr>
    </table>
    <div style="padding:22px 20px;font-size:15px;line-height:1.5;">
      <h2 style="margin:0 0 14px;font-size:18px;color:${color};">${escapeHtml(title)}</h2>
      ${greeting ? `<p style="margin:0 0 12px;">Bonjour <strong>${escapeHtml(greeting)}</strong>,</p>` : ""}
      ${paragraphs.map((p) => `<p style="margin:0 0 12px;">${escapeHtml(p)}</p>`).join("")}
      ${items.length ? `<ul style="margin:0 0 12px;padding-left:20px;">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : ""}
      ${
        highlight.length
          ? `<div style="background:#f3f4f6;border-left:4px solid ${color};padding:12px 14px;border-radius:6px;margin:16px 0;">${highlight
              .map((h) => `<div style="margin:2px 0;"><strong>${escapeHtml(h)}</strong></div>`)
              .join("")}</div>`
          : ""
      }
      ${
        cta
          ? `<p style="margin:22px 0 4px;"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${color};color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">${escapeHtml(cta.label)}</a></p>`
          : ""
      }
    </div>
    <div style="padding:14px 20px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;line-height:1.5;">
      <strong>${escapeHtml(name)}</strong>${contacts.map((l) => `<br>${escapeHtml(l)}`).join("")}
    </div>
  </div>
</div>`;

  const text = [
    name,
    "",
    title,
    "",
    greeting ? `Bonjour ${greeting},` : null,
    ...paragraphs,
    ...items.map((i) => `- ${i}`),
    ...highlight,
    cta ? `${cta.label} : ${cta.url}` : null,
    "",
    "--",
    name,
    ...contacts,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    html,
    text,
    attachments: logo ? [logo] : undefined,
    fromName: profile.shortName || profile.name || "Établissement",
  };
};

module.exports = { buildSchoolEmail };
