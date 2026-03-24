import nodemailer from "nodemailer";

const smtpConfig = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_PORT == "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
};

export const transporter = nodemailer.createTransport(smtpConfig);

transporter.verify((err, _success) => {
  if (err) {
    console.error("❌ SMTP connection failed:", err.message);
  } else {
    console.log("✅ SMTP connection successful");
  }
});

// ---------------------------------------------------------------------------
// Template Engine
// ---------------------------------------------------------------------------

/**
 * Replaces {{key}} placeholders with values from a vars object.
 * Unknown keys are left as-is.
 *
 * @param {string} template - The template string with {{key}} placeholders
 * @param {Record<string, string|number>} vars - Variable map
 * @returns {string}
 */
const render = (template, vars = {}) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`
  );

/**
 * Wraps rendered body content in the shared HTML shell.
 *
 * @param {string} title   - Email heading (already rendered)
 * @param {string} body    - Body HTML (already rendered)
 * @param {string|null} explorerLink - Optional "View on Explorer" CTA
 * @returns {string} Full HTML document
 */
const buildHtml = (title, body, explorerLink = null) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>
  body { margin: 0; padding: 0; font-family: Arial, sans-serif; background: #f2f2f2; }
  .email-container { max-width: 600px; margin: 40px auto; background: #fff; border: 1px solid #ddd; border-radius: 8px; }
  .header { text-align: center; background: #eee; padding: 20px; }
  .header img { max-width: 150px; }
  .content { padding: 30px 20px; }
  h1 { font-size: 22px; color: #000; margin-bottom: 20px; }
  p { font-size: 16px; color: #333; line-height: 1.6; }
  .footer { background: #f9f9f9; padding: 20px; text-align: center; font-size: 13px; color: #777; }
  .btn { display: inline-block; padding: 12px 24px; background-color: #000; color: #fff !important; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 20px; }
  .otp-box { display: inline-block; padding: 14px 32px; background: #f2f2f2; border: 1px dashed #999; border-radius: 6px; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #000; margin: 20px 0; }
  .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: bold; }
  .badge-success { background: #d4edda; color: #155724; }
  .badge-danger  { background: #f8d7da; color: #721c24; }
  .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 15px; }
  .detail-label { color: #777; }
  .detail-value { font-weight: bold; color: #000; }
</style>
</head>
<body>
<div class="email-container">
  <div class="header">
    <img src="https://taggedpay.xyz/logo.png" alt="TaggedPay Logo" />
  </div>
  <div class="content">
    <h1>${title}</h1>
    ${body}
    ${explorerLink ? `<a href="${explorerLink}" class="btn">View on Explorer</a>` : ""}
    <p>Cheers,<br/>Llins from Tagged</p>
  </div>
  <div class="footer">Tagged &bull; support@taggedpay.xyz</div>
</div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Template Definitions
// ---------------------------------------------------------------------------

/**
 * Each entry has:
 *   subject {string}  - Subject line template (supports {{var}})
 *   body    {string}  - HTML body template    (supports {{var}})
 *
 * Available templates:
 *   welcome            – new-user registration
 *   transaction_sent   – outbound payment
 *   transaction_received – inbound payment
 *   otp                – one-time password / verification code
 *   kyc_approved       – KYC verification approved
 *   kyc_rejected       – KYC verification rejected
 *   api_key_created    – new API key generated
 */
const EMAIL_TEMPLATES = {
  // ── English ────────────────────────────────────────────────────────────────
  en: {
    welcome: {
      subject: "Welcome to Tagged, {{name}}!",
      body: `
<p>Hi <strong>{{name}}</strong>,</p>
<p>Welcome to <strong>Tagged</strong> — the simplest way to send and receive crypto using your @tag.</p>
<p>Your tag is: <strong>@{{tag}}</strong></p>
<p>You can now send payments, manage your wallets, and track your transactions all in one place.</p>
<p>If you have any questions, reply to this email or visit our support page.</p>`,
    },

    transaction_sent: {
      subject: "You sent {{amount}} {{asset}} to @{{recipientTag}}",
      body: `
