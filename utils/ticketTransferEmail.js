const { SendByte } = require('@sendbyte/node');
const { buildEmailHtml } = require('./emailLayout');

const sendbyte = new SendByte(process.env.SENDBYTE_API_KEY);

async function sendTicketTransferredEmail({ toEmail, recipientName, eventTitle, verificationLink }) {
  const displayName = recipientName || 'there';

  const html = buildEmailHtml({
    preview: `A ticket to ${eventTitle} was transferred to you`,
    heading: `Hi ${displayName}, you've received a ticket`,
    bodyHtml: `
      Someone transferred their ticket for <strong>${eventTitle}</strong> to you.
      <br><br>
      Click the button below to get your ticket code.
    `,
    ctaText: 'Get my ticket code',
    ctaUrl: verificationLink,
  });

  await sendbyte.emails.send({
    from: 'Tixtee <noreply@tixtee.xyz>',
    to: toEmail,
    subject: `A ticket to ${eventTitle} was transferred to you`,
    html,
  });
}

module.exports = { sendTicketTransferredEmail };