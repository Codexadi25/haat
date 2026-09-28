const mongoose = require('mongoose');
const softDelete = require('./plugins/softDelete');
const { Schema } = mongoose;

const storeSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true }, // one Mx = one store
  name: { type: String, required: true, trim: true, maxlength: 100 },
  slug: { type: String, required: true, unique: true },
  storeCode: { type: String, unique: true, sparse: true },
  description: { type: String, maxlength: 1000 },
  category: { type: String, lowercase: true, trim: true, index: true },
  phone: String,
  logo: String,
  banner: String,
  openingHours: String,
  address: { line1: String, line2: String, city: String, state: String, pincode: String },
  location: { type: { type: String, enum: ['Point'] }, coordinates: { type: [Number], default: undefined } },
  isOpen: { type: Boolean, default: true },
  status: { type: String, enum: ['pending', 'approved', 'suspended'], default: 'approved', index: true },
  deliveryFee: { type: Number, min: 0 },   // paise; falls back to DELIVERY_FEE_PAISE
  minOrder: { type: Number, min: 0, default: 0 }, // paise
  gstin: String,
}, { timestamps: true });

storeSchema.plugin(softDelete);
storeSchema.index({ location: '2dsphere' });
storeSchema.index({ status: 1, isOpen: 1, category: 1 });

module.exports = mongoose.model('Store', storeSchema);
