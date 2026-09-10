const { SendByte } = require('@sendbyte/node');

const sendbyte = new SendByte(process.env.SENDBYTE_API_KEY);

async function sendEventLiveEmail({ toEmail, organizerName, eventTitle, eventLink }) {
  const displayName = organizerName || 'there';

  await sendbyte.emails.send({
    from: 'Tixtee <noreply@tixtee.xyz>',
    to: toEmail,
    subject: `${eventTitle} is now live`,
    html: `
      <div style="font-family: Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; color: #434245;">
        <h2>Hi ${displayName}, your event is live</h2>
        <p><strong>${eventTitle}</strong> is now published and ready to sell tickets.</p>
        <a href="${eventLink}" style="display:inline-block; background:#47034E; color:#fff; padding:10px 25px; border-radius:30px; text-decoration:none; font-weight:bold;">View your event</a>
      </div>
    `,
  });
}

module.exports = { sendEventLiveEmail };