<p>Hi <strong>{{name}}</strong>,</p>
<p>Your payment has been sent successfully.</p>
<div class="detail-row"><span class="detail-label">To</span><span class="detail-value">@{{recipientTag}}</span></div>
<div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value">{{amount}} {{asset}}</span></div>
<div class="detail-row"><span class="detail-label">Fee</span><span class="detail-value">{{fee}} {{asset}}</span></div>
<div class="detail-row"><span class="detail-label">Reference</span><span class="detail-value">{{reference}}</span></div>
<div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">{{date}}</span></div>
<p style="margin-top:20px;">Keep this email as your payment record.</p>`,
    },

    transaction_received: {
      subject: "You received {{amount}} {{asset}} from @{{senderTag}}",
      body: `
<p>Hi <strong>{{name}}</strong>,</p>
<p>Great news — you just received a payment!</p>
<div class="detail-row"><span class="detail-label">From</span><span class="detail-value">@{{senderTag}}</span></div>
<div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value">{{amount}} {{asset}}</span></div>
<div class="detail-row"><span class="detail-label">Reference</span><span class="detail-value">{{reference}}</span></div>
<div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">{{date}}</span></div>
<p style="margin-top:20px;">Log in to your Tagged account to view your updated balance.</p>`,
    },

    otp: {
      subject: "Your Tagged verification code",
      body: `
<p>Hi <strong>{{name}}</strong>,</p>
<p>Use the code below to verify your identity. This code expires in <strong>{{expiresIn}}</strong>.</p>
<div style="text-align:center;">
  <span class="otp-box">{{code}}</span>
