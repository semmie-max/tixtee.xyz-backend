const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendTicketTransferredEmail } = require('../utils/ticketTransferEmail');

const router = express.Router();

const TICKET_CODE_CHARS = 'ABCDEFGHJKLMNPQRTUVWXYZ234679';

function randomTicketCode(length = 6){
  let code = '';
  for(let i = 0; i < length; i++){
    code += TICKET_CODE_CHARS.charAt(Math.floor(Math.random() * TICKET_CODE_CHARS.length));
  }
  return code;
}

async function generateUniqueTicketCode(){
  while(true){
    const code = randomTicketCode();
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

    const normalizedCode = (code || '').toUpperCase().trim();
    if (!normalizedCode || !/^[ABCDEFGHJKLMNPQRTUVWXYZ234679]{6}$/.test(normalizedCode)) {
      return res.status(400).json({ error: 'Enter a valid 6-character ticket code.' });
    }

    const [rows] = await pool.query(
      `SELECT o.id, o.buyer_name, o.buyer_email, o.status, o.scan_count, e.creator_id
       FROM orders o
       JOIN events e ON e.id = o.event_id
       WHERE o.ticket_code = ?`,
      [normalizedCode]
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
/**
 * GET /api/tickets/checked-in
 * Returns everyone who has been scanned at least once for this organizer's events,
 * sorted alphabetically by name.
 */
router.get('/checked-in', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.id, COALESCE(NULLIF(o.buyer_name, ''), o.buyer_email) AS holder_name,
              o.buyer_email, o.scan_count, e.title AS event_title
       FROM orders o
       JOIN events e ON e.id = o.event_id
       WHERE e.creator_id = ? AND o.status = 'paid' AND o.scan_count > 0
       ORDER BY holder_name ASC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load checked-in guests' });
  }
});
/**
 * GET /api/tickets/my-ticket/:orderId
 * Public route for the buyer to view their own ticket code, using the access_token
 * sent to them in their confirmation email. Not behind requireAuth.
 */
router.get('/my-ticket/:orderId', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Missing access token.' });

    const [rows] = await pool.query(
      `SELECT o.ticket_code, o.buyer_name, o.status, o.scan_count, o.transfer_count,
              e.event_date, e.start_time, e.allow_transfers
       FROM orders o
       JOIN events e ON e.id = o.event_id
       WHERE o.id = ? AND o.access_token = ?`,
      [req.params.orderId, token]
    );

    if (!rows.length) return res.status(404).json({ error: 'Ticket not found.' });
    const order = rows[0];
    if (order.status !== 'paid') return res.status(400).json({ error: 'This order has not been paid for.' });

    const eventStart = new Date(`${order.event_date.toISOString().slice(0,10)}T${order.start_time || '00:00:00'}`);
    const unlockTime = new Date(eventStart.getTime() - 2 * 60 * 60 * 1000);
    const isLocked = new Date() < unlockTime;

    const canTransfer = !!order.allow_transfers && order.scan_count === 0 && order.transfer_count === 0 && isLocked;

    if (isLocked) {
      return res.status(403).json({
        error: "Your ticket code isn't available yet.",
        code_locked: true,
        unlock_time: unlockTime.toISOString(),
        can_transfer: canTransfer
      });
    }

    res.json({ ticket_code: order.ticket_code, holder_name: order.buyer_name, can_transfer: canTransfer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load ticket.' });
  }
});


/**
 * POST /api/tickets/:orderId/transfer
 * Public — the current holder transfers their ticket to someone else, using the
 * access_token from their confirmation email. One transfer allowed per ticket.
 */
router.post('/:orderId/transfer', async (req, res) => {
  try {
    const { token, recipient_name, recipient_email } = req.body;

    if (!token) return res.status(400).json({ error: 'Missing access token.' });
    if (!recipient_name || !recipient_email || !/^\S+@\S+\.\S+$/.test(recipient_email)) {
      return res.status(400).json({ error: 'Enter a valid recipient name and email.' });
    }

    const [rows] = await pool.query(
      `SELECT o.status, o.scan_count, o.transfer_count,
              e.event_date, e.start_time, e.allow_transfers, e.title AS event_title
       FROM orders o
       JOIN events e ON e.id = o.event_id
       WHERE o.id = ? AND o.access_token = ?`,
      [req.params.orderId, token]
    );

    if (!rows.length) return res.status(404).json({ error: 'Ticket not found.' });
    const order = rows[0];

    if (order.status !== 'paid') return res.status(400).json({ error: 'This order has not been paid for.' });
    if (!order.allow_transfers) return res.status(403).json({ error: 'This event does not allow ticket transfers.' });
    if (order.transfer_count > 0) return res.status(409).json({ error: 'This ticket has already been transferred once.' });
    if (order.scan_count > 0) return res.status(409).json({ error: 'This ticket has already been used and can no longer be transferred.' });

    const eventStart = new Date(`${order.event_date.toISOString().slice(0,10)}T${order.start_time || '00:00:00'}`);
    const unlockTime = new Date(eventStart.getTime() - 2 * 60 * 60 * 1000);
    if (new Date() >= unlockTime) {
      return res.status(409).json({ error: 'Transfers close 2 hours before the event.' });
    }

    const newTicketCode = await generateUniqueTicketCode();
    const newAccessToken = crypto.randomBytes(24).toString('hex');

    await pool.query(
      `UPDATE orders
       SET buyer_name = ?, buyer_email = ?, ticket_code = ?, access_token = ?, transfer_count = transfer_count + 1
       WHERE id = ?`,
      [recipient_name, recipient_email, newTicketCode, newAccessToken, req.params.orderId]
    );

    const verificationLink = `https://tixtee.xyz/my-ticket?orderId=${req.params.orderId}&token=${newAccessToken}`;

    await sendTicketTransferredEmail({
      toEmail: recipient_email,
      recipientName: recipient_name,
      eventTitle: order.event_title,
      verificationLink,
    });

    res.json({ message: 'Ticket transferred successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not transfer ticket.' });
  }
});

module.exports = router;