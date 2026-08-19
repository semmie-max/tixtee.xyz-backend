const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM events WHERE creator_id = ? ORDER BY event_date ASC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load events' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM events WHERE id = ? OR custom_url = ?',
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
      organizer_name, organizer_contact, age_limit, event_template,
      sales_start_date, sales_end_date, refund_policy, allow_transfers,
      groupchat_created, enable_networking, event_rules, dress_code, event_theme, tags, highlights,
      tickets, faqs, sponsors
    } = req.body;

    if (!title || !event_date) {
      return res.status(400).json({ error: 'Title and date are required' });
    }

    const [result] = await pool.query(
      `INSERT INTO events
       (creator_id, title, description, event_date, start_time, end_time, venue, capacity, price,
        image_url, has_groupchat, category, event_format, is_virtual, virtual_link, is_recurring,
        recurrence_pattern, social_instagram, social_twitter, social_tiktok, custom_url, latitude, longitude,
                groupchat_name, groupchat_rules, groupchat_link, has_secret_guest, secret_guest_note, has_golden_seat, golden_seat_note,
        organizer_name, organizer_contact, age_limit, event_template,
        sales_start_date, sales_end_date, refund_policy, allow_transfers,
        groupchat_created, enable_networking, event_rules, dress_code, event_theme, tags, highlights)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.user.id, title, description, event_date, start_time, end_time, venue, capacity, price,
                image_url, !!has_groupchat, category || 'Music & Concerts', event_format, !!is_virtual, virtual_link,
        !!is_recurring, recurrence_pattern, social_instagram, social_twitter, social_tiktok, custom_url,
        latitude || null, longitude || null,
                groupchat_name, groupchat_rules, groupchat_link || null, !!has_secret_guest, secret_guest_note, !!has_golden_seat, golden_seat_note,
        organizer_name || null, organizer_contact || null, age_limit || null, event_template || 'classic',
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

    res.json({ id: eventId, message: 'Event created' });
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That custom URL is already taken — try another one' });
    }
    res.status(500).json({ error: 'Could not create event' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM events WHERE id = ? AND creator_id = ?',
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Event not found' });
    res.json({ message: 'Event deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete event' });
  }
});

module.exports = router;