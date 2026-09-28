const { Store, Product } = require('../models');
const { ApiError, uniqueSlug } = require('../utils/helpers');
const { bump } = require('../utils/cache');

const CASCADE = 'cascade:store';
const bustCaches = () => Promise.all([bump('products'), bump('stores')]);

async function createProduct(storeId, data) {
  const store = await Store.findById(storeId).select('status');
  if (!store) throw new ApiError(404, 'Store not found');
  const p = await Product.create({
    ...data, slug: await uniqueSlug(Product, data.name), store: storeId, storeActive: store.status === 'approved',
  });
  await bustCaches();
  return p;
}

async function updateProduct(filter, data) {
  const p = await Product.findOneAndUpdate(filter, { $set: data }, { new: true, runValidators: true });
  if (!p) throw new ApiError(404, 'Product not found');
  await bustCaches();
  return p;
}

async function removeProduct(filter, actorId, reason = 'Removed') {
  const p = await Product.findOne(filter);
  if (!p) throw new ApiError(404, 'Product not found');
  p.isListed = false; // never shown publicly, but the record stays for past orders
  await p.softDelete(actorId, reason);
  await bustCaches();
  return p;
}

async function restoreProduct(filter) {
  const p = await Product.findOne({ ...filter, isDeleted: true });
  if (!p) throw new ApiError(404, 'Nothing to restore');
  const store = await Store.findById(p.store).select('status');
  p.storeActive = !!store && store.status === 'approved';
  await p.restore(); // stays unlisted until the store lists it again
  await bustCaches();
  return p;
}

async function updateStore(filter, data) {
  const s = await Store.findOneAndUpdate(filter, { $set: data }, { new: true, runValidators: true });
  if (!s) throw new ApiError(404, 'Store not found');
  if (data.status) await Product.updateMany({ store: s._id }, { $set: { storeActive: s.status === 'approved' } });
  await bustCaches();
  return s;
}

async function removeStore(filter, actorId, reason = 'Store removed') {
  const s = await Store.findOne(filter);
  if (!s) throw new ApiError(404, 'Store not found');
  await s.softDelete(actorId, reason);
  await Product.updateMany({ store: s._id, isDeleted: false }, {
    $set: { isDeleted: true, isListed: false, deletedAt: new Date(), deletedBy: actorId, deleteReason: CASCADE },
  });
  await bustCaches();
  return s;
}

async function restoreStore(id) {
  const s = await Store.findOne({ _id: id, isDeleted: true });
  if (!s) throw new ApiError(404, 'Nothing to restore');
  await s.restore();
  await Product.updateMany({ store: s._id, isDeleted: true, deleteReason: CASCADE }, {
    $set: { isDeleted: false, deletedAt: null, deletedBy: null, storeActive: s.status === 'approved' },
    $unset: { deleteReason: 1 },
  });
  await bustCaches();
  return s;
}

module.exports = { createProduct, updateProduct, removeProduct, restoreProduct, updateStore, removeStore, restoreStore, bustCaches };
