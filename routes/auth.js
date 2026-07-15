const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const { Resend } = require('resend');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');


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
    sameSite: 'lax',
    secure: true,
    domain: '.tixtee.xyz',
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

router.get('/me', requireAuth, async (req, res) => {
  res.json({ email: req.user.email, isAdmin: req.user.isAdmin });
});

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
});
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
      from: 'Tixtee <noreply@mail.tixtee.xyz>',
      to: email,
      subject: 'Your  password reset code',
      html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset Your Password</title>
    <style>
      /* Global client-specific resets */
      body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
      table { border-collapse: collapse !important; }
      body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #121212; }
    </style>
  </head>
  <body style="margin: 0; padding: 40px 0; background-color: #121212;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
      <tr>
        <td align="center">
          <table
            border="0"
            cellpadding="0"
            cellspacing="0"
            width="100%"
            style="max-width: 500px; background-color: #ffffff; border-radius: 40px 40px 0 0; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;"
          >
            

            <tr>
              <td align="center" style="padding: 10px 30px 20px 30px;">
                <h1 style="font-size: 32px; font-weight: 700; color: #000000; margin: 0; letter-spacing: -0.5px;">
                  Let's get you back inside
                </h1>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding: 0 40px;">
                <div style="border-top: 1px solid #e0e0e0; height: 1px; width: 100%;"></div>
              </td>
            </tr>

            <tr>
              <td
                align="center"
                style="padding: 40px 40px 30px 40px; font-size: 15px; line-height: 1.6; color: #333333;"
              >
                <p style="margin: 0 0 20px 0; font-weight: 500;">Hi there,</p>

                <p style="margin: 0 0 10px 0;">Your password reset key is:</p>

                <div
                  style="display: inline-block; background-color: #f4f4f5; padding: 12px 24px; border-radius: 8px; margin: 10px 0 25px 0;"
                >
                  <span
                    style="font-family: 'Courier New', Courier, monospace; font-size: 20px; font-weight: 700; color: #111111; letter-spacing: 2px;"
                  >
                    ${code}
                  </span>
                </div>

                <p style="margin: 0 0 30px 0; font-size: 14px; color: #666666;">
                  this code resets in 15mins
                </p>

            <tr>
              <td align="center" style="background-color: #000; padding: 40px 30px; border-radius: 0 0 0 0;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td align="center" style="padding-bottom: 25px;">
                      <span
                        style="font-family: 'Brush Script MT', 'Dancing Script', cursive, sans-serif; font-size: 38px; color: #ffffff; letter-spacing: 1px;"
                      >
                        #smartticketing.
                      </span>
                    </td>
                  </tr>

                  <tr>
                    <td align="center" style="padding-bottom: 30px;">
                      <a
                        href="https://x.com/your_handle"
                        target="_blank"
                        style="display: inline-block; text-decoration: none;"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          width="22"
                          height="22"
                          fill="#ffffff"
                          style="display: block;"
                        >
                          <path
                            d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                          />
                        </svg>
                      </a>
                    </td>
                  </tr>

                  <tr>
                    <td align="center">
                      <table border="0" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding: 0 10px;">
                            <a
                              href="mailto:tixteedotxyz@gmail.com"
                              style="color: #ffffff; font-size: 12px; font-weight: 500; text-decoration: underline; opacity: 0.9;"
                              >Contact Us</a
                            >
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    });

    res.json({ message: 'Key sent! Check your inbox.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send reset code' });
  }
});

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



router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

module.exports = router;
