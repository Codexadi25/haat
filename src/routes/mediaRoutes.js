const router = require('express').Router();
const multer = require('multer');
const sharp = require('sharp');
const { Media } = require('../models');
const { asyncHandler, ApiError } = require('../utils/helpers');

// Keep files in memory before processing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new ApiError(400, 'Only images are allowed'));
    }
    cb(null, true);
  }
});

router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No file uploaded');

  // Convert to WebP format with sharp, resizing appropriately if needed, optimizing quality
  const processedBuffer = await sharp(req.file.buffer)
    .webp({ quality: 80, effort: 4 }) // Effort 4 means better compression ratio
    .toBuffer();

  const m = await Media.create({
    filename: req.file.originalname.split('.')[0] + '.webp',
    mimeType: 'image/webp',
    size: processedBuffer.length,
    data: processedBuffer,
    uploadedBy: req.user.id,
  });

  // Return the public URL
  res.json({ success: true, url: `/api/v2/media/${m._id}` });
}));

module.exports = router;
