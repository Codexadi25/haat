const validate = (schema, source = 'body') => (req, res, next) => {
  const r = schema.safeParse(req[source]);
  if (!r.success) return next(r.error);
  req[source] = r.data;
  return next();
};
module.exports = validate;
