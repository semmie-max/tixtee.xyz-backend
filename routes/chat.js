const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/chat/active
 * Lists group chats for events the logged-in organizer created,
 * where the organizer has turned on + finished setting up the chat.
 * This powers the "Active Group Chat(s)" stat card and the chat list page.
 */
router.get('/active', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT e.id, e.title, e.image_url, e.groupchat_name, e.event_date,
              (SELECT m.message FROM group_chat_messages m
                WHERE m.event_id = e.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT m.created_at FROM group_chat_messages m
                WHERE m.event_id = e.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
       FROM events e
       WHERE e.creator_id = ? AND e.has_groupchat = 1 AND e.groupchat_created = 1
       ORDER BY last_message_at IS NULL, last_message_at DESC, e.event_date ASC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load group chats' });
  }
});

/**
 * GET /api/chat/:eventId/messages
 * Message history for one event's group chat.
 *
 * NOTE: right now this only checks that the chat is active — it does not yet
 * check that the requester actually bought a ticket to this event (there's no
 * ticket-ownership table wired up yet). Once you have one, add that check here
 * so random logged-in users can't read/post in someone else's event chat.
 */
router.get('/:eventId/messages', requireAuth, async (req, res) => {
  try {
    const [events] = await pool.query(
      'SELECT id, has_groupchat, groupchat_created FROM events WHERE id = ?',
      [req.params.eventId]
    );
    if (!events.length) return res.status(404).json({ error: 'Event not found' });
    if (!events[0].has_groupchat || !events[0].groupchat_created) {
      return res.status(403).json({ error: 'This event has no active group chat' });
    }

    const [messages] = await pool.query(
      `SELECT m.id, m.sender_id, m.message, m.created_at, u.name AS sender_name
       FROM group_chat_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.event_id = ?
       ORDER BY m.created_at ASC`,
      [req.params.eventId]
    );
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load messages' });
  }
});

/**
 * POST /api/chat/:eventId/messages
 * Sends a message into an event's group chat.
 */
router.post('/:eventId/messages', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    const [events] = await pool.query(
      'SELECT id, has_groupchat, groupchat_created FROM events WHERE id = ?',
      [req.params.eventId]
    );
    if (!events.length) return res.status(404).json({ error: 'Event not found' });
    if (!events[0].has_groupchat || !events[0].groupchat_created) {
      return res.status(403).json({ error: 'This event has no active group chat' });
    }

    const [result] = await pool.query(
      'INSERT INTO group_chat_messages (event_id, sender_id, message) VALUES (?, ?, ?)',
      [req.params.eventId, req.user.id, message.trim()]
    );

    res.json({
      id: result.insertId,
      event_id: Number(req.params.eventId),
      sender_id: req.user.id,
      sender_name: req.user.name || 'You',
      message: message.trim(),
      created_at: new Date()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send message' });
  }
});

module.exports = router;