</div>
<p style="font-size:14px; color:#999;">If you didn't request this, please ignore this email.</p>`,
    },

    kyc_approved: {
      subject: "Your KYC verification has been approved",
      body: `
<p>Hi <strong>{{name}}</strong>,</p>
<p>Your identity verification (KYC) has been <span class="status-badge badge-success">Approved</span>.</p>
<p>You now have full access to all Tagged features, including higher transaction limits.</p>
<p>Thank you for verifying your account.</p>`,
    },

    kyc_rejected: {
      subject: "Action required: KYC verification not approved",
      body: `
<p>Hi <strong>{{name}}</strong>,</p>
<p>Your identity verification (KYC) was <span class="status-badge badge-danger">Not Approved</span>.</p>
<p><strong>Reason:</strong> {{reason}}</p>
<p>Please log in and resubmit your documents to continue using all Tagged features.</p>`,
    },

    api_key_created: {
      subject: "A new API key was created on your account",
      body: `
<p>Hi <strong>{{name}}</strong>,</p>
<p>A new API key named <strong>"{{keyName}}"</strong> was created on your Tagged account on <strong>{{date}}</strong>.</p>
<p>If you did not create this key, please revoke it immediately from your account settings and contact support.</p>`,
    },

    transaction_export_ready: {
      subject: "Your transaction export is ready",
      body: `
<p>Hi <strong>{{name}}</strong>,</p>
<p>Your transaction export ({{format}}) with <strong>{{recordCount}}</strong> records is ready for download.</p>
<p>This link expires on <strong>{{expiresAt}}</strong>. Download your file before it expires.</p>
<p><a href="{{downloadUrl}}" class="btn">Download Export</a></p>
<p style="font-size:14px; color:#999;">If the button doesn't work, copy and paste this link into your browser: {{downloadUrl}}</p>`,
    },
  },

  // ── French ─────────────────────────────────────────────────────────────────
  fr: {
    welcome: {
      subject: "Bienvenue sur Tagged, {{name}} !",
      body: `
<p>Bonjour <strong>{{name}}</strong>,</p>
<p>Bienvenue sur <strong>Tagged</strong> — la façon la plus simple d'envoyer et de recevoir des cryptomonnaies avec votre @tag.</p>
<p>Votre tag est : <strong>@{{tag}}</strong></p>
<p>Vous pouvez maintenant envoyer des paiements, gérer vos portefeuilles et suivre vos transactions en un seul endroit.</p>
<p>Si vous avez des questions, répondez à cet email ou visitez notre page d'assistance.</p>`,
    },

    transaction_sent: {
      subject: "Vous avez envoyé {{amount}} {{asset}} à @{{recipientTag}}",
      body: `
<p>Bonjour <strong>{{name}}</strong>,</p>
<p>Votre paiement a été envoyé avec succès.</p>
<div class="detail-row"><span class="detail-label">À</span><span class="detail-value">@{{recipientTag}}</span></div>
<div class="detail-row"><span class="detail-label">Montant</span><span class="detail-value">{{amount}} {{asset}}</span></div>
<div class="detail-row"><span class="detail-label">Frais</span><span class="detail-value">{{fee}} {{asset}}</span></div>
<div class="detail-row"><span class="detail-label">Référence</span><span class="detail-value">{{reference}}</span></div>
<div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">{{date}}</span></div>
<p style="margin-top:20px;">Conservez cet email comme preuve de paiement.</p>`,
    },

    transaction_received: {
      subject: "Vous avez reçu {{amount}} {{asset}} de @{{senderTag}}",
      body: `
<p>Bonjour <strong>{{name}}</strong>,</p>
<p>Bonne nouvelle — vous venez de recevoir un paiement !</p>
<div class="detail-row"><span class="detail-label">De</span><span class="detail-value">@{{senderTag}}</span></div>
<div class="detail-row"><span class="detail-label">Montant</span><span class="detail-value">{{amount}} {{asset}}</span></div>
<div class="detail-row"><span class="detail-label">Référence</span><span class="detail-value">{{reference}}</span></div>
<div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">{{date}}</span></div>
<p style="margin-top:20px;">Connectez-vous à votre compte Tagged pour voir votre solde mis à jour.</p>`,
    },

    otp: {
      subject: "Votre code de vérification Tagged",
      body: `
<p>Bonjour <strong>{{name}}</strong>,</p>
<p>Utilisez le code ci-dessous pour vérifier votre identité. Ce code expire dans <strong>{{expiresIn}}</strong>.</p>
<div style="text-align:center;">
  <span class="otp-box">{{code}}</span>
</div>
<p style="font-size:14px; color:#999;">Si vous n'avez pas fait cette demande, ignorez cet email.</p>`,
    },

    kyc_approved: {
      subject: "Votre vérification KYC a été approuvée",
      body: `
<p>Bonjour <strong>{{name}}</strong>,</p>
<p>Votre vérification d'identité (KYC) a été <span class="status-badge badge-success">Approuvée</span>.</p>
<p>Vous avez désormais accès à toutes les fonctionnalités de Tagged, y compris des limites de transaction plus élevées.</p>
<p>Merci d'avoir vérifié votre compte.</p>`,
    },

    kyc_rejected: {
      subject: "Action requise : vérification KYC non approuvée",
      body: `
<p>Bonjour <strong>{{name}}</strong>,</p>
<p>Votre vérification d'identité (KYC) n'a pas été <span class="status-badge badge-danger">approuvée</span>.</p>
<p><strong>Raison :</strong> {{reason}}</p>
<p>Veuillez vous connecter et soumettre à nouveau vos documents pour continuer à utiliser toutes les fonctionnalités de Tagged.</p>`,
    },

    api_key_created: {
      subject: "Une nouvelle clé API a été créée sur votre compte",
      body: `
<p>Bonjour <strong>{{name}}</strong>,</p>
<p>Une nouvelle clé API nommée <strong>"{{keyName}}"</strong> a été créée sur votre compte Tagged le <strong>{{date}}</strong>.</p>
<p>Si vous n'avez pas créé cette clé, veuillez la révoquer immédiatement depuis les paramètres de votre compte et contacter le support.</p>`,
    },

    transaction_export_ready: {
      subject: "Votre export de transactions est prêt",
      body: `
<p>Bonjour <strong>{{name}}</strong>,</p>
<p>Votre export de transactions ({{format}}) avec <strong>{{recordCount}}</strong> enregistrements est prêt à être téléchargé.</p>
<p>Ce lien expire le <strong>{{expiresAt}}</strong>. Téléchargez votre fichier avant expiration.</p>
<p><a href="{{downloadUrl}}" class="btn">Télécharger l'export</a></p>
<p style="font-size:14px; color:#999;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur : {{downloadUrl}}</p>`,
    },
  },
};

