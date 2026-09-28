const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Exclude binary data when querying unless explicitly selected
mediaSchema.pre('find', function() {
  this.select('-data');
});
mediaSchema.pre('findOne', function() {
  // If not accessing the exact document by ID for serving, don't load the buffer
  if (!this.getQuery()._id) this.select('-data');
});

module.exports = mongoose.model('Media', mediaSchema);
