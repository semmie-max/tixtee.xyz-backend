const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM platform_settings');
    const settings = {};
    rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load settings' });
  }
});

router.put('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { commission_percent, currency, support_email } = req.body;
    const updates = { commission_percent, currency, support_email };

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      await pool.query(
        'INSERT INTO platform_settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value = ?',
        [key, value, value]
      );
    }

    res.json({ message: 'Settings updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update settings' });
  }
});

module.exports = router;