const { SendByte } = require('@sendbyte/node');

const sendbyte = new SendByte(process.env.SENDBYTE_API_KEY);

async function sendSalesStoppedEmail({ toEmail, organizerName, eventTitle, ticketsSold, earnings }){
  const displayName = organizerName || 'there';
  const formattedEarnings = `₦${Number(earnings || 0).toLocaleString('en-NG')}`;

  try{
    await sendbyte.emails.send({
      from: 'Tixtee <noreply@tixtee.xyz>',
      to: toEmail,
      subject: `Ticket sales have closed for ${eventTitle}`,
      html: `
        <div style="font-family: Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; color: #434245;">
          <h2>Hi ${displayName}, ticket sales just closed</h2>
          <p>Sales for <strong>${eventTitle}</strong> have stopped since the event is starting soon.</p>
          <p>Tickets sold: <strong>${ticketsSold}</strong><br>Total earnings: <strong>${formattedEarnings}</strong></p>
        </div>
      `,
    });
  }catch(err){
    console.error('Sales stopped email FAILED', { eventTitle, toEmail, error: err.message });
  }
}

module.exports = { sendSalesStoppedEmail };