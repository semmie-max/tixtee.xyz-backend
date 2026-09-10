const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const { sendTicketConfirmationEmail } = require('../utils/ticketEmail');
const { getSalesCutoff } = require('../utils/salesExpiry');

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

const BACHS_API_KEY = process.env.BACHS_API_KEY;
const BACHS_BASE_URL = process.env.BACHS_BASE_URL || 'https://sandbox-api.bachs.io';
const BACHS_WEBHOOK_SECRET = process.env.BACHS_WEBHOOK_SECRET;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'https://tixtee.xyz';

/**
 * POST /api/orders/checkout
 * Public — a buyer does not need an account to purchase a ticket.
 * Body: { event_id, ticket_id, quantity, buyer_email, buyer_name, success_url, cancel_url }
 *
 * success_url/cancel_url should be the current event page URL (with its slug/id already
 * in the query string) — this endpoint appends `&order=<id>` to success_url itself.
 */
router.post('/checkout', async (req, res) => {
  try {
    const { event_id, ticket_id, quantity, buyer_email, buyer_name, success_url, cancel_url } = req.body;

    if (!event_id || !ticket_id || !buyer_email || !success_url || !cancel_url) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    // Only allow redirecting back to our own site
    if (!success_url.startsWith(CLIENT_ORIGIN) || !cancel_url.startsWith(CLIENT_ORIGIN)) {
      return res.status(400).json({ error: 'Invalid redirect URL' });
    }

    const [tickets] = await pool.query(
      'SELECT id, event_id, tier_name, price, quantity, quantity_sold FROM event_tickets WHERE id = ? AND event_id = ?',
      [ticket_id, event_id]
    );
    if (!tickets.length) return res.status(404).json({ error: 'Ticket tier not found' });
    const ticket = tickets[0];

    const [eventRowsForCutoff] = await pool.query(
      'SELECT event_date, start_time, sales_end_date FROM events WHERE id = ?',
      [event_id]
    );
    if (!eventRowsForCutoff.length) return res.status(404).json({ error: 'Event not found' });

    const cutoff = getSalesCutoff(eventRowsForCutoff[0]);
    if (new Date() >= cutoff) {
      return res.status(409).json({ error: 'Ticket sales have closed for this event' });
    }

    if (ticket.quantity !== null && ticket.quantity_sold + qty > ticket.quantity) {
      return res.status(409).json({ error: 'Not enough tickets left in this tier' });
    }

    const unitPrice = Number(ticket.price);
    const totalAmount = (unitPrice * qty).toFixed(2);

    const [orderResult] = await pool.query(
      `INSERT INTO orders (event_id, ticket_id, buyer_email, buyer_name, quantity, unit_price, total_amount, currency, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'NGN', 'pending')`,
      [event_id, ticket_id, buyer_email, buyer_name || null, qty, unitPrice.toFixed(2), totalAmount]
    );
    const orderId = orderResult.insertId;

    const finalSuccessUrl = new URL(success_url);
    finalSuccessUrl.searchParams.set('order', orderId);

    const bachsRes = await fetch(`${BACHS_BASE_URL}/v1/checkout-sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BACHS_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pricing: { currency: 'NGN', amount: totalAmount },
        customer: { email: buyer_email, name: buyer_name || undefined },
        success_url: finalSuccessUrl.toString(),
        cancel_url,
        reference: `order_${orderId}`,
        metadata: { order_id: String(orderId), event_id: String(event_id), ticket_id: String(ticket_id) }
      })
    });

    const bachsData = await bachsRes.json();
    if (!bachsRes.ok) {
      console.error('Bachs checkout error:', bachsData);
      await pool.query('UPDATE orders SET status = "failed" WHERE id = ?', [orderId]);
      return res.status(502).json({ error: 'Could not start checkout' });
    }

    await pool.query('UPDATE orders SET checkout_id = ? WHERE id = ?', [bachsData.checkout_id, orderId]);

    res.json({ order_id: orderId, checkout_url: bachsData.checkout_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not start checkout' });
  }
});

/**
 * GET /api/orders/:id/status
 * Public — the event page polls this after redirecting back from checkout,
 * since the webhook (source of truth) may land a moment after the redirect does.
 */
router.get('/:id/status', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.id, o.status, o.quantity, o.total_amount, o.currency, e.title AS event_title
       FROM orders o JOIN events e ON e.id = o.event_id
       WHERE o.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load order' });
  }
});

/**
 * POST /api/orders/webhook
 * Bachs calls this. Verifies the HMAC-SHA256 signature before trusting anything.
 */
router.post('/webhook', async (req, res) => {
  try {
    const timestampHeader = req.headers['x-bachs-timestamp'];
    const signatureHeader = req.headers['x-bachs-signature'];

    if (!timestampHeader || !signatureHeader || !req.rawBody) {
      return res.status(400).json({ error: 'Missing signature headers' });
    }

    const timestamp = parseInt(timestampHeader, 10);
    if (Math.abs(Date.now() / 1000 - timestamp) > 300) {
      return res.status(400).json({ error: 'Stale webhook' });
    }

    const message = `${timestamp}.${req.rawBody.toString('utf8')}`;
    const expected = crypto
      .createHmac('sha256', BACHS_WEBHOOK_SECRET)
      .update(message, 'utf8')
      .digest('hex');

    const sigBuf = Buffer.from(signatureHeader);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body;

    if (event.type === 'collection.succeeded') {
      const checkoutId = event.data.checkout_id;
      const [orders] = await pool.query('SELECT * FROM orders WHERE checkout_id = ?', [checkoutId]);
      if (orders.length && orders[0].status !== 'paid') {
        const order = orders[0];
        const ticketCode = await generateUniqueTicketCode();
        const accessToken = crypto.randomBytes(24).toString('hex');
        await pool.query(
          'UPDATE orders SET status = "paid", charge_id = ?, ticket_code = ?, access_token = ? WHERE id = ?',
          [event.data.charge_id, ticketCode, accessToken, order.id]
        );
        await pool.query(
          'UPDATE event_tickets SET quantity_sold = quantity_sold + ? WHERE id = ?',
          [order.quantity, order.ticket_id]
        );

        const verificationLink = `https://tixtee.xyz/my-ticket?orderId=${order.id}&token=${accessToken}`;

        const [ticketRows] = await pool.query(
          'SELECT tier_name, price FROM event_tickets WHERE id = ?',
          [order.ticket_id]
        );
        const [eventRows] = await pool.query(
          'SELECT title FROM events WHERE id = ?',
          [order.event_id]
        );

        await sendTicketConfirmationEmail({
          toEmail: order.buyer_email,
          buyerName: order.buyer_name,
          eventTitle: eventRows[0] ? eventRows[0].title : '',
          ticketName: ticketRows[0] ? ticketRows[0].tier_name : 'Ticket',
          ticketPrice: order.total_amount,
          orderId: order.id,
          verificationLink,
        });

        const [[eventOwner]] = await pool.query(
          'SELECT creator_id FROM events WHERE id = ?',
          [order.event_id]
        );
        if (eventOwner) {
          const buyerLabel = order.buyer_name || order.buyer_email;
          const eventTitleForNotif = eventRows[0] ? eventRows[0].title : 'your event';
          await pool.query(
            `INSERT INTO notifications (user_id, event_id, type, title, message)
             VALUES (?, ?, 'ticket_sold', ?, ?)`,
            [
              eventOwner.creator_id,
              order.event_id,
              'New ticket sold',
              `${buyerLabel} just got a new ticket for ${eventTitleForNotif}.`
            ]
          );
        }
      }
    } else if (event.type === 'collection.failed') {
      await pool.query(
        'UPDATE orders SET status = "failed" WHERE checkout_id = ? AND status = "pending"',
        [event.data.checkout_id]
      );
    } else if (event.type === 'checkout.expired') {
      await pool.query(
        'UPDATE orders SET status = "expired" WHERE checkout_id = ? AND status = "pending"',
        [event.data.checkout_id]
      );
    } else if (event.type === 'refund.paid') {
      await pool.query(
        'UPDATE orders SET refund_status = "success" WHERE refund_id = ?',
        [event.data.refund_id]
      );
    } else if (event.type === 'refund.failed') {
      await pool.query(
        'UPDATE orders SET refund_status = "failed" WHERE refund_id = ?',
        [event.data.refund_id]
      );
    }

    res.json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;