const express = require('express');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

async function generateUniqueTicketCode(){
  while(true){
    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
    const [existing] = await pool.query('SELECT id FROM orders WHERE ticket_code = ?', [code]);
    if(!existing.length) return code;
  }
}

const MAX_SCANS = 2;

/**
 * POST /api/tickets/confirm
 * Organizer scans/enters a 6-digit code at the door.
 * Allows up to MAX_SCANS confirmations per code, then requires a fresh code.
 */
router.post('/confirm', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Enter a valid 6-digit code.' });
    }

    const [rows] = await pool.query(
      `SELECT o.id, o.buyer_name, o.buyer_email, o.status, o.scan_count, e.creator_id
       FROM orders o
       JOIN events e ON e.id = o.event_id
       WHERE o.ticket_code = ?`,
      [code]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'That ticket code was not found.' });
    }

    const order = rows[0];

    // Only the event's organizer can confirm its tickets
    if (order.creator_id !== req.user.id) {
      return res.status(403).json({ error: 'This ticket belongs to a different event.' });
    }

    if (order.status !== 'paid') {
      return res.status(400).json({ error: 'This ticket has not been paid for.' });
    }

    if (order.scan_count >= MAX_SCANS) {
      return res.status(409).json({
        error: `This ticket has reached its scan limit (${MAX_SCANS}/${MAX_SCANS}). Generate a new code to allow entry.`,
        limit_reached: true
      });
    }

    const newScanCount = order.scan_count + 1;
    await pool.query('UPDATE orders SET scan_count = ? WHERE id = ?', [newScanCount, order.id]);

    res.json({
      holder_name: order.buyer_name || order.buyer_email,
      scans_used: newScanCount,
      scans_remaining: MAX_SCANS - newScanCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not confirm ticket' });
  }
});

/**
 * POST /api/tickets/:orderId/regenerate-code
 * Organizer issues a fresh code for an order that hit its scan limit, and resets scan_count.
 */
router.post('/:orderId/regenerate-code', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.id, e.creator_id
       FROM orders o
       JOIN events e ON e.id = o.event_id
       WHERE o.id = ?`,
      [req.params.orderId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    if (rows[0].creator_id !== req.user.id) {
      return res.status(403).json({ error: 'This ticket belongs to a different event.' });
    }

    const newCode = await generateUniqueTicketCode();
    await pool.query(
      'UPDATE orders SET ticket_code = ?, scan_count = 0 WHERE id = ?',
      [newCode, req.params.orderId]
    );

    res.json({ ticket_code: newCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not regenerate ticket code' });
  }
});

module.exports = router;