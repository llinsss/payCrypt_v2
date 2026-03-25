import axios from "axios";

export async function sendHttpEmail({ to, title, body, explorerLink = null }) {
  const bodyHtml = explorerLink
    ? `${body}<br/><br/><a href="${explorerLink}" style="display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold;">View on Explorer</a>`
    : body;

  const resp = await axios.post(
    "https://api.elasticemail.com/v2/email/send",
    null,
    {
      params: {
        apikey: process.env.ELASTICEMAIL_API_KEY,
        subject: title,
        from: "support@taggedpay.xyz",
        to,
        bodyHtml,
        isTransactional: true,
      },
    }
  );
  console.log("✅ Email sent:", resp.data);
}
