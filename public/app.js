/* iDomainX Manager — app.js (black & white, modal-root dialogs) */
'use strict';

/* ============================ STATE / API ============================ */
const state = {
  route: 'dashboard', templates: [], media: [], settings: {},
  contentFilters: { search: '', type: 'all', category: 'all', sort: 'path', page: 1, trash: false, kind: 'pages' },
  selection: new Set(), currentEntryId: null, editorEntry: null, editorFields: {},
  editorTemplate: null, editorDirty: false, mediaSearch: '', currentMediaTarget: null
};

async function api(url, opts = {}) {
  const headers = { 'x-idxx-csrf': '1' };
  let body = opts.body;
  if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  const res = await fetch(url, { method: opts.method || 'GET', headers, body, credentials: 'same-origin' });
  if (res.status === 401) { showLogin(); throw new Error('Please sign in again.'); }
  if (!res.ok) { let msg = 'Request failed'; try { msg = (await res.json()).error || msg; } catch {} throw new Error(msg); }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}

/* ============================ HELPERS ============================ */
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function fmtBytes(n) { if (!n && n !== 0) return '—'; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1048576).toFixed(2) + ' MB'; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'; }
function fmtDateTime(d) { return d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const ICON_PLUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const ICON_X = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const ICON_FILE = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

/* ============================ TOASTS ============================ */
function toast(message, type = 'info', ms = 4000) {
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = 'toast';
  const icon = type === 'success'
    ? '<svg class="toast-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>'
    : type === 'error'
      ? '<svg class="toast-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
      : '<svg class="toast-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  el.innerHTML = icon + '<span class="toast-msg">' + esc(message) + '</span>' +
    '<button class="toast-close" aria-label="Dismiss">' + ICON_X + '</button>' +
    '<span class="toast-progress" style="animation:toastBar ' + ms + 'ms linear forwards"></span>';
  root.appendChild(el);
  const kill = () => {
    if (!el.parentNode) return;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 190);
  };
  el.querySelector('.toast-close').addEventListener('click', kill);
  el.addEventListener('mouseenter', () => el.querySelector('.toast-progress').style.animationPlayState = 'paused');
  el.addEventListener('mouseleave', () => el.querySelector('.toast-progress').style.animationPlayState = 'running');
  setTimeout(kill, ms);
}

/* ============================ MODALS (one layered root) ============================ */
function modalShell(innerHtml, cls = '') {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay' + (cls ? ' ' + cls : '');
  ov.innerHTML = innerHtml;
  ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
  document.getElementById('modalRoot').appendChild(ov);
  return ov;
}
function confirmDialog(title, message, okLabel = 'Confirm') {
  return new Promise(resolve => {
    const ov = modalShell(
      '<div class="modal" style="max-width:400px"><div class="modal-header"><h3>' + esc(title) + '</h3></div>' +
      '<div class="modal-body"><p style="font-size:13px;color:var(--muted)">' + esc(message || '') + '</p></div>' +
      '<div class="modal-footer"><button class="btn btn-secondary" data-x>Cancel</button>' +
      '<button class="btn btn-primary" data-ok>' + esc(okLabel) + '</button></div></div>', 'confirm-layer');
    ov.querySelector('[data-x]').onclick = () => { ov.remove(); resolve(false); };
    ov.querySelector('[data-ok]').onclick = () => { ov.remove(); resolve(true); };
  });
}

