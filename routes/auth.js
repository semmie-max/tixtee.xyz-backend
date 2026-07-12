const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const { Resend } = require('resend');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const resend = new Resend(process.env.RESEND_API_KEY);

const resend = new Resend(process.env.RESEND_API_KEY);

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function isAdminEmail(email) {
  return email.toLowerCase() === (process.env.ADMIN_EMAIL || '').toLowerCase();
}

function issueToken(res, user) {
  const token = jwt.sign(
    { id: user.id, email: user.email, isAdmin: !!user.is_admin },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing name, email, or password' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(409).json({ error: 'An account with this email already exists — try logging in' });
    }

    const hash = await bcrypt.hash(password, 10);
    const admin = isAdminEmail(email);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, auth_provider, is_admin) VALUES (?,?,?,?,?)',
      [name, email, hash, 'local', admin]
    );

    const user = { id: result.insertId, email, is_admin: admin };
    issueToken(res, user);
    res.json({
      isAdmin: admin,
      message: admin ? 'Welcome back' : 'Account created — your dashboard unlocks at launch'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// LOGIN — email + password
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length || !rows[0].password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const match = await bcrypt.compare(password, rows[0].password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    issueToken(res, rows[0]);
    res.json({ isAdmin: !!rows[0].is_admin });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name } = payload;

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    let user;
    if (!rows.length) {
      const admin = isAdminEmail(email);
      const [result] = await pool.query(
        'INSERT INTO users (name, email, auth_provider, is_admin) VALUES (?,?,?,?)',
        [name, email, 'google', admin]
      );
      user = { id: result.insertId, email, is_admin: admin };
    } else {
      user = rows[0];
    }

    issueToken(res, user);
    res.json({ isAdmin: !!user.is_admin });
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: 'Google sign-in failed' });
  }
});

// WHO AM I — frontend calls this to decide dashboard vs pending page
router.get('/me', requireAuth, async (req, res) => {
  res.json({ email: req.user.email, isAdmin: req.user.isAdmin });
});

// ADMIN ONLY — list every account that has signed up
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, is_admin, auth_provider, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load users' });
  }
});// STEP 1 — request a reset code by email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const [rows] = await pool.query('SELECT id, name FROM users WHERE email = ?', [email]);

    // Always respond the same way, whether or not the email exists — avoids leaking who has an account
    if (!rows.length) {
      return res.json({ message: 'If that email has an account, a code has been sent.' });
    }

    const user = rows[0];
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await pool.query('INSERT INTO password_resets (user_id, code, expires_at) VALUES (?,?,?)', [user.id, code, expiresAt]);

    await resend.emails.send({
      from: 'Tixtee <onboarding@resend.dev>',
      to: email,
      subject: 'Your Tixtee password reset code',
      html: `<p>Hi ${user.name || ''},</p><p>Your password reset code is:</p><h2 style="letter-spacing:4px;">${code}</h2><p>This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`,
    });

    res.json({ message: 'If that email has an account, a code has been sent.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send reset code' });
  }
});

// STEP 2 — verify the code, issue a short-lived reset token
router.post('/verify-reset-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (!users.length) return res.status(400).json({ error: 'Invalid code' });

    const userId = users[0].id;
    const [resets] = await pool.query(
      'SELECT * FROM password_resets WHERE user_id = ? AND code = ? AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
      [userId, code]
    );

    if (!resets.length) return res.status(400).json({ error: 'Invalid or expired code' });

    const resetToken = jwt.sign({ userId, purpose: 'password_reset' }, process.env.JWT_SECRET, { expiresIn: '10m' });
    res.json({ resetToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not verify code' });
  }
});

// STEP 3 — set the new password using the reset token
router.post('/reset-password', async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Reset session expired — request a new code' });
    }

    if (decoded.purpose !== 'password_reset') {
      return res.status(401).json({ error: 'Invalid reset session' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, decoded.userId]);
    await pool.query('DELETE FROM password_resets WHERE user_id = ?', [decoded.userId]);

    res.json({ message: 'Password updated — you can log in now' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not reset password' });
  }
});


// STEP 1 — request a reset code by email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const [rows] = await pool.query('SELECT id, name FROM users WHERE email = ?', [email]);

    if (!rows.length) {
      return res.json({ message: 'If that email has an account, a code has been sent.' });
    }

    const user = rows[0];
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query('INSERT INTO password_resets (user_id, code, expires_at) VALUES (?,?,?)', [user.id, code, expiresAt]);

    await resend.emails.send({
      from: 'Tixtee <onboarding@resend.dev>',
      to: email,
      subject: 'Your Tixtee password reset code',
      html: `<p>Hi ${user.name || ''},</p><p>Your password reset code is:</p><h2 style="letter-spacing:4px;">${code}</h2><p>This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`,
    });

    res.json({ message: 'If that email has an account, a code has been sent.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send reset code' });
  }
});

// STEP 2 — verify the code, issue a short-lived reset token
router.post('/verify-reset-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (!users.length) return res.status(400).json({ error: 'Invalid code' });

    const userId = users[0].id;
    const [resets] = await pool.query(
      'SELECT * FROM password_resets WHERE user_id = ? AND code = ? AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
      [userId, code]
    );

    if (!resets.length) return res.status(400).json({ error: 'Invalid or expired code' });

    const resetToken = jwt.sign({ userId, purpose: 'password_reset' }, process.env.JWT_SECRET, { expiresIn: '10m' });
    res.json({ resetToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not verify code' });
  }
});

// STEP 3 — set the new password using the reset token
router.post('/reset-password', async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Reset session expired — request a new code' });
    }

    if (decoded.purpose !== 'password_reset') {
      return res.status(401).json({ error: 'Invalid reset session' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, decoded.userId]);
    await pool.query('DELETE FROM password_resets WHERE user_id = ?', [decoded.userId]);

    res.json({ message: 'Password updated — you can log in now' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not reset password' });
  }
});



// LOGOUT
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

module.exports = router;
