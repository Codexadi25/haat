const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const { authenticate, pageAuth } = require('../middleware/auth');

const HOME = { admin: '/admin', mx: '/mx', dp: '/dp', cx: '/account' };

const clientTemplates = {};
try {
  const tplDir = path.join(__dirname, '../views/partials/components');
  if (fs.existsSync(tplDir)) {
    fs.readdirSync(tplDir).forEach(f => {
      if (f.endsWith('.ejs')) clientTemplates[f.replace('.ejs', '')] = fs.readFileSync(path.join(tplDir, f), 'utf-8');
    });
  }
} catch (e) {}

router.get('/', authenticate(false), (req, res) => res.render('landing', { me: req.user, home: req.user && HOME[req.user.role], bodyClass: 'landing' }));

router.get('/login', authenticate(false), (req, res) => {
  if (req.user) return res.redirect(HOME[req.user.role]);
  return res.render('login', { bodyClass: 'auth', scripts: ['/js/login.js'] });
});

Object.entries(HOME).forEach(([role, rpath]) => {
  router.get(rpath, pageAuth(role), (req, res) => res.render('panel', { role, me: req.user, bodyClass: 'panel', scripts: ['https://cdn.jsdelivr.net/npm/ejs@3.1.9/ejs.min.js', '/js/app.js'], storefront: env.STOREFRONT_URL, clientTemplates }));
});

router.get('/admin/store/:id', pageAuth('admin'), (req, res) => res.render('panel', { role: 'admin', me: req.user, bodyClass: 'panel', scripts: ['https://cdn.jsdelivr.net/npm/ejs@3.1.9/ejs.min.js', '/js/app.js'], storeId: req.params.id, storefront: env.STOREFRONT_URL, clientTemplates }));
router.get('/admin/store', pageAuth('admin'), (req, res) => {
  const id = req.query.id || req.query[''] || Object.keys(req.query)[0];
  if (id) return res.redirect('/admin/store/' + id);
  return res.redirect('/admin#stores');
});

router.get('/healthz', (req, res) => res.json({ ok: true, uptime: process.uptime() }));
module.exports = router;
