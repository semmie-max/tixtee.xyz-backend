 const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { checkTicketSalesStatus } = require('../utils/ticketSalesCheck');
const { sendEventLiveEmail } = require('../utils/eventLiveEmail');
const { sendEventCancelledEmail } = require('../utils/eventCancelledEmail');

const BACHS_API_KEY = process.env.BACHS_API_KEY;
const BACHS_BASE_URL = process.env.BACHS_BASE_URL || 'https://sandbox-api.bachs.io';

async function processRefundsInBackground(paidOrders, eventTitle){
  for (const order of paidOrders) {
    try {
      await sendEventCancelledEmail({
        toEmail: order.buyer_email,
        buyerName: order.buyer_name,
        eventTitle,
        ticketPrice: order.total_amount,
      });
    } catch (emailErr) {
      console.error(`Could not send cancellation email for order ${order.id}:`, emailErr.message);
    }

    try {
      const refundRes = await fetch(`${BACHS_BASE_URL}/v1/refunds`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${BACHS_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          charge_id: order.charge_id,
          reference: `refund_order_${order.id}`,
          reason: 'Event cancelled by organizer',
          idempotency_key: `refund_order_${order.id}`
        })
      });
      const refundData = await refundRes.json();

      if (refundRes.ok) {
        await pool.query(
          'UPDATE orders SET refund_status = ?, refund_id = ? WHERE id = ?',
          [refundData.status, refundData.refund_id, order.id]
        );
      } else {
        console.error(`Refund failed for order ${order.id}:`, refundData);
        await pool.query('UPDATE orders SET refund_status = ? WHERE id = ?', ['failed', order.id]);
      }
    } catch (refundErr) {
      console.error(`Could not start refund for order ${order.id}:`, refundErr.message);
      await pool.query('UPDATE orders SET refund_status = ? WHERE id = ?', ['failed', order.id]);
    }
  }
}

