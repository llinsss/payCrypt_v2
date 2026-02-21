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

transporter.verify((err, success) => {
  if (err) {
    console.error("❌ SMTP connection failed:", err.message);
  } else {
    console.log("✅ SMTP connection successful");
  }
});

const emailTemplate = (title, body, explorerLink = null) => `<!DOCTYPE html>
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
</style>
</head>
<body>
<div class="email-container">
  <div class="header">
    <img src="https://taggedpay.xyz/logo.png" alt="taggedpay Logo" />
  </div>
  <div class="content">
    <h1>${title}</h1>
    <p>${body}</p>
    ${explorerLink ? `<a href="${explorerLink}" class="btn">View on Explorer</a>` : ''}
    <p>Cheers,<br/>Llins from Tagged</p>
  </div>
  <div class="footer">Tagged • support@taggedpay.xyz</div>
</div>
</body>
</html>`;

export const sendEmail = async (to, title, body, explorerLink = null) => {
  try {
    const html = emailTemplate(title, body, explorerLink);

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
