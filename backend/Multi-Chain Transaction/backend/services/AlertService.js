const axios = require('axios');
const nodemailer = require('nodemailer');

class AlertService {
  constructor() {
    this.slackWebhook = process.env.ALERT_WEBHOOK_SLACK;
    this.emailEnabled = !!(process.env.SMTP_HOST && process.env.ALERT_EMAIL_TO);
    if (this.emailEnabled) {
      this.mailer = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    }
  }

  async send({ level, chain, type, message, data = {} }) {
    const payload = { level, chain, type, message, data, ts: new Date().toISOString() };
    await Promise.allSettled([
      this._slack(payload),
      this._email(payload),
    ]);
  }

  async _slack({ level, message, chain, type, ts }) {
    if (!this.slackWebhook) return;
    const emoji = level === 'error' ? '🔴' : '⚠️';
    await axios.post(this.slackWebhook, {
      text: `${emoji} *[${chain}] ${type}*\n${message}\n_${ts}_`,
    });
  }

  async _email({ level, message, chain, type, ts }) {
    if (!this.emailEnabled) return;
    await this.mailer.sendMail({
      from: process.env.ALERT_EMAIL_FROM,
      to: process.env.ALERT_EMAIL_TO,
      subject: `[${level.toUpperCase()}] ${chain} - ${type}`,
      text: `${message}\n\nTimestamp: ${ts}`,
    });
  }
}

module.exports = AlertService;
