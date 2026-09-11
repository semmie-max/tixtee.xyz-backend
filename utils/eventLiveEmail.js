const { SendByte } = require('@sendbyte/node');
const { buildEmailHtml } = require('./emailLayout');

const sendbyte = new SendByte(process.env.SENDBYTE_API_KEY);

async function sendEventLiveEmail({ toEmail, organizerName, eventTitle, eventLink }) {
  const displayName = organizerName || 'there';

  const html = buildEmailHtml({
    preview: `${eventTitle} is now live`,
    heading: `Hi ${displayName}, your event is live`,
    bodyHtml: `<strong>${eventTitle}</strong> is now published and ready to sell tickets.`,
    ctaText: 'View your event',
    ctaUrl: eventLink,
  });

  await sendbyte.emails.send({
    from: 'Tixtee <noreply@tixtee.xyz>',
    to: toEmail,
    subject: `${eventTitle} is now live`,
    html,
  });
}

module.exports = { sendEventLiveEmail };