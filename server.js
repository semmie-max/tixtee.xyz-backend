require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chat');
const broadcastRoutes = require('./routes/broadcast');
const settingsRoutes = require('./routes/settings');
const waitlistRoutes = require('./routes/waitlist');
const blogRoutes = require('./routes/blogs');
const orderRoutes = require('./routes/orders');

const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'https://tixtee.xyz',
  credentials: true
}));
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use(cookieParser());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/broadcast', broadcastRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/orders', orderRoutes);

app.get('/', (req, res) => res.send('Tixtee/OpenMic backend is running'));

// 404 handler for unmatched API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler — must be LAST, and must have 4 args
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
