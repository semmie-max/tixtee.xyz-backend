const { SendByte } = require('@sendbyte/node');

const sendbyte = new SendByte(process.env.SENDBYTE_API_KEY);

async function sendTicketTransferredEmail({ toEmail, recipientName, eventTitle, verificationLink }) {
  const displayName = recipientName || 'there';

  await sendbyte.emails.send({
    from: 'Tixtee <noreply@tixtee.xyz>',
    to: toEmail,
    subject: `A ticket to ${eventTitle} was transferred to you`,
    html: `
      <div style="font-family: Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; color: #434245;">
        <h2>Hi ${displayName}, you've received a ticket</h2>
        <p>Someone transferred their ticket for <strong>${eventTitle}</strong> to you.</p>
        <p>Click the button below to get your ticket code.</p>
        <a href="${verificationLink}" style="display:inline-block; background:#47034E; color:#fff; padding:10px 25px; border-radius:30px; text-decoration:none; font-weight:bold;">Get my ticket code</a>
      </div>
    `,
  });
}

module.exports = { sendTicketTransferredEmail };