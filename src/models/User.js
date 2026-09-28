const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const softDelete = require('./plugins/softDelete');
const { Schema } = mongoose;

const addressSchema = new Schema({
  label: String, line1: String, line2: String, city: String, state: String, pincode: String, lat: Number, lng: Number,
}, { _id: true });

// One collection, four roles: cx (customer) | mx (merchant/store owner) | dp (delivery partner) | admin
const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['cx', 'mx', 'dp', 'admin'], required: true, index: true },
  isActive: { type: Boolean, default: true },
  addresses: [addressSchema],
  vehicle: { kind: String, number: String },
  isAvailable: { type: Boolean, default: false },
  onboardedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  lastLoginAt: Date,
  passwordResetTokenHash: { type: String, select: false },
  passwordResetExpiresAt: { type: Date, select: false },
}, { timestamps: true });

userSchema.plugin(softDelete);
userSchema.index({ role: 1, isActive: 1, createdAt: -1 });

userSchema.statics.hash = (plain) => bcrypt.hash(plain, 11);
userSchema.methods.verifyPassword = function (plain) { return bcrypt.compare(plain, this.passwordHash); };
userSchema.set('toJSON', { transform: (_d, r) => { delete r.passwordHash; delete r.__v; return r; } });

module.exports = mongoose.model('User', userSchema);