// ---------------------------------------------------------------------------
// Template Management
// ---------------------------------------------------------------------------

/**
 * Returns the list of registered template names for a given locale.
 *
 * @param {string} [lang="en"] - Locale code ("en" | "fr")
 * @returns {string[]}
 */
export const listTemplates = (lang = "en") => {
  const bucket = EMAIL_TEMPLATES[lang] ?? EMAIL_TEMPLATES.en;
  return Object.keys(bucket);
};

/**
 * Retrieves a fully-rendered template (subject + html).
 * Falls back to English if the requested locale is unavailable.
 *
 * @param {string} templateName - One of the registered template keys
 * @param {Record<string, string|number>} vars - Variable map for substitution
 * @param {string} [lang="en"] - Locale code ("en" | "fr")
 * @param {string|null} [explorerLink=null] - Optional blockchain explorer URL
 * @returns {{ subject: string, html: string }}
 * @throws {Error} if templateName is not registered
 */
export const getTemplate = (templateName, vars = {}, lang = "en", explorerLink = null) => {
  const bucket = EMAIL_TEMPLATES[lang] ?? EMAIL_TEMPLATES.en;
  const tpl = bucket[templateName] ?? EMAIL_TEMPLATES.en[templateName];

  if (!tpl) {
    throw new Error(`Unknown email template: "${templateName}". Available: ${listTemplates().join(", ")}`);
  }

  const subject = render(tpl.subject, vars);
  const bodyContent = render(tpl.body, vars);
  const html = buildHtml(subject, bodyContent, explorerLink);

  return { subject, html };
};

// ---------------------------------------------------------------------------
// Send Helpers
// ---------------------------------------------------------------------------

/**
 * Sends a templated email.
 *
 * @param {string} to            - Recipient email address
 * @param {string} templateName  - Registered template key
 * @param {Record<string, string|number>} [vars={}] - Template variables
 * @param {string} [lang="en"]   - Locale ("en" | "fr")
 * @param {string|null} [explorerLink=null] - Optional blockchain explorer URL
 * @returns {Promise<import("nodemailer").SentMessageInfo|false>}
 *
 * @example
 * await sendTemplatedEmail("user@example.com", "welcome", { name: "Alice", tag: "alice" });
 *
 * @example
 * await sendTemplatedEmail(
 *   "user@example.com",
 *   "transaction_sent",
 *   { name: "Bob", recipientTag: "alice", amount: "10", asset: "XLM", fee: "0.01", reference: "PAY-123", date: "2026-02-21" },
 *   "en",
 *   "https://stellar.expert/explorer/public/tx/abc123"
 * );
 */
export const sendTemplatedEmail = async (to, templateName, vars = {}, lang = "en", explorerLink = null) => {
  try {
    const { subject, html } = getTemplate(templateName, vars, lang, explorerLink);

    const info = await transporter.sendMail({
      from: `Tagged <${process.env.FROM_EMAIL || "support@taggedpay.xyz"}>`,
      to,
      subject,
      html,
    });

    console.log(`📧 Email [${templateName}] sent to ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`❌ Email Error [${templateName}]:`, error.message);
    if (error.response) {
      console.error("SMTP Response:", error.response);
    }
    return false;
  }
};

/**
 * Low-level send with a raw title and body string.
 * Kept for backward compatibility; prefer sendTemplatedEmail for new code.
 *
 * @param {string} to
 * @param {string} title
 * @param {string} body      - Plain HTML string (not a template key)
 * @param {string|null} [explorerLink=null]
 * @returns {Promise<import("nodemailer").SentMessageInfo|false>}
 */
export const sendEmail = async (to, title, body, explorerLink = null) => {
  try {
    const html = buildHtml(title, `<p>${body}</p>`, explorerLink);

    const info = await transporter.sendMail({
      from: `Tagged <${process.env.FROM_EMAIL || "support@taggedpay.xyz"}>`,
      to,
      subject: title,
      html,
    });

    console.log(`📧 Email sent successfully to ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error("❌ Email Error:", error.message);
    if (error.response) {
      console.error("SMTP Response:", error.response);
    }
    return false;
  }
};
