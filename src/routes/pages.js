const router = require('express').Router();
const env = require('../config/env');
const { authenticate, pageAuth } = require('../middleware/auth');

const HOME = { admin: '/admin', mx: '/mx', dp: '/dp', cx: '/account' };

router.get('/', authenticate(false), (req, res) => res.render('landing', { me: req.user, home: req.user && HOME[req.user.role], bodyClass: 'landing' }));

router.get('/login', authenticate(false), (req, res) => {
  if (req.user) return res.redirect(HOME[req.user.role]);
  return res.render('login', { bodyClass: 'auth', scripts: ['/js/login.js'] });
});

Object.entries(HOME).forEach(([role, path]) => {
  router.get(path, pageAuth(role), (req, res) => res.render('panel', { role, me: req.user, bodyClass: 'panel', scripts: ['/js/app.js'], storefront: env.STOREFRONT_URL }));
});

router.get('/admin/store/:id', pageAuth('admin'), (req, res) => res.render('panel', { role: 'admin', me: req.user, bodyClass: 'panel', scripts: ['/js/app.js'], storeId: req.params.id, storefront: env.STOREFRONT_URL }));
router.get('/admin/store', pageAuth('admin'), (req, res) => {
  const id = req.query.id || req.query[''] || Object.keys(req.query)[0];
  if (id) return res.redirect('/admin/store/' + id);
  return res.redirect('/admin#stores');
});

router.get('/healthz', (req, res) => res.json({ ok: true, uptime: process.uptime() }));
module.exports = router;
