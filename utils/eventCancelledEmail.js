const { SendByte } = require('@sendbyte/node');
const { buildEmailHtml } = require('./emailLayout');

const sendbyte = new SendByte(process.env.SENDBYTE_API_KEY);

async function sendEventCancelledEmail({ toEmail, buyerName, eventTitle, ticketPrice }) {
  const displayName = buyerName || 'there';
  const formattedPrice = `₦${Number(ticketPrice).toLocaleString('en-NG')}`;

  const html = buildEmailHtml({
    preview: `${eventTitle} has been cancelled`,
    heading: `Hi ${displayName}, your event was cancelled`,
    bodyHtml: `
      <strong>${eventTitle}</strong> has been cancelled by the organizer.
      <br><br>
      Your payment of <strong>${formattedPrice}</strong> is being refunded automatically to the same payment method you used. This can take a few days to reflect, and we'll email you again once it's confirmed.
      <br><br>
      No action is needed from you.
    `,
  });

  await sendbyte.emails.send({
    from: 'Tixtee <noreply@tixtee.xyz>',
    to: toEmail,
    subject: `${eventTitle} has been cancelled — refund on the way`,
    html,
  });
}

module.exports = { sendEventCancelledEmail };