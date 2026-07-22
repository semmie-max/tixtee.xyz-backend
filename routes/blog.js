const express = require('express');
const router = express.Router();
const db = require('../db'); // adjust to match how you import your MySQL connection/pool
const { requireAuth, requireAdmin } = require('../middleware/auth'); // adjust to match your actual auth middleware names/paths

// GET /api/blogs — list posts
// Public callers (?published=true) only see published posts.
// Logged-in admin callers with no query param see everything, including drafts.
router.get('/', async (req, res) => {
  try {
    const publishedOnly = req.query.published === 'true';
    const query = publishedOnly
      ? 'SELECT * FROM blogs WHERE is_draft = 0 ORDER BY created_at DESC'
      : 'SELECT * FROM blogs ORDER BY created_at DESC';
    const [rows] = await db.query(query);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch posts' });
  }
});

// GET /api/blogs/:slug — single post
router.get('/:slug', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM blogs WHERE slug = ? OR id = ? LIMIT 1',
      [req.params.slug, req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch post' });
  }
});

// POST /api/blogs — create a post (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, excerpt, content, image_url, is_draft } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const slug = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const [result] = await db.query(
      'INSERT INTO blogs (title, slug, excerpt, content, image_url, is_draft, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [title, slug, excerpt || null, content, image_url || null, is_draft ? 1 : 0]
    );

    res.status(201).json({ id: result.insertId, slug });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create post' });
  }
});



module.exports = router;