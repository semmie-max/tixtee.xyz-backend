const { SendByte } = require('@sendbyte/node');

const sendbyte = new SendByte(process.env.SENDBYTE_API_KEY);

async function sendTicketConfirmationEmail({ toEmail, buyerName, eventTitle, ticketName, ticketPrice, orderId, verificationLink }) {
  const displayName = buyerName || 'there';
  const formattedPrice = `₦${Number(ticketPrice).toLocaleString('en-NG')}`;

  await sendbyte.emails.send({
    from: 'Tixtee <noreply@mail.tixtee.xyz>',
    to: toEmail,
    subject: 'Your Tixtee ticket is confirmed',
    html: `
      <div style="font-family: Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; color: #434245;">
        <h2>Hi ${displayName}, your ticket is confirmed</h2>
        <p>Your ticket purchase (#${orderId}) was successfully placed and your payment has been processed.</p>
        <p><strong>${ticketName}</strong><br>${eventTitle}<br>${formattedPrice}</p>
        <p>Click the button below to get your ticket verification code.</p>
        <a href="${verificationLink}" style="display:inline-block; background:#2e58ff; color:#fff; padding:10px 25px; border-radius:30px; text-decoration:none; font-weight:bold;">Get my ticket code</a>
      </div>
    `,
  });
}

module.exports = { sendTicketConfirmationEmail };