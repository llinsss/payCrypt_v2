import axios from "axios";

export async function sendHttpEmail({ to, title, body }) {
  const resp = await axios.post(
    "https://api.elasticemail.com/v2/email/send",
    null,
    {
      params: {
        apikey: process.env.ELASTICEMAIL_API_KEY,
        subject: title,
        from: "support@taggedpay.xyz",
        to,
        bodyHtml: body,
        isTransactional: true,
      },
    }
  );
  console.log("✅ Email sent:", resp.data);
}
