const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try{
    const [rows] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30',
      [req.user.id]
    );
    res.json(rows);
  }catch(err){
    console.error(err);
    res.status(500).json({ error: 'Could not load notifications' });
  }
});

router.post('/:id/read', requireAuth, async (req, res) => {
  try{
    await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  }catch(err){
    console.error(err);
    res.status(500).json({ error: 'Could not update notification' });
  }
});

router.post('/read-all', requireAuth, async (req, res) => {
  try{
    await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ ok: true });
  }catch(err){
    console.error(err);
    res.status(500).json({ error: 'Could not update notifications' });
  }
});

module.exports = router;