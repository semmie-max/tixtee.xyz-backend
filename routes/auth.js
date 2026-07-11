const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

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
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// SIGNUP — email + password
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

// GOOGLE SIGN-IN — verifies the ID token sent from the frontend button
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

// LOGOUT
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

module.exports = router;
