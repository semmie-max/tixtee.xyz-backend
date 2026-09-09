const express = require('express');
const { SendByte } = require('@sendbyte/node');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const sendbyte = new SendByte(process.env.SENDBYTE_API_KEY);

// ADMIN ONLY — send an email to some or all signed-up users
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { subject, message, recipientIds } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ error: 'Subject and message are required' });
    }

    let query = 'SELECT email FROM users';
    let params = [];
    if (Array.isArray(recipientIds) && recipientIds.length) {
      query += ` WHERE id IN (${recipientIds.map(() => '?').join(',')})`;
      params = recipientIds;
    }

    const [rows] = await pool.query(query, params);
    const emails = rows.map(r => r.email);

    if (!emails.length) {
      return res.status(400).json({ error: 'No matching recipients found' });
    }

    const results = await Promise.allSettled(
      emails.map(email =>
        sendbyte.emails.send({
          from: 'Tixtee <noreply@mail.tixtee.xyz>',
          to: email,
          template_id: 'dc499593-29d1-4d0a-a05c-6377126ba742',
          variables: {
            SUBJECT: subject,
            MESSAGE: message,
          },
        })
      )
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - sent;

    res.json({ message: `Sent to ${sent} of ${emails.length}`, sent, failed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send emails' });
  }
});

module.exports = router;