/* ============================ AUTH / SHELL ============================ */
function showLogin() {
  document.getElementById('appView').classList.add('hidden');
  document.getElementById('loginView').classList.remove('hidden');
}
async function doLogin(e) {
  e.preventDefault();
  const pw = document.getElementById('loginPassword').value;
  try {
    await fetch('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) })
      .then(async r => { if (!r.ok) throw new Error('Invalid password.'); return r.json(); });
    document.getElementById('loginView').classList.add('hidden');
    document.getElementById('appView').classList.remove('hidden');
    await showApp();
  } catch (err) { toast(err.message, 'error'); }
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function toggleUserMenu() {
  let m = document.getElementById('userMenu');
  if (m) { m.remove(); return; }
  m = document.createElement('div');
  m.id = 'userMenu';
  m.className = 'dropdown-menu';
  m.style.cssText = 'position:fixed;top:' + (document.getElementById('userMenuBtn').getBoundingClientRect().bottom + 6) + 'px;right:16px;display:block';
  m.innerHTML = '<div class="dropdown-item" onclick="location.href=\'/logout\'">Sign out</div>';
  document.getElementById('modalRoot').appendChild(m);
  setTimeout(() => document.addEventListener('click', function h(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', h); } }), 0);
}
function showApp() { navigate('dashboard'); }
async function refreshTemplates() { try { state.templates = await api('/api/templates'); } catch { state.templates = []; } }
async function refreshPublishBadge() {
  try {
    const d = await api('/api/dashboard');
    ['publishBadge', 'topbarPublishBadge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = d.unpublished || 0; el.classList.toggle('hidden', !(d.unpublished > 0)); }
    });
  } catch {}
}

/* ============================ ROUTING ============================ */
const ROUTES = {
  dashboard: { title: 'Dashboard', render: renderDashboard },
  pages: { title: 'Pages', render: renderPages },
  content: { title: 'Content', render: renderContent },
  templates: { title: 'Templates', render: renderTemplates },
  media: { title: 'Media', render: renderMedia },
  publish: { title: 'Publish', render: renderPublish },
  backups: { title: 'Backups', render: renderBackups },
  settings: { title: 'Settings', render: renderSettings }
};
function navigate(route) {
  if (!ROUTES[route]) return;
  state.route = route;
  document.getElementById('sidebar').classList.remove('open');
  document.querySelectorAll('.nav-item[data-route]').forEach(el => el.classList.toggle('active', el.dataset.route === route));
  document.getElementById('breadcrumb').textContent = ROUTES[route].title;
  document.getElementById('viewContainer').innerHTML = '<div class="skeleton skeleton-line" style="height:120px"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div>';
  ROUTES[route].render();
  window.scrollTo(0, 0);
}
function pageHeader(title, subtitle, actions) {
  return '<div class="page-header"><div><h2 class="page-title">' + esc(title) + '</h2>' +
    (subtitle ? '<p class="page-subtitle">' + esc(subtitle) + '</p>' : '') +
    '</div><div style="display:flex;gap:8px;flex-wrap:wrap">' + (actions || '') + '</div></div>';
}
function emptyState(title, desc, action) {
  return '<div class="empty-state"><div class="empty-state-icon">' + ICON_FILE + '</div>' +
    '<div class="empty-state-title">' + esc(title) + '</div><div class="empty-state-desc">' + esc(desc) + '</div>' + (action || '') + '</div>';
}
function statCard(label, value, meta) {
  return '<div class="stat-card"><div class="stat-label">' + esc(label) + '</div><div class="stat-value">' + esc(String(value)) + '</div>' +
    (meta ? '<div style="font-size:12px;color:var(--muted);margin-top:4px">' + esc(meta) + '</div>' : '') + '</div>';
}
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard', 'success')).catch(() => toast('Could not copy', 'error'));
}

/* ============================ DASHBOARD ============================ */
async function renderDashboard() {
  const c = document.getElementById('viewContainer');
  let d;
  try { d = await api('/api/dashboard'); } catch (e) { c.innerHTML = emptyState('Could not load dashboard', e.message); return; }
  const counts = d.counts || {};
  const lp = d.lastPublish;
  const activity = (d.activity || []).map(a =>
    '<div class="activity-item"><div class="activity-dot"></div><div><div>' + esc(a.action) + (a.detail ? ' — ' + esc(a.detail) : '') + '</div><div class="activity-time">' + fmtDateTime(a.ts) + '</div></div></div>'
  ).join('') || '<p style="color:var(--muted);font-size:13px">No activity yet.</p>';

  c.innerHTML = pageHeader('Dashboard', 'Overview of your site') +
    '<div class="stat-grid">' +
    statCard('Pages', counts.pages || 0) +
    statCard('Content entries', counts.content || 0) +
    statCard('Templates', counts.templates || 0) +
    statCard('Media files', counts.media || 0) +
    '</div>' +
    '<div class="grid-2" style="margin-bottom:16px">' +
    '<div class="card card-pad"><div class="stat-label">Changes not published</div>' +
    '<div style="font-size:32px;font-weight:800;margin-top:6px">' + (d.unpublished || 0) + '</div>' +
    '<p style="color:var(--muted);font-size:13px;margin:8px 0 16px">' + ((d.unpublished || 0) > 0 ? 'Saved changes since the last publish.' : 'Everything is up to date.') + '</p>' +
    '<button class="btn btn-primary" onclick="navigate(\'publish\')">Review and publish</button></div>' +
    '<div class="card card-pad"><div class="stat-label">Last publish</div>' +
    (lp ? '<div style="font-weight:700;margin:8px 0 4px">' + fmtDateTime(lp.ts) + '</div><div style="font-size:13px;color:var(--muted)">' + (lp.new_count || 0) + ' new, ' + (lp.changed_count || 0) + ' changed, ' + (lp.deleted_count || 0) + ' deleted · ' + fmtBytes(lp.total_size) + '</div>' +
      (lp.deployment_url ? '<a class="badge" style="margin-top:8px" href="' + esc(lp.deployment_url) + '" target="_blank" rel="noopener">View deployment</a>' : '')
      : '<p style="color:var(--muted);font-size:13px;margin-top:8px">Never published.</p>') +
    '<div class="divider"></div><div class="stat-label">Last backup</div>' +
    (d.lastBackup ? '<div style="font-size:13px;font-weight:600;margin-top:8px">' + esc(d.lastBackup.filename) + ' · ' + fmtDate(d.lastBackup.created_at) + '</div>' : '<p style="color:var(--muted);font-size:13px;margin-top:8px">No backups yet.</p>') +
    '</div></div>' +
    '<div class="card card-pad"><div class="stat-label">Recent activity</div><div style="margin-top:8px">' + activity + '</div></div>';
}

/* ============================ PAGES / CONTENT LIST ============================ */
async function renderPages() { await renderEntryList('pages'); }
async function renderContent() { await renderEntryList('content'); }

async function renderEntryList(kind) {
  const c = document.getElementById('viewContainer');
  const f = state.contentFilters;
  f.kind = kind;
  const isPages = kind === 'pages';
  const params = new URLSearchParams({
    search: f.search, category: f.category, sort: f.sort,
    page: String(f.page), limit: '25', trashed: f.trash ? '1' : '0', kind
  });
  if (!isPages && f.type !== 'all') params.set('type', f.type);

  let data;
  try { data = await api('/api/entries?' + params.toString()); } catch (e) { c.innerHTML = emptyState('Could not load entries', e.message); return; }
  const items = data.items || [];
  const typeOptions = state.templates.map(t => '<option value="' + esc(t.name) + '"' + (f.type === t.name ? ' selected' : '') + '>' + esc(t.name) + '</option>').join('');

  c.innerHTML = pageHeader(isPages ? 'Pages' : 'Content', isPages ? 'Standalone pages, files and system pages' : 'Entries built from templates',
      '<button class="btn btn-secondary" onclick="toggleTrash()">' + (f.trash ? 'Back to list' : 'Trash') + '</button>' +
      '<button class="btn btn-primary" onclick="openNewPicker()">' + ICON_PLUS + ' New</button>') +
    '<div class="list-filters">' +
    '<input type="text" class="input" style="max-width:240px" placeholder="Search..." value="' + esc(f.search) + '" oninput="filterSearch(this.value)">' +
    (isPages ? '' : '<select class="input filter-select" onchange="filterType(this.value)"><option value="all">All types</option>' + typeOptions + '</select>') +
    '<select class="input filter-select" onchange="filterSort(this.value)"><option value="path">By path</option><option value="newest"' + (f.sort === 'newest' ? ' selected' : '') + '>Newest</option><option value="oldest"' + (f.sort === 'oldest' ? ' selected' : '') + '>Oldest</option><option value="title"' + (f.sort === 'title' ? ' selected' : '') + '>Title</option></select>' +
    '</div>' +
    (state.selection.size ? '<div class="toolbar"><span style="font-size:13px;font-weight:700">' + state.selection.size + ' selected</span>' +
      '<button class="btn btn-sm btn-secondary" onclick="bulkAction(\'delete\')">Move to trash</button>' +
      '<button class="btn btn-sm btn-ghost" onclick="clearSelection()">Clear</button></div>' : '') +
    (items.length === 0
      ? '<div class="card">' + emptyState(f.trash ? 'Trash is empty' : 'Nothing here yet', f.trash ? 'Deleted items appear here.' : 'Create your first ' + (isPages ? 'page' : 'entry') + ' to get started.',
          f.trash ? '' : '<button class="btn btn-primary" onclick="openNewPicker()">' + ICON_PLUS + ' New ' + (isPages ? 'page' : 'entry') + '</button>') + '</div>'
      : '<div class="table-wrap"><table><thead><tr><th style="width:36px"><input type="checkbox" onchange="toggleSelectAll(this.checked)"></th>' +
        '<th>' + (isPages ? 'Path' : 'Title') + '</th>' + (isPages ? '<th>Title</th>' : '<th>Type</th>') + '<th>Updated</th><th style="width:60px"></th>' +
        '</tr></thead><tbody>' + items.map(p => rowHtml(p, isPages, f)).join('') + '</tbody></table></div>') +
    (data.pages > 1 ? '<div class="toolbar" style="justify-content:center">' +
      (f.page > 1 ? '<button class="btn btn-sm btn-secondary" onclick="gotoPage(' + (f.page - 1) + ')">Prev</button>' : '') +
      '<span style="font-size:13px;color:var(--muted);padding:0 12px">Page ' + data.page + ' of ' + data.pages + '</span>' +
      (f.page < data.pages ? '<button class="btn btn-sm btn-secondary" onclick="gotoPage(' + (f.page + 1) + ')">Next</button>' : '') + '</div>' : '');

  function rowHtml(p, isPages, f) {
    const pinned = p.pinned ? '<span class="pin-badge">System</span>' : '';
    return '<tr>' +
      '<td>' + (p.pinned ? '' : '<input type="checkbox" onchange="toggleSelect(' + p.id + ', this.checked)"' + (state.selection.has(p.id) ? ' checked' : '') + '>') + '</td>' +
      (isPages
        ? '<td><div class="table-title"><a href="#" onclick="openEditorById(' + p.id + ');return false">' + esc(p.path || '/') + '</a></div>' + (p.kind !== 'content' ? '<div class="table-sub">' + esc(p.kind) + '</div>' : '') + '</td>' +
          '<td style="color:var(--muted)">' + esc(p.title) + pinned + '</td>'
        : '<td><div class="table-title"><a href="#" onclick="openEditorById(' + p.id + ');return false">' + esc(p.title) + '</a></div></td>' +
          '<td style="color:var(--muted)">' + esc(p.template_name || '—') + '</td>') +
      '<td style="color:var(--muted)">' + fmtDate(p.updated_at) + '</td>' +
      '<td><div class="dropdown"><button class="btn btn-ghost btn-sm" onclick="toggleDropdown(event, this)"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg></button>' +
      '<div class="dropdown-menu">' +
      '<div class="dropdown-item" onclick="openEditorById(' + p.id + ')">Edit</div>' +
      (p.kind !== 'file' && p.kind !== 'system' ? '<div class="dropdown-item" onclick="duplicateEntry(' + p.id + ')">Duplicate</div>' : '') +
      '<div class="dropdown-item" onclick="copyToClipboard(\'' + esc((state.settings.site_url || '') + (p.path || '')) + '\')">Copy live URL</div>' +
      (p.preview_token ? '<div class="dropdown-item" onclick="copyToClipboard(location.origin + \'/preview/' + esc(p.preview_token) + '\')">Copy preview link</div>' : '') +
      (f.trash
        ? '<div class="dropdown-item" onclick="restoreEntry(' + p.id + ')">Restore</div>'
        : (p.pinned ? '' : '<div class="dropdown-item danger" onclick="trashEntry(' + p.id + ')">Delete to trash</div>')) +
      '</div></div></td></tr>';
  }
}

const filterSearch = debounce(v => { state.contentFilters.search = v; state.contentFilters.page = 1; renderEntryList(state.route); }, 350);
function filterType(v) { state.contentFilters.type = v; state.contentFilters.page = 1; renderEntryList(state.route); }
function filterSort(v) { state.contentFilters.sort = v; renderEntryList(state.route); }
function gotoPage(p) { state.contentFilters.page = p; renderEntryList(state.route); }
function toggleTrash() { state.contentFilters.trash = !state.contentFilters.trash; state.contentFilters.page = 1; renderEntryList(state.route); }
function toggleSelect(id, checked) { checked ? state.selection.add(id) : state.selection.delete(id); renderEntryList(state.route); }
function toggleSelectAll(checked) {
  document.querySelectorAll('tbody input[type=checkbox]').forEach(cb => {
    cb.checked = checked;
  });
  if (checked) document.querySelectorAll('tbody input[type=checkbox]').forEach(cb => { const m = cb.getAttribute('onchange').match(/\d+/); if (m) state.selection.add(Number(m[0])); });
  else state.selection.clear();
  renderEntryList(state.route);
}
function clearSelection() { state.selection.clear(); renderEntryList(state.route); }
async function bulkAction(action) {
  try {
    await api('/api/entries/bulk', { method: 'POST', body: { ids: [...state.selection], action } });
    state.selection.clear();
    toast('Applied to selected', 'success');
    renderEntryList(state.route); refreshPublishBadge();
  } catch (e) { toast(e.message, 'error'); }
}
function toggleDropdown(e, btn) {
  e.stopPropagation();
  const dd = btn.closest('.dropdown');
  const wasOpen = dd.classList.contains('open');
  document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
  if (!wasOpen) dd.classList.add('open');
}
document.addEventListener('click', () => document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open')));

/* ---- New page / new entry flows ---- */
function openNewPicker() {
  if (state.contentFilters.kind === 'pages') return openNewPageModal();
  openNewContentModal();
}
function openNewPageModal() {
  const ov = modalShell(
    '<div class="modal"><div class="modal-header"><h3>New page</h3><button class="modal-close" data-x>' + ICON_X + '</button></div>' +
    '<div class="modal-body">' +
    '<div class="form-field"><label class="form-label">Title</label><input type="text" id="npTitle" class="input" placeholder="About us"></div>' +
    '<div class="form-field"><label class="form-label">Path</label><input type="text" id="npPath" class="input mono" placeholder="/about/"><p class="form-hint" id="npHint">Lowercase, starts with / — for example /about/</p></div>' +
    '</div><div class="modal-footer"><button class="btn btn-secondary" data-x>Cancel</button>' +
    '<button class="btn btn-primary" id="npCreate">Create page</button></div></div>');
  ov.querySelectorAll('[data-x]').forEach(b => b.onclick = () => ov.remove());
  const pathInput = ov.querySelector('#npPath');
  const hint = ov.querySelector('#npHint');
  const check = debounce(async () => {
    const p = pathInput.value.trim();
    if (!p) { hint.textContent = 'Lowercase, starts with / — for example /about/'; hint.classList.remove('error'); return; }
    try {
      const r = await api('/api/path-check?path=' + encodeURIComponent(p));
      if (r.ok) { hint.textContent = 'Available: ' + r.normalized; hint.classList.remove('error'); }
      else { hint.textContent = 'In use by ' + r.owner; hint.classList.add('error'); }
    } catch {}
  }, 350);
  pathInput.addEventListener('input', check);
  ov.querySelector('#npCreate').onclick = async () => {
    try {
      const r = await api('/api/entries', { method: 'POST', body: { title: ov.querySelector('#npTitle').value.trim(), path: pathInput.value.trim(), kind: 'page' } });
      ov.remove(); toast('Page created', 'success'); await openEditorById(r.id);
    } catch (e) { toast(e.message, 'error'); }
  };
  ov.querySelector('#npTitle').focus();
}
function openNewContentModal() {
  const ov = modalShell(
    '<div class="modal"><div class="modal-header"><h3>Choose a template</h3><button class="modal-close" data-x>' + ICON_X + '</button></div>' +
    '<div class="modal-body"><div class="media-grid">' +
    state.templates.map(t => '<div class="media-item" style="padding:20px;text-align:center" data-tpl="' + t.id + '">' +
      '<div style="font-weight:700;margin-bottom:4px">' + esc(t.name) + '</div>' +
      '<div style="font-size:11px;color:var(--muted)">' + esc(t.path_prefix || '/') + '</div></div>').join('') +
    '</div></div></div>');
  ov.querySelector('[data-x]').onclick = () => ov.remove();
  ov.querySelectorAll('[data-tpl]').forEach(el => {
    el.onclick = async () => {
      try {
        const r = await api('/api/entries', { method: 'POST', body: { title: 'Untitled', template_id: Number(el.dataset.tpl), kind: 'content' } });
        ov.remove(); toast('Entry created', 'success'); await openEditorById(r.id);
      } catch (e) { toast(e.message, 'error'); }
    };
  });
}
async function openEditorById(id) { await openEditor(id); }
async function duplicateEntry(id) {
  try { await api('/api/entries/' + id + '/duplicate', { method: 'POST', body: {} }); toast('Duplicated', 'success'); renderEntryList(state.route); refreshPublishBadge(); }
  catch (e) { toast(e.message, 'error'); }
}
async function trashEntry(id) {
  const ok = await confirmDialog('Move to trash?', 'You can restore it later from the Trash.', 'Move to trash');
  if (!ok) return;
  try { await api('/api/entries/' + id, { method: 'DELETE' }); toast('Moved to trash', 'success'); renderEntryList(state.route); refreshPublishBadge(); }
  catch (e) { toast(e.message, 'error'); }
}
async function restoreEntry(id) {
  try { await api('/api/entries/' + id + '/restore', { method: 'POST', body: {} }); toast('Restored', 'success'); renderEntryList(state.route); refreshPublishBadge(); }
  catch (e) { toast(e.message, 'error'); }
}

/* ============================ ENTRY EDITOR ============================ */
let previewTimer = null;

async function openEditor(id) {
  state.currentEntryId = id;
  state.editorDirty = false;
  let entry;
  try { entry = await api('/api/entries/' + id); } catch (e) { toast(e.message, 'error'); return; }
  await refreshTemplates();
  state.editorEntry = entry;
  state.editorTemplate = state.templates.find(t => t.id === entry.template_id) || null;
  try { state.editorFields = JSON.parse(entry.fields_json || '{}'); } catch { state.editorFields = {}; }

  document.getElementById('editorTitleInput').value = entry.title || '';
  document.getElementById('editorSaveIndicator').classList.add('hidden');
  document.getElementById('editorOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderEditorAccordion();
  updateSaveIndicator();
  schedulePreviewNow();
}

function closeEditor() {
  if (state.editorDirty) {
    confirmDialog('Unsaved changes', 'You have unsaved changes. Leave anyway?', 'Discard changes').then(ok => { if (ok) hideEditor(); });
    return;
  }
  hideEditor();
}
function hideEditor() {
  document.getElementById('editorOverlay').classList.add('hidden');
  document.body.style.overflow = '';
  state.currentEntryId = null; state.editorEntry = null; state.editorDirty = false;
  clearTimeout(previewTimer);
  if (state.route === 'pages' || state.route === 'content') renderEntryList(state.route);
  refreshPublishBadge();
}

function renderEditorAccordion() {
  const entry = state.editorEntry;
  const t = state.editorTemplate;
  const fields = (t && t.fields) || [];
  const isPageLike = entry.kind === 'page' || entry.kind === 'system' || entry.kind === 'file';

  // Content section: builtin + template fields, grouped by field group
  let contentHtml = builtinFieldsHtml();
  if (fields.length) {
    const groups = [];
    for (const f of fields) {
      let g = groups.find(x => x.name === f.group);
      if (!g) { g = { name: f.group, fields: [] }; groups.push(g); }
      g.fields.push(f);
    }
    for (const g of groups) {
      contentHtml += '<div class="stat-label" style="margin:14px 0 8px">' + esc(g.name) + '</div>';
      for (const f of g.fields) contentHtml += templateFieldHtml(f);
    }
  }
  let html = accordionSection('content', 'Content', contentHtml, false);

  // SEO section
  html += accordionSection('seo', 'SEO', seoPanelHtml(), true);

  // Settings section
  let settingsHtml = field('Path', '<input type="text" id="edPath" class="mono" value="' + esc(entry.path || '') + '"' + (entry.pinned ? ' disabled' : '') + '><p class="form-hint">' +
    (entry.pinned ? 'This system page cannot move.' : 'Changing this creates a redirect from the old path.') + '</p>');
  if (entry.kind === 'content') {
    settingsHtml += field('Template', '<select id="edTemplate">' + state.templates.map(tp =>
      '<option value="' + tp.id + '"' + (tp.id === entry.template_id ? ' selected' : '') + '>' + esc(tp.name) + '</option>').join('') + '</select>');
  }
  if (entry.kind === 'file' && entry.path === '/robots.txt') {
    settingsHtml += '<p class="form-hint">This file is generated from your SEO settings. Edit it under Settings &rarr; SEO.</p>';
  }
  settingsHtml += checkboxField('Hide from search engines (noindex)', 'edNoindex', !!entry.noindex);
  html += accordionSection('settings', 'Settings', settingsHtml, true);

  const acc = document.getElementById('editorAccordion');
  acc.innerHTML = html;
  bindEditorInputs();
}

function accordionSection(id, label, bodyHtml, collapsed) {
  return '<div class="editor-accordion-section' + (collapsed ? ' collapsed' : '') + '" id="acc-' + id + '">' +
    '<div class="editor-accordion-header" onclick="toggleAccordion(\'' + id + '\')"><span>' + esc(label) + '</span>' +
    '<svg class="editor-accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></div>' +
    '<div class="editor-accordion-body">' + bodyHtml + '</div></div>';
}
function toggleAccordion(id) { document.getElementById('acc-' + id).classList.toggle('collapsed'); }

function field(label, inputHtml, hint) {
  return '<div class="form-field"><label class="form-label">' + esc(label) + '</label>' + inputHtml + (hint ? '<p class="form-hint">' + esc(hint) + '</p>' : '') + '</div>';
}
function checkboxField(label, id, checked) {
  return '<div class="checkbox-row"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '><label for="' + id + '">' + esc(label) + '</label></div>';
}

function builtinFieldsHtml() {
  const e = state.editorEntry;
  let html = field('Title', '<input type="text" id="edTitle" value="' + esc(e.title || '') + '">');
  if (e.kind === 'content') {
    html += field('Summary', '<textarea id="edSummary" rows="2">' + esc(e.summary || '') + '</textarea>');
    html += field('Image', '<div style="display:flex;gap:8px"><input type="text" id="edImage" value="' + esc(e.image || '') + '"><button class="btn btn-secondary btn-sm" onclick="openMediaPicker(\'edImage\')">Browse</button></div>');
  }
  return html;
}

function templateFieldHtml(f) {
  const val = state.editorFields[f.name];
  const id = 'edf_' + f.name;
  const label = f.label || f.name;
  switch (f.type) {
    case 'textarea': return field(label, '<textarea id="' + id + '" rows="4">' + esc(val || f.default || '') + '</textarea>');
    case 'markdown': return field(label, '<textarea id="' + id + '" class="code-editor" rows="10">' + esc(val || f.default || '') + '</textarea>');
    case 'html': case 'code':
      return field(label, '<textarea id="' + id + '" class="code-editor" rows="10">' + esc(val || f.default || '') + '</textarea>');
    case 'image': {
      const url = val && typeof val === 'object' ? (val.url || '') : (val || f.default || '');
      const alt = val && typeof val === 'object' ? (val.alt || '') : '';
      return field(label, '<div style="display:flex;gap:8px"><input type="text" id="' + id + '" value="' + esc(url) + '"><button class="btn btn-secondary btn-sm" onclick="openMediaPicker(\'' + id + '\')">Browse</button></div>' +
        field('Alt text', '<input type="text" id="' + id + '_alt" value="' + esc(alt) + '">'));
    }
    case 'url': return field(label, '<input type="url" id="' + id + '" value="' + esc(val || f.default || '') + '">');
    case 'number': return field(label, '<input type="number" id="' + id + '" value="' + esc(val != null ? val : (f.default || '')) + '">');
    case 'color': return field(label, '<input type="color" id="' + id + '" value="' + esc(val || f.default || '#0A0A0A') + '" style="height:38px;padding:2px">');
    case 'date': return field(label, '<input type="date" id="' + id + '" value="' + esc(val || f.default || '') + '">');
    case 'select': return field(label, '<select id="' + id + '">' + (f.options || []).map(o => '<option value="' + esc(o) + '"' + (val === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>');
    case 'checkbox': return checkboxField(label, id, !!val);
    case 'faq': return field(label, faqEditorHtml(id, Array.isArray(val) ? val : []));
    case 'list': return field(label, listEditorHtml(id, f.subfields || [], Array.isArray(val) ? val : []));
    default: return field(label, '<input type="text" id="' + id + '" value="' + esc(val != null ? val : (f.default || '')) + '">');
  }
}

/* ---- FAQ editor ---- */
function faqEditorHtml(id, items) {
  let html = '<div id="' + id + '_list">';
  items.forEach(() => { html += faqRowHtml(id, null); });
  html += '</div><button class="btn btn-secondary btn-sm" onclick="addFaqItem(\'' + id + '\')">' + ICON_PLUS + ' Add question</button>';
  return html;
}
function faqRowHtml(id, item) {
  return '<div class="form-field" style="border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:8px">' +
    '<input type="text" placeholder="Question" value="' + esc(item ? item.q || '' : '') + '" oninput="updateFaq(\'' + id + '\')" style="margin-bottom:6px">' +
    '<textarea rows="2" placeholder="Answer" oninput="updateFaq(\'' + id + '\')">' + esc(item ? item.a || '' : '') + '</textarea>' +
    '<button class="btn btn-ghost btn-xs" style="margin-top:6px" onclick="this.parentElement.remove(); updateFaq(\'' + id + '\')">Remove</button></div>';
}
function addFaqItem(id) {
  const list = document.getElementById(id + '_list');
  list.insertAdjacentHTML('beforeend', faqRowHtml(id, null));
  updateFaq(id);
}
function updateFaq(id) {
  const items = [];
  document.querySelectorAll('#' + id + '_list > .form-field').forEach(row => {
    const q = row.querySelector('input').value;
    const a = row.querySelector('textarea').value;
    if (q || a) items.push({ q, a });
  });
  state.editorFields[id.replace('edf_', '')] = items;
  markDirty(); schedulePreview();
}

/* ---- List (repeatable) editor ---- */
function listEditorHtml(id, subfields, items) {
  if (!window.__subfields) window.__subfields = {};
  window.__subfields[id] = subfields;
  let html = '<div id="' + id + '_list">';
  (items.length ? items : [null]).forEach(item => { html += listRowHtml(id, subfields, item); });
  html += '</div><button class="btn btn-secondary btn-sm" onclick="addListRow(\'' + id + '\')">' + ICON_PLUS + ' Add row</button>';
  return html;
}
function listRowHtml(id, subfields, item) {
  let inputs = '';
  for (const sf of subfields) {
    const v = item ? (item[sf.name] || '') : '';
    const type = sf.type === 'url' ? 'url' : 'text';
    inputs += '<input type="' + type + '" data-sf="' + esc(sf.name) + '" placeholder="' + esc(sf.label || sf.name) + '" value="' + esc(v) + '" oninput="updateList(\'' + id + '\')">';
  }
  return '<div class="form-field" style="border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:8px">' + inputs +
    '<button class="btn btn-ghost btn-xs" style="margin-top:6px" onclick="this.parentElement.remove(); updateList(\'' + id + '\')">Remove</button></div>';
}
function addListRow(id) {
  const subfields = (window.__subfields || {})[id] || [];
  document.getElementById(id + '_list').insertAdjacentHTML('beforeend', listRowHtml(id, subfields, null));
  updateList(id);
}
function updateList(id) {
  const items = [];
  document.querySelectorAll('#' + id + '_list > .form-field').forEach(row => {
    const obj = {};
    row.querySelectorAll('input[data-sf]').forEach(inp => { obj[inp.dataset.sf] = inp.value; });
    items.push(obj);
  });
  state.editorFields[id.replace('edf_', '')] = items;
  markDirty(); schedulePreview();
}

/* ---- SEO panel ---- */
function seoPanelHtml() {
  const e = state.editorEntry;
  return field('SEO title', '<input type="text" id="edSeoTitle" value="' + esc(e.seo_title || '') + '" maxlength="80"><p class="form-hint"><span id="edSeoTitleCount"></span> — aim for 50-60 characters.</p>') +
    field('Meta description', '<textarea id="edMetaDescription" rows="3" maxlength="200">' + esc(e.meta_description || '') + '</textarea><p class="form-hint"><span id="edMetaDescCount"></span> — aim for 140-160 characters.</p>');
}

function bindEditorInputs() {
  const acc = document.getElementById('editorAccordion');
  acc.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', () => { markDirty(); schedulePreview(); });
    el.addEventListener('change', () => { markDirty(); schedulePreview(); });
  });
  document.getElementById('editorTitleInput').addEventListener('input', () => { markDirty(); schedulePreview(); });
}

function collectEditorFields() {
  const entry = state.editorEntry;
  const get = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const t = state.editorTemplate;
  const fields = {};
  for (const f of ((t && t.fields) || [])) {
    const id = 'edf_' + f.name;
    if (f.type === 'checkbox') { const el = document.getElementById(id); fields[f.name] = el ? el.checked : false; }
    else if (f.type === 'faq' || f.type === 'list') fields[f.name] = state.editorFields[f.name] || [];
    else if (f.type === 'image') fields[f.name] = { url: get(id), alt: get(id + '_alt') };
    else fields[f.name] = get(id);
  }
  const payload = {
    title: get('edTitle') || document.getElementById('editorTitleInput').value,
    seo_title: get('edSeoTitle'),
    meta_description: get('edMetaDescription'),
    path: get('edPath'),
    noindex: document.getElementById('edNoindex') && document.getElementById('edNoindex').checked ? 1 : 0,
    fields_json: JSON.stringify(fields)
  };
  if (entry.kind === 'content') {
    payload.summary = get('edSummary');
    payload.image = get('edImage');
    const tplSel = document.getElementById('edTemplate');
    if (tplSel) payload.template_id = Number(tplSel.value);
  }
  return payload;
}

function markDirty() {
  if (!state.editorDirty) { state.editorDirty = true; }
  updateSaveIndicator();
}
function updateSaveIndicator() {
  const el = document.getElementById('editorSaveIndicator');
  if (!el) return;
  el.classList.remove('hidden');
  el.textContent = state.editorDirty ? 'Unsaved' : 'Saved';
}

async function saveEntry() {
  if (!state.currentEntryId) return;
  const payload = collectEditorFields();
  if (!payload.title || !payload.title.trim()) { toast('Title is required', 'error'); return; }
  try {
    await api('/api/entries/' + state.currentEntryId, { method: 'PUT', body: payload });
    state.editorDirty = false;
    updateSaveIndicator();
    toast('Saved', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

function previewUrl() {
  const e = state.editorEntry;
  if (!e) return '';
  return location.origin + '/preview/' + (e.preview_token || '');
}
function copyPreviewLink() { copyToClipboard(previewUrl()); }
function openPreviewTab() { window.open('/preview/' + (state.editorEntry ? state.editorEntry.preview_token : ''), '_blank'); }

/* ---- Live preview ---- */
function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(doPreview, 600); }
function schedulePreviewNow() { clearTimeout(previewTimer); previewTimer = setTimeout(doPreview, 200); }

async function doPreview() {
  if (!state.currentEntryId || !state.editorEntry) return;
  const payload = collectEditorFields();
  payload.id = state.currentEntryId;
  payload.kind = state.editorEntry.kind;
  payload.template_id = payload.template_id || state.editorEntry.template_id;
  try {
    const res = await api('/api/preview', { method: 'POST', body: payload });
    const frame = document.getElementById('previewFrame');
    if (res.error) {
      frame.srcdoc = '<div style="padding:20px;font-family:monospace;color:#B3261E;white-space:pre-wrap">' + esc(res.error) + '</div>';
    } else {
      frame.srcdoc = res.html;
    }
  } catch (e) {
    document.getElementById('previewFrame').srcdoc = '<div style="padding:20px;font-family:monospace;color:#B3261E">' + esc(e.message) + '</div>';
  }
}

/* ============================ TEMPLATES ============================ */
let activeTemplateId = null;

async function renderTemplates() {
  const c = document.getElementById('viewContainer');
  await refreshTemplates();
  const tplCard = t => {
    const inUse = t.in_use || 0;
    return '<div class="card" style="padding:16px;cursor:pointer" onclick="openTemplateEditor(' + t.id + ')">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
      '<div style="font-weight:700">' + esc(t.name) + '</div>' +
      (inUse ? '<span class="badge badge-black">In use: ' + inUse + '</span>' : '<span class="badge">Unused</span>') + '</div>' +
      '<div style="font-size:12px;color:var(--muted);margin-top:6px">' + (t.fields || []).length + ' fields · path prefix ' + esc(t.path_prefix || '/') + '</div>' +
      (t.use_note ? '<div style="font-size:12px;color:var(--muted);margin-top:4px">' + esc(t.use_note) + '</div>' : '') +
      '</div>';
  };
  c.innerHTML = pageHeader('Templates', 'The blueprint for your pages and entries',
      '<button class="btn btn-primary" onclick="createTemplate()">' + ICON_PLUS + ' New template</button>') +
    '<div class="stat-label" style="margin-bottom:8px">How templates work</div>' +
    '<div class="card card-pad" style="margin-bottom:20px"><p style="font-size:13px;color:var(--muted)">' +
    'Build one complete HTML page. Anything that changes page-to-page becomes a variable: write <code class="mono">{{hero|text|Hero/Title|Welcome}}</code> once, then reuse <code class="mono">{{hero}}</code> anywhere. Fields are grouped by whatever you write before the slash.</p></div>' +
    '<div class="grid-2">' + (state.templates.map(tplCard).join('') || '') + '</div>';
}

async function openTemplateEditor(id) {
  activeTemplateId = id;
  let t;
  try { t = await api('/api/templates/' + id); } catch (e) { toast(e.message, 'error'); return; }
  const ov = modalShell(
    '<div class="modal modal-xl" style="height:90vh;display:flex;flex-direction:column">' +
    '<div class="modal-header"><h3>Edit template: ' + esc(t.name) + '</h3><button class="modal-close" data-x>' + ICON_X + '</button></div>' +
    '<div style="flex:1;display:grid;grid-template-columns:1fr 300px;gap:0;overflow:hidden">' +
    '<div style="padding:16px;overflow-y:auto">' +
    '<div class="grid-2">' +
    field('Name', '<input type="text" id="tplName" class="input" value="' + esc(t.name) + '">') +
    field('Path prefix', '<input type="text" id="tplPrefix" class="input mono" value="' + esc(t.path_prefix || '/') + '" placeholder="/blog/"><p class="form-hint">New entries from this template live here.</p>') +
    '</div>' +
    field('Use note', '<input type="text" id="tplUseNote" class="input" value="' + esc(t.use_note || '') + '" placeholder="When should this be used?"><p class="form-hint">Shown on the template card.</p>') +
    field('HTML', '<textarea id="tplContent" class="code-editor" rows="20" spellcheck="false" style="min-height:360px" oninput="detectVariables()">' + esc(t.content) + '</textarea>') +
    '</div>' +
    '<div style="padding:16px;border-left:1px solid var(--border);overflow-y:auto">' +
    '<div class="stat-label" style="margin-bottom:8px">Detected fields</div>' +
    '<div id="tplDetected" style="font-size:12px"></div>' +
    '<div class="divider"></div>' +
    '<div class="stat-label" style="margin-bottom:8px">AI prompt</div>' +
    '<button class="btn btn-secondary btn-sm btn-block" onclick="copyAiInstructions()">Copy AI prompt</button>' +
    '<p class="form-hint">Paste into any AI to generate a template, then paste the result here.</p>' +
    '<div class="divider"></div>' +
    '<div class="stat-label" style="margin-bottom:8px">Test</div>' +
    '<button class="btn btn-secondary btn-sm btn-block" onclick="previewTemplate(' + t.id + ')">Render with sample data</button>' +
    '<div id="tplPreviewResult" style="margin-top:8px"></div>' +
    '</div></div>' +
    '<div class="modal-footer">' +
    '<button class="btn btn-danger" data-del data-id="' + t.id + '">Delete</button>' +
    '<button class="btn btn-secondary" data-dup data-id="' + t.id + '">Duplicate</button>' +
    '<button class="btn btn-primary" data-save data-id="' + t.id + '">Save</button></div></div>');
  ov.querySelector('[data-x]').onclick = () => closeTemplateEditor();
  ov.querySelector('[data-save]').onclick = () => saveTemplate(Number(ov.querySelector('[data-save]').dataset.id));
  ov.querySelector('[data-dup]').onclick = () => duplicateTemplate(Number(ov.querySelector('[data-dup]').dataset.id));
  ov.querySelector('[data-del]').onclick = () => deleteTemplate(Number(ov.querySelector('[data-del]').dataset.id));
  detectVariables();
}
function closeTemplateEditor() {
  document.querySelectorAll('#tplEditorOverlay, .modal-overlay').forEach(el => { if (el.querySelector('#tplContent')) el.remove(); });
  if (state.route === 'templates') renderTemplates();
}

async function copyAiInstructions() {
  try {
    const r = await api('/api/templates/ai-instructions');
    copyToClipboard(r.text);
  } catch (e) { toast(e.message, 'error'); }
}

function detectVariables() {
  const content = document.getElementById('tplContent')?.value || '';
  const declRe = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\|([a-z]+)\|([^|}]*)\|?([^}]*)\}\}/g;
  const listRe = /\{\{#list\s+([a-zA-Z_][a-zA-Z0-9_]*)\|([^|}]*)\|([^}]*)\}\}/g;
  const seen = new Set();
  let html = '';
  let m;
  while ((m = declRe.exec(content)) !== null) {
    if (seen.has(m[1])) continue; seen.add(m[1]);
    const group = (m[3] || '').split('/')[0].trim();
    html += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">' +
      '<span style="font-weight:700" class="mono">' + esc(m[1]) + '</span><span class="muted">' + esc(m[2]) + (group ? ' · ' + esc(group) : '') + '</span></div>';
  }
  while ((m = listRe.exec(content)) !== null) {
    if (seen.has(m[1])) continue; seen.add(m[1]);
    html += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">' +
      '<span style="font-weight:700" class="mono">' + esc(m[1]) + '</span><span class="muted">list</span></div>';
  }
  const target = document.getElementById('tplDetected');
  if (target) target.innerHTML = html || '<p class="muted" style="font-size:12px">No variables yet. Use <code class="mono">{{name|type|Group/Label|default}}</code>.</p>';
}

async function saveTemplate(id) {
  try {
    await api('/api/templates/' + id, {
      method: 'PUT',
      body: {
        name: document.getElementById('tplName').value.trim(),
        use_note: document.getElementById('tplUseNote').value,
        path_prefix: document.getElementById('tplPrefix').value,
        content: document.getElementById('tplContent').value
      }
    });
    toast('Template saved', 'success');
    closeTemplateEditor();
  } catch (e) { toast(e.message, 'error'); }
}
async function duplicateTemplate(id) {
  try { await api('/api/templates/' + id + '/duplicate', { method: 'POST', body: {} }); toast('Duplicated', 'success'); closeTemplateEditor(); }
  catch (e) { toast(e.message, 'error'); }
}
async function deleteTemplate(id) {
  const ok = await confirmDialog('Delete template?', 'Templates in use by entries cannot be deleted.', 'Delete');
  if (!ok) return;
  try { await api('/api/templates/' + id, { method: 'DELETE' }); toast('Template deleted', 'success'); closeTemplateEditor(); }
  catch (e) { toast(e.message, 'error'); }
}
async function createTemplate() {
  try {
    const r = await api('/api/templates', {
      method: 'POST',
      body: {
        name: 'new-template',
        use_note: '',
        path_prefix: '/',
        content: '<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="utf-8"><title>{{page.title}}</title></head>\n<body>\n<header>{{hero|text|Hero/Title|Welcome}}</header>\n<main>{{body|markdown|Content|Hello world}}</main>\n<footer>© {{site.name}} {{year}}</footer>\n</body>\n</html>'
      }
    });
    toast('Template created', 'success');
    await refreshTemplates();
    openTemplateEditor(r.id);
  } catch (e) { toast(e.message, 'error'); }
}
async function previewTemplate(id) {
  const content = document.getElementById('tplContent').value;
  try {
    const r = await api('/api/templates/parse', { method: 'POST', body: { content } });
    const sample = { title: 'Sample Entry Title', summary: 'This is a sample summary for preview purposes.' };
    for (const f of r.fields) {
      if (f.type === 'list') sample[f.name] = [Object.fromEntries((f.subfields || [{ name: 'name' }]).map(sf => [sf.name, 'Sample ' + sf.label]))];
      else if (f.type === 'faq') sample[f.name] = [{ q: 'Sample question?', a: 'Sample answer.' }];
      else if (f.type === 'image') sample[f.name] = { url: '', alt: 'Sample' };
      else sample[f.name] = f.default || 'Sample ' + (f.label || f.name);
    }
    const res = await api('/api/preview', { method: 'POST', body: { template_id: id, kind: 'content', title: sample.title, summary: sample.summary, fields_json: JSON.stringify(sample), body: '## Sample\n\nHello world.' } });
    const target = document.getElementById('tplPreviewResult');
    if (target) {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:100%;height:300px;border:1px solid var(--border);border-radius:8px;background:#fff';
      iframe.srcdoc = res.html || ('<div style="padding:12px;color:#B3261E;font-family:monospace">' + esc(res.error || 'Render failed') + '</div>');
      target.innerHTML = '';
      target.appendChild(iframe);
    }
  } catch (e) { toast(e.message, 'error'); }
}

/* ============================ MEDIA ============================ */
async function renderMedia() {
  const c = document.getElementById('viewContainer');
  try { state.media = await api('/api/media' + (state.mediaSearch ? '?search=' + encodeURIComponent(state.mediaSearch) : '')); }
  catch (e) { c.innerHTML = emptyState('Could not load media', e.message); return; }

  c.innerHTML = pageHeader('Media', state.media.length + ' files',
      '<label class="btn btn-primary" style="cursor:pointer">' + ICON_PLUS + ' Upload<input type="file" multiple accept="image/*" class="hidden" onchange="uploadMediaFiles(this.files)"></label>') +
    '<input type="text" class="input" style="max-width:280px;margin-bottom:14px" placeholder="Search media..." value="' + esc(state.mediaSearch || '') + '" oninput="mediaSearch(this.value)">' +
    '<div id="mediaDropZone" class="card" style="border-style:dashed;padding:20px;text-align:center;color:var(--muted);margin-bottom:16px">Drag and drop images here to upload</div>' +
    (state.media.length === 0
      ? '<div class="card">' + emptyState('No media yet', 'Upload images to use them in your pages.') + '</div>'
      : '<div class="media-grid">' + state.media.map(mediaItemHtml).join('') + '</div>');

  const dz = document.getElementById('mediaDropZone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drop-active'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drop-active'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drop-active');
    uploadMediaFiles(e.dataTransfer.files);
  });
}
const mediaSearch = debounce(v => { state.mediaSearch = v; renderMedia(); }, 350);

function mediaItemHtml(m) {
  return '<div class="media-item">' +
    '<img src="' + esc(m.url) + '" alt="' + esc(m.alt_text || '') + '" loading="lazy">' +
    '<div class="media-item-actions">' +
    '<button class="media-item-action" title="Copy URL" onclick="event.stopPropagation(); copyToClipboard(\'' + esc(m.url) + '\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>' +
    '<button class="media-item-action" title="Edit alt text" onclick="event.stopPropagation(); editMediaAlt(' + m.id + ')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>' +
    '<button class="media-item-action" title="Delete" onclick="event.stopPropagation(); deleteMedia(' + m.id + ')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
    '</div>' +
    '<div class="media-item-info"><div class="media-item-name" title="' + esc(m.original_name || m.filename) + '">' + esc(m.original_name || m.filename) + '</div>' +
    '<div class="media-item-meta">' + (m.width ? m.width + '\u00d7' + m.height + ' \u00b7 ' : '') + fmtBytes(m.size) + ' \u00b7 used in ' + (m.usedIn || 0) + '</div></div></div>';
}
async function uploadMediaFiles(files) {
  if (!files || !files.length) return;
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  try {
    const results = await api('/api/media/upload', { method: 'POST', body: fd });
    toast(results.length + ' file(s) uploaded', 'success');
    renderMedia();
  } catch (e) { toast(e.message, 'error'); }
}
function editMediaAlt(id) {
  const m = state.media.find(x => x.id === id);
  if (!m) return;
  const ov = modalShell(
    '<div class="modal" style="max-width:400px"><div class="modal-header"><h3>Edit alt text</h3><button class="modal-close" data-x>' + ICON_X + '</button></div>' +
    '<div class="modal-body"><div class="form-field"><input type="text" id="altInput" class="input" value="' + esc(m.alt_text || '') + '"></div></div>' +
    '<div class="modal-footer"><button class="btn btn-secondary" data-x>Cancel</button>' +
    '<button class="btn btn-primary" data-ok>Save</button></div></div>');
  ov.querySelectorAll('[data-x]').forEach(b => b.onclick = () => ov.remove());
  ov.querySelector('[data-ok]').onclick = async () => {
    try {
      await api('/api/media/' + id, { method: 'PUT', body: { alt_text: ov.querySelector('#altInput').value } });
      ov.remove(); toast('Alt text updated', 'success'); renderMedia();
    } catch (e) { toast(e.message, 'error'); }
  };
}
async function deleteMedia(id) {
  const m = state.media.find(x => x.id === id);
  if (!m) return;
  const ok = await confirmDialog('Delete file?', (m.usedIn > 0 ? 'This file is used in ' + m.usedIn + ' pages. ' : '') + 'Delete "' + (m.original_name || m.filename) + '"?', 'Delete');
  if (!ok) return;
  try { await api('/api/media/' + id, { method: 'DELETE' }); toast('File deleted', 'success'); renderMedia(); }
  catch (e) { toast(e.message, 'error'); }
}

/* ---- Media picker (from editor) ---- */
function openMediaPicker(targetId) {
  state.currentMediaTarget = targetId;
  const ov = modalShell(
    '<div class="modal modal-lg"><div class="modal-header"><h3>Choose an image</h3><button class="modal-close" data-x>' + ICON_X + '</button></div>' +
    '<div class="modal-body">' +
    '<div style="display:flex;gap:8px;margin-bottom:12px">' +
    '<input type="text" id="mediaPickerSearch" class="input" placeholder="Search..." oninput="loadMediaPickerDebounced()">' +
    '<label class="btn btn-secondary" style="cursor:pointer;white-space:nowrap">Upload<input type="file" multiple accept="image/*" class="hidden" onchange="uploadFromPicker(this)"></label>' +
    '</div><div id="mediaPickerGrid" class="media-grid"></div></div></div>');
  ov.querySelector('[data-x]').onclick = () => ov.remove();
  window.__mediaPickerOv = ov;
  loadMediaPicker();
}
function closeMediaPicker() {
  if (window.__mediaPickerOv) { window.__mediaPickerOv.remove(); window.__mediaPickerOv = null; }
}
const loadMediaPickerDebounced = debounce(loadMediaPicker, 300);
async function loadMediaPicker() {
  const grid = document.getElementById('mediaPickerGrid');
  if (!grid) return;
  const search = document.getElementById('mediaPickerSearch').value;
  try {
    const items = await api('/api/media' + (search ? '?search=' + encodeURIComponent(search) : ''));
    grid.innerHTML = items.map(m => '<div class="media-item" onclick="pickMedia(\'' + esc(m.url) + '\')">' +
      '<img src="' + esc(m.url) + '" alt="" loading="lazy">' +
      '<div class="media-item-info"><div class="media-item-name">' + esc(m.filename) + '</div></div></div>').join('') ||
      '<p class="muted" style="font-size:13px">No media found.</p>';
  } catch (e) { grid.innerHTML = '<p class="danger-text" style="font-size:13px">' + esc(e.message) + '</p>'; }
}
function pickMedia(url) {
  if (state.currentMediaTarget) {
    const el = document.getElementById(state.currentMediaTarget);
    if (el) { el.value = url; el.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  closeMediaPicker();
}
async function uploadFromPicker(input) {
  if (!input.files.length) return;
  const fd = new FormData();
  for (const f of input.files) fd.append('files', f);
  try {
    await api('/api/media/upload', { method: 'POST', body: fd });
    toast('Uploaded', 'success');
    loadMediaPicker();
  } catch (e) { toast(e.message, 'error'); }
  input.value = '';
}




/* ============================ PUBLISH ============================ */
let publishStepsActive = false;

async function renderPublish() {
  const c = document.getElementById('viewContainer');
  let diff;
  try { diff = await api('/api/publish/diff'); }
  catch (e) { c.innerHTML = emptyState('Could not load changes', e.message); return; }

  const files = [
    ...(diff.newFiles || []).map(f => ({ ...f, status: 'new' })),
    ...(diff.changedFiles || []).map(f => ({ ...f, status: 'changed' })),
    ...(diff.deletedFiles || []).map(f => ({ ...f, status: 'deleted' }))
  ];
  files.sort((a, b) => a.file_path.localeCompare(b.file_path));

  c.innerHTML = pageHeader('Publish', 'Send your changes live to Cloudflare Pages') +
    (diff.errors && diff.errors.length
      ? '<div class="card card-pad" style="border-color:var(--danger);margin-bottom:16px"><div class="stat-label danger-text" style="margin-bottom:6px">Problems</div>' +
        diff.errors.map(e => '<p style="font-size:13px" class="danger-text">' + esc(e) + '</p>').join('') + '</div>'
      : '') +
    '<div class="diff-cards">' +
    diffCard(String(diff.newCount || 0), 'New') +
    diffCard(String(diff.changedCount || 0), 'Changed') +
    diffCard(String(diff.deletedCount || 0), 'Deleted') +
    '</div>' +
    '<div class="card card-pad" style="margin-bottom:16px"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
    '<span style="font-size:13px;font-weight:700">' + fmtBytes(diff.totalSize) + ' total' +
    (diff.sizeChange ? ' (' + (diff.sizeChange > 0 ? '+' : '') + fmtBytes(Math.abs(diff.sizeChange)) + ')' : '') + '</span>' +
    '<div style="flex:1"></div>' +
    '<button class="btn btn-primary" onclick="doPublish()" id="publishBtn">' + (publishStepsActive ? 'Publishing...' : 'Publish now') + '</button>' +
    '</div>' +
    '<div id="publishSteps" class="publish-steps" style="display:none"></div>' +
    '</div>' +
    '<div class="stat-label" style="margin-bottom:8px">Files in this publish</div>' +
    '<div class="table-wrap"><table><thead><tr><th>File</th><th>Status</th><th style="text-align:right">Size</th></tr></thead><tbody>' +
    (files.map(f => '<tr><td class="table-sub">' + esc(f.file_path) + '</td>' +
      '<td><span class="badge' + (f.status === 'new' ? ' badge-black' : f.status === 'deleted' ? ' badge-error' : '') + '">' + f.status + '</span></td>' +
      '<td style="text-align:right;color:var(--muted)">' + fmtBytes(f.sizeAfter) + '</td></tr>').join('') ||
      '<tr><td colspan="3" class="muted">No changes since the last publish.</td></tr>') +
    '</tbody></table></div>' +
    '<div class="stat-label" style="margin:24px 0 8px">Publish history</div>' +
    '<div id="publishHistory"><div class="skeleton skeleton-line"></div></div>';

  loadPublishHistory();
}
function diffCard(value, label) {
  return '<div class="diff-card"><div class="diff-card-value">' + esc(value) + '</div><div class="stat-label">' + esc(label) + '</div></div>';
}
async function doPublish() {
  const btn = document.getElementById('publishBtn');
  btn.disabled = true; btn.textContent = 'Publishing...';
  const stepsEl = document.getElementById('publishSteps');
  stepsEl.style.display = 'flex';
  stepsEl.innerHTML =
    publishStep('st-build', 'Building files') +
    publishStep('st-cf', 'Deploying to Cloudflare') +
    publishStep('st-done', 'Finishing');
  setStep('st-build', 'active');
  try {
    const r = await api('/api/publish', { method: 'POST', body: { note: '' } });
    setStep('st-build', 'done');
    setStep('st-cf', 'done');
    setStep('st-done', 'done');
    toast('Published: ' + (r.changedCount || 0) + ' files deployed', 'success');
    publishStepsActive = false;
    renderPublish();
    refreshPublishBadge();
  } catch (e) {
    setStep('st-build', 'error');
    toast(e.message, 'error');
    btn.disabled = false; btn.textContent = 'Publish now';
  }
}
function publishStep(id, label) {
  return '<div class="publish-step" id="' + id + '"><span class="step-icon">\u25cb</span><span>' + esc(label) + '</span></div>';
}
function setStep(id, status) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'publish-step ' + status;
  const icon = el.querySelector('.step-icon');
  if (status === 'done') icon.textContent = '\u2713';
  else if (status === 'active') icon.innerHTML = '<span class="spin">\u25cb</span>';
  else if (status === 'error') icon.textContent = '\u00d7';
}
async function loadPublishHistory() {
  const box = document.getElementById('publishHistory');
  if (!box) return;
  try {
    const rows = await api('/api/publishes');
    box.innerHTML = rows.length === 0
      ? '<p class="muted" style="font-size:13px">No publishes yet.</p>'
      : '<div class="table-wrap"><table><thead><tr><th>When</th><th>Changes</th><th>Status</th><th style="width:170px"></th></tr></thead><tbody>' +
        rows.map(p => '<tr><td>' + fmtDateTime(p.ts) + '</td>' +
          '<td class="muted">' + (p.new_count || 0) + ' new, ' + (p.changed_count || 0) + ' changed, ' + (p.deleted_count || 0) + ' deleted</td>' +
          '<td><span class="badge' + (p.status === 'success' ? ' badge-black' : ' badge-error') + '">' + esc(p.status) + '</span></td>' +
          '<td style="text-align:right"><button class="btn btn-ghost btn-xs" onclick="downloadSnapshot(' + p.id + ')">Download</button>' +
          (p.status === 'success' ? ' <button class="btn btn-ghost btn-xs danger-text" onclick="rollbackPublish(' + p.id + ')">Roll back</button>' : '') +
          '</td></tr>').join('') + '</tbody></table></div>';
  } catch (e) { box.innerHTML = '<p class="danger-text" style="font-size:13px">' + esc(e.message) + '</p>'; }
}
function downloadSnapshot(id) { window.location.href = '/api/publishes/' + id + '/download'; }
async function rollbackPublish(id) {
  const ok = await confirmDialog('Roll back?', 'The live site will be restored to this snapshot. Current live files will be replaced.', 'Roll back');
  if (!ok) return;
  try {
    await api('/api/publishes/' + id + '/rollback', { method: 'POST', body: {} });
    toast('Rolled back and redeployed', 'success');
    renderPublish();
  } catch (e) { toast(e.message, 'error'); }
}

/* ============================ BACKUPS ============================ */
async function renderBackups() {
  const c = document.getElementById('viewContainer');
  let rows;
  try { rows = await api('/api/backups'); } catch (e) { c.innerHTML = emptyState('Could not load backups', e.message); return; }

  c.innerHTML = pageHeader('Backups', 'Download or restore a full copy of your site data',
      '<button class="btn btn-primary" onclick="createBackup()">Create backup</button>' +
      '<label class="btn btn-secondary" style="cursor:pointer">Restore from file<input type="file" accept=".zip" class="hidden" onchange="restoreBackup(this)"></label>') +
    (rows.length === 0
      ? '<div class="card">' + emptyState('No backups yet', 'Create a backup to download a full copy of your site data.') + '</div>'
      : '<div class="table-wrap"><table><thead><tr><th>File</th><th>Created</th><th style="text-align:right"></th></tr></thead><tbody>' +
        rows.map(b => '<tr><td style="font-weight:700">' + esc(b.filename) + '</td><td class="muted">' + fmtDateTime(b.created_at) + '</td>' +
          '<td style="text-align:right"><button class="btn btn-ghost btn-xs" onclick="location.href=\'/api/backups/' + b.id + '/download\'">Download</button>' +
          ' <button class="btn btn-ghost btn-xs danger-text" onclick="deleteBackup(' + b.id + ')">Delete</button></td></tr>').join('') +
        '</tbody></table></div>');
}
async function createBackup() {
  try {
    await api('/api/backups/create', { method: 'POST', body: {} });
    toast('Backup created', 'success');
    renderBackups();
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteBackup(id) {
  const ok = await confirmDialog('Delete backup?', '', 'Delete');
  if (!ok) return;
  try { await api('/api/backups/' + id, { method: 'DELETE' }); toast('Backup deleted', 'success'); renderBackups(); }
  catch (e) { toast(e.message, 'error'); }
}
async function restoreBackup(input) {
  const file = input.files[0];
  if (!file) return;
  const ok = await confirmDialog('Restore from backup?', 'All current pages, content, templates and media will be replaced by the backup.', 'Restore');
  if (!ok) { input.value = ''; return; }
  const fd = new FormData();
  fd.append('file', file);
  try {
    await api('/api/backups/restore', { method: 'POST', body: fd });
    toast('Backup restored', 'success');
    await refreshTemplates();
    navigate('dashboard');
  } catch (e) { toast(e.message, 'error'); }
  input.value = '';
}

/* ============================ SETTINGS ============================ */
let settingsTab = 'general';

async function renderSettings() {
  const c = document.getElementById('viewContainer');
  try { state.settings = await api('/api/settings'); } catch (e) { c.innerHTML = emptyState('Could not load settings', e.message); return; }
  renderSettingsView();
}

function renderSettingsView() {
  const c = document.getElementById('viewContainer');
  const s = state.settings;
  const tabs = [['general', 'General'], ['tracking', 'Tracking codes'], ['seo', 'SEO & sitemap'], ['redirects', 'Redirects'], ['publishing', 'Publishing'], ['backups', 'Backups']];
  const subnav = tabs.map(([id, label]) => '<div class="settings-subnav-item' + (settingsTab === id ? ' active' : '') + '" onclick="settingsTab=\'' + id + '\'; renderSettingsView()">' + label + '</div>').join('');

  let body = '';
  if (settingsTab === 'general') {
    body = settingsInput('site_name', 'Site name') +
      settingsInput('site_url', 'Site URL', 'https://idomainx.com') +
      '<div class="grid-2">' +
      settingsInput('site_logo', 'Logo path', '/assets/images/logo.png') +
      settingsInput('site_favicon', 'Favicon path', '/assets/images/favicon.ico') + '</div>' +
      saveBtn();
  } else if (settingsTab === 'tracking') {
    body = settingsTextarea('tracking_head', 'Head scripts', 'Injected before </head> on every published page.') +
      settingsTextarea('tracking_body_start', 'Body start scripts', 'Injected right after <body>.') +
      settingsTextarea('tracking_body_end', 'Body end scripts', 'Injected before </body>.') +
      saveBtn();
  } else if (settingsTab === 'seo') {
    body = settingsTextarea('robots_txt', 'robots.txt', 'Leave blank to auto-generate a robots.txt pointing at your sitemap.') +
      '<div class="divider"></div>' +
      '<div class="stat-label" style="margin-bottom:8px">IndexNow</div>' +
      '<p style="font-size:13px;color:var(--muted);margin-bottom:12px">After each publish, changed URLs are submitted to IndexNow automatically.</p>' +
      '<div style="display:flex;gap:8px;align-items:center"><input type="text" class="input" style="max-width:320px" value="' + esc(s.indexnow_key || '') + '" readonly>' +
      '<button class="btn btn-secondary" onclick="generateIndexNowKey()">Generate key</button></div>' +
      saveBtn();
  } else if (settingsTab === 'redirects') {
    body = '<div id="redirectsTable"><div class="skeleton skeleton-line"></div></div>';
  } else if (settingsTab === 'publishing') {
    const env = s._env || {};
    body = '<div class="stat-label" style="margin-bottom:12px">Environment</div>' +
      envRow('Cloudflare Pages', env.cloudflare ? 'Connected (project: ' + esc(env.cloudflare_project || '') + ', branch: ' + esc(env.cloudflare_branch || '') + ')' : 'Not configured — set CLOUDFLARE_API_TOKEN, CF_PAGES_PROJECT', env.cloudflare) +
      envRow('GitHub mirror', env.github ? 'Connected (' + esc(env.github_repo || '') + ')' : 'Optional — set GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO', env.github) +
      '<div class="divider"></div>' +
      checkboxField('Also mirror published site to GitHub', 'github_mirror', s.github_mirror === '1') +
      checkboxField('Convert uploaded images to WebP (keeps logo/favicon format)', 'convert_webp', s.convert_webp !== '0') +
      saveBtn();
  } else if (settingsTab === 'backups') {
    body = settingsInput('backup_hour', 'Auto backup hour (0-23)', '3') +
      settingsInput('backup_keep', 'Keep last N auto backups', '14') +
      saveBtn();
  }

  c.innerHTML = pageHeader('Settings', '') +
    '<div class="settings-layout"><div class="settings-subnav">' + subnav + '</div>' +
    '<div class="card card-pad" style="max-width:640px">' + body + '</div></div>';

  if (settingsTab === 'redirects') loadRedirects();
}

function settingsInput(key, label, placeholder) {
  return field(label, '<input type="text" id="set_' + key + '" class="input" value="' + esc(state.settings[key] || '') + '"' + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '>');
}
function settingsTextarea(key, label, hint) {
  return field(label, '<textarea id="set_' + key + '" rows="5" class="code-editor">' + esc(state.settings[key] || '') + '</textarea>', hint);
}

/* ---- Redirects ---- */
async function loadRedirects() {
  const box = document.getElementById('redirectsTable');
  if (!box) return;
  try {
    const rows = await api('/api/redirects');
    box.innerHTML = '<div class="toolbar"><button class="btn btn-sm btn-primary" onclick="addRedirect()">' + ICON_PLUS + ' Add redirect</button>' +
      '<a class="btn btn-sm btn-secondary" href="/api/redirects/csv">Export CSV</a>' +
      '<label class="btn btn-sm btn-secondary" style="cursor:pointer">Import CSV<input type="file" accept=".csv" class="hidden" onchange="importRedirectsCsv(this)"></label></div>' +
      (rows.length === 0 ? '<p class="muted" style="font-size:13px">No redirects yet. One is created automatically when you change a path.</p>' :
        '<div class="table-wrap"><table><thead><tr><th>From</th><th>To</th><th>Code</th><th>Note</th><th></th></tr></thead><tbody>' +
        rows.map(r => '<tr><td class="table-sub">' + esc(r.from_path) + '</td><td class="table-sub">' + esc(r.to_path) + '</td><td>' + r.code + '</td><td class="muted">' + esc(r.note || '') + '</td>' +
          '<td style="text-align:right"><button class="btn btn-ghost btn-xs danger-text" onclick="deleteRedirect(' + r.id + ')">Delete</button></td></tr>').join('') +
        '</tbody></table></div>');
  } catch (e) { box.innerHTML = '<p class="danger-text" style="font-size:13px">' + esc(e.message) + '</p>'; }
}
function addRedirect() {
  const ov = modalShell(
    '<div class="modal" style="max-width:440px"><div class="modal-header"><h3>Add redirect</h3><button class="modal-close" data-x>' + ICON_X + '</button></div>' +
    '<div class="modal-body">' +
    field('From path', '<input type="text" id="rFrom" class="input mono" placeholder="/old-path/">') +
    field('To path', '<input type="text" id="rTo" class="input mono" placeholder="/new-path/">') +
    field('Code', '<select id="rCode" class="input"><option value="301">301 (permanent)</option><option value="302">302 (temporary)</option><option value="410">410 (gone)</option></select>') +
    field('Note', '<input type="text" id="rNote" class="input" placeholder="Why this redirect exists">') +
    '</div><div class="modal-footer"><button class="btn btn-secondary" data-x>Cancel</button>' +
    '<button class="btn btn-primary" data-ok>Add redirect</button></div></div>');
  ov.querySelectorAll('[data-x]').forEach(b => b.onclick = () => ov.remove());
  ov.querySelector('[data-ok]').onclick = async () => {
    try {
      await api('/api/redirects', { method: 'POST', body: { from_path: ov.querySelector('#rFrom').value, to_path: ov.querySelector('#rTo').value, code: parseInt(ov.querySelector('#rCode').value), note: ov.querySelector('#rNote').value } });
      ov.remove(); toast('Redirect added', 'success'); loadRedirects();
    } catch (e) { toast(e.message, 'error'); }
  };
}
async function deleteRedirect(id) {
  const ok = await confirmDialog('Delete redirect?', '', 'Delete');
  if (!ok) return;
  try { await api('/api/redirects/' + id, { method: 'DELETE' }); toast('Redirect deleted', 'success'); loadRedirects(); }
  catch (e) { toast(e.message, 'error'); }
}
async function importRedirectsCsv(input) {
  const file = input.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const r = await api('/api/redirects/csv', { method: 'POST', body: { csv: text } });
    toast(r.imported + ' redirects imported', 'success');
    loadRedirects();
  } catch (e) { toast(e.message, 'error'); }
  input.value = '';
}

function saveBtn() { return '<button class="btn btn-primary" onclick="saveSettings()">Save settings</button>'; }
function envRow(name, status, ok) {
  return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span class="badge' + (ok ? ' badge-black' : '') + '">' + (ok ? 'Set' : 'Missing') + '</span>' +
    '<span style="font-weight:700">' + esc(name) + '</span><span class="muted" style="font-size:12px">' + esc(status) + '</span></div>';
}
async function saveSettings() {
  const body = {};
  document.querySelectorAll('[id^="set_"]').forEach(el => { body[el.id.replace('set_', '')] = el.value; });
  const gm = document.getElementById('github_mirror');
  if (gm) body.github_mirror = gm.checked ? '1' : '0';
  const cw = document.getElementById('convert_webp');
  if (cw) body.convert_webp = cw.checked ? '1' : '0';
  try {
    await api('/api/settings', { method: 'PUT', body });
    toast('Settings saved', 'success');
  } catch (e) { toast(e.message, 'error'); }
}
async function generateIndexNowKey() {
  try {
    const r = await api('/api/indexnow/generate-key', { method: 'POST', body: {} });
    toast('IndexNow key generated', 'success');
    renderSettings();
  } catch (e) { toast(e.message, 'error'); }
}

/* ============================ KEYBOARD + BOOT ============================ */
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    if (!document.getElementById('editorOverlay').classList.contains('hidden')) {
      e.preventDefault();
      saveEntry();
    }
  }
  if (e.key === 'Escape') {
    closeMediaPicker();
    document.querySelectorAll('#modalRoot .modal-overlay').forEach(el => el.remove());
    if (!document.getElementById('editorOverlay').classList.contains('hidden')) closeEditor();
  }
});
window.addEventListener('beforeunload', e => {
  if (state.editorDirty && !document.getElementById('editorOverlay').classList.contains('hidden')) {
    e.preventDefault(); e.returnValue = '';
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('loginForm').addEventListener('submit', doLogin);
  try {
    const me = await api('/api/me');
    if (me.authed) {
      document.getElementById('loginView').classList.add('hidden');
      document.getElementById('appView').classList.remove('hidden');
      await showApp();
    } else showLogin();
  } catch { showLogin(); }
});
