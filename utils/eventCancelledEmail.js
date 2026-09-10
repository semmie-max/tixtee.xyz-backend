const { SendByte } = require('@sendbyte/node');

const sendbyte = new SendByte(process.env.SENDBYTE_API_KEY);

async function sendEventCancelledEmail({ toEmail, buyerName, eventTitle, ticketPrice }) {
  const displayName = buyerName || 'there';
  const formattedPrice = `₦${Number(ticketPrice).toLocaleString('en-NG')}`;

  await sendbyte.emails.send({
    from: 'Tixtee <noreply@tixtee.xyz>',
    to: toEmail,
    subject: `${eventTitle} has been cancelled — refund on the way`,
    html: `
      <div style="font-family: Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; color: #434245;">
        <h2>Hi ${displayName}, your event was cancelled</h2>
        <p><strong>${eventTitle}</strong> has been cancelled by the organizer.</p>
        <p>Your payment of <strong>${formattedPrice}</strong> is being refunded automatically to the same payment method you used. This can take a few days to reflect, and we'll email you again once it's confirmed.</p>
        <p>No action is needed from you.</p>
      </div>
    `,
  });
}

module.exports = { sendEventCancelledEmail };