const router = express.Router();
function slugify(str){
  return (str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function generateUniqueSlug(name){
  const base = slugify(name) || 'chat';
  let slug = base;
  let i = 1;
  while(true){
    const [existing] = await pool.query('SELECT id FROM events WHERE groupchat_slug = ?', [slug]);
    if(!existing.length) return slug;
    i++;
    slug = `${base}-${i}`;
  }
}

router.get('/public', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM events WHERE status = ? ORDER BY event_date ASC',
      ['active']
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load events' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    checkTicketSalesStatus(req.user.id).catch(e => console.error('Sales check failed:', e.message));

    const [rows] = await pool.query(
      'SELECT * FROM events WHERE creator_id = ? AND status != ? ORDER BY event_date ASC',
      [req.user.id, 'cancelled']
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load events' });
  }
});

router.get('/stats/summary', requireAuth, async (req, res) => {
  try {
    const [[row]] = await pool.query(
      `SELECT COALESCE(SUM(o.quantity),0) AS tickets_issued, COALESCE(SUM(o.total_amount),0) AS earnings
       FROM orders o
       JOIN events e ON e.id = o.event_id
       WHERE e.creator_id = ? AND o.status = 'paid'`,
      [req.user.id]
    );
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load stats' });
  }
});

router.get('/check-url/:slug', requireAuth, async (req, res) => {
  try {
    const slug = (req.params.slug || '').toLowerCase().trim();
    if (!slug) {
      return res.status(400).json({ error: 'Missing slug' });
    }

    const [rows] = await pool.query(
      'SELECT id FROM events WHERE custom_url = ?',
      [slug]
    );

    res.json({ available: rows.length === 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not check URL' });
  }
});

router.put('/:id/sales-end', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { sales_end_date } = req.body;
    if (!sales_end_date) {
      return res.status(400).json({ error: 'Missing sales_end_date' });
    }

    const [result] = await pool.query(
      'UPDATE events SET sales_end_date = ? WHERE id = ? AND creator_id = ?',
      [sales_end_date, req.params.id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({ message: 'Sales end time updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update sales end time' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT events.*, users.name AS organizer_name, users.email AS organizer_contact
       FROM events
       JOIN users ON events.creator_id = users.id
       WHERE events.id = ? OR events.custom_url = ?`,
      [req.params.id, req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = rows[0];

    // Use the actual event ID for related tables
    const [lineup] = await pool.query(
      'SELECT name, role FROM event_lineup WHERE event_id = ?',
      [event.id]
    );

    const [tickets] = await pool.query(
      'SELECT id, tier_name, price, quantity FROM event_tickets WHERE event_id = ?',
      [event.id]
    );

        const [faqs] = await pool.query(
      'SELECT question, answer FROM event_faqs WHERE event_id = ?',
      [event.id]
    );

    const [sponsors] = await pool.query(
      'SELECT name FROM event_sponsors WHERE event_id = ?',
      [event.id]
    );

    event.lineup = lineup;
    event.tickets = tickets;
        event.faqs = faqs;
    event.sponsors = sponsors;

    res.json(event);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load event' });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      title, description, event_date, start_time, end_time,
      venue, capacity, price, image_url, has_groupchat, category,
      event_format, is_virtual, virtual_link, is_recurring, recurrence_pattern,
      social_instagram, social_twitter, social_tiktok, custom_url, latitude,longitude,
      groupchat_name, groupchat_rules, groupchat_link, lineup,
      has_secret_guest, secret_guest_note, has_golden_seat, golden_seat_note,
      age_limit, event_template,
      sales_start_date, sales_end_date, refund_policy, allow_transfers,
      groupchat_created, enable_networking, event_rules, dress_code, event_theme, tags, highlights,
      tickets, faqs, sponsors
    } = req.body;

    if (!title || !event_date) {
      return res.status(400).json({ error: 'Title and date are required' });
    }
        let groupchat_slug = null;
    if (has_groupchat && groupchat_name) {
      groupchat_slug = await generateUniqueSlug(groupchat_name);
    }

    const [result] = await pool.query(
      `INSERT INTO events
       (creator_id, title, description, event_date, start_time, end_time, venue, capacity, price,
        image_url, has_groupchat, category, event_format, is_virtual, virtual_link, is_recurring,
        recurrence_pattern, social_instagram, social_twitter, social_tiktok, custom_url, latitude, longitude,
        groupchat_name, groupchat_slug, groupchat_rules, groupchat_link, has_secret_guest, secret_guest_note, has_golden_seat, golden_seat_note,
                age_limit, event_template,
        sales_start_date, sales_end_date, refund_policy, allow_transfers,
        groupchat_created, enable_networking, event_rules, dress_code, event_theme, tags, highlights)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.user.id, title, description, event_date, start_time, end_time, venue, capacity, price,
                image_url, !!has_groupchat, category || 'Music & Concerts', event_format, !!is_virtual, virtual_link,
        !!is_recurring, recurrence_pattern, social_instagram, social_twitter, social_tiktok, custom_url,
        latitude || null, longitude || null,
        groupchat_name, groupchat_slug, groupchat_rules, groupchat_link || null, !!has_secret_guest, secret_guest_note, !!has_golden_seat, golden_seat_note,
        age_limit || null, event_template || 'classic',
        sales_start_date || null, sales_end_date || null, refund_policy || 'no_refunds', allow_transfers !== false,
        !!groupchat_created, !!enable_networking, event_rules || null, dress_code || null, event_theme || null, tags || null, highlights || null
      ]
    );

    const eventId = result.insertId;

    if (Array.isArray(lineup) && lineup.length) {
      const values = lineup
        .filter(person => person.name && person.name.trim())
        .map(person => [eventId, person.name.trim(), person.role || null]);
      if (values.length) {
        await pool.query('INSERT INTO event_lineup (event_id, name, role) VALUES ?', [values]);
      }
    }

    if (Array.isArray(tickets) && tickets.length) {
      const values = tickets
        .filter(t => t.tier_name && t.tier_name.trim() && t.price)
        .map(t => [eventId, t.tier_name.trim(), t.price, t.quantity || null]);
      if (values.length) {
        await pool.query('INSERT INTO event_tickets (event_id, tier_name, price, quantity) VALUES ?', [values]);
      }
    }

        if (Array.isArray(faqs) && faqs.length) {
      try {
        const values = faqs
          .filter(f => f.question && f.question.trim())
          .map(f => [eventId, f.question.trim(), f.answer || null]);
        if (values.length) {
          await pool.query('INSERT INTO event_faqs (event_id, question, answer) VALUES ?', [values]);
        }
      } catch (faqErr) {
        console.error('Could not save FAQs (event still created):', faqErr.message);
      }
    }

    if (Array.isArray(sponsors) && sponsors.length) {
      try {
        const values = sponsors
          .filter(s => s.name && s.name.trim())
          .map(s => [eventId, s.name.trim()]);
        if (values.length) {
          await pool.query('INSERT INTO event_sponsors (event_id, name) VALUES ?', [values]);
        }
      } catch (sponsorErr) {
        console.error('Could not save sponsors (event still created):', sponsorErr.message);
      }
    }

    try {
      await pool.query(
        `INSERT INTO notifications (user_id, event_id, type, title, message)
         VALUES (?, ?, 'event_live', ?, ?)`,
        [req.user.id, eventId, 'Your event is live', `"${title}" has been published and is ready to sell tickets.`]
      );
    } catch (notifErr) {
      console.error('Could not create event-live notification:', notifErr.message);
    }

    try {
      const [[organizer]] = await pool.query('SELECT name, email FROM users WHERE id = ?', [req.user.id]);
      const eventLink = `https://tixtee.xyz/e/${custom_url || eventId}`;
      await sendEventLiveEmail({
        toEmail: organizer.email,
        organizerName: organizer.name,
        eventTitle: title,
        eventLink,
      });
    } catch (emailErr) {
      console.error('Could not send event-live email:', emailErr.message);
    }

    res.json({ id: eventId, message: 'Event created' });
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That custom URL is already taken — try another one' });
    }
    res.status(500).json({ error: 'Could not create event' });
  }
});

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, description, event_date, start_time, end_time, venue, capacity, image_url } = req.body;

    if (!title || !event_date) {
      return res.status(400).json({ error: 'Title and date are required' });
    }

    const [result] = await pool.query(
      `UPDATE events
       SET title = ?, description = ?, event_date = ?, start_time = ?, end_time = ?,
           venue = ?, capacity = ?, image_url = ?
       WHERE id = ? AND creator_id = ?`,
      [title, description, event_date, start_time, end_time, venue, capacity || null, image_url, req.params.id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({ message: 'Event updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update event' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [paidOrders] = await pool.query(
      `SELECT o.id, o.buyer_email, o.buyer_name, o.total_amount, o.charge_id
       FROM orders o WHERE o.event_id = ? AND o.status = 'paid'`,
      [req.params.id]
    );

    if (paidOrders.length > 0) {
      const [[eventRow]] = await pool.query(
        'SELECT title FROM events WHERE id = ? AND creator_id = ?',
        [req.params.id, req.user.id]
      );
      if (!eventRow) return res.status(404).json({ error: 'Event not found' });

      const [result] = await pool.query(
        'UPDATE events SET status = ? WHERE id = ? AND creator_id = ?',
        ['cancelled', req.params.id, req.user.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Event not found' });

      res.json({ message: 'Event cancelled. Refunds are being processed for all paid orders.' });

      processRefundsInBackground(paidOrders, eventRow.title);
      return;
    }

    const [anyOrders] = await pool.query(
      'SELECT COUNT(*) AS count FROM orders WHERE event_id = ?',
      [req.params.id]
    );
    if (anyOrders[0].count > 0) {
      const [result] = await pool.query(
        'UPDATE events SET status = ? WHERE id = ? AND creator_id = ?',
        ['cancelled', req.params.id, req.user.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Event not found' });
      return res.json({ message: 'Event has existing orders, so it was cancelled instead of deleted' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM event_lineup WHERE event_id = ?', [req.params.id]);
      await conn.query('DELETE FROM event_tickets WHERE event_id = ?', [req.params.id]);
      await conn.query('DELETE FROM event_faqs WHERE event_id = ?', [req.params.id]);
      await conn.query('DELETE FROM event_sponsors WHERE event_id = ?', [req.params.id]);

      const [result] = await conn.query(
        'DELETE FROM events WHERE id = ? AND creator_id = ?',
        [req.params.id, req.user.id]
      );

      if (result.affectedRows === 0) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ error: 'Event not found' });
      }

      await conn.commit();
      conn.release();
      res.json({ message: 'Event deleted' });
    } catch (innerErr) {
      await conn.rollback();
      conn.release();
      throw innerErr;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete event' });
  }
});

module.exports = router;