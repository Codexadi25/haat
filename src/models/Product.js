const mongoose = require('mongoose');
const softDelete = require('./plugins/softDelete');
const { Schema } = mongoose;

// All money is stored as integer paise (₹1 = 100) to avoid floating point drift.
const productSchema = new Schema({
  store: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
  name: { type: String, required: true, trim: true, maxlength: 140 },
  slug: { type: String, required: true, unique: true },
  description: { type: String, maxlength: 2000 },
  category: { type: String, lowercase: true, trim: true },
  tags: [{ type: String, lowercase: true, trim: true }],
  images: [String],
  sku: { type: String, trim: true },
  unit: { type: String, trim: true },
  price: { type: Number, required: true, min: 1 },
  mrp: { type: Number, min: 1 },
  stock: { type: Number, default: 0, min: 0 },
  isListed: { type: Boolean, default: true },
  // Denormalised from Store.status so public listings need no join.
  storeActive: { type: Boolean, default: true },
}, { timestamps: true });

productSchema.plugin(softDelete);
productSchema.index({ store: 1, isListed: 1, createdAt: -1 });
productSchema.index({ isListed: 1, storeActive: 1, category: 1, price: 1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Product', productSchema);
