const { SendByte } = require('@sendbyte/node');
const { buildStatusEmailHtml } = require('./statusEmailLayout');

const sendbyte = new SendByte(process.env.SENDBYTE_API_KEY);

async function sendTicketConfirmationEmail({ toEmail, buyerName, eventTitle, ticketName, ticketPrice, orderId, verificationLink }) {
  const displayName = buyerName || 'there';
  const formattedPrice = `₦${Number(ticketPrice).toLocaleString('en-NG')}`;

  const html = buildStatusEmailHtml({
    preview: 'Your Tixtee ticket is confirmed',
    bannerHeading: `Hi ${displayName}, you have a new ticket.`,
    bannerBody: 'Your purchase went through and your ticket is ready.',
    cardLabel: 'Confirmed',
    cardColor: '#47034E',
    cardHeading: 'Ticket Confirmed',
    cardBodyHtml: `
      Order #${orderId} was successfully placed and your payment has been processed.
      <br><br>
      <strong>${ticketName}</strong><br>${eventTitle}<br>${formattedPrice}
    `,
    ctaText: 'Get my ticket code',
    ctaUrl: verificationLink,
  });

  await sendbyte.emails.send({
    from: 'Tixtee <noreply@tixtee.xyz>',
    to: toEmail,
    subject: 'Your Tixtee ticket is confirmed',
    html,
  });
}

module.exports = { sendTicketConfirmationEmail };