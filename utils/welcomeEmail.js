const { SendByte } = require('@sendbyte/node');
const { buildEmailHtml } = require('./emailLayout');

const sendbyte = new SendByte(process.env.SENDBYTE_API_KEY);

async function sendWelcomeEmail({ toEmail, name, dashboardLink }) {
  const displayName = name || 'there';

  const html = buildEmailHtml({
    preview: 'Welcome to Tixtee',
    heading: `${displayName}, welcome onboard`,
    bodyHtml: `
      Your Tixtee account is ready. Create events, sell tickets, and manage everything from your dashboard.
    `,
    ctaText: 'Go to my dashboard',
    ctaUrl: dashboardLink,
  });

  await sendbyte.emails.send({
    from: 'Tixtee <noreply@tixtee.xyz>',
    to: toEmail,
    subject: 'Welcome to Tixtee',
    html,
  });
}

module.exports = { sendWelcomeEmail };