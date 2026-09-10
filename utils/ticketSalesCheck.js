const pool = require('../config/db');
const { getSalesCutoff } = require('./salesExpiry');
const { sendSalesStoppedEmail } = require('./salesStoppedEmail');

async function checkTicketSalesStatus(userId){
  const [events] = await pool.query(
    `SELECT id, title, event_date, start_time, sales_end_date, capacity,
            sales_prompt_sent, sales_stopped_email_sent
     FROM events
     WHERE creator_id = ? AND status = 'active' AND capacity IS NULL AND event_date >= CURDATE()`,
    [userId]
  );

  for(const event of events){
    if(!event.sales_end_date && !event.sales_prompt_sent){
      await pool.query(
        `INSERT INTO notifications (user_id, event_id, type, title, message)
         VALUES (?, ?, 'sales_end_prompt', ?, ?)`,
        [userId, event.id, 'Set a ticket sales end time', `When would you like ticket sales to stop for "${event.title}"? If you don't choose, sales will stop automatically 30 minutes before the event.`]
      );
      await pool.query('UPDATE events SET sales_prompt_sent = 1 WHERE id = ?', [event.id]);
    }

    const cutoff = getSalesCutoff(event);
    if(new Date() >= cutoff && !event.sales_stopped_email_sent){
      const [[organizer]] = await pool.query('SELECT name, email FROM users WHERE id = ?', [userId]);
      const [[totals]] = await pool.query(
        `SELECT COALESCE(SUM(quantity),0) AS tickets_sold, COALESCE(SUM(total_amount),0) AS earnings
         FROM orders WHERE event_id = ? AND status = 'paid'`,
        [event.id]
      );

      await sendSalesStoppedEmail({
        toEmail: organizer.email,
        organizerName: organizer.name,
        eventTitle: event.title,
        ticketsSold: totals.tickets_sold,
        earnings: totals.earnings
      });

      await pool.query(
        `INSERT INTO notifications (user_id, event_id, type, title, message)
         VALUES (?, ?, 'sales_stopped', ?, ?)`,
        [userId, event.id, 'Ticket sales closed', `Sales for "${event.title}" have stopped. ${totals.tickets_sold} tickets sold, ₦${Number(totals.earnings).toLocaleString('en-NG')} earned.`]
      );
      await pool.query('UPDATE events SET sales_stopped_email_sent = 1 WHERE id = ?', [event.id]);
    }
  }
}

module.exports = { checkTicketSalesStatus };