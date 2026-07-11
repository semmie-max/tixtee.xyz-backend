const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM events ORDER BY event_date ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load events' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM events WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Event not found' });

    const [lineup] = await pool.query('SELECT name, role FROM event_lineup WHERE event_id = ?', [req.params.id]);
    const [tickets] = await pool.query('SELECT id, tier_name, price, quantity FROM event_tickets WHERE event_id = ?', [req.params.id]);

    const event = rows[0];
    event.lineup = lineup;
    event.tickets = tickets;

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
      social_instagram, social_twitter, social_tiktok, custom_url,
      groupchat_name, groupchat_rules, lineup,
      has_secret_guest, secret_guest_note, has_golden_seat, golden_seat_note,
      tickets
    } = req.body;

    if (!title || !event_date) {
      return res.status(400).json({ error: 'Title and date are required' });
    }

    const [result] = await pool.query(
      `INSERT INTO events
       (creator_id, title, description, event_date, start_time, end_time, venue, capacity, price,
        image_url, has_groupchat, category, event_format, is_virtual, virtual_link, is_recurring,
        recurrence_pattern, social_instagram, social_twitter, social_tiktok, custom_url,
        groupchat_name, groupchat_rules, has_secret_guest, secret_guest_note, has_golden_seat, golden_seat_note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.user.id, title, description, event_date, start_time, end_time, venue, capacity, price,
        image_url, !!has_groupchat, category || 'Corporate event', event_format, !!is_virtual, virtual_link,
        !!is_recurring, recurrence_pattern, social_instagram, social_twitter, social_tiktok, custom_url,
        groupchat_name, groupchat_rules, !!has_secret_guest, secret_guest_note, !!has_golden_seat, golden_seat_note
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
    const [result] = await pool.query('DELETE FROM events WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Event not found' });
    res.json({ message: 'Event deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete event' });
  }
});

module.exports = router;