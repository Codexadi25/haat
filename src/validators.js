const { z } = require('zod');

const id = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const phone = z.string().trim().transform(v => v.replace(/[\s-]/g, '')).pipe(z.string().regex(/^(?:\+91)?[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'));
const pincode = z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit pincode');
const password = z.string().min(8, 'Use at least 8 characters').max(72);
const email = z.string().trim().toLowerCase().email('Enter a valid email');
const url = z.string().trim().max(500).refine(val => val.startsWith('http') || val.startsWith('/api'), { message: 'Must be a valid URL or local media path' });
const paise = z.number().int().min(0).max(100000000);

const address = z.object({
  label: z.string().trim().max(30).optional(),
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  pincode,
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

const storeFields = {
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000),
  category: z.string().trim().min(2).max(40),
  phone,
  logo: url, banner: url,
  openingHours: z.string().trim().max(100),
  address,
  isOpen: z.boolean(),
  deliveryFee: paise,
  minOrder: paise,
  gstin: z.string().trim().max(20),
};
const storeUpdate = z.object(storeFields).partial().strict();

const productFields = {
  name: z.string().trim().min(2).max(140),
  description: z.string().trim().max(2000),
  category: z.string().trim().min(2).max(40),
  tags: z.array(z.string().trim().min(1).max(30)).max(15),
  images: z.array(url).max(8),
  sku: z.string().trim().max(40),
  unit: z.string().trim().max(30),
  price: z.number().int().min(1).max(100000000),
  mrp: z.number().int().min(1).max(100000000),
  stock: z.number().int().min(0).max(1000000),
  isListed: z.boolean(),
};
const mrpCheck = (d) => d.mrp === undefined || d.price === undefined || d.mrp >= d.price;
const mrpMsg = { message: 'MRP must be at least the selling price', path: ['mrp'] };
const productCreate = z.object({ ...productFields, name: productFields.name, price: productFields.price })
  .partial({ description: true, category: true, tags: true, images: true, sku: true, unit: true, mrp: true, stock: true, isListed: true })
  .strict().refine(mrpCheck, mrpMsg);
const productUpdate = z.object(productFields).partial().strict().refine(mrpCheck, mrpMsg);

const s = {
  register: z.object({ name: z.string().trim().min(2).max(80), email, phone, password }),
  login: z.object({ email, password: z.string().min(1).max(72) }),
  passwordResetRequest: z.object({ identifier: z.string().trim().min(1) }),
  passwordResetConfirm: z.object({ token: z.string().regex(/^[a-f\d]{64}$/i), password }),
  profile: z.object({ name: z.string().trim().min(2).max(80), phone, addresses: z.array(address).max(10) }).partial().strict(),
  storeUpdate, productCreate, productUpdate,

  onboardMx: z.object({
    name: z.string().trim().min(2).max(80), email, phone, password: password.optional(),
    store: z.object({
      name: storeFields.name, category: storeFields.category, phone: storeFields.phone.optional(),
      description: storeFields.description.optional(), address: address.optional(), division: z.string().optional()
    }),
  }),
  onboardDp: z.object({
    name: z.string().trim().min(2).max(80), email, phone, password: password.optional(),
    vehicle: z.object({ kind: z.string().trim().max(30).optional(), number: z.string().trim().max(20).optional() }).optional(),
  }),
  userUpdate: z.object({
    name: z.string().trim().min(2).max(80), phone, email, role: z.enum(['cx', 'mx', 'dp', 'admin']), isActive: z.boolean(), password,
    vehicle: z.object({ kind: z.string().max(30), number: z.string().max(20) }).partial(),
  }).partial().strict(),
  adminUserCreate: z.object({
    name: z.string().trim().min(2).max(80), email, phone: phone.optional(),
    role: z.enum(['cx', 'mx', 'dp', 'admin']), password: password.optional(),
  }).strict(),
  storeAdminUpdate: z.object({ ...storeFields, status: z.enum(['pending', 'approved', 'suspended']) }).partial().strict(),
  adminProductCreate: z.object({ storeId: id }).and(productCreate),

  orderCreate: z.object({
    storeId: id,
    items: z.array(z.object({ productId: id, qty: z.number().int().min(1).max(50) })).min(1).max(40),
    address,
    notes: z.string().trim().max(300).optional(),
  }),
  status: z.object({ status: z.string(), note: z.string().trim().max(300).optional() }),
  reason: z.object({ reason: z.string().trim().max(300).optional() }),
  returnReq: z.object({ kind: z.enum(['return', 'replace']), reason: z.string().trim().min(3).max(300) }),
  assign: z.object({ dpId: id }),
  payVerify: z.object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() }),
  availability: z.object({ isAvailable: z.boolean() }),
};
module.exports = s;
