const crypto = require('crypto');

class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const isObjectId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parsePage = (q) => {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(q.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
};
const pageMeta = (total, page, limit) => ({ total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
async function uniqueSlug(Model, base) {
  let slug = slugify(base) || 'item';
  // withDeleted: a soft-deleted record still owns its slug (it can be restored)
  if (await Model.exists({ slug }).setOptions({ withDeleted: true })) slug += '-' + crypto.randomBytes(2).toString('hex');
  return slug;
}

/**
 * Generic paginated list. Only string query values are accepted for filters
 * (blocks NoSQL operator injection such as ?status[$ne]=x).
 */
async function listQuery(Model, req, { search = [], filters = [], base = {}, populate, select, sort = { createdAt: -1 } } = {}) {
  const { page, limit, skip } = parsePage(req.query);
  const filter = { ...base };
  for (const k of filters) {
    const v = req.query[k];
    if (typeof v !== 'string' || v === '') continue;
    filter[k] = v === 'true' ? true : v === 'false' ? false : v;
  }
  if (typeof req.query.q === 'string' && req.query.q.trim() && search.length) {
    const rx = new RegExp(escapeRegex(req.query.q.trim().slice(0, 60)), 'i');
    filter.$or = search.map((f) => ({ [f]: rx }));
  }
  let q = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (select) q = q.select(select);
  if (populate) q = q.populate(populate);
  const [items, total] = await Promise.all([q.lean(), Model.countDocuments(filter)]);
  return { items, meta: pageMeta(total, page, limit) };
}

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

module.exports = { ApiError, asyncHandler, isObjectId, escapeRegex, parsePage, pageMeta, slugify, uniqueSlug, listQuery, ok };
