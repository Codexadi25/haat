const mongoose = require('mongoose');

/**
 * Soft-delete plugin.
 *  - Nothing is ever removed through the app: every delete* operation is blocked.
 *  - Normal queries and aggregations automatically hide deleted records.
 *  - Recycle Bin queries opt in with an explicit `isDeleted: true` filter,
 *    or `.setOptions({ withDeleted: true })` to see everything.
 *  - Permanent removal is a deliberate manual act in the database.
 */
module.exports = function softDelete(schema) {
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deleteReason: { type: String, default: undefined },
  });

  function hideDeleted() {
    if (this.getOptions().withDeleted) return;
    if (this.getFilter().isDeleted === undefined) this.where({ isDeleted: false });
  }
  ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'updateOne', 'updateMany'].forEach((h) => schema.pre(h, hideDeleted));

  schema.pre('aggregate', function () {
    if (this.options.withDeleted) return;
    this.pipeline().unshift({ $match: { isDeleted: false } });
  });

  const block = function (next) {
    next(new Error('Hard delete is disabled. Records move to the Recycle Bin via softDelete().'));
  };
  ['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((h) => schema.pre(h, { document: false, query: true }, block));
  schema.pre('deleteOne', { document: true, query: false }, block);

  schema.methods.softDelete = function (userId, reason) {
    this.isDeleted = true; this.deletedAt = new Date(); this.deletedBy = userId || null; this.deleteReason = reason;
    return this.save();
  };
  schema.methods.restore = function () {
    this.isDeleted = false; this.deletedAt = null; this.deletedBy = null; this.deleteReason = undefined;
    return this.save();
  };
};
