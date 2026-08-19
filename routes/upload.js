const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// keep the file in memory instead of writing it to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  }
});

function streamUpload(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'tixtee' },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    stream.end(buffer);
  });
}

router.post('/', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const result = await streamUpload(req.file.buffer);
    res.json({ url: result.secure_url });
  } catch (err) {
    console.error('Cloudinary upload failed:', err);
    res.status(500).json({ error: 'Image upload failed' });
  }
});

module.exports = router;