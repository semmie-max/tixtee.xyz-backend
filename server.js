require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chat');

const app = express();

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5500',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// serve uploaded images so the frontend can display them
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/chat', chatRoutes);

app.get('/', (req, res) => res.send('Tixtee/OpenMic backend is running'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});