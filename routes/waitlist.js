const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// PUBLIC — anyone can join the waitlist
router.post('/', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid email' });
    }

    await pool.query(
      'INSERT INTO waitlist_emails (email) VALUES (?) ON DUPLICATE KEY UPDATE email = email',
      [email.trim().toLowerCase()]
    );

    res.json({ message: "You're on the list!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not join waitlist' });
  }
});

// ADMIN ONLY — view everyone who joined
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, email, created_at FROM waitlist_emails ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load waitlist' });
  }
});

module.exports = router;