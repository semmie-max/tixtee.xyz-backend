const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/:eventId', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT sender_name, message, created_at FROM chat_messages WHERE event_id = ? ORDER BY created_at ASC',
      [req.params.eventId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load messages' });
  }
});

router.post('/:eventId', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message cannot be empty' });

    await pool.query(
      'INSERT INTO chat_messages (event_id, sender_name, message) VALUES (?,?,?)',
      [req.params.eventId, req.user.email, message.trim()]
    );
    res.json({ message: 'Sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send message' });
  }
});

module.exports = router;