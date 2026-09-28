/* Haat panel client. One small engine drives every role: sections are plain config objects. */
(() => {
  'use strict';
  const root = document.querySelector('.app'); if (!root) return;
  const ROLE = root.dataset.role;
  const $ = (s, e = document) => e.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (p) => '₹' + ((p || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const sentence = (s) => { const t = String(s || '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
  const icon = (n) => `<svg class="i"><use href="#i-${n}"/></svg>`;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  window.copyText = function(el, e) {
    if (e) e.stopPropagation();
    const text = el.dataset.copy;
    navigator.clipboard.writeText(text);
    const box = document.createElement('span');
    box.textContent = '✓Copied !';
    box.style.cssText = 'position:absolute;font-size:8px;color:green;background:#fff;border:1px solid green;padding:2px;border-radius:3px;z-index:0;margin-left:4px;white-space:nowrap;animation:fadeout 1s forwards';
    el.appendChild(box);
    setTimeout(() => box.remove(), 1000);
  };
  const copyHtml = (t, show) => t ? `<span style="cursor:pointer;position:relative" data-copy="${esc(t)}" onclick="copyText(this, event)">${esc(show || t)}</span>` : '—';

  /* ---------- API, toast, modal ---------- */
  async function api(path, { method = 'GET', body, isForm } = {}) {
    const headers = { 'X-Requested-With': 'XMLHttpRequest' };
    if (!isForm) headers['Content-Type'] = 'application/json';
    const r = await fetch('/api/v2' + path, {
      method, credentials: 'same-origin', body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      headers
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = '/login'; throw new Error('Signed out'); }
    if (!r.ok) throw new Error(j.message || 'Something went wrong');
    return j.data;
  }
  function toast(msg, bad) {
    const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg;
    $('#toasts').append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 3400);
  }
  const dlg = $('#modal');
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
  const shell = (title, body, foot = '') => `<div class="dlg"><header><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header><div class="dlg-body">${body}</div><footer>${foot}</footer></div>`;

  function fieldHtml(f) {
    const cls = f.full ? ' full' : '';
    let v = f.value ?? '';
    const hint = f.hint ? `<small>${esc(f.hint)}</small>` : '';
    const req = f.required ? 'required' : '';
    if (f.type === 'checkbox') return `<label class="check${cls}"><input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''}> ${esc(f.label)}</label>`;
    if (f.type === 'money' && v !== '') v = v / 100;
    if (f.type === 'lines' && Array.isArray(v)) v = v.join('\n');
    let ctl;
    const type = f.type || (f.name.toLowerCase().includes('phone') ? 'phone' : 'text');
    if (type === 'textarea' || type === 'lines') ctl = `<textarea name="${f.name}" ${req}>${esc(v)}</textarea>`;
    else if (type === 'select') ctl = `<select name="${f.name}" ${req}>${f.options.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else if (type === 'hours') {
      const isCustom = v && v.startsWith('Custom|');
      const parts = isCustom ? v.split('|').slice(1) : [];
      ctl = `<div class="hours-widget" data-name="${f.name}">
        <div style="display:flex;gap:15px;margin-bottom:8px">
          <label><input type="radio" name="${f.name}_mode" value="Regular" ${!isCustom ? 'checked' : ''}> Regular</label>
          <label><input type="radio" name="${f.name}_mode" value="Custom" ${isCustom ? 'checked' : ''}> Custom (Weekends off)</label>
        </div>
        <div class="h-reg" style="display:${!isCustom ? 'block' : 'none'};margin-bottom:8px;">
          <input type="time" name="${f.name}_reg_start" value="${!isCustom && v ? v.split('-')[0] : '09:00'}"> to 
          <input type="time" name="${f.name}_reg_end" value="${!isCustom && v ? v.split('-')[1] : '17:00'}">
        </div>
        <div class="h-cust" style="display:${isCustom ? 'block' : 'none'};">
          ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, i) => {
            const dp = parts[i] || (['Sat','Sun'].includes(d) ? 'off' : '09:00-17:00');
            const isOff = dp === 'off';
            return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px" class="h-day-row">
              <span style="width:35px">${d}</span>
              <label><input type="checkbox" class="h-off-chk" data-day="${d}" ${isOff ? 'checked' : ''}> Off</label>
              <div class="h-times" style="display:${isOff ? 'none' : 'block'}">
                <input type="time" class="h-start" data-day="${d}" value="${isOff ? '09:00' : dp.split('-')[0]}"> to 
                <input type="time" class="h-end" data-day="${d}" value="${isOff ? '17:00' : dp.split('-')[1]}">
              </div>
            </div>`;
          }).join('')}
          <div style="font-size:0.8em;color:var(--ink-2)" class="h-hint"></div>
        </div>
        <input type="hidden" name="${f.name}" value="${esc(v)}">
      </div>`;
      return `<div class="field${cls}"><span>${esc(f.label)}</span>${ctl}${hint}</div>`;
    }
    else if (type === 'images') {
      ctl = `<div class="image-upload-widget" data-name="${f.name}">
        <input type="hidden" name="${f.name}" value="${esc(v)}">
        <div class="iu-preview" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"></div>
        <input type="file" accept="image/*" class="iu-file" ${req && (!v || !v.length) ? 'required' : ''}>
      </div>`;
      return `<div class="field${cls}"><span>${esc(f.label)}</span>${ctl}${hint}</div>`;
    }
    else ctl = `<input name="${f.name}" type="${type === 'money' ? 'number' : type === 'phone' ? 'text' : type}" ${type === 'money' ? 'step="0.01" min="0"' : ''} ${type === 'number' ? 'min="0"' : ''} ${type === 'phone' ? 'data-is-phone="true"' : ''} value="${esc(v)}" ${req} autocomplete="off">`;
    return `<label class="field${cls}"><span>${esc(f.label)}</span>${ctl}${hint}</label>`;
  }
  function collect(form, fields) {
    const out = {};
    for (const f of fields) {
      const el = form.elements[f.name]; let val;
      if (f.type === 'checkbox') val = el.checked;
      else if (f.type === 'hours') {
        const mode = form.elements[`${f.name}_mode`].value;
        if (mode === 'Regular') {
          val = `${form.elements[`${f.name}_reg_start`].value}-${form.elements[`${f.name}_reg_end`].value}`;
        } else {
          val = 'Custom|' + ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => {
            const row = form.querySelector(`.h-off-chk[data-day="${d}"]`);
            if (row.checked) return 'off';
            return `${form.querySelector(`.h-start[data-day="${d}"]`).value}-${form.querySelector(`.h-end[data-day="${d}"]`).value}`;
          }).join('|');
        }
      } else {
        const raw = el.value.trim(); if (raw === '') continue;
        val = f.type === 'number' ? Number(raw) : f.type === 'money' ? Math.round(Number(raw) * 100)
          : f.type === 'lines' || f.type === 'images' ? raw.split(/\n|,/).map((s) => s.trim()).filter(Boolean) : raw;
      }
      const path = f.name.split('.'); let o = out;
      path.slice(0, -1).forEach((k) => { o = o[k] = o[k] || {}; });
      o[path.at(-1)] = val;
    }
    return out;
  }
  function initHoursWidget(form) {
    form.querySelectorAll('.hours-widget').forEach(w => {
      const rads = w.querySelectorAll('input[type="radio"]');
      const hReg = w.querySelector('.h-reg'); const hCust = w.querySelector('.h-cust');
      rads.forEach(r => r.addEventListener('change', () => { hReg.style.display = r.value === 'Regular' ? 'block' : 'none'; hCust.style.display = r.value === 'Custom' ? 'block' : 'none'; }));
      
      w.querySelectorAll('.h-off-chk').forEach(chk => chk.addEventListener('change', (e) => {
        e.target.closest('.h-day-row').querySelector('.h-times').style.display = e.target.checked ? 'none' : 'block';
      }));

      // 3-day pattern auto-fill
      const starts = Array.from(w.querySelectorAll('.h-start'));
      const ends = Array.from(w.querySelectorAll('.h-end'));
      const hint = w.querySelector('.h-hint');
      const checkPattern = () => {
        const vals = starts.map((s,i) => s.value + '-' + ends[i].value);
        if (vals[0] === vals[1] && vals[1] === vals[2] && vals[0] !== '-') {
          const allSame = vals.slice(3, 5).every(v => v === vals[0]);
          if (!allSame) {
            hint.innerHTML = `You set the same time for Mon-Wed. <a href="#" id="autofill-btn" style="color:var(--brand)">Auto-fill Thu-Fri?</a>`;
            hint.querySelector('#autofill-btn').onclick = (e) => {
              e.preventDefault();
              starts.slice(3, 5).forEach(s => s.value = starts[0].value);
              ends.slice(3, 5).forEach(e => e.value = ends[0].value);
              hint.innerHTML = '';
            };
          } else hint.innerHTML = '';
        } else hint.innerHTML = '';
      };
      starts.forEach(i => i.addEventListener('change', checkPattern));
      ends.forEach(i => i.addEventListener('change', checkPattern));
    });
  }

  function initPhoneWidget(form) {
    form.querySelectorAll('input[data-is-phone="true"]').forEach(input => {
      input.type = 'text'; // change type to text for proper display
      input.addEventListener('input', (e) => {
        let val = e.target.value;
        if (val.startsWith('+91')) return; // Already has it
        if (val.startsWith('91') && val.length > 10) val = '+' + val;
        else if (val.length === 10 && !val.startsWith('+')) val = '+91' + val;
        e.target.value = val;
      });
    });
  }
  async function initAddressWidget(form) {
    const pins = form.querySelectorAll('input[name$="pincode"]');
    if (!pins.length) return;
    try {
      const locRes = await api('/locations');
      const states = locRes.states || [];
      pins.forEach(pin => {
        const prefix = pin.name.replace('pincode', '');
        const citySel = form.querySelector(`select[name="${prefix}city"], input[name="${prefix}city"]`);
        const stateSel = form.querySelector(`select[name="${prefix}state"], input[name="${prefix}state"]`);
        if (!citySel || !stateSel) return;
        
        // Convert to selects if they are inputs (or just populate if already selects)
        const populateStates = (selectedState, selectedCity) => {
           if (stateSel.tagName === 'SELECT') {
             stateSel.innerHTML = '<option value="">Select State</option>' + states.map(s => `<option value="${esc(s.state)}" ${s.state===selectedState?'selected':''}>${esc(s.state)}</option>`).join('');
           }
           if (citySel.tagName === 'SELECT') {
             const stateObj = states.find(s => s.state === (selectedState || stateSel.value));
             const cities = stateObj ? stateObj.cities : [];
             citySel.innerHTML = '<option value="">Select City</option>' + cities.map(c => `<option value="${esc(c)}" ${c===selectedCity?'selected':''}>${esc(c)}</option>`).join('');
           }
        };
        populateStates(stateSel.value, citySel.value);
        if (stateSel.tagName === 'SELECT') stateSel.addEventListener('change', () => populateStates(stateSel.value, ''));

        pin.addEventListener('input', async (e) => {
          const val = e.target.value.trim();
          if (val.length === 6) {
            try {
              const res = await api('/pincode/' + val);
              if (res.city && res.state) {
                if (stateSel.tagName === 'SELECT') {
                  stateSel.value = res.state;
                  populateStates(res.state, res.city);
                } else stateSel.value = res.state;
                if (citySel.tagName === 'SELECT') citySel.value = res.city;
                else citySel.value = res.city;
              }
            } catch (err) { /* ignore */ }
          }
        });
      });
    } catch (e) { /* ignore */ }
  }

  function initImageWidget(form) {
    form.querySelectorAll('.image-upload-widget').forEach(w => {
      const hidden = w.querySelector('input[type="hidden"]');
      const file = w.querySelector('input[type="file"]');
      const preview = w.querySelector('.iu-preview');
      let urls = hidden.value ? hidden.value.split('\\n').filter(Boolean) : [];
      
      const render = () => {
        hidden.value = urls.join('\\n');
        preview.innerHTML = urls.map((url, i) => `<div style="position:relative;width:60px;height:60px;border-radius:4px;overflow:hidden"><img src="${esc(url)}" style="width:100%;height:100%;object-fit:cover"><button type="button" data-i="${i}" style="position:absolute;top:0;right:0;background:var(--danger,#f44);color:white;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:12px;line-height:1">&times;</button></div>`).join('');
        if (urls.length >= 8) file.style.display = 'none';
        else file.style.display = 'block';
        if (urls.length > 0) file.removeAttribute('required');
      };
      preview.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
          urls.splice(e.target.dataset.i, 1);
          render();
        }
      });
      file.addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        file.disabled = true;
        try {
          const fd = new FormData();
          fd.append('file', f);
          const res = await api('/media/upload', { method: 'POST', body: fd, isForm: true });
          urls.push(res.url);
          render();
        } catch (err) { toast(err.message, true); }
        file.value = '';
        file.disabled = false;
      });
      render();
    });
  }

  function formModal({ title, fields, submit = 'Save changes', onSubmit, intro }) {
    dlg.innerHTML = `<form class="dlg" novalidate><header><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
      <div class="dlg-body">${intro ? `<p class="full" style="color:var(--ink-2)">${esc(intro)}</p>` : ''}${fields.map(fieldHtml).join('')}<div class="form-error full" role="alert"></div></div>
      <footer><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${esc(submit)}</button></footer></form>`;
    const form = $('form', dlg); const err = $('.form-error', dlg); const btn = $('.btn.primary', dlg);
    initHoursWidget(form);
    initPhoneWidget(form);
    initAddressWidget(form);
    initImageWidget(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = ''; btn.disabled = true;
      try { await onSubmit(collect(form, fields)); dlg.close(); } catch (x) { err.textContent = x.message; btn.disabled = false; }
    });
    dlg.showModal();
  }
  const confirmBox = (title, text, label, run, danger = true) => {
    dlg.innerHTML = shell(title, `<p class="full">${esc(text)}</p>`, `<button class="btn" data-close>Keep it</button><button class="btn ${danger ? 'danger' : 'primary'}" id="okBtn">${esc(label)}</button>`);
    $('#okBtn', dlg).addEventListener('click', async (e) => { e.target.disabled = true; try { await run(); dlg.close(); } catch (x) { toast(x.message, true); e.target.disabled = false; } });
    dlg.showModal();
  };

  /* ---------- Status helpers ---------- */
  const TONE = { delivered: 'ok', replaced: 'ok', paid: 'ok', approved: 'ok', pending_payment: 'warn', return_requested: 'warn', pending: 'warn', refund_failed: 'bad', cancelled: 'bad', returned: 'mute', suspended: 'bad', refunded: 'mute' };
  const pill = (s) => `<span class="pill ${TONE[s] || ''}">${esc(sentence(s))}</span>`;
  const ORDER_STATUSES = ['pending_payment', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled', 'return_requested', 'returned', 'replaced'].map((s) => [s, sentence(s)]);
  const BASE = { admin: '/admin', mx: '/mx', dp: '/dp', cx: '' }[ROLE];
  const ORDERS_EP = ROLE === 'cx' ? '/orders' : BASE + '/orders';

  /* ---------- Table engine ---------- */
  function table(cfg) {
    const st = { page: 1, q: '', f: { ...(cfg.defaults || {}) } }; let rows = [];
    const box = document.createElement('div');
    box.innerHTML = `<div class="toolbar">
      ${cfg.search === false ? '' : `<input class="grow" type="search" placeholder="${esc(cfg.searchHint || 'Search')}" aria-label="Search">`}
      ${(cfg.filters || []).map((f) => `<select data-f="${f.k}" aria-label="${esc(f.label)}">${f.all === false ? '' : `<option value="">${esc(f.label)}</option>`}${f.opts.map(([k, l]) => `<option value="${esc(k)}" ${st.f[f.k] === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`).join('')}
      <span class="spacer"></span><span data-tools></span></div>
      <div class="card">
        ${cfg.grid 
          ? `<div class="grid-wrap" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px;padding:20px;"></div>` 
          : `<div class="table-wrap"><table><thead><tr>${(cfg.cols||[]).map((c) => `<th>${esc(c.h)}</th>`).join('')}<th></th></tr></thead><tbody></tbody></table></div>`}
        <div class="pager" style="padding:16px;"></div>
      </div>`;
    const body = cfg.grid ? $('.grid-wrap', box) : $('tbody', box); 
    const pager = $('.pager', box);
    (cfg.tools || []).forEach((t) => { const b = document.createElement('button'); b.className = 'btn primary'; b.innerHTML = `${icon('plus')}${esc(t.label)}`; b.onclick = () => t.run(load); $('[data-tools]', box).append(b); });

    async function load() {
      body.innerHTML = cfg.grid 
        ? Array.from({ length: 5 }, () => `<div class="skel" style="height:250px;border-radius:12px"></div>`).join('')
        : Array.from({ length: 5 }, () => `<tr>${cfg.cols.map(() => '<td><div class="skel"></div></td>').join('')}<td></td></tr>`).join('');
      const qs = new URLSearchParams({ page: st.page, limit: cfg.grid ? 20 : 10, ...(st.q && { q: st.q }), ...Object.fromEntries(Object.entries(st.f).filter(([, v]) => v)) });
      try {
        const d = await api(`${typeof cfg.ep === 'function' ? cfg.ep() : cfg.ep}?${qs}`);
        rows = d.items; draw(d.meta);
      } catch (e) { 
        body.innerHTML = cfg.grid 
          ? `<div class="empty" style="grid-column:1/-1"><b>Could not load this list</b>${esc(e.message)}</div>`
          : `<tr><td colspan="${cfg.cols.length + 1}"><div class="empty"><b>Could not load this list</b>${esc(e.message)}</div></td></tr>`; 
      }
    }
    function draw(m) {
      if (!rows.length) {
        body.innerHTML = cfg.grid 
          ? `<div class="empty" style="grid-column:1/-1"><b>${esc(cfg.emptyTitle || 'Nothing here yet')}</b>${esc(cfg.empty || 'Records will show up here.')}</div>`
          : `<tr><td colspan="${cfg.cols.length + 1}"><div class="empty"><b>${esc(cfg.emptyTitle || 'Nothing here yet')}</b>${esc(cfg.empty || 'Records will show up here.')}</div></td></tr>`;
      } else {
        if (cfg.grid) {
          body.innerHTML = rows.map((r, i) => {
            const acts = (cfg.actions ? cfg.actions(r) : []).map((a, j) => `<button class="btn sm ${a.cls || ''}" data-i="${i}" data-a="${j}">${esc(a.label)}</button>`).join('');
            return cfg.grid(r, acts);
          }).join('');
        } else {
          body.innerHTML = rows.map((r, i) => `<tr>${cfg.cols.map((c) => `<td>${c.c(r)}</td>`).join('')}<td class="actions">${(cfg.actions ? cfg.actions(r) : []).map((a, j) => `<button class="btn sm ${a.cls || ''}" data-i="${i}" data-a="${j}">${esc(a.label)}</button>`).join('')}</td></tr>`).join('');
        }
      }
      pager.innerHTML = `<span>${m.total} ${m.total === 1 ? 'record' : 'records'}</span><div style="display:flex;align-items:center;gap:12px"><button class="btn sm" data-p="-1" ${m.page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${m.page} of ${m.pages}</span><button class="btn sm" data-p="1" ${m.page >= m.pages ? 'disabled' : ''}>Next</button></div>`;
    }
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (b) {
        const r = rows[b.dataset.i]; const a = cfg.actions(r)[b.dataset.a];
        Promise.resolve(a.run(r, load)).catch((x) => toast(x.message, true));
        return;
      }
      if (cfg.onRowClick) {
        const tr = e.target.closest('tr');
        if (tr && tr.parentNode === body) {
          const rowIdx = Array.from(body.children).indexOf(tr);
          const r = rows[rowIdx];
          if (r) cfg.onRowClick(r);
        }
      }
    });
    pager.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { st.page += Number(b.dataset.p); load(); } });
    let tm; const s = $('input[type=search]', box);
    if (s) s.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { st.q = s.value; st.page = 1; load(); }, 300); });
    box.querySelectorAll('[data-f]').forEach((sel) => sel.addEventListener('change', () => { st.f[sel.dataset.f] = sel.value; st.page = 1; load(); }));
    load();
    return box;
  }

  /* ---------- Orders ---------- */
  const line = (t, s) => `${esc(t)}${s ? `<small>${s}</small>` : ''}`;
  function orderCols() {
    const c = [{ h: 'Order', c: (r) => `<b>${copyHtml(r.orderNo)}</b><small>${dt(r.createdAt)}</small>` }];
    if (ROLE !== 'cx') c.push({ h: 'Customer', c: (r) => line(r.customerSnapshot?.name, copyHtml(r.customerSnapshot?.phone)) });
    if (ROLE !== 'mx') c.push({ h: 'Store', c: (r) => line(r.storeSnapshot?.name, esc(r.storeSnapshot?.address?.city)) });
    if (ROLE === 'dp') c.push({ h: 'Deliver to', c: (r) => line(r.address?.line1, esc(`${r.address?.city || ''} ${r.address?.pincode || ''}`)) });
    if (ROLE === 'admin') c.push({ h: 'Partner', c: (r) => esc(r.dpSnapshot?.name || '—') });
    c.push({ h: 'Items', c: (r) => r.items.reduce((n, i) => n + i.qty, 0) }, { h: 'Total', c: (r) => `<b>${inr(r.amounts.total)}</b>` }, { h: 'Status', c: (r) => pill(r.status) });
    return c;
  }
  const MOVES = {
    confirmed: [['preparing', 'Start preparing', ['mx', 'admin']]], preparing: [['ready', 'Mark ready', ['mx', 'admin']]],
    ready: [['picked_up', 'Picked up', ['dp', 'admin']]], picked_up: [['delivered', 'Delivered', ['dp', 'admin']]],
    return_requested: [['returned', 'Accept return', ['mx', 'admin']], ['replaced', 'Send replacement', ['mx', 'admin']]],
  };
  const move = (r, to, note) => api(`${ORDERS_EP}/${r._id}/status`, { method: 'PATCH', body: { status: to, ...(note && { note }) } });
  const cancelForm = (r, reload) => formModal({
    title: `Cancel ${r.orderNo}`, submit: 'Cancel order', intro: r.payment?.status === 'paid' ? 'The customer is refunded automatically.' : undefined,
    fields: [{ name: 'reason', label: 'Reason', type: 'textarea', full: true, required: true }],
    onSubmit: async (v) => { await (ROLE === 'cx' ? api(`/orders/${r._id}/cancel`, { method: 'POST', body: v }) : move(r, 'cancelled', v.reason)); toast('Order cancelled'); reload(); },
  });
  function orderActions(r, reload) {
    const a = [{ label: 'View', run: () => viewOrder(r) }];
    if (ROLE === 'cx') {
      if (r.status === 'pending_payment') a.push({ label: 'Pay now', cls: 'primary', run: () => payNow(r, reload) });
      if (r.status === 'confirmed') a.push({ label: 'Cancel', cls: 'danger', run: () => cancelForm(r, reload) });
      if (r.status === 'delivered') a.push({ label: 'Return', run: () => returnForm(r, reload) });
      return a;
    }
    (MOVES[r.status] || []).filter((m) => m[2].includes(ROLE)).forEach(([to, label]) => a.push({ label, cls: 'primary', run: async () => { await move(r, to); toast(`${r.orderNo}: ${sentence(to)}`); reload(); } }));
    if (ROLE === 'admin' && ['confirmed', 'preparing', 'ready'].includes(r.status)) a.push({ label: r.deliveryPartner ? 'Reassign' : 'Assign partner', run: () => assignForm(r, reload) });
    if (['mx', 'admin'].includes(ROLE) && ['confirmed', 'preparing'].includes(r.status) || (ROLE === 'admin' && r.status === 'ready')) a.push({ label: 'Cancel', cls: 'danger', run: () => cancelForm(r, reload) });
    if (ROLE === 'admin') a.push({ label: 'Remove', cls: 'danger', run: () => confirmBox('Move to recycle bin?', `${r.orderNo} leaves the main list but its details stay on record.`, 'Move to bin', async () => { await api(`/admin/orders/${r._id}`, { method: 'DELETE' }); toast('Moved to recycle bin'); reload(); }) });
    return a;
  }
  async function assignForm(r, reload) {
    const d = await api('/admin/users?role=dp&isActive=true&limit=50');
    if (!d.items.length) return toast('Onboard a delivery partner first', true);
    formModal({
      title: `Assign partner to ${r.orderNo}`, submit: 'Assign',
      fields: [{ name: 'dpId', label: 'Delivery partner', type: 'select', full: true, options: d.items.map((u) => [u._id, `${u.name}${u.isAvailable ? ' · available' : ''}`]), value: r.deliveryPartner }],
      onSubmit: async (v) => { await api(`/admin/orders/${r._id}/assign`, { method: 'PATCH', body: v }); toast('Partner assigned'); reload(); },
    });
  }
  const returnForm = (r, reload) => formModal({
    title: `Return or replace ${r.orderNo}`, submit: 'Send request',
    fields: [{ name: 'kind', label: 'What do you need?', type: 'select', options: [['return', 'Return for a refund'], ['replace', 'Replace the items']], full: true }, { name: 'reason', label: 'What went wrong?', type: 'textarea', required: true, full: true }],
    onSubmit: async (v) => { await api(`/orders/${r._id}/return`, { method: 'POST', body: v }); toast('Request sent'); reload(); },
  });
  function viewOrder(r) {
    const a = r.address || {};
    dlg.innerHTML = shell(r.orderNo, `
      <div class="full">${pill(r.status)} <span style="margin-left:6px">${pill(r.payment?.status || 'created')}</span></div>
      <dl class="kv full">
        <dt>Customer</dt><dd>${esc(r.customerSnapshot?.name)} · ${esc(r.customerSnapshot?.phone || '')}</dd>
        <dt>Store</dt><dd>${esc(r.storeSnapshot?.name)}</dd>
        <dt>Deliver to</dt><dd>${esc([a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', '))}</dd>
        ${r.dpSnapshot?.name ? `<dt>Partner</dt><dd>${esc(r.dpSnapshot.name)} · ${esc(r.dpSnapshot.phone || '')}</dd>` : ''}
        ${r.notes ? `<dt>Note</dt><dd>${esc(r.notes)}</dd>` : ''}
        ${r.returnRequest?.kind ? `<dt>${esc(sentence(r.returnRequest.kind))}</dt><dd>${esc(r.returnRequest.reason)}</dd>` : ''}
      </dl>
      <table class="lines full"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>
        ${r.items.map((i) => `<tr><td>${esc(i.name)}${i.unit ? `<small>${esc(i.unit)}</small>` : ''}</td><td>${i.qty}</td><td>${inr(i.unitPrice)}</td><td>${inr(i.lineTotal)}</td></tr>`).join('')}
        <tr><td colspan="3">Delivery</td><td>${inr(r.amounts.deliveryFee)}</td></tr><tr><td colspan="3"><b>Total</b></td><td><b>${inr(r.amounts.total)}</b></td></tr></tbody></table>
      <ol class="tl full">${[...(r.statusHistory || [])].reverse().map((h) => `<li><b>${esc(sentence(h.status))}</b> <small>${dt(h.at)} · ${esc(h.by)}${h.note ? ' · ' + esc(h.note) : ''}</small></li>`).join('')}</ol>`,
    '<button class="btn" data-close>Close</button>');
    dlg.showModal();
  }
  function loadRazorpay() {
    if (window.Razorpay) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the payment window')); document.head.append(s); });
  }
  async function payNow(r, reload) {
    const p = await api(`/orders/${r._id}/payment`); await loadRazorpay();
    new window.Razorpay({
      key: p.keyId, order_id: p.razorpayOrderId, amount: p.amount, currency: p.currency, name: p.name, description: p.description,
      theme: { color: '#0E5A55' },
      handler: async (resp) => { try { await api('/payments/verify', { method: 'POST', body: resp }); toast('Payment received'); } catch (e) { toast(e.message, true); } reload(); },
    }).open();
  }
  const ordersSection = (extra = {}) => () => table({
    ep: ORDERS_EP, searchHint: 'Search order number or customer', cols: orderCols(), actions: (r) => orderActions(r, extra.reload || (() => go(current))),
    filters: [{ k: 'status', label: 'All statuses', opts: ORDER_STATUSES }], emptyTitle: 'No orders yet', empty: 'New orders appear here the moment they are paid.', ...extra,
  });

  /* ---------- Products ---------- */
  const productFields = (p) => {
    p = p || {};
    return [
      { name: 'name', label: 'Product name', required: true, value: p.name, full: true },
      { name: 'price', label: 'Selling price (₹)', type: 'money', required: true, value: p.price },
      { name: 'mrp', label: 'MRP (₹)', type: 'money', value: p.mrp, hint: 'Shown as the struck-through price' },
      { name: 'stock', label: 'Stock', type: 'number', value: p.stock ?? 0 },
      { name: 'unit', label: 'Unit', value: p.unit, hint: 'For example 500 g or 1 pack' },
      { name: 'category', label: 'Category', value: p.category },
      { name: 'sku', label: 'SKU', value: p.sku },
      { name: 'images', label: 'Product images', type: 'images', value: p.images, full: true, hint: 'Upload up to 8 images' },
      { name: 'description', label: 'Description', type: 'textarea', value: p.description, full: true },
      { name: 'isListed', label: 'Show in the store', type: 'checkbox', value: p.isListed ?? true },
    ];
  };
  const PROD_EP = ROLE === 'admin' ? '/admin/products' : '/mx/products';
  const productForm = (p, reload, fixedStoreId) => formModal({
    title: p ? 'Edit product' : 'Add product', fields: [...(!p && ROLE === 'admin' && !fixedStoreId ? [{ name: 'storeId', label: 'Store ID', required: true, full: true, hint: 'Copy it from the Stores list' }] : []), ...productFields(p)],
    onSubmit: async (v) => { 
      if (!p && fixedStoreId) v.storeId = fixedStoreId;
      await api(p ? `${PROD_EP}/${p._id}` : PROD_EP, { method: p ? 'PATCH' : 'POST', body: v }); toast(p ? 'Product updated' : 'Product added'); reload(); 
    },
  });
  const productsSection = () => table({
    ep: PROD_EP, searchHint: 'Search name, SKU or category', emptyTitle: 'No products yet', empty: 'Add your first product to start selling.',
    filters: [{ k: 'isListed', label: 'All listings', opts: [['true', 'Listed'], ['false', 'Unlisted']] }],
    tools: [{ label: 'Add product', run: (reload) => productForm(null, reload) }],
    cols: [
      { h: 'Product', c: (p) => `<div class="cell-flex">${p.images?.[0] ? `<img class="thumb" alt="" src="${esc(p.images[0])}" loading="lazy">` : '<span class="thumb"></span>'}<div><b>${esc(p.name)}</b><small>${esc(p.sku || p.category || '')}</small></div></div>` },
      ...(ROLE === 'admin' ? [{ h: 'Store', c: (p) => esc(p.store?.name || '') }] : []),
      { h: 'Price', c: (p) => `<b>${inr(p.price)}</b>${p.mrp > p.price ? `<small><s>${inr(p.mrp)}</s></small>` : ''}` },
      { h: 'Stock', c: (p) => (p.stock <= 5 ? `<span class="pill warn">${p.stock} left</span>` : p.stock) },
      { h: 'Status', c: (p) => (p.isListed ? pill('approved').replace('Approved', 'Listed') : '<span class="pill mute">Unlisted</span>') },
    ],
    actions: (p) => [
      { label: 'Edit', run: (r, reload) => productForm(r, reload) },
      { label: p.isListed ? 'Unlist' : 'List', run: async (r, reload) => { await api(`${PROD_EP}/${r._id}`, { method: 'PATCH', body: { isListed: !r.isListed } }); toast(r.isListed ? 'Unlisted' : 'Listed'); reload(); } },
      { label: 'Remove', cls: 'danger', run: (r, reload) => confirmBox('Remove this product?', 'It leaves your store page but stays on record for past orders. You can restore it from the recycle bin.', 'Move to bin', async () => { await api(`${PROD_EP}/${r._id}`, { method: 'DELETE' }); toast('Moved to recycle bin'); reload(); }) },
    ],
  });

  /* ---------- Stores ---------- */
  const addr = (a = {}, p = 'address.') => [
    { name: p + 'line1', label: 'Address', value: a.line1, full: true },
    { name: p + 'state', label: 'State', type: 'select', value: a.state, options: [[a.state||'', a.state||'Select State']] },
    { name: p + 'city', label: 'City', type: 'select', value: a.city, options: [[a.city||'', a.city||'Select City']] },
    { name: p + 'pincode', label: 'Pincode', value: a.pincode },
  ];
  const storeFields = (s = {}) => [
    { name: 'name', label: 'Store name', value: s.name, required: true, full: true }, { name: 'category', label: 'Category', value: s.category },
    { name: 'phone', label: 'Store phone', value: s.phone }, ...addr(s.address),
    { name: 'openingHours', label: 'Opening hours', type: 'hours', value: s.openingHours }, { name: 'deliveryFee', label: 'Delivery fee (₹)', type: 'money', value: s.deliveryFee },
    { name: 'minOrder', label: 'Minimum order (₹)', type: 'money', value: s.minOrder }, { name: 'logo', label: 'Logo link', value: s.logo }, { name: 'banner', label: 'Banner link', value: s.banner },
    { name: 'description', label: 'About the store', type: 'textarea', value: s.description, full: true }, { name: 'isOpen', label: 'Open for orders', type: 'checkbox', value: s.isOpen ?? true },
  ];
  const storeEdit = (s, reload) => formModal({
    title: 'Edit store', fields: [...storeFields(s), ...(ROLE === 'admin' ? [{ name: 'status', label: 'Approval', type: 'select', value: s.status, options: [['approved', 'Approved'], ['pending', 'Pending'], ['suspended', 'Suspended']] }] : [])],
    onSubmit: async (v) => { await api(ROLE === 'admin' ? `/admin/stores/${s._id}` : '/mx/store', { method: 'PATCH', body: v }); toast('Store updated'); reload(); },
  });
  const storesSection = () => table({
    ep: '/admin/stores', searchHint: 'Search store, category or phone', emptyTitle: 'No stores yet', empty: 'Onboard your first store from the Partners tab.',
    filters: [{ k: 'status', label: 'All approvals', opts: [['approved', 'Approved'], ['pending', 'Pending'], ['suspended', 'Suspended']] }],
    tools: [
      { label: 'Onboard store', run: (reload) => formModal({ title: 'Onboard a store', submit: 'Create store', intro: 'Creates the owner login and the store together. Leave the password empty to generate one.', fields: [{ name: 'name', label: 'Owner name', required: true }, { name: 'phone', label: 'Owner phone', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'password', label: 'Password', type: 'password' }, { name: 'store.name', label: 'Store name', required: true, full: true }, { name: 'store.category', label: 'Category', required: true }, { name: 'store.phone', label: 'Store phone' }, ...addr({}, 'store.address.'), { name: 'store.division', label: 'City Division', type: 'select', options: [['C', 'Center'], ['S', 'South'], ['N', 'North'], ['E', 'East'], ['W', 'West']] }], onSubmit: async (v) => { showTemp(await api('/admin/onboard/mx', { method: 'POST', body: v })); reload(); } }) },
    ],
    cols: [
      { h: 'Store', c: (s) => `<span style="cursor:pointer;color:var(--brand)"><b>${esc(s.name)}</b></span><br><small>${esc(s.address?.city || '')} · ${copyHtml(s.storeCode || s._id)}</small>` },
      { h: 'Owner', c: (s) => line(s.owner?.name, copyHtml(s.owner?.email)) }, { h: 'Category', c: (s) => esc(s.category || '—') },
      { h: 'Approval', c: (s) => pill(s.status) }, { h: 'Open', c: (s) => (s.isOpen ? pill('approved').replace('Approved', 'Open') : '<span class="pill mute">Closed</span>') },
    ],
    onRowClick: (s) => window.open('/admin/store/' + s._id, '_blank'),
    actions: (s) => [
      { label: 'Edit', run: (r, reload) => storeEdit(r, reload) },
      { label: 'Remove', cls: 'danger', run: (r, reload) => confirmBox('Remove this store?', 'The store and its products move to the recycle bin. Past orders keep every detail.', 'Move to bin', async () => { await api(`/admin/stores/${r._id}`, { method: 'DELETE' }); toast('Moved to recycle bin'); reload(); }) },
    ],
  });
  async function myStore() {
    const box = document.createElement('div');
    try {
      const s = await api('/mx/store');
      const reload = () => go('store');
      box.innerHTML = `<div class="card card-pad"><dl class="kv"><dt>Name</dt><dd>${esc(s.name)}</dd><dt>Status</dt><dd>${pill(s.status)} ${s.isOpen ? '<span class="pill ok">Open</span>' : '<span class="pill mute">Closed</span>'}</dd>
        <dt>Category</dt><dd>${esc(s.category || '—')}</dd><dt>Phone</dt><dd>${esc(s.phone || '—')}</dd>
        <dt>Address</dt><dd>${esc([s.address?.line1, s.address?.city, s.address?.state, s.address?.pincode].filter(Boolean).join(', ') || '—')}</dd>
        <dt>Delivery fee</dt><dd>${s.deliveryFee != null ? inr(s.deliveryFee) : 'Platform default'}</dd><dt>Minimum order</dt><dd>${inr(s.minOrder)}</dd>
        <dt>Hours</dt><dd>${esc(s.openingHours || '—')}</dd><dt>About</dt><dd>${esc(s.description || '—')}</dd></dl>
        <div class="toolbar" style="margin:18px 0 0"><button class="btn primary" id="e">Edit store</button><button class="btn" id="t">${s.isOpen ? 'Close for now' : 'Open for orders'}</button><span class="spacer"></span><button class="btn danger" id="d">Remove store</button></div></div>`;
      $('#e', box).onclick = () => storeEdit(s, reload);
      $('#t', box).onclick = async () => { await api('/mx/store', { method: 'PATCH', body: { isOpen: !s.isOpen } }); toast(s.isOpen ? 'Store closed' : 'Store open'); reload(); };
      $('#d', box).onclick = () => confirmBox('Remove your store?', 'Your store and products move to the recycle bin and disappear from the storefront. Ask an admin to restore them.', 'Remove store', async () => { await api('/mx/store', { method: 'DELETE' }); location.href = '/login'; });
    } catch (e) { box.innerHTML = `<div class="card empty"><b>No store found</b>${esc(e.message)}</div>`; }
    return box;
  }

  /* ---------- People ---------- */
  const userCols = [
    { h: 'Name', c: (u) => `<b>${esc(u.name)}</b><small>${copyHtml(u.email)}</small>` }, { h: 'Role', c: (u) => esc(sentence(u.role)) }, { h: 'Phone', c: (u) => copyHtml(u.phone || '—') },
    { h: 'Joined', c: (u) => dt(u.createdAt) }, { h: 'Account', c: (u) => (u.isActive ? pill('approved').replace('Approved', 'Active') : '<span class="pill mute">Paused</span>') },
  ];
  const userActions = (u) => [
    { label: 'Edit', run: (r, reload) => formModal({ title: 'Edit ' + r.name, fields: [{ name: 'name', label: 'Name', value: r.name, full: true }, { name: 'phone', label: 'Phone', value: r.phone }, { name: 'role', label: 'Role', type: 'select', value: r.role, options: [['cx', 'Customer'], ['mx', 'Store owner'], ['dp', 'Delivery partner'], ['admin', 'Admin']] }, { name: 'password', label: 'New password', type: 'password', hint: 'Leave empty to keep the current one' }, { name: 'isActive', label: 'Account is active', type: 'checkbox', value: r.isActive }], onSubmit: async (v) => { await api(`/admin/users/${r._id}`, { method: 'PATCH', body: v }); toast('Saved'); reload(); } }) },
    { label: 'Remove', cls: 'danger', run: (r, reload) => confirmBox('Remove this account?', 'They can no longer sign in. Their history stays on record and you can restore them from the recycle bin.', 'Move to bin', async () => { await api(`/admin/users/${r._id}`, { method: 'DELETE' }); toast('Moved to recycle bin'); reload(); }) },
  ];
  const customersSection = () => table({
    ep: '/admin/users', searchHint: 'Search name, email or phone', cols: userCols, actions: userActions, emptyTitle: 'No users yet', empty: 'Accounts appear here when they register or an admin creates them.',
    filters: [{ k: 'role', label: 'All roles', opts: [['cx', 'Customer'], ['mx', 'Store owner'], ['dp', 'Delivery partner'], ['admin', 'Admin']] }],
    tools: [{ label: 'Create user', run: (reload) => formModal({ title: 'Create user', submit: 'Create account', intro: 'Choose the account role and set its initial password. Leave it empty to generate a temporary password.', fields: [{ name: 'name', label: 'Name', required: true, full: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'phone', label: 'Phone' }, { name: 'role', label: 'Role', type: 'select', value: 'cx', options: [['cx', 'Customer'], ['mx', 'Store owner'], ['dp', 'Delivery partner'], ['admin', 'Admin']] }, { name: 'password', label: 'Initial password', type: 'password' }], onSubmit: async (v) => { showTemp(await api('/admin/users', { method: 'POST', body: v })); reload(); } }) }],
  });
  const showTemp = (r) => { if (r.temporaryPassword) { dlg.innerHTML = shell('Account created', `<p class="full">Share these sign-in details once. The password is not shown again.</p><dl class="kv full"><dt>Email</dt><dd>${esc(r.user.email)}</dd><dt>Password</dt><dd><b>${esc(r.temporaryPassword)}</b></dd></dl>`, '<button class="btn primary" data-close>Done</button>'); dlg.showModal(); } };
  const partnersSection = () => table({
    ep: '/admin/users', defaults: { role: 'mx' }, searchHint: 'Search name, email or phone', emptyTitle: 'No partners yet', empty: 'Onboard a store or delivery partner to get started.',
    filters: [{ k: 'role', label: 'Type', all: false, opts: [['mx', 'Stores (Mx)'], ['dp', 'Delivery (DP)']] }],
    tools: [
      { label: 'Onboard store', run: (reload) => formModal({ title: 'Onboard a store', submit: 'Create store', intro: 'Creates the owner login and the store together. Leave the password empty to generate one.', fields: [{ name: 'name', label: 'Owner name', required: true }, { name: 'phone', label: 'Owner phone', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'password', label: 'Password', type: 'password' }, { name: 'store.name', label: 'Store name', required: true, full: true }, { name: 'store.category', label: 'Category', required: true }, { name: 'store.phone', label: 'Store phone' }, ...addr({}, 'store.address.'), { name: 'store.division', label: 'City Division', type: 'select', options: [['C', 'Center'], ['S', 'South'], ['N', 'North'], ['E', 'East'], ['W', 'West']] }], onSubmit: async (v) => { showTemp(await api('/admin/onboard/mx', { method: 'POST', body: v })); reload(); } }) },
      { label: 'Onboard delivery partner', run: (reload) => formModal({ title: 'Onboard a delivery partner', submit: 'Create partner', intro: 'Leave the password empty to generate one.', fields: [{ name: 'name', label: 'Name', required: true }, { name: 'phone', label: 'Phone', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'password', label: 'Password', type: 'password' }, { name: 'vehicle.kind', label: 'Vehicle' }, { name: 'vehicle.number', label: 'Vehicle number' }], onSubmit: async (v) => { showTemp(await api('/admin/onboard/dp', { method: 'POST', body: v })); reload(); } }) },
    ],
    cols: userCols, actions: userActions,
  });

  async function adminNotifications() {
    const status = await api('/admin/notifications'); const box = document.createElement('div');
    if (status.redis === 'ready') {
      box.innerHTML = '<div class="card card-pad"><h3>Redis is connected</h3><p style="color:var(--ink-2);margin-top:8px">Caching, shared rate limits, session revocation and scheduled-job coordination are available.</p></div>';
    } else {
      const detail = status.redis === 'not_configured' ? 'REDIS_URL is not set.' : 'Redis is configured but is not currently connected.';
      box.innerHTML = `<div class="card card-pad"><h3>Redis unavailable</h3><p style="margin-top:8px">${esc(detail)} The app continues using MongoDB without caching, local per-process rate limits, or shared session revocation. Run a single app instance while Redis is unavailable so scheduled jobs are not duplicated.</p></div>`;
    }
    return box;
  }

  /* ---------- Recycle bin ---------- */
  function recycleSection() {
    const wrap = document.createElement('div');
    const kinds = ROLE === 'admin' ? [['orders', 'Orders'], ['products', 'Products'], ['stores', 'Stores'], ['users', 'People']] : [['products', 'Products']];
    let kind = kinds[0][0];
    const draw = () => {
      const label = { orders: (r) => `<b>${esc(r.orderNo)}</b><small>${inr(r.amounts?.total)}</small>`, products: (r) => `<b>${esc(r.name)}</b><small>${esc(r.slug)}</small>`, stores: (r) => `<b>${esc(r.name)}</b><small>${esc(r.slug)}</small>`, users: (r) => `<b>${esc(r.name)}</b><small>${esc(r.email)} · ${esc(r.role)}</small>` }[kind];
      const t = table({
        ep: ROLE === 'admin' ? `/admin/recycle/${kind}` : '/mx/recycle', search: false, emptyTitle: 'The bin is empty', empty: 'Removed records wait here until you restore them.',
        cols: [{ h: 'Record', c: label }, { h: 'Removed', c: (r) => dt(r.deletedAt) }, { h: 'Reason', c: (r) => esc(r.deleteReason || '—') }],
        actions: () => [{ label: 'Restore', cls: 'primary', run: async (r, reload) => { await api(ROLE === 'admin' ? `/admin/recycle/${kind}/${r._id}/restore` : `/mx/recycle/${r._id}/restore`, { method: 'POST' }); toast('Restored'); reload(); } }],
      });
      wrap.querySelector('.slot')?.remove(); t.classList.add('slot'); wrap.append(t);
    };
    if (kinds.length > 1) {
      const seg = document.createElement('div'); seg.className = 'seg'; seg.style.cssText = 'max-width:460px;margin-bottom:14px';
      seg.innerHTML = kinds.map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${k === kind}">${l}</button>`).join('');
      seg.onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; kind = b.dataset.k; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); };
      wrap.append(seg);
    }
    draw(); return wrap;
  }

  async function adminStoreDetail() {
    const box = document.createElement('div');
    const sid = root.dataset.storeId;
    if (!sid) {
      box.innerHTML = `<div class="card empty"><b>No store selected</b><p style="color:var(--ink-2);margin-top:8px">Please go to the <a href="#stores" onclick="go('stores')">Stores</a> tab and select a store to manage.</p></div>`;
      return box;
    }
    try {
      const s = await api('/admin/stores/' + sid);
      const reload = () => go('store-detail');
      box.innerHTML = `<div class="card card-pad" style="margin-bottom:16px"><dl class="kv"><dt>Name</dt><dd>${esc(s.name)}</dd><dt>Status</dt><dd>${pill(s.status)} ${s.isOpen ? '<span class="pill ok">Open</span>' : '<span class="pill mute">Closed</span>'}</dd>
        <dt>Category</dt><dd>${esc(s.category || '—')}</dd><dt>Phone</dt><dd>${esc(s.phone || '—')}</dd>
        <dt>Address</dt><dd>${esc([s.address?.line1, s.address?.city, s.address?.state, s.address?.pincode].filter(Boolean).join(', ') || '—')}</dd>
        <dt>Delivery fee</dt><dd>${s.deliveryFee != null ? inr(s.deliveryFee) : 'Platform default'}</dd><dt>Minimum order</dt><dd>${inr(s.minOrder)}</dd>
        <dt>Hours</dt><dd>${esc(s.openingHours || '—')}</dd><dt>About</dt><dd>${esc(s.description || '—')}</dd></dl>
        <div class="toolbar" style="margin:18px 0 0">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="conf-edit"> I confirm the changes made</label>
          <button class="btn primary" id="e" disabled>Save / Edit store</button>
          <button class="btn" id="em">Update Owner Email</button>
        </div></div>`;
      
      const btn = $('#e', box);
      $('#conf-edit', box).onchange = (e) => btn.disabled = !e.target.checked;
      btn.onclick = () => storeEdit(s, reload);
      $('#em', box).onclick = () => formModal({
        title: 'Update Owner Email', fields: [{ name: 'email', label: 'New Email', type: 'email', required: true, value: s.owner?.email }],
        onSubmit: async (v) => { await api(`/admin/users/${s.owner._id}`, { method: 'PATCH', body: v }); toast('Email updated'); reload(); }
      });

      const gridStyle = document.createElement('style');
      gridStyle.innerHTML = `
        .prod-grid-card { position: relative; height: 250px; z-index: 1; }
        .prod-grid-card:hover { z-index: 100; }
        .prod-grid-card-inner {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px;
          display: flex; flex-direction: column; overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .prod-grid-card:hover .prod-grid-card-inner {
          width: 200%; height: 200%; top: -50%; left: -50%;
          box-shadow: 0 15px 35px rgba(0,0,0,0.2);
        }
        .pg-img { flex: 1; position: relative; background: #eee; min-height: 140px; }
        .pg-img img { width: 100%; height: 100%; object-fit: cover; position: absolute; }
        .pg-badge { position: absolute; top: 8px; left: 8px; background: var(--brand); color: #fff; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: bold; }
        .pg-info { padding: 12px; flex-shrink: 0; background: var(--surface-1); }
        .pg-title { font-weight: 600; font-size: 1rem; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pg-price { color: var(--brand); font-weight: bold; }
        .pg-desc { display: none; font-size: 0.85rem; color: var(--ink-2); margin-top: 8px; }
        .pg-acts { display: none; padding: 12px; border-top: 1px solid var(--border); gap: 6px; flex-wrap: wrap; background: var(--surface-1); }
        .prod-grid-card:hover .pg-title { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .prod-grid-card:hover .pg-desc { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .prod-grid-card:hover .pg-acts { display: flex; }
      `;
      box.append(gridStyle);

      box.append(table({
        ep: '/admin/products?store=' + s._id, searchHint: 'Search products', emptyTitle: 'No products yet', empty: 'This store has no products.',
        tools: [{ label: 'Add product', run: (reload) => productForm(null, reload, s._id) }],
        grid: (p, acts) => {
          const discount = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
          return `<div class="prod-grid-card">
            <div class="prod-grid-card-inner">
              <div class="pg-img">
                ${p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="">` : ''}
                ${discount > 0 ? `<div class="pg-badge">${discount}% OFF</div>` : ''}
              </div>
              <div class="pg-info">
                <div class="pg-title">${esc(p.name)}</div>
                <div class="pg-price">${inr(p.price)} ${p.mrp > p.price ? `<small style="color:var(--ink-2)"><s>${inr(p.mrp)}</s></small>` : ''}</div>
                <div class="pg-desc">${esc(p.description || '')}</div>
              </div>
              <div class="pg-acts">${acts}</div>
            </div>
          </div>`;
        },
        actions: (p) => [
          { label: 'Edit', run: (r, reload) => productForm(r, reload, s._id) },
          { label: p.isListed ? 'Unlist' : 'List', run: async (r, reload) => { await api(`/admin/products/${r._id}`, { method: 'PATCH', body: { isListed: !r.isListed } }); toast(r.isListed ? 'Unlisted' : 'Listed'); reload(); } },
          { label: 'Remove', cls: 'danger', run: (r, reload) => confirmBox('Remove this product?', 'It leaves your store page but stays on record.', 'Move to bin', async () => { await api(`/admin/products/${r._id}`, { method: 'DELETE' }); toast('Moved to bin'); reload(); }) },
        ],
      }));
    } catch (e) { box.innerHTML = `<div class="card empty"><b>No store found</b>${esc(e.message)}</div>`; }
    return box;
  }

  /* ---------- Overview ---------- */
  function countUp(el, to, fmt) {
    if (reduceMotion) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const tick = (t) => { const k = Math.min(1, (t - t0) / 900); el.textContent = fmt(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  const kpi = (label, v, fmt, cls = '') => `<div class="kpi ${cls}"><span>${esc(label)}</span><b data-n="${v}" data-f="${fmt.name}">0</b></div>`;
  const fmts = { money: inr, num: (n) => Math.round(n).toLocaleString('en-IN') };
  const animateKpis = (box) => box.querySelectorAll('[data-n]').forEach((el) => countUp(el, Number(el.dataset.n), fmts[el.dataset.f]));
  async function adminOverview() {
    const box = document.createElement('div'); const s = await api('/admin/stats');
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5); const k = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); return { k, l: d.toLocaleDateString('en-IN', { weekday: 'short' }), t: s.daily.find((x) => x.date === k)?.total || 0 }; });
    const max = Math.max(...days.map((d) => d.t), 1); const active = ['confirmed', 'preparing', 'ready', 'picked_up'].reduce((n, k) => n + (s.orders[k] || 0), 0);
    box.innerHTML = `<div class="kpis">${kpi('Revenue collected', s.revenue, { name: 'money' }, 'gold')}${kpi('Orders in progress', active, { name: 'num' })}${kpi('Active stores', s.stores, { name: 'num' })}${kpi('Customers', s.users.cx || 0, { name: 'num' })}${kpi('Delivery partners', s.users.dp || 0, { name: 'num' })}</div>
      <div class="two"><div class="card card-pad"><h3>Revenue, last 7 days</h3><div class="chart" role="img" aria-label="Revenue per day for the last seven days">${days.map((d) => `<div class="bar" title="${inr(d.t)}"><i style="height:${Math.max(3, (d.t / max) * 100)}%"></i><span>${d.l}</span></div>`).join('')}</div></div>
      <div class="card card-pad"><h3>Orders by status</h3><div class="breakdown">${Object.entries(s.orders).map(([k, n]) => `<div>${pill(k)}<b>${n}</b></div>`).join('') || '<p style="color:var(--ink-2);margin-top:8px">No orders yet.</p>'}</div>${s.recycle ? `<p style="margin-top:16px;color:var(--ink-2)">${s.recycle} records in the recycle bin.</p>` : ''}</div></div>`;
    requestAnimationFrame(() => animateKpis(box)); return box;
  }
  async function mxOverview() {
    const box = document.createElement('div'); const s = await api('/mx/stats');
    box.innerHTML = `<div class="kpis">${kpi("Today's sales", s.todayRevenue, { name: 'money' }, 'gold')}${kpi("Today's orders", s.todayOrders, { name: 'num' })}${kpi('Waiting for you', s.newOrders, { name: 'num' })}${kpi('Products', s.products, { name: 'num' })}${kpi('Low on stock', s.lowStock, { name: 'num' })}</div>`;
    requestAnimationFrame(() => animateKpis(box)); return box;
  }
  async function profile() {
    const box = document.createElement('div'); const u = await api('/auth/me');
    box.innerHTML = `<div class="card card-pad"><dl class="kv"><dt>Name</dt><dd>${esc(u.name)}</dd><dt>Email</dt><dd>${esc(u.email)}</dd><dt>Phone</dt><dd>${esc(u.phone || '—')}</dd><dt>Saved addresses</dt><dd>${u.addresses?.length || 0}</dd></dl><div class="toolbar" style="margin:18px 0 0"><button class="btn primary" id="e">Edit details</button>${root.dataset.storefront ? `<a class="btn" href="${esc(root.dataset.storefront)}">Go to the store</a>` : ''}</div></div>`;
    $('#e', box).onclick = () => formModal({ title: 'Edit details', fields: [{ name: 'name', label: 'Name', value: u.name, full: true }, { name: 'phone', label: 'Phone', value: u.phone, full: true }], onSubmit: async (v) => { await api('/auth/me', { method: 'PATCH', body: v }); toast('Saved'); go('profile'); } });
    return box;
  }
  async function deliveries() {
    const box = document.createElement('div'); const me = await api('/dp/me'); const top = $('#topActions');
    const btn = document.createElement('button'); btn.className = 'btn';
    const paint = () => { btn.innerHTML = me.isAvailable ? '<span class="pill ok">Available</span> Go off duty' : '<span class="pill mute">Off duty</span> Go available'; };
    btn.onclick = async () => { const u = await api('/dp/availability', { method: 'PATCH', body: { isAvailable: !me.isAvailable } }); me.isAvailable = u.isAvailable; paint(); toast(me.isAvailable ? 'You are available for orders' : 'You are off duty'); };
    paint(); top.append(btn);
    box.append(ordersSection({ ep: '/dp/orders', defaults: { scope: 'active' }, filters: [{ k: 'scope', label: 'Show', all: false, opts: [['active', 'Active deliveries'], ['done', 'Completed']] }], emptyTitle: 'No deliveries assigned', empty: 'When dispatch assigns you an order it will appear here.' })());
    return box;
  }

  /* ---------- Sections & router ---------- */
  const SECTIONS = {
    admin: [['overview', 'Overview', 'chart', 'Revenue and activity across the marketplace', adminOverview], ['notifications', 'Notifications', 'bell', 'Service status and account alerts', adminNotifications], ['orders', 'Orders', 'receipt', 'Track, dispatch and resolve orders', ordersSection()], ['stores', 'Stores', 'store', 'Every store on the platform', storesSection], ['products', 'Products', 'box', 'All products across stores', productsSection], ['customers', 'Users', 'users', 'Manage customer, partner and administrator accounts', customersSection], ['partners', 'Partners', 'truck', 'Onboard and manage stores and delivery partners', partnersSection], ['recycle', 'Recycle bin', 'bin', 'Removed records, ready to restore', recycleSection], ['store-detail', 'Store Details', 'store', 'Manage store and products', adminStoreDetail]],
    mx: [['overview', 'Overview', 'chart', 'How your store is doing today', mxOverview], ['orders', 'Orders', 'receipt', 'Prepare and hand over orders', ordersSection()], ['products', 'Products', 'box', 'Your catalogue', productsSection], ['store', 'My store', 'store', 'Details customers see', myStore], ['recycle', 'Recycle bin', 'bin', 'Removed products, ready to restore', recycleSection]],
    dp: [['deliveries', 'Deliveries', 'truck', 'Pick up and deliver your assigned orders', deliveries]],
    cx: [['orders', 'My orders', 'receipt', 'Track, pay for, return or replace orders', ordersSection()], ['profile', 'Profile', 'user', 'Your details', profile]],
  }[ROLE];
  let current = SECTIONS[0][0];
  $('#nav').innerHTML = SECTIONS.map(([k, l, i]) => `<button data-k="${k}">${icon(i)}<span>${l}</span></button>`).join('');
  $('#nav').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) go(b.dataset.k); });

  async function go(key) {
    const s = SECTIONS.find((x) => x[0] === key) || SECTIONS[0]; current = s[0];
    history.replaceState(null, '', '#' + current);
    $('#nav').querySelectorAll('button').forEach((b) => (b.dataset.k === current ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    $('#title').textContent = s[1]; $('#sub').textContent = s[3]; $('#topActions').innerHTML = '';
    const view = $('#view'); view.innerHTML = '<div class="card card-pad"><div class="skel" style="width:40%"></div></div>';
    try { const el = await s[4](); view.replaceChildren(el); view.style.animation = 'none'; view.offsetHeight; view.style.animation = ''; }
    catch (e) { view.innerHTML = `<div class="card empty"><b>Something went wrong</b>${esc(e.message)}</div>`; }
  }

  $('#logout').addEventListener('click', async () => {
    try { await api(ROLE === 'admin' ? '/admin/logout' : '/auth/logout', { method: 'POST' }); } finally { location.href = '/login'; }
  });
  if (root.dataset.storeId) {
    go('store-detail');
  } else {
    go(location.hash.slice(1));
  }
})();
