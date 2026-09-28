// Open API - no login. Built for the React / React Native storefront.
const router = require('express').Router();
const cors = require('cors');
const { Product, Store } = require('../models');
const { asyncHandler, ApiError, isObjectId, parsePage, pageMeta, escapeRegex } = require('../utils/helpers');
const { cached } = require('../utils/cache');

// Read-only and credential-free, so any origin may call it. Scoped per route so it never leaks onto authenticated endpoints.
const open = cors({ origin: '*', methods: ['GET'] });

const { Media } = require('../models');

router.get('/media/:id', open, asyncHandler(async (req, res) => {
  if (!isObjectId(req.params.id)) throw new ApiError(404, 'Not found');
  const m = await Media.findById(req.params.id).select('+data');
  if (!m) throw new ApiError(404, 'Not found');
  res.set('Content-Type', m.mimeType);
  res.set('Cache-Control', 'public, max-age=31536000, immutable'); // Cache for 1 year
  res.send(m.data);
}));


const HIDE = '-isDeleted -deletedAt -deletedBy -deleteReason -__v -storeActive';
const publicProduct = (p) => { const { stock, ...rest } = p; return { ...rest, inStock: stock > 0 }; };
const SORTS = { newest: { createdAt: -1 }, price_asc: { price: 1 }, price_desc: { price: -1 } };

router.get('/products', open, asyncHandler(async (req, res) => {
  const q = req.query; const { page, limit, skip } = parsePage(q);
  const filter = { isListed: true, storeActive: true };
  if (isObjectId(q.store)) filter.store = q.store;
  if (typeof q.category === 'string' && q.category) filter.category = q.category.toLowerCase();
  const min = Number(q.min); const max = Number(q.max);
  if (min || max) filter.price = { ...(min && { $gte: min }), ...(max && { $lte: max }) };
  if (typeof q.q === 'string' && q.q.trim()) filter.$text = { $search: q.q.trim().slice(0, 80) };
  const sort = SORTS[q.sort] || SORTS.newest;

  const data = await cached('products', JSON.stringify([filter, sort, page, limit]), 30, async () => {
    const [items, total] = await Promise.all([
      Product.find(filter).select(HIDE).sort(sort).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);
    return { items: items.map(publicProduct), meta: pageMeta(total, page, limit) };
  });
  res.set('Cache-Control', 'public, max-age=15').json({ success: true, data });
}));

router.get('/products/:ref', open, asyncHandler(async (req, res) => {
  const where = isObjectId(req.params.ref) ? { _id: req.params.ref } : { slug: req.params.ref };
  const p = await Product.findOne({ ...where, isListed: true, storeActive: true }).select(HIDE).lean();
  if (!p) throw new ApiError(404, 'Product not found');
  res.json({ success: true, data: publicProduct(p) });
}));

const STORE_HIDE = '-isDeleted -deletedAt -deletedBy -deleteReason -__v -owner -gstin';
router.get('/stores', open, asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePage(req.query);
  const filter = { status: 'approved' };
  if (typeof req.query.category === 'string' && req.query.category) filter.category = req.query.category.toLowerCase();
  if (typeof req.query.q === 'string' && req.query.q.trim()) filter.name = new RegExp(escapeRegex(req.query.q.trim().slice(0, 60)), 'i');
  const data = await cached('stores', JSON.stringify([filter, page, limit]), 60, async () => {
    const [items, total] = await Promise.all([
      Store.find(filter).select(STORE_HIDE).sort({ isOpen: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Store.countDocuments(filter),
    ]);
    return { items, meta: pageMeta(total, page, limit) };
  });
  res.set('Cache-Control', 'public, max-age=30').json({ success: true, data });
}));

router.get('/stores/:ref', open, asyncHandler(async (req, res) => {
  const where = isObjectId(req.params.ref) ? { _id: req.params.ref } : { slug: req.params.ref };
  const s = await Store.findOne({ ...where, status: 'approved' }).select(STORE_HIDE).lean();
  if (!s) throw new ApiError(404, 'Store not found');
  res.json({ success: true, data: s });
}));

router.get('/pincode/:pincode', open, asyncHandler(async (req, res) => {
  const { pincode } = req.params;
  const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
  const data = await response.json();
  
  if (!data || !data[0] || data[0].Status !== 'Success') {
    throw new ApiError(404, 'Invalid PIN Code or location not found');
  }

  const postOffice = data[0].PostOffice[0];
  res.json({
    success: true,
    data: {
      city: postOffice.District,
      state: postOffice.State,
      country: postOffice.Country
    }
  });
}));

router.get('/locations', open, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      states: [
        {
          state: "Maharashtra",
          cities: ["Mumbai", "Pune", "Nagpur", "Nashik"]
        },
        {
          state: "Karnataka",
          cities: ["Bengaluru", "Mysuru", "Hubballi", "Mangaluru"]
        },
        {
          state: "Delhi",
          cities: ["New Delhi", "North Delhi", "South Delhi"]
        },
        {
          state: "Gujarat",
          cities: ["Ahmedabad", "Surat", "Vadodara", "Rajkot"]
        },
        {
          state: "Tamil Nadu",
          cities: ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli"]
        }
      ]
    }
  });
}));

module.exports = router;
