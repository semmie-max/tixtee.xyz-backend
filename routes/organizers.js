const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, avatar_url, handle, bio, cover_image_url, is_verified,
              social_instagram, social_twitter, social_facebook
       FROM users WHERE id = ? OR handle = ?`,
      [req.params.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Organizer not found' });

    const organizer = rows[0];

    const [[eventCount]] = await pool.query(
      'SELECT COUNT(*) AS count FROM events WHERE creator_id = ? AND status != ?',
      [organizer.id, 'cancelled']
    );

    const [[ratingStats]] = await pool.query(
      'SELECT AVG(rating) AS avg_rating, COUNT(*) AS rating_count FROM organizer_ratings WHERE organizer_id = ?',
      [organizer.id]
    );

    let userRating = 0;
    if (req.cookies && req.cookies.token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
        const [[existing]] = await pool.query(
          'SELECT rating FROM organizer_ratings WHERE organizer_id = ? AND user_id = ?',
          [organizer.id, decoded.id]
        );
        if (existing) userRating = existing.rating;
      } catch (err) { /* not logged in — ignore */ }
    }

    res.json({
      ...organizer,
      event_count: eventCount.count,
      avg_rating: ratingStats.avg_rating,
      rating_count: ratingStats.rating_count,
      user_rating: userRating
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load organizer' });
  }
});

router.get('/:id/events', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, event_date, image_url, custom_url FROM events WHERE creator_id = ? AND status = ? ORDER BY event_date DESC',
      [req.params.id, 'active']
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load events' });
  }
});

router.post('/:id/rate', requireAuth, async (req, res) => {
  try {
    const { rating } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    await pool.query(
      `INSERT INTO organizer_ratings (organizer_id, user_id, rating)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating)`,
      [req.params.id, req.user.id, rating]
    );

    const [[stats]] = await pool.query(
      'SELECT AVG(rating) AS avg_rating, COUNT(*) AS rating_count FROM organizer_ratings WHERE organizer_id = ?',
      [req.params.id]
    );

    res.json({ avg_rating: stats.avg_rating, rating_count: stats.rating_count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save rating' });
  }
});

router.get('/:id/comments', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.text, c.created_at, u.name AS author_name
       FROM organizer_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.organizer_id = ?
       ORDER BY c.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load comments' });
  }
});

router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment cannot be empty' });
    }

    await pool.query(
      'INSERT INTO organizer_comments (organizer_id, user_id, text) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, text.trim().slice(0, 1000)]
    );

    res.json({ message: 'Comment posted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not post comment' });
  }
});

module.exports = router;