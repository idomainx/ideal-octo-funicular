/* =====================================================================
   iDomainX Manager — server.js
   Self-hosted static-site manager for iDomainX
   Node 20 · Express · better-sqlite3 · Cloudflare Pages · Docker
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const express = require('express');
const Database = require('better-sqlite3');
const session = require('cookie-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const sharp = require('sharp');
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');
const AdmZip = require('adm-zip');
const { Octokit } = require('@octokit/rest');

/* ============================ CONFIG ============================ */
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');
const BUILD_DIR = path.join(DATA_DIR, 'build');
const DB_PATH = path.join(DATA_DIR, 'app.db');

const SESSION_SECRET = process.env.SESSION_SECRET || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CF_PAGES_PROJECT = process.env.CF_PAGES_PROJECT || '';
const CF_PAGES_BRANCH = process.env.CF_PAGES_BRANCH || 'main';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

/* ---- Production guard: refuse to start without secrets ---- */
if (NODE_ENV === 'production' && (!SESSION_SECRET || !ADMIN_PASSWORD)) {
  console.error('[FATAL] SESSION_SECRET and ADMIN_PASSWORD must be set in production.');
  console.error('  SESSION_SECRET set:', !!SESSION_SECRET);
  console.error('  ADMIN_PASSWORD set:', !!ADMIN_PASSWORD);
  process.exit(1);
}

const SESSION_KEYS = SESSION_SECRET ? [SESSION_SECRET] : ['dev-only-key'];
const ADMIN_PW = ADMIN_PASSWORD || 'admin';

/* ============================ FS BOOTSTRAP ============================ */
for (const d of [DATA_DIR, UPLOAD_DIR, BACKUP_DIR, SNAPSHOT_DIR, BUILD_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

/* ============================ DATABASE ============================ */
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  path TEXT DEFAULT '',
  seo_title TEXT DEFAULT '',
  meta_description TEXT DEFAULT '',
  focus_keyword TEXT DEFAULT '',
  alt_text TEXT DEFAULT '',
  image TEXT DEFAULT '',
  image_width INTEGER DEFAULT 0,
  image_height INTEGER DEFAULT 0,
  summary TEXT DEFAULT '',
  body TEXT DEFAULT '',
  category TEXT DEFAULT '',
  ad_code TEXT DEFAULT '',
  faq TEXT DEFAULT '[]',
  noindex INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  seo_score INTEGER DEFAULT 0,
  template_id INTEGER,
  fields_json TEXT DEFAULT '{}',
  preview_token TEXT,
  preview_expires TEXT,
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  trashed INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  kind TEXT DEFAULT 'page',
  content TEXT NOT NULL,
  seo_title_pattern TEXT DEFAULT '',
  seo_desc_pattern TEXT DEFAULT '',
  schema_type TEXT DEFAULT 'WebPage',
  default_robots TEXT DEFAULT 'index,follow',
  path_pattern TEXT DEFAULT '',
  og_image_field TEXT DEFAULT '',
  listing_path TEXT DEFAULT '',
  fields_json TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  original_name TEXT DEFAULT '',
  url TEXT NOT NULL,
  alt_text TEXT DEFAULT '',
  width INTEGER DEFAULT 0,
  height INTEGER DEFAULT 0,
  size INTEGER DEFAULT 0,
  mime TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS redirects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_path TEXT NOT NULL UNIQUE,
  to_path TEXT NOT NULL,
  code INTEGER DEFAULT 301,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS publishes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT (datetime('now')),
  note TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  deployment_url TEXT,
  new_count INTEGER DEFAULT 0,
  changed_count INTEGER DEFAULT 0,
  deleted_count INTEGER DEFAULT 0,
  total_size INTEGER DEFAULT 0,
  manifest_path TEXT
);

CREATE TABLE IF NOT EXISTS manifests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publish_id INTEGER REFERENCES publishes(id),
  file_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER DEFAULT 0,
  status TEXT DEFAULT 'same'
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT (datetime('now')),
  action TEXT NOT NULL,
  detail TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS indexnow_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  pinged_at TEXT DEFAULT (datetime('now')),
  status INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  size INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS legacy_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  migrated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS slug_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  old_path TEXT NOT NULL,
  new_path TEXT NOT NULL,
  changed_at TEXT DEFAULT (datetime('now'))
);
`);

/* ============================ MIGRATIONS ============================ */
function migrateOldData() {
  const cols = db.prepare("PRAGMA table_info(posts)").all().map(c => c.name);
  const addCol = (name, def) => { if (!cols.includes(name)) db.exec("ALTER TABLE posts ADD COLUMN " + name + " " + def); };

  addCol("path", "TEXT DEFAULT ''");
  addCol("kind", "TEXT DEFAULT 'content'");
  addCol("pinned", "INTEGER DEFAULT 0");

  const tcols = db.prepare("PRAGMA table_info(templates)").all().map(c => c.name);
  if (!tcols.includes('path_prefix')) db.exec("ALTER TABLE templates ADD COLUMN path_prefix TEXT DEFAULT '/'");
  if (!tcols.includes('use_note')) db.exec("ALTER TABLE templates ADD COLUMN use_note TEXT DEFAULT ''");

  db.exec("UPDATE posts SET path = '/' || slug || '/' WHERE (path = '' OR path IS NULL) AND kind='content'");

  // Backfill preview tokens
  const needToken = db.prepare("SELECT id FROM posts WHERE preview_token IS NULL OR preview_token=''").all();
  for (const r of needToken) {
    db.prepare('UPDATE posts SET preview_token=? WHERE id=?').run(generateToken(16), r.id);
  }

  // Convert everything to live (status column kept but unused)
  db.exec("UPDATE posts SET status='live'");

  // Path prefix backfill
  db.exec("UPDATE templates SET path_prefix='/blog/' WHERE name='blog-post' AND (path_prefix IS NULL OR path_prefix='')");
  db.exec("UPDATE templates SET path_prefix='/' WHERE path_prefix IS NULL OR path_prefix=''");

  // Seed pinned system pages if missing
  const sysHome = db.prepare("SELECT id FROM posts WHERE kind='system' AND path='/'").get();
  if (!sysHome) {
    db.prepare("INSERT INTO posts (title, slug, path, kind, pinned, body, status, preview_token) VALUES ('Home','home','/','system',1,'','live',?)")
      .run(generateToken(16));
  }
  const sys404 = db.prepare("SELECT id FROM posts WHERE kind='system' AND path='/404'").get();
  if (!sys404) {
    db.prepare("INSERT INTO posts (title, slug, path, kind, pinned, body, status, preview_token) VALUES ('404','404','/404','system',1,'<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Page not found</title></head><body style=\"font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0\"><div style=\"text-align:center\"><h1>404</h1><p style=\"color:#737373\">The page you are looking for does not exist.</p><a href=\"/\">Back to Home</a></div></body></html>','live',?)")
      .run(generateToken(16));
  }
  const sysRobots = db.prepare("SELECT id FROM posts WHERE kind='file' AND path='/robots.txt'").get();
  if (!sysRobots) {
    db.prepare("INSERT INTO posts (title, slug, path, kind, pinned, body, status, preview_token) VALUES ('robots.txt','robots-txt','/robots.txt','file',1,'','live',?)")
      .run(generateToken(16));
  }
}


/* ============================ HELPERS ============================ */
function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeXml(s) {
  return escapeHtml(s).replace(/&#39;/g, '&apos;');
}

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
}

function readingTime(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200)) + ' min read';
}

function wordCount(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ');
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function isoDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return iso;
  return d.toISOString();
}

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : (fallback !== undefined ? fallback : '');
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
}

function logActivity(action, detail) {
  db.prepare('INSERT INTO activity_log (action, detail) VALUES (?,?)').run(action, detail || '');
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function generateToken(len) {
  return crypto.randomBytes(len || 32).toString('hex');
}

/* ============================ MARKDOWN ============================ */
const ALLOWED_TAGS = ['p','br','hr','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','pre','code','strong','em','b','i','u','s','a','img','figure','figcaption','table','thead','tbody','tr','th','td','span','div','dl','dt','dd'];

function renderMarkdown(md) {
  if (!md) return '';
  const raw = marked.parse(md, { mangle: false, headerIds: false, breaks: false });
  const siteUrl = getSetting('site_url', 'https://idomainx.com');
  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href','title','rel','target'],
      img: ['src','alt','title','width','height','loading','decoding','srcset','sizes'],
      '*': ['class','id']
    },
    allowedSchemes: ['http','https','mailto','tel'],
    transformTags: {
      a: (tag, attribs) => {
        if (attribs.href && /^https?:/i.test(attribs.href) && !attribs.href.startsWith(siteUrl)) {
          attribs.rel = 'noopener noreferrer';
        }
        return { tagName: 'a', attribs };
      },
      img: (tag, attribs) => {
        if (!attribs.loading) attribs.loading = 'lazy';
        if (!attribs.decoding) attribs.decoding = 'async';
        return { tagName: 'img', attribs };
      }
    }
  });
}

/* ============================ TEMPLATE ENGINE ============================ */
/*
  Custom mini template engine (no eval).
  Supports:
  - {{name|type|Label|default}} — declare + print
  - {{name}} — print
  - {{name.alt}} — sub-property of image
  - {{#list var|Label|field1:type:Label, field2:type:Label}} ... {{/list}}
  - {{#if name}} ... {{else}} ... {{/if}}
  - {{#entries type=blog-post limit=6 sort=newest category=same exclude=self}} ... {{/entries}}
  - {{> partial_name}}
  - Globals: {{site.name}} {{site.url}} {{site.logo}} {{year}} {{page.title}} etc.
*/

function parseTemplateFields(tplContent) {
  const fields = [];
  const seen = new Set();

  // Declaration pattern: {{name|type|Group/Label|default}}
  const declRe = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\|([a-z]+)\|([^|}]*)\|?([^}]*)\}\}/g;
  let match;
  while ((match = declRe.exec(tplContent)) !== null) {
    const name = match[1];
    const type = match[2];
    const labelRaw = match[3].trim();
    const dft = (match[4] || '').trim();

    if (seen.has(name)) continue;
    seen.add(name);

    let group = 'Content';
    let label = labelRaw;
    if (labelRaw.includes('/')) {
      const slash = labelRaw.indexOf('/');
      group = labelRaw.slice(0, slash).trim() || 'Content';
      label = labelRaw.slice(slash + 1).trim();
    }

    const field = { name, type, group, label: label || name, default: dft };

    if (type === 'select' && dft) {
      field.options = dft.split(';').map(s => s.trim()).filter(Boolean);
    }

    if (type === 'list') {
      field.subfields = [];
      if (dft) {
        for (const sf of dft.split(',')) {
          const parts = sf.trim().split(':');
          if (parts.length >= 2) {
            field.subfields.push({
              name: parts[0].trim(),
              type: parts[1].trim() || 'text',
              label: (parts[2] || parts[0]).trim()
            });
          }
        }
      }
    }

    fields.push(field);
  }

  // List blocks: {{#list var|Group/Label|subfields}}
  const listRe = /\{\{#list\s+([a-zA-Z_][a-zA-Z0-9_]*)\|([^|}]*)\|([^}]*)\}\}/g;
  while ((match = listRe.exec(tplContent)) !== null) {
    const name = match[1];
    const labelRaw = match[2].trim();
    const subfieldsRaw = match[3];
    if (seen.has(name)) continue;
    seen.add(name);

    let group = 'Content';
    let label = labelRaw;
    if (labelRaw.includes('/')) {
      const slash = labelRaw.indexOf('/');
      group = labelRaw.slice(0, slash).trim() || 'Content';
      label = labelRaw.slice(slash + 1).trim();
    }

    const subfields = [];
    if (subfieldsRaw) {
      for (const sf of subfieldsRaw.split(',')) {
        const parts = sf.trim().split(':');
        if (parts.length >= 2) {
          subfields.push({ name: parts[0].trim(), type: parts[1].trim() || 'text', label: (parts[2] || parts[0]).trim() });
        }
      }
    }
    fields.push({ name, type: 'list', group, label: label || name, subfields });
  }

  return fields;
}
function escapeTemplateValue(value, type) {
  if (value == null) return '';
  const rawTypes = ['markdown', 'html', 'code'];
  if (rawTypes.includes(type)) return String(value);
  return escapeHtml(String(value));
}

function renderTemplateBody(tplContent, ctx) {
  // ctx contains: fields (values), site, page, entries (map of type -> array), partials (map)
  const lines = tplContent.split('\n');
  let output = '';
  let i = 0;

  while (i < lines.length) {
    output += renderTemplateLine(lines[i], ctx) + '\n';
    i++;
  }
  return output.trim();
}

function renderTemplateLine(line, ctx) {
  let result = '';
  let pos = 0;

  while (pos < line.length) {
    const open = line.indexOf('{{', pos);
    if (open === -1) {
      result += line.slice(pos);
      break;
    }
    result += line.slice(pos, open);
    const close = line.indexOf('}}', open + 2);
    if (close === -1) {
      result += line.slice(open);
      break;
    }
    const tag = line.slice(open + 2, close).trim();
    result += resolveTemplateTag(tag, ctx);
    pos = close + 2;
  }
  return result;
}

function resolveTemplateTag(tag, ctx) {
  // Partial: > name
  if (tag.startsWith('>')) {
    const pname = tag.slice(1).trim();
    const partial = ctx.partials[pname];
    if (partial) return renderTemplateBody(partial, ctx);
    return '';
  }

  // Declaration tag: name|type|label|default — print the value
  const declMatch = tag.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\|([a-z]+)\|([^|]*)\|?(.*)$/);
  if (declMatch) {
    const name = declMatch[1];
    const type = declMatch[2];
    return renderFieldValue(name, type, ctx);
  }

  // Simple variable or dotted path
  if (tag.startsWith('#') || tag.startsWith('/')) {
    // Block tags handled at line level — shouldn't reach here for inline
    return '{{' + tag + '}}';
  }

  return resolveVariable(tag, ctx);
}

function renderFieldValue(name, type, ctx) {
  const val = ctx.fields[name];
  if (val == null) return '';

  if (type === 'markdown') {
    return renderMarkdown(String(val));
  }
  if (type === 'html' || type === 'code') {
    return String(val);
  }
  if (type === 'image') {
    if (typeof val === 'object' && val.url) return val.url;
    return String(val);
  }
  if (type === 'checkbox') {
    return val ? 'true' : '';
  }
  if (type === 'faq') {
    if (!Array.isArray(val)) return '';
    return val.map(item => `<details><summary>${escapeHtml(item.q || '')}</summary><p>${escapeHtml(item.a || '')}</p></details>`).join('');
  }
  if (type === 'textarea') {
    return escapeHtml(String(val)).replace(/\n/g, '<br>\n');
  }
  return escapeHtml(String(val));
}

function resolveVariable(expr, ctx) {
  expr = expr.trim();

  // site.* globals
  if (expr.startsWith('site.')) {
    const key = expr.slice(5);
    const site = ctx.site || {};
    return escapeHtml(String(site[key] != null ? site[key] : ''));
  }

  // page.* globals
  if (expr.startsWith('page.')) {
    const key = expr.slice(5);
    const page = ctx.page || {};
    return escapeHtml(String(page[key] != null ? page[key] : ''));
  }

  if (expr === 'year') return String(new Date().getFullYear());

  // image.alt style: fieldName.property
  if (expr.includes('.')) {
    const parts = expr.split('.');
    const base = ctx.fields[parts[0]];
    if (base == null) return '';
    if (typeof base === 'object') {
      return escapeHtml(String(base[parts[1]] != null ? base[parts[1]] : ''));
    }
    return '';
  }

  // Simple field
  const val = ctx.fields[expr];
  if (val == null) return '';
  if (typeof val === 'object' && val.url) return escapeHtml(val.url);
  if (Array.isArray(val)) return '';
  return escapeHtml(String(val));
}

function renderTemplate(tplContent, ctx) {
  // Handle block-level constructs: #list, #if, #entries, #each
  // We process these at a higher level
  const processed = processBlocks(tplContent, ctx);
  return renderTemplateBody(processed, ctx);
}

function processBlocks(tpl, ctx) {
  const re = /\{\{#(list|entries|if)\b[^}]*\}\}/g;
  if (!re.test(tpl)) return tpl;
  re.lastIndex = 0;
  const m = re.exec(tpl);
  const kind = m[1];
  const openStart = m.index;
  const openEnd = re.lastIndex;
  const closeTag = '{{/' + kind + '}}';
  const openProbe = kind === 'list' ? '{{#list' : kind === 'entries' ? '{{#entries' : '{{#if';

  // Find matching close tag, counting nested opens of the same kind
  let depth = 1;
  let pos = openEnd;
  let closeIdx = -1;
  while (pos <= tpl.length) {
    const nextOpen = tpl.indexOf(openProbe, pos);
    const nextClose = tpl.indexOf(closeTag, pos);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) { depth++; pos = nextOpen + openProbe.length; continue; }
    depth--;
    if (depth === 0) { closeIdx = nextClose; break; }
    pos = nextClose + closeTag.length;
  }
  if (closeIdx === -1) return tpl.slice(0, openStart) + tpl.slice(openEnd);

  const raw = m[0];
  const inner = tpl.slice(openEnd, closeIdx);
  let rendered = '';
  if (kind === 'list') rendered = renderListFromRaw(raw, inner, ctx);
  else if (kind === 'if') rendered = renderIfFromRaw(raw, inner, ctx);
  else rendered = renderEntriesFromRaw(raw, inner, ctx);

  return tpl.slice(0, openStart) + rendered + processBlocks(tpl.slice(closeIdx + closeTag.length), ctx);
}

function renderListFromRaw(raw, inner, ctx) {
  const def = raw.replace(/^\{\{#list\s+/, '').replace(/\}\}\s*$/, '');
  const varName = def.slice(0, def.indexOf('|')).trim();
  const rest = def.slice(def.indexOf('|') + 1);
  return renderListBlock(varName, rest, inner, ctx);
}

function renderEntriesFromRaw(raw, inner, ctx) {
  const attrs = raw.replace(/^\{\{#entries\s+/, '').replace(/\}\}\s*$/, '');
  return renderEntriesBlock(attrs, inner, ctx);
}

function renderIfFromRaw(raw, inner, ctx) {
  const cond = raw.replace(/^\{\{#if\s+/, '').replace(/\}\}\s*$/, '').trim();
  // Split else at depth 1
  let depth = 1, elseIdx = -1, pos = 0;
  while (pos < inner.length) {
    const o = inner.indexOf('{{#if', pos);
    const c = inner.indexOf('{{/if}}', pos);
    const e = inner.indexOf('{{else}}', pos);
    const next = [o, c, e].filter(x => x !== -1).sort((a, b) => a - b)[0];
    if (next === undefined) break;
    if (next === o) depth++;
    else if (next === c) { depth--; if (depth === 0) break; }
    else if (next === e && depth === 1) { elseIdx = next; break; }
    pos = next + 2;
  }
  const truthy = evalCondition(cond, ctx);
  const chosen = truthy
    ? (elseIdx >= 0 ? inner.slice(0, elseIdx) : inner)
    : (elseIdx >= 0 ? inner.slice(elseIdx + 8) : '');
  return renderTemplate(chosen, ctx);
}

function evalCondition(cond, ctx) {
  // Check if a field is truthy
  const val = ctx.fields[cond];
  if (val == null) return false;
  if (val === '') return false;
  if (val === '0') return false;
  if (val === false) return false;
  if (Array.isArray(val) && val.length === 0) return false;
  return !!val;
}

function renderListBlock(varName, subfieldDef, blockContent, ctx) {
  const items = ctx.fields[varName];
  if (!Array.isArray(items) || items.length === 0) return '';

  let result = '';
  items.forEach((item, index) => {
    const itemCtx = { ...ctx, fields: { ...ctx.fields, [varName]: item } };
    // Render item.* and @index
    let rendered = blockContent
      .replace(/\{\{@index\}\}/g, String(index))
      .replace(new RegExp('\\{\\{' + varName + '\\.([a-zA-Z_][a-zA-Z0-9_]*)\\}\\}', 'g'), (m, prop) => {
        return escapeHtml(String(item[prop] != null ? item[prop] : ''));
      });
    // Also support {{item.prop}} pattern
    rendered = rendered.replace(/\{\{item\.([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (m, prop) => {
      return escapeHtml(String(item[prop] != null ? item[prop] : ''));
    });
    result += renderTemplateBody(rendered, itemCtx);
  });
  return result;
}

function renderEntriesBlock(attrs, blockContent, ctx) {
  const params = {};
  attrs.split(/\s+/).forEach(pair => {
    const [k, v] = pair.split('=');
    if (k && v) params[k] = v.replace(/['"]/g, '');
  });

  const type = params.type || 'blog-post';
  const limit = parseInt(params.limit || '6', 10);
  const sort = params.sort || 'newest';
  const excludeSelf = params.exclude === 'self';

  let entries = ctx.allEntries[type] || [];

  if (params.category === 'same' && ctx.page && ctx.page.category) {
    entries = entries.filter(e => e.category === ctx.page.category);
  }
  if (excludeSelf && ctx.page && ctx.page.id) {
    entries = entries.filter(e => e.id !== ctx.page.id);
  }

  if (sort === 'newest') {
    entries = [...entries].sort((a, b) => {
      const da = new Date(a.published_at || a.created_at).getTime();
      const db = new Date(b.published_at || b.created_at).getTime();
      return db - da;
    });
  }

  entries = entries.slice(0, limit);

  let result = '';
  for (const entry of entries) {
    let rendered = blockContent;
    // Replace {{entry.field}} patterns
    rendered = rendered.replace(/\{\{entry\.([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (m, prop) => {
      const val = entry[prop];
      if (val == null) return '';
      return escapeHtml(String(val));
    });
    // Also replace {{entry.path}}
    rendered = rendered.replace(/\{\{entry\.path\}\}/g, escapeHtml(entry.path || ''));
    rendered = rendered.replace(/\{\{entry\.url\}\}/g, escapeHtml((ctx.site.url || '') + (entry.path || '')));
    result += renderTemplateBody(rendered, ctx);
  }
  return result;
}

/* ============================ SITE BUILDER ============================ */
const RESERVED_PATHS = ['/assets/', '/preview/', '/api/', '/sitemap.xml', '/feed.xml', '/_headers', '/_redirects', '/404.html'];
const SYSTEM_ROBOTS_DEFAULT = 'User-agent: *\nAllow: /\n\nSitemap: {URL}/sitemap.xml\n';

function getSiteConfig() {
  const siteUrl = (getSetting('site_url', 'https://idomainx.com')).replace(/\/+$/, '');
  const siteName = getSetting('site_name', 'iDomainX');
  const logo = getSetting('site_logo', '');
  const favicon = getSetting('site_favicon', '');
  const trackingHead = getSetting('tracking_head', '');
  const trackingBodyStart = getSetting('tracking_body_start', '');
  const trackingBodyEnd = getSetting('tracking_body_end', '');
  return { siteUrl, siteName, logo, favicon, trackingHead, trackingBodyStart, trackingBodyEnd };
}

function getAllTemplates() {
  return db.prepare('SELECT * FROM templates ORDER BY id').all();
}

function decorateEntry(entry) {
  if (!entry) return null;
  let fields = {};
  try { fields = JSON.parse(entry.fields_json || '{}'); } catch { fields = {}; }
  return {
    ...entry,
    fields,
    url: entry.path || ('/' + entry.slug + '/'),
    dateLabel: fmtDate(entry.published_at || entry.created_at),
    updatedLabel: fmtDate(entry.updated_at),
    isoDate: isoDate(entry.published_at || entry.created_at)
  };
}

function stripExistingSEOTags(html) {
  html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');
  html = html.replace(/<meta\s+name=["']description["'][^>]*>/gi, '');
  html = html.replace(/<meta\s+name=["']robots["'][^>]*>/gi, '');
  html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');
  html = html.replace(/<meta\s+property=["']og:[^>]*>/gi, '');
  html = html.replace(/<meta\s+name=["']twitter:[^>]*>/gi, '');
  return html;
}

/* Replace matching tags only when the field is filled; otherwise keep pasted HTML. */
function injectSEO(html, opts) {
  const hasHead = /<head[^>]*>/i.test(html);
  const ensure = [];
  if (opts.title) {
    if (/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, '<title>' + escapeHtml(opts.title) + '</title>');
    else ensure.push('<title>' + escapeHtml(opts.title) + '</title>');
  }
  if (opts.description) {
    if (/<meta\s+name=["']description["']/i.test(html)) html = html.replace(/<meta\s+name=["']description["'][^>]*>/i, '<meta name="description" content="' + escapeAttr(opts.description) + '">');
    else ensure.push('<meta name="description" content="' + escapeAttr(opts.description) + '">');
  }
  const canonical = opts.canonical || '';
  const robots = opts.noindex ? 'noindex,nofollow' : 'index,follow';
  const extra = [];
  if (canonical) {
    if (/<link\s+rel=["']canonical["']/i.test(html)) html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/i, '<link rel="canonical" href="' + escapeAttr(canonical) + '">');
    else extra.push('<link rel="canonical" href="' + escapeAttr(canonical) + '">');
  }
  if (/<meta\s+name=["']robots["']/i.test(html)) {
    html = html.replace(/<meta\s+name=["']robots["'][^>]*>/i, '<meta name="robots" content="' + escapeAttr(robots) + '">');
  } else {
    extra.push('<meta name="robots" content="' + escapeAttr(robots) + '">');
  }
  const ogTitle = opts.title || '';
  const ogDesc = opts.description || '';
  const ogImage = opts.ogImage || '';
  if (ogTitle || ogDesc) {
    const og = [];
    if (ogTitle) og.push('<meta property="og:title" content="' + escapeAttr(ogTitle) + '">');
    if (ogDesc) og.push('<meta property="og:description" content="' + escapeAttr(ogDesc) + '">');
    if (ogImage) og.push('<meta property="og:image" content="' + escapeAttr(ogImage) + '">');
    og.push('<meta name="twitter:card" content="summary_large_image">');
    if (ogTitle) og.push('<meta name="twitter:title" content="' + escapeAttr(ogTitle) + '">');
    if (ogDesc) og.push('<meta name="twitter:description" content="' + escapeAttr(ogDesc) + '">');
    if (ogImage) og.push('<meta name="twitter:image" content="' + escapeAttr(ogImage) + '">');
    extra.push(...og);
  }
  // JSON-LD
  const ld = [];
  ld.push(JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: ogTitle || undefined, url: canonical || undefined }));
  if (opts.breadcrumbs && opts.breadcrumbs.length && opts.siteUrl) {
    ld.push(JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: opts.breadcrumbs.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: (b.url || '').startsWith('http') ? b.url : opts.siteUrl + b.url })) }));
  }
  if (opts.faq && opts.faq.length) {
    ld.push(JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: opts.faq.map(it => ({ '@type': 'Question', name: it.q, acceptedAnswer: { '@type': 'Answer', text: it.a } })) }));
  }
  for (const s of ld) extra.push('<script type="application/ld+json">' + s + '</script>');
  if (opts.trackingHead) extra.push(opts.trackingHead);

  const headTags = extra.concat(ensure).join('\n');
  if (hasHead) {
    html = html.replace(/<\/head>/i, headTags + '\n</head>');
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html[^>]*>/i, m => m + '\n<head>\n' + headTags + '\n</head>');
  } else {
    html = headTags + '\n' + html;
  }

  if (opts.trackingBodyStart && /<body[^>]*>/i.test(html)) {
    html = html.replace(/(<body[^>]*>)/i, '$1\n' + opts.trackingBodyStart);
  }
  if (opts.trackingBodyEnd && /<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, opts.trackingBodyEnd + '\n</body>');
  }
  return html;
}

function breadcrumbsFor(p, title) {
  const parts = p.split('/').filter(Boolean);
  const crumbs = [{ name: 'Home', url: '/' }];
  let acc = '';
  for (let i = 0; i < parts.length - 1; i++) {
    acc += '/' + parts[i];
    crumbs.push({ name: parts[i].charAt(0).toUpperCase() + parts[i].slice(1), url: acc + '/' });
  }
  if (title) crumbs.push({ name: title, url: p });
  return crumbs;
}

function renderPageHTML(row, siteConfig) {
  // row: joined posts row with template_name/template content via template_id (or own code for pages)
  const tpl = row.template_id ? db.prepare('SELECT * FROM templates WHERE id=?').get(row.template_id) : null;
  const fields = (() => { try { return JSON.parse(row.fields_json || '{}'); } catch { return {}; } })();

  const ctx = {
    fields: { ...fields, title: row.title, summary: row.summary, body: row.body || '' },
    site: { name: siteConfig.siteName, url: siteConfig.siteUrl, logo: siteConfig.logo, favicon: siteConfig.favicon },
    page: {
      title: row.seo_title || row.title,
      path: row.path,
      url: siteConfig.siteUrl + row.path,
      summary: row.summary || '',
      date: fmtDate(row.published_at || row.created_at),
      id: row.id,
      category: row.category
    },
    allEntries: {}
  };

  let html;
  try {
    const source = tpl ? tpl.content : (row.body || '');
    html = renderTemplate(source, ctx);
  } catch (err) {
    return { html: '<!-- Template render error (line ' + (err.lineNumber || '?') + '): ' + escapeHtml(err.message) + ' -->', error: err.message };
  }

  if (row.kind === 'file') return { html, isFile: true };

  html = injectSEO(html, {
    siteUrl: siteConfig.siteUrl,
    title: row.seo_title || row.title,
    description: row.meta_description || row.summary || '',
    canonical: siteConfig.siteUrl + row.path,
    noindex: !!row.noindex,
    ogImage: row.image || '',
    breadcrumbs: breadcrumbsFor(row.path, row.title),
    faq: (() => { try { const f = fields.faq; return Array.isArray(f) ? f : []; } catch { return []; } })(),
    trackingHead: siteConfig.trackingHead,
    trackingBodyStart: siteConfig.trackingBodyStart,
    trackingBodyEnd: siteConfig.trackingBodyEnd
  });
  return { html };
}

function pathToFilePath(p) {
  p = p.replace(/^\/+/, '');
  if (/\.(txt|xml|json|html|css|js|ico|png|svg|webp|jpg|jpeg|gif|woff2)$/i.test(p)) return p;
  if (p === '') return 'index.html';
  if (p.endsWith('/')) return p + 'index.html';
  return p + '/index.html';
}

function collectAllPages() {
  // Returns all non-trashed rows (pages + content). kind: 'content' (template), 'page', 'file', 'system'
  return db.prepare(`
    SELECT p.*, t.name as template_name, t.path_prefix as template_prefix
    FROM posts p LEFT JOIN templates t ON p.template_id = t.id
    WHERE p.trashed=0 ORDER BY p.path ASC
  `).all();
}

function buildSite() {
  const siteConfig = getSiteConfig();
  const rows = collectAllPages();
  const files = {};

  for (const row of rows) {
    let p = row.path;
    if (!p) continue;
    const result = renderPageHTML(row, siteConfig);
    const filePath = pathToFilePath(p);
    files[filePath] = { content: result.html, isBinary: false };
  }

  // sitemap.xml (HTML pages only, noindex/404/file excluded)
  {
    const urls = [];
    for (const row of rows) {
      if (row.kind === 'file') continue;
      if (row.noindex) continue;
      if (row.path === '/404' || row.path === '/404/') continue;
      urls.push({ loc: siteConfig.siteUrl + row.path, lastmod: isoDate(row.updated_at) });
    }
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map(u => '  <url>\n    <loc>' + escapeXml(u.loc) + '</loc>\n    <lastmod>' + u.lastmod + '</lastmod>\n  </url>').join('\n') +
      '\n</urlset>';
    files['sitemap.xml'] = { content: xml, isBinary: false };
  }

  // feed.xml from entries (kind content) — keep simple, use all
  {
    const recent = rows.filter(r => r.kind === 'content').slice(0, 20);
    const items = recent.map(e =>
      '    <item>\n      <title>' + escapeXml(e.title) + '</title>\n      <link>' + siteConfig.siteUrl + (e.path || '/') + '</link>\n      <guid>' + siteConfig.siteUrl + (e.path || '/') + '</guid>\n      <pubDate>' + new Date(isoDate(e.published_at || e.created_at)).toUTCString() + '</pubDate>\n      <description>' + escapeXml(e.summary || '') + '</description>\n    </item>'
    ).join('\n');
    files['feed.xml'] = {
      content: '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n  <title>' + escapeXml(siteConfig.siteName) + '</title>\n  <link>' + siteConfig.siteUrl + '/</link>\n  <description>Latest from ' + escapeXml(siteConfig.siteName) + '</description>\n  <language>en</language>\n' + items + '\n</channel></rss>',
      isBinary: false
    };
  }

  // _headers
  files['_headers'] = {
    content: '/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n',
    isBinary: false
  };

  // _redirects
  {
    const redirectRows = db.prepare('SELECT from_path, to_path, code FROM redirects ORDER BY id DESC').all();
    const lines = ['# Redirects'];
    const seen = new Set();
    for (const r of redirectRows) {
      if (seen.has(r.from_path)) continue;
      seen.add(r.from_path);
      lines.push(r.from_path + '  ' + r.to_path + '  ' + r.code);
    }
    files['_redirects'] = { content: lines.join('\n') + '\n', isBinary: false };
  }

  // robots.txt: system page row (kind file, path /robots.txt) or generated default
  {
    const robotsRow = rows.find(r => r.path === '/robots.txt');
    files['robots.txt'] = {
      content: robotsRow && robotsRow.body ? robotsRow.body : SYSTEM_ROBOTS_DEFAULT.replace('{URL}', siteConfig.siteUrl),
      isBinary: false
    };
  }

  // IndexNow key file
  const indexnowKey = getSetting('indexnow_key', '');
  if (indexnowKey) {
    files[indexnowKey + '.txt'] = { content: indexnowKey, isBinary: false };
  }

  // Copy uploaded images
  if (fs.existsSync(UPLOAD_DIR)) {
    for (const f of fs.readdirSync(UPLOAD_DIR)) {
      const full = path.join(UPLOAD_DIR, f);
      if (fs.statSync(full).isFile()) {
        files['assets/images/' + f] = { content: fs.readFileSync(full), isBinary: true };
      }
    }
  }

  return { files, rows };
}

/* ============================ PUBLISHING ============================ */
function buildToDir(buildPath) {
  const { files } = buildSite();
  // Clean build dir
  if (fs.existsSync(buildPath)) {
    fs.rmSync(buildPath, { recursive: true, force: true });
  }
  fs.mkdirSync(buildPath, { recursive: true });

  for (const [filePath, data] of Object.entries(files)) {
    const full = path.join(buildPath, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (data.isBinary) {
      fs.writeFileSync(full, data.content);
    } else {
      fs.writeFileSync(full, data.content, 'utf8');
    }
  }

  return files;
}

function computeManifest(files) {
  const manifest = [];
  for (const [filePath, data] of Object.entries(files)) {
    const content = data.isBinary ? data.content : Buffer.from(data.content, 'utf8');
    manifest.push({
      file_path: filePath,
      sha256: sha256(content),
      size: Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content)
    });
  }
  return manifest;
}

function getLastManifest() {
  const lastPublish = db.prepare("SELECT * FROM publishes WHERE status='success' ORDER BY id DESC LIMIT 1").get();
  if (!lastPublish) return null;
  const rows = db.prepare('SELECT * FROM manifests WHERE publish_id=?').all(lastPublish.id);
  if (!rows.length) return null;
  const map = {};
  for (const r of rows) map[r.file_path] = r;
  return map;
}

function computeDiff() {
  const { files } = buildSite();
  const lastManifest = getLastManifest();

  const currentManifest = computeManifest(files);
  const currentMap = {};
  for (const m of currentManifest) currentMap[m.file_path] = m;

  const newFiles = [], changedFiles = [], deletedFiles = [];
  let totalSize = 0, oldSize = 0, newSize = 0;

  for (const m of currentManifest) {
    newSize += m.size;
    totalSize += m.size;
    if (!lastManifest || !lastManifest[m.file_path]) {
      newFiles.push({ ...m, status: 'new', sizeBefore: 0, sizeAfter: m.size });
    } else if (lastManifest[m.file_path].sha256 !== m.sha256) {
      changedFiles.push({ ...m, status: 'changed', sizeBefore: lastManifest[m.file_path].size, sizeAfter: m.size });
      oldSize += lastManifest[m.file_path].size;
    } else {
      oldSize += m.size;
    }
  }

  if (lastManifest) {
    for (const [filePath, m] of Object.entries(lastManifest)) {
      if (!currentMap[filePath]) {
        deletedFiles.push({ file_path: filePath, status: 'deleted', sizeBefore: m.size, sizeAfter: 0 });
        oldSize += m.size;
      }
    }
  }

  const warnings = [];
  const errors = [];

  // Check for duplicate paths
  const pathSet = new Set();
  for (const m of currentManifest) {
    if (pathSet.has(m.file_path)) errors.push('Duplicate path: ' + m.file_path);
    pathSet.add(m.file_path);
  }

  // Check redirect loops
  const redirectRows = db.prepare('SELECT from_path, to_path FROM redirects').all();
  for (const r of redirectRows) {
    let curr = r.to_path;
    const visited = new Set([r.from_path]);
    while (curr) {
      if (visited.has(curr)) { errors.push('Redirect loop detected: ' + r.from_path); break; }
      visited.add(curr);
      const next = db.prepare('SELECT to_path FROM redirects WHERE from_path=?').get(curr);
      curr = next ? next.to_path : null;
    }
  }

  return {
    newFiles, changedFiles, deletedFiles,
    newCount: newFiles.length,
    changedCount: changedFiles.length,
    deletedCount: deletedFiles.length,
    totalSize: newSize,
    sizeChange: newSize - oldSize,
    warnings, errors,
    files
  };
}

async function publish(message) {
  const diff = computeDiff();
  if (diff.errors.length > 0) {
    throw new Error('Cannot publish: ' + diff.errors[0]);
  }

  const buildPath = path.join(BUILD_DIR, 'publish-' + Date.now());
  buildToDir(buildPath);

  // Deploy via wrangler
  if (!CF_API_TOKEN || !CF_PAGES_PROJECT) {
    throw new Error('Cloudflare not configured. Set CLOUDFLARE_API_TOKEN and CF_PAGES_PROJECT.');
  }

  const wranglerPath = path.join(__dirname, 'node_modules', '.bin', 'wrangler');
  const env = { ...process.env, CLOUDFLARE_API_TOKEN: CF_API_TOKEN };
  if (CF_ACCOUNT_ID) env.CLOUDFLARE_ACCOUNT_ID = CF_ACCOUNT_ID;

  const deployResult = await new Promise((resolve, reject) => {
    const args = ['pages', 'deploy', buildPath, '--project-name', CF_PAGES_PROJECT, '--branch', CF_PAGES_BRANCH];
    execFile(wranglerPath, args, { env, timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error('Wrangler deploy failed: ' + (stderr || err.message)));
      } else {
        // Extract deployment URL from output
        const urlMatch = stdout.match(/https:\/\/[^\s]+/);
        resolve({ url: urlMatch ? urlMatch[0] : '', stdout, stderr });
      }
    });
  });

  // Save snapshot
  const publishId = db.prepare('INSERT INTO publishes (note, status, deployment_url, new_count, changed_count, deleted_count, total_size) VALUES (?,?,?,?,?,?,?)')
    .run(message || '', 'success', deployResult.url, diff.newCount, diff.changedCount, diff.deletedCount, diff.totalSize).lastInsertRowid;

  const snapshotDir = path.join(SNAPSHOT_DIR, String(publishId));
  fs.mkdirSync(snapshotDir, { recursive: true });
  // Copy build to snapshot
  for (const item of fs.readdirSync(buildPath)) {
    fs.cpSync(path.join(buildPath, item), path.join(snapshotDir, item), { recursive: true });
  }

  // Save manifest
  const manifest = computeManifest(diff.files);
  const stmt = db.prepare('INSERT INTO manifests (publish_id, file_path, sha256, size, status) VALUES (?,?,?,?,?)');
  for (const m of manifest) {
    let status = 'same';
    if (diff.newFiles.some(f => f.file_path === m.file_path)) status = 'new';
    else if (diff.changedFiles.some(f => f.file_path === m.file_path)) status = 'changed';
    stmt.run(publishId, m.file_path, m.sha256, m.size, status);
  }

  logActivity('published', message || ('Deployed ' + (diff.newCount + diff.changedCount) + ' files'));

  // Optional GitHub mirror
  if (getSetting('github_mirror', '0') === '1' && GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO) {
    try {
      await publishToGithub(buildPath, message);
    } catch (err) {
      console.error('[GitHub mirror] failed:', err.message);
    }
  }

  // IndexNow ping
  try {
    await pingIndexNow(diff.newFiles.concat(diff.changedFiles).map(f => f.file_path));
  } catch (err) {
    console.error('[IndexNow] failed:', err.message);
  }

  // Clean old snapshots (keep 20)
  const snapshots = fs.readdirSync(SNAPSHOT_DIR).sort().reverse();
  for (const s of snapshots.slice(20)) {
    fs.rmSync(path.join(SNAPSHOT_DIR, s), { recursive: true, force: true });
  }

  // Clean build dir
  fs.rmSync(buildPath, { recursive: true, force: true });

  return {
    deploymentUrl: deployResult.url,
    newCount: diff.newCount,
    changedCount: diff.changedCount,
    deletedCount: diff.deletedCount,
    publishId
  };
}

async function publishToGithub(buildPath, message) {
  const octo = new Octokit({ auth: GITHUB_TOKEN });

  // Get current tree
  let baseTreeSha = null, baseCommitSha = null;
  try {
    const { data: refData } = await octo.git.getRef({ owner: GITHUB_OWNER, repo: GITHUB_REPO, ref: 'heads/' + GITHUB_BRANCH });
    baseCommitSha = refData.object.sha;
    const { data: commitData } = await octo.git.getCommit({ owner: GITHUB_OWNER, repo: GITHUB_REPO, commit_sha: baseCommitSha });
    baseTreeSha = commitData.tree.sha;
  } catch (err) {
    if (err.status !== 404 && err.status !== 409) throw err;
  }

  // Upload all files from build dir
  const treeEntries = [];
  const allFiles = [];
  function walkDir(dir, prefix) {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      const rel = prefix ? prefix + '/' + item : item;
      if (fs.statSync(full).isDirectory()) {
        walkDir(full, rel);
      } else {
        allFiles.push({ localPath: full, repoPath: rel });
      }
    }
  }
  walkDir(buildPath, '');

  for (const f of allFiles) {
    const buf = fs.readFileSync(f.localPath);
    const { data: blob } = await octo.git.createBlob({
      owner: GITHUB_OWNER, repo: GITHUB_REPO,
      content: buf.toString('base64'), encoding: 'base64'
    });
    treeEntries.push({ path: f.repoPath, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const { data: tree } = await octo.git.createTree({
    owner: GITHUB_OWNER, repo: GITHUB_REPO,
    base_tree: baseTreeSha || undefined, tree: treeEntries
  });

  const { data: commit } = await octo.git.createCommit({
    owner: GITHUB_OWNER, repo: GITHUB_REPO,
    message: message || 'Publish from iDomainX', tree: tree.sha,
    parents: baseCommitSha ? [baseCommitSha] : []
  });

  if (baseCommitSha) {
    await octo.git.updateRef({ owner: GITHUB_OWNER, repo: GITHUB_REPO, ref: 'heads/' + GITHUB_BRANCH, sha: commit.sha, force: false });
  } else {
    await octo.git.createRef({ owner: GITHUB_OWNER, repo: GITHUB_REPO, ref: 'refs/heads/' + GITHUB_BRANCH, sha: commit.sha });
  }

  return commit.html_url;
}

async function pingIndexNow(filePaths) {
  const key = getSetting('indexnow_key', '');
  if (!key || !filePaths.length) return;
  const siteConfig = getSiteConfig();

  const urls = filePaths.map(p => {
    if (p === 'index.html') return siteConfig.siteUrl + '/';
    const m = p.match(/^(.*)\/index\.html$/);
    if (m) return siteConfig.siteUrl + '/' + m[1] + '/';
    if (p.endsWith('.html')) return siteConfig.siteUrl + '/' + p.replace(/\.html$/, '/');
    return null;
  }).filter(Boolean);

  // Filter to only never-pinged URLs
  const newUrls = [];
  for (const url of urls) {
    const existing = db.prepare('SELECT id FROM indexnow_log WHERE url=?').get(url);
    if (!existing) newUrls.push(url);
  }

  if (!newUrls.length) return;

  const host = new URL(siteConfig.siteUrl).host;
  const body = { host, key, keyLocation: siteConfig.siteUrl + '/' + key + '.txt', urlList: newUrls.slice(0, 100) };

  try {
    const resp = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body)
    });
    for (const url of newUrls) {
      db.prepare('INSERT OR IGNORE INTO indexnow_log (url, status) VALUES (?,?)').run(url, resp.status);
    }
  } catch (err) {
    // IndexNow is best-effort
  }
}

/* Run migrations */
migrateOldData();

/* ============================ APP ============================ */
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(session({
  name: 'idx.sid',
  keys: SESSION_KEYS,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: NODE_ENV === 'production'
}));

/* ---- Serve uploaded images ---- */
app.use('/assets/images', express.static(UPLOAD_DIR, { maxAge: '1y' }));

/* ---- Static admin files ---- */
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.status(200).send('OK'));

/* ---- CSRF: require custom header on mutations ---- */
const CSRF_HEADER = 'x-idxx-csrf';
function csrfCheck(req, res, next) {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    if (!req.headers[CSRF_HEADER]) {
      return res.status(403).json({ error: 'Missing CSRF header' });
    }
  }
  next();
}

/* ---- Rate limits ---- */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});

/* ---- Auth ---- */
function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

app.post('/login', loginLimiter, (req, res) => {
  const pw = String((req.body && req.body.password) || '');
  if (pw && timingSafeEqual(pw, ADMIN_PW)) {
    req.session.authed = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Invalid password.' });
});

app.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/api/me', (req, res) => {
  res.json({ authed: !!(req.session && req.session.authed) });
});

/* ============================ PATH COLLISION ============================ */
function normalizeIncomingPath(p) {
  p = String(p || '').trim().toLowerCase();
  if (!p) return '';
  if (!p.startsWith('/')) p = '/' + p;
  const hasExt = /\.[a-z0-9]{2,5}$/i.test(p);
  if (!hasExt && !p.endsWith('/')) p += '/';
  return p;
}

function pathOwner(p, excludeId) {
  // Returns friendly name of what uses path p, or null.
  if (!p) return null;
  for (const r of RESERVED_PATHS) {
    if (r.endsWith('/') ? p.startsWith(r) : p === r) return 'a reserved path';
  }
  const row = db.prepare('SELECT id, title FROM posts WHERE path=? AND trashed=0').get(p);
  if (row && row.id !== excludeId) return '"' + row.title + '"';
  const red = db.prepare('SELECT id FROM redirects WHERE from_path=?').get(p);
  if (red) return 'a redirect';
  return null;
}

/* ============================ API: DASHBOARD ============================ */
app.get('/api/dashboard', requireAuth, (req, res) => {
  const pages = db.prepare("SELECT COUNT(*) as n FROM posts WHERE trashed=0 AND kind IN ('page','system','file')").get();
  const content = db.prepare("SELECT COUNT(*) as n FROM posts WHERE trashed=0 AND kind='content'").get();
  const templates = db.prepare("SELECT COUNT(*) as n FROM templates").get();
  const media = db.prepare("SELECT COUNT(*) as n FROM media").get();

  const lastPublish = db.prepare("SELECT * FROM publishes WHERE status='success' ORDER BY id DESC LIMIT 1").get();
  const lastTs = lastPublish ? lastPublish.ts : '1970-01-01';
  const unpublished = db.prepare("SELECT COUNT(*) as n FROM posts WHERE trashed=0 AND updated_at > ?").get(lastTs);

  const activity = db.prepare("SELECT * FROM activity_log ORDER BY id DESC LIMIT 10").all();
  const lastBackup = db.prepare("SELECT * FROM backups ORDER BY id DESC LIMIT 1").get();

  res.json({
    counts: { pages: pages.n, content: content.n, templates: templates.n, media: media.n },
    unpublished: unpublished.n,
    activity, lastPublish, lastBackup
  });
});

/* ============================ API: PAGES + CONTENT (unified) ============================ */
app.get('/api/entries', requireAuth, (req, res) => {
  const { search, type, category, sort, page, limit, trashed, kind } = req.query;
  let sql = "SELECT p.*, t.name as template_name, t.use_note as template_note FROM posts p LEFT JOIN templates t ON p.template_id=t.id WHERE 1=1";
  const params = [];

  sql += trashed === '1' ? " AND p.trashed=1" : " AND p.trashed=0";
  if (kind === 'page') sql += " AND p.kind IN ('page','system','file')";
  if (kind === 'content') sql += " AND p.kind='content'";
  if (search) {
    sql += " AND (p.title LIKE ? OR p.summary LIKE ? OR p.path LIKE ?)";
    params.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
  }
  if (type && type !== 'all') { sql += " AND t.name=?"; params.push(type); }
  if (category && category !== 'all') { sql += " AND p.category=?"; params.push(category); }

  const orderBy = sort === 'oldest' ? 'p.created_at ASC' :
    sort === 'title' ? 'p.title ASC' :
    'p.pinned DESC, p.path ASC, p.updated_at DESC';
  sql += " ORDER BY " + orderBy;

  const pageNum = Math.max(1, parseInt(page || '1', 10));
  const limitNum = Math.min(100, parseInt(limit || '50', 10));
  const offset = (pageNum - 1) * limitNum;

  const total = db.prepare(sql.replace('SELECT p.*, t.name as template_name, t.use_note as template_note', 'SELECT COUNT(*) as n')).get(...params).n;
  sql += " LIMIT ? OFFSET ?";
  params.push(limitNum, offset);
  const rows = db.prepare(sql).all(...params);
  res.json({ items: rows, total, page: pageNum, pages: Math.ceil(total / limitNum) });
});

app.get('/api/path-check', requireAuth, (req, res) => {
  const p = normalizeIncomingPath(req.query.path);
  const owner = pathOwner(p, req.query.exclude ? Number(req.query.exclude) : null);
  res.json({ ok: !owner, owner, normalized: p });
});

app.get('/api/entries/:id', requireAuth, (req, res) => {
  const row = db.prepare("SELECT p.*, t.name as template_name FROM posts p LEFT JOIN templates t ON p.template_id=t.id WHERE p.id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.post('/api/entries', requireAuth, csrfCheck, (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'Title is required.' });

  const kind = b.kind || 'content';
  let entryPath = '';
  let slug = '';

  if (kind === 'content') {
    if (!b.template_id) return res.status(400).json({ error: 'Template is required.' });
    const tpl = db.prepare('SELECT * FROM templates WHERE id=?').get(b.template_id);
    if (!tpl) return res.status(400).json({ error: 'Template not found.' });
    slug = slugify(b.slug || b.title);
    const prefix = tpl.path_prefix || '/';
    entryPath = normalizeIncomingPath(prefix.replace(/\/+$/, '') + '/' + slug);
  } else {
    entryPath = normalizeIncomingPath(b.path);
    if (!entryPath) return res.status(400).json({ error: 'Path is required.' });
    slug = slugify(b.slug || b.title);
  }

  const owner = pathOwner(entryPath, null);
  if (owner) return res.status(400).json({ error: 'This path is already used by ' + owner + '.' });

  try {
    const info = db.prepare(`
      INSERT INTO posts (title, slug, path, kind, pinned, seo_title, meta_description, image, summary, body, category, faq, noindex, status, template_id, fields_json, preview_token, published_at, updated_at)
      VALUES (@title, @slug, @path, @kind, @pinned, @seo_title, @meta_description, @image, @summary, @body, @category, @faq, @noindex, 'live', @template_id, @fields_json, @preview_token, datetime('now'), datetime('now'))
    `).run({
      title: b.title, slug, path: entryPath, kind, pinned: b.pinned ? 1 : 0,
      seo_title: b.seo_title || '', meta_description: b.meta_description || '',
      image: b.image || '', summary: b.summary || '', body: b.body || '',
      category: b.category || '',
      faq: typeof b.faq === 'string' ? b.faq : JSON.stringify(b.faq || '[]'),
      noindex: b.noindex ? 1 : 0,
      template_id: b.template_id || null,
      fields_json: typeof b.fields_json === 'string' ? b.fields_json : JSON.stringify(b.fields_json || {}),
      preview_token: generateToken(16)
    });
    logActivity('created', b.title);
    res.json({ id: info.lastInsertRowid, slug, path: entryPath, preview_token: undefined });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/entries/:id', requireAuth, csrfCheck, (req, res) => {
  const b = req.body || {};
  const existing = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const newPath = b.path !== undefined ? normalizeIncomingPath(b.path) : existing.path;
  if (existing.pinned && newPath !== existing.path) {
    return res.status(400).json({ error: 'This system page cannot move to a new path.' });
  }
  const owner = pathOwner(newPath, existing.id);
  if (owner) return res.status(400).json({ error: 'This path is already used by ' + owner + '.' });

  if (newPath !== existing.path && existing.kind !== 'file' && existing.kind !== 'system') {
    db.prepare('INSERT OR IGNORE INTO redirects (from_path, to_path, code, note) VALUES (?,?,301,?)')
      .run(existing.path, newPath, 'Auto: path change');
  }

  db.prepare(`
    UPDATE posts SET
      title=@title, slug=@slug, path=@path, seo_title=@seo_title, meta_description=@meta_description,
      image=@image, summary=@summary, body=@body, category=@category, faq=@faq, noindex=@noindex,
      template_id=@template_id, fields_json=@fields_json, updated_at=datetime('now')
    WHERE id=@id
  `).run({
    id: existing.id,
    title: b.title || existing.title,
    slug: existing.slug,
    path: newPath,
    seo_title: b.seo_title ?? existing.seo_title,
    meta_description: b.meta_description ?? existing.meta_description,
    image: b.image ?? existing.image,
    summary: b.summary ?? existing.summary,
    body: b.body ?? existing.body,
    category: b.category ?? existing.category,
    faq: typeof b.faq === 'string' ? b.faq : JSON.stringify(b.faq || (() => { try { return JSON.parse(existing.faq || '[]'); } catch { return []; } })()),
    noindex: typeof b.noindex === 'undefined' ? existing.noindex : (b.noindex ? 1 : 0),
    template_id: b.template_id || existing.template_id,
    fields_json: typeof b.fields_json === 'string' ? b.fields_json : JSON.stringify(b.fields_json || (() => { try { return JSON.parse(existing.fields_json || '{}'); } catch { return {}; } })())
  });
  logActivity('edited', (b.title || existing.title));
  res.json({ ok: true });
});

app.delete('/api/entries/:id', requireAuth, csrfCheck, (req, res) => {
  const existing = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing.pinned) return res.status(400).json({ error: 'System pages cannot be deleted.' });
  db.prepare("UPDATE posts SET trashed=1, updated_at=datetime('now') WHERE id=?").run(existing.id);
  logActivity('deleted', existing.title);
  res.json({ ok: true });
});

app.post('/api/entries/:id/restore', requireAuth, csrfCheck, (req, res) => {
  db.prepare("UPDATE posts SET trashed=0 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/entries/:id/duplicate', requireAuth, csrfCheck, (req, res) => {
  const existing = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  let newPath = '';
  if (existing.kind === 'content') {
    const tpl = existing.template_id ? db.prepare('SELECT * FROM templates WHERE id=?').get(existing.template_id) : null;
    const prefix = (tpl && tpl.path_prefix) || '/';
    let slug = slugify(existing.title + '-copy');
    newPath = normalizeIncomingPath(prefix.replace(/\/+$/, '') + '/' + slug);
    let n = 2;
    while (pathOwner(newPath, null)) { slug = slugify(existing.title + '-copy-' + n); newPath = normalizeIncomingPath(prefix.replace(/\/+$/, '') + '/' + slug); n++; }
  } else {
    let slug = slugify(existing.title + '-copy');
    newPath = normalizeIncomingPath(slug);
    let n = 2;
    while (pathOwner(newPath, null)) { slug = slugify(existing.title + '-copy-' + n); newPath = normalizeIncomingPath(slug); n++; }
  }

  const info = db.prepare(`
    INSERT INTO posts (title, slug, path, kind, seo_title, meta_description, image, summary, body, category, faq, noindex, status, template_id, fields_json, preview_token, published_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'live',?,?,?,datetime('now'),datetime('now'))
  `).run(
    existing.title + ' (copy)', slugify(existing.title + '-copy'), newPath, existing.kind,
    existing.seo_title, existing.meta_description, existing.image, existing.summary,
    existing.body, existing.category, existing.faq, existing.noindex,
    existing.template_id, existing.fields_json, generateToken(16)
  );
  res.json({ id: info.lastInsertRowid, path: newPath });
});

app.post('/api/entries/bulk', requireAuth, csrfCheck, (req, res) => {
  const { ids, action, value } = req.body || {};
  if (!ids || !Array.isArray(ids) || !action) return res.status(400).json({ error: 'ids and action required' });

  for (const id of ids) {
    if (action === 'set-category') db.prepare("UPDATE posts SET category=? WHERE id=? AND pinned=0").run(value || '', id);
    else if (action === 'delete') db.prepare("UPDATE posts SET trashed=1 WHERE id=? AND pinned=0").run(id);
  }
  logActivity('bulk-' + action, ids.length + ' items');
  res.json({ ok: true });
});

/* ============================ PREVIEW (public, no login) ============================ */
app.get('/preview/:token', (req, res) => {
  const entry = db.prepare('SELECT * FROM posts WHERE preview_token=? AND trashed=0').get(req.params.token);
  if (!entry) return res.status(404).send('Preview link not found.');

  const siteConfig = getSiteConfig();
  const result = renderPageHTML(entry, siteConfig);
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.type('html').send(result.html);
});

/* ============================ API: PREVIEW (unsaved state) ============================ */
app.post('/api/preview', requireAuth, (req, res) => {
  try {
    const b = req.body || {};
    const siteConfig = getSiteConfig();
    const temp = {
      id: b.id || 0,
      title: b.title || 'Untitled',
      slug: slugify(b.slug || b.title || 'untitled'),
      path: normalizeIncomingPath(b.path || '/' + slugify(b.slug || b.title || 'untitled') + '/'),
      kind: b.kind || 'content',
      seo_title: b.seo_title || '', meta_description: b.meta_description || '',
      image: b.image || '', summary: b.summary || '', body: b.body || '',
      category: b.category || '',
      noindex: b.noindex ? 1 : 0,
      template_id: b.template_id || null,
      fields_json: typeof b.fields_json === 'string' ? b.fields_json : JSON.stringify(b.fields_json || {}),
      published_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_at: new Date().toISOString()
    };
    if (temp.kind === 'page' || temp.kind === 'system') temp.template_id = null;
    const result = renderPageHTML(temp, siteConfig);
    res.json({ html: result.html, error: result.error || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* ============================ API: TEMPLATES ============================ */
const AI_INSTRUCTIONS = "Create ONE complete, responsive HTML page in a single file, with its own header, footer, CSS and JS. Anything that changes from page to page must be a variable written exactly as {{name|type|Group/Label|default}}. Declare each variable once, then reuse it as {{name}}. name = lowercase letters and underscores. Types: text, textarea, markdown, html, code, image, url, number, color, date, select, checkbox, faq. Group/Label: the part before the slash is the section name shown in the editor (for example Hero/Title). Without a slash the field goes in a section called Content. For select, put the options in default separated by semicolons (a;b;c). Image: {{hero}} prints the URL and {{hero.alt}} prints the alt text. Repeating items: {{#list items|Group/Label|name:text:Name, price:text:Price, link:url:Link}} ... {{item.name}} ... {{/list}}. Conditions: {{#if hero}} ... {{else}} ... {{/if}}. Site values usable without declaring: {{site.name}} {{site.url}} {{site.logo}} {{year}} {{page.title}} {{page.url}} {{page.path}} {{page.summary}} {{page.date}}. Do not invent any other syntax. Give every variable a realistic default so the page looks complete in preview.";

app.get('/api/templates', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM templates ORDER BY id').all();
  res.json(rows.map(r => {
    let inUse = 0;
    try { inUse = db.prepare('SELECT COUNT(*) as n FROM posts WHERE template_id=? AND trashed=0').get(r.id).n; } catch {}
    return { ...r, fields: JSON.parse(r.fields_json || '[]'), in_use: inUse };
  }));
});

app.get('/api/templates/ai-instructions', requireAuth, (req, res) => {
  res.json({ text: AI_INSTRUCTIONS });
});

app.get('/api/templates/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM templates WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ ...row, fields: JSON.parse(row.fields_json || '[]') });
});

app.post('/api/templates', requireAuth, csrfCheck, (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Name required' });
  const fields = parseTemplateFields(b.content || '');
  const info = db.prepare('INSERT INTO templates (name, use_note, path_prefix, content, seo_title_pattern, seo_desc_pattern, fields_json) VALUES (?,?,?,?,?,?,?)')
    .run(b.name, b.use_note || '', b.path_prefix || '/', b.content || '', b.seo_title_pattern || '', b.seo_desc_pattern || '', JSON.stringify(fields));
  res.json({ id: info.lastInsertRowid, fields });
});

app.put('/api/templates/:id', requireAuth, csrfCheck, (req, res) => {
  const b = req.body || {};
  const existing = db.prepare('SELECT * FROM templates WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const fields = parseTemplateFields(b.content !== undefined ? b.content : existing.content);
  db.prepare("UPDATE templates SET name=?, use_note=?, path_prefix=?, content=?, seo_title_pattern=?, seo_desc_pattern=?, fields_json=?, updated_at=datetime('now') WHERE id=?")
    .run(
      b.name || existing.name,
      b.use_note ?? existing.use_note ?? '',
      b.path_prefix ?? existing.path_prefix ?? '/',
      b.content !== undefined ? b.content : existing.content,
      b.seo_title_pattern ?? existing.seo_title_pattern ?? '',
      b.seo_desc_pattern ?? existing.seo_desc_pattern ?? '',
      JSON.stringify(fields), req.params.id
    );
  res.json({ ok: true, fields });
});

app.delete('/api/templates/:id', requireAuth, csrfCheck, (req, res) => {
  const inUse = db.prepare('SELECT COUNT(*) as n FROM posts WHERE template_id=? AND trashed=0').get(req.params.id);
  if (inUse.n > 0) return res.status(400).json({ error: 'Template is in use by ' + inUse.n + ' entries and cannot be deleted.' });
  db.prepare('DELETE FROM templates WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/templates/:id/duplicate', requireAuth, csrfCheck, (req, res) => {
  const existing = db.prepare('SELECT * FROM templates WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const info = db.prepare('INSERT INTO templates (name, use_note, path_prefix, content, seo_title_pattern, seo_desc_pattern, fields_json) VALUES (?,?,?,?,?,?,?)')
    .run(existing.name + ' (copy)', existing.use_note, existing.path_prefix || '/', existing.content, existing.seo_title_pattern, existing.seo_desc_pattern, existing.fields_json);
  res.json({ id: info.lastInsertRowid });
});

app.post('/api/templates/parse', requireAuth, (req, res) => {
  const b = req.body || {};
  const fields = parseTemplateFields(b.content || '');
  res.json({ fields });
});


/* ============================ API: MEDIA ============================ */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.get('/api/media', requireAuth, (req, res) => {
  const { search } = req.query;
  let sql = "SELECT * FROM media";
  const params = [];
  if (search) {
    sql += " WHERE filename LIKE ? OR alt_text LIKE ? OR original_name LIKE ?";
    params.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
  }
  sql += " ORDER BY created_at DESC";
  const rows = db.prepare(sql).all(...params);

  // Count usage
  const result = rows.map(r => {
    const usage = db.prepare("SELECT COUNT(*) as n FROM posts WHERE body LIKE ? OR image LIKE ? AND trashed=0").get('%' + r.url + '%', '%' + r.url + '%');
    return { ...r, usedIn: usage.n };
  });
  res.json(result);
});

app.post('/api/media/upload', requireAuth, upload.array('files', 20), async (req, res) => {
  const results = [];
  const convertWebp = getSetting('convert_webp', '1') === '1';

  for (const file of req.files || []) {
    const isLogo = file.fieldname === 'logo' || file.fieldname === 'favicon';
    const ext = path.extname(file.originalname).toLowerCase();
    try {

    // Keep original format for logo/favicon (PNG/SVG/ICO)
    if (isLogo || (ext === '.svg') || (ext === '.ico') || (ext === '.gif') || (!convertWebp && ext.match(/\.(png|jpg|jpeg|webp)$/))) {
      const filename = (slugify(path.parse(file.originalname).name) || 'file-' + Date.now()) + ext;
      const outPath = path.join(UPLOAD_DIR, filename);
      fs.writeFileSync(outPath, file.buffer);

      let width = 0, height = 0;
      try {
        const meta = await sharp(file.buffer).metadata();
        width = meta.width || 0; height = meta.height || 0;
      } catch {}

      const url = '/assets/images/' + filename;
      const info = db.prepare('INSERT INTO media (filename, original_name, url, alt_text, width, height, size, mime) VALUES (?,?,?,?,?,?,?,?)')
        .run(filename, file.originalname, url, '', width, height, file.size, file.mimetype);
      results.push({ id: info.lastInsertRowid, filename, url, width, height });
    } else {
      // Convert to WebP
      const filename = (slugify(path.parse(file.originalname).name) || 'image-' + Date.now()) + '.webp';
      const outPath = path.join(UPLOAD_DIR, filename);
      const meta = await sharp(file.buffer).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile(outPath);

      const url = '/assets/images/' + filename;
      const info = db.prepare('INSERT INTO media (filename, original_name, url, alt_text, width, height, size, mime) VALUES (?,?,?,?,?,?,?,?)')
        .run(filename, file.originalname, url, '', meta.width, meta.height, meta.size, 'image/webp');
      results.push({ id: info.lastInsertRowid, filename, url, width: meta.width, height: meta.height });
    }
    } catch (fileErr) {
      results.push({ error: 'Could not process "' + file.originalname + '": not a valid image.' });
    }
  }
  logActivity('uploaded', results.length + ' files');
  res.json(results);
});

app.put('/api/media/:id', requireAuth, csrfCheck, (req, res) => {
  const b = req.body || {};
  db.prepare('UPDATE media SET alt_text=? WHERE id=?').run(b.alt_text || '', req.params.id);
  res.json({ ok: true });
});

app.delete('/api/media/:id', requireAuth, csrfCheck, (req, res) => {
  const row = db.prepare('SELECT * FROM media WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  // Check usage
  const usage = db.prepare("SELECT COUNT(*) as n FROM posts WHERE (body LIKE ? OR image LIKE ?) AND trashed=0").get('%' + row.url + '%', '%' + row.url + '%');
  if (usage.n > 0) {
    return res.status(400).json({ error: 'This file is used in ' + usage.n + ' pages. Remove references before deleting.' });
  }

  const full = path.join(UPLOAD_DIR, row.filename);
  if (fs.existsSync(full)) fs.unlinkSync(full);
  db.prepare('DELETE FROM media WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ============================ API: SETTINGS ============================ */
app.get('/api/settings', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;

  // Add env status (no secrets)
  obj._env = {
    cloudflare: !!CF_API_TOKEN && !!CF_PAGES_PROJECT,
    cloudflare_project: CF_PAGES_PROJECT,
    cloudflare_branch: CF_PAGES_BRANCH,
    github: !!GITHUB_TOKEN && !!GITHUB_OWNER && !!GITHUB_REPO,
    github_repo: GITHUB_OWNER + '/' + GITHUB_REPO,
  };
  res.json(obj);
});

app.put('/api/settings', requireAuth, csrfCheck, (req, res) => {
  const b = req.body || {};
  for (const [k, v] of Object.entries(b)) {
    if (k === '_env') continue;
    setSetting(k, v);
  }
  logActivity('edited', 'Settings updated');
  res.json({ ok: true });
});

/* ============================ API: REDIRECTS ============================ */
app.get('/api/redirects', requireAuth, (req, res) => {
  const { search } = req.query;
  let sql = "SELECT * FROM redirects";
  const params = [];
  if (search) {
    sql += " WHERE from_path LIKE ? OR to_path LIKE ?";
    params.push('%' + search + '%', '%' + search + '%');
  }
  sql += " ORDER BY id DESC";
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/redirects', requireAuth, csrfCheck, (req, res) => {
  const b = req.body || {};
  if (!b.from_path || !b.to_path) return res.status(400).json({ error: 'from and to required' });

  // Loop detection
  let curr = b.to_path;
  const visited = new Set([b.from_path]);
  while (curr) {
    if (visited.has(curr)) return res.status(400).json({ error: 'This would create a redirect loop.' });
    visited.add(curr);
    const next = db.prepare('SELECT to_path FROM redirects WHERE from_path=?').get(curr);
    curr = next ? next.to_path : null;
  }

  db.prepare('INSERT OR REPLACE INTO redirects (from_path, to_path, code, note) VALUES (?,?,?,?)')
    .run(b.from_path, b.to_path, b.code || 301, b.note || '');
  res.json({ ok: true });
});

app.put('/api/redirects/:id', requireAuth, csrfCheck, (req, res) => {
  const b = req.body || {};
  db.prepare('UPDATE redirects SET from_path=?, to_path=?, code=?, note=? WHERE id=?')
    .run(b.from_path, b.to_path, b.code || 301, b.note || '', req.params.id);
  res.json({ ok: true });
});

app.delete('/api/redirects/:id', requireAuth, csrfCheck, (req, res) => {
  db.prepare('DELETE FROM redirects WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/redirects/csv', requireAuth, csrfCheck, (req, res) => {
  const b = req.body || {};
  const lines = (b.csv || '').split('\n').filter(l => l.trim());
  let count = 0;
  for (const line of lines) {
    const [from, to, code] = line.split(',').map(s => s.trim());
    if (from && to) {
      db.prepare('INSERT OR REPLACE INTO redirects (from_path, to_path, code) VALUES (?,?,?)').run(from, to, parseInt(code || '301'));
      count++;
    }
  }
  res.json({ imported: count });
});

app.get('/api/redirects/csv', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT from_path, to_path, code, note FROM redirects ORDER BY id').all();
  const csv = 'from,to,code,note\n' + rows.map(r => [r.from_path, r.to_path, r.code, r.note].join(',')).join('\n');
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', 'attachment; filename="redirects.csv"');
  res.send(csv);
});

/* ============================ API: PUBLISH ============================ */
app.get('/api/publish/diff', requireAuth, async (req, res) => {
  try {
    const diff = computeDiff();
    res.json({
      newFiles: diff.newFiles,
      changedFiles: diff.changedFiles,
      deletedFiles: diff.deletedFiles,
      newCount: diff.newCount,
      changedCount: diff.changedCount,
      deletedCount: diff.deletedCount,
      totalSize: diff.totalSize,
      sizeChange: diff.sizeChange,
      warnings: diff.warnings,
      errors: diff.errors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/publish', requireAuth, csrfCheck, async (req, res) => {
  try {
    const note = (req.body && req.body.note) || '';
    const result = await publish(note);
    res.json(result);
  } catch (err) {
    const failNote = (req.body && req.body.note) || '';
    db.prepare("INSERT INTO publishes (note, status) VALUES (?,'error')").run(failNote);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/publishes', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM publishes ORDER BY id DESC LIMIT 50').all();
  for (const p of rows) {
    const files = db.prepare('SELECT file_path, status FROM manifests WHERE publish_id=?').all(p.id);
    p.filesChanged = files;
  }
  res.json(rows);
});

app.get('/api/publishes/:id/download', requireAuth, (req, res) => {
  const snapshotDir = path.join(SNAPSHOT_DIR, req.params.id);
  if (!fs.existsSync(snapshotDir)) return res.status(404).json({ error: 'Snapshot not found' });

  const zipPath = path.join(BACKUP_DIR, 'snapshot-' + req.params.id + '.zip');
  const zip = new AdmZip();
  zip.addLocalFolder(snapshotDir);
  zip.writeZip(zipPath);

  res.download(zipPath, 'snapshot-' + req.params.id + '.zip', () => {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  });
});

app.post('/api/publishes/:id/rollback', requireAuth, csrfCheck, async (req, res) => {
  const snapshotDir = path.join(SNAPSHOT_DIR, req.params.id);
  if (!fs.existsSync(snapshotDir)) return res.status(404).json({ error: 'Snapshot not found' });

  try {
    if (!CF_API_TOKEN || !CF_PAGES_PROJECT) {
      return res.status(400).json({ error: 'Cloudflare not configured.' });
    }

    const wranglerPath = path.join(__dirname, 'node_modules', '.bin', 'wrangler');
    const env = { ...process.env, CLOUDFLARE_API_TOKEN: CF_API_TOKEN };
    if (CF_ACCOUNT_ID) env.CLOUDFLARE_ACCOUNT_ID = CF_ACCOUNT_ID;

    const deployResult = await new Promise((resolve, reject) => {
      execFile(wranglerPath, ['pages', 'deploy', snapshotDir, '--project-name', CF_PAGES_PROJECT, '--branch', CF_PAGES_BRANCH], { env, timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) reject(new Error('Rollback deploy failed: ' + (stderr || err.message)));
        else { const urlMatch = stdout.match(/https:\/\/[^\s]+/); resolve({ url: urlMatch ? urlMatch[0] : '' }); }
      });
    });

    db.prepare("INSERT INTO publishes (note, status, deployment_url) VALUES (?,'success',?)").run('Rollback to #' + req.params.id, deployResult.url);
    logActivity('published', 'Rollback to #' + req.params.id);
    res.json({ deploymentUrl: deployResult.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================ API: BACKUPS ============================ */
app.get('/api/backups', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM backups ORDER BY id DESC LIMIT 50').all();
  res.json(rows);
});

app.post('/api/backups/create', requireAuth, csrfCheck, async (req, res) => {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = 'idomainx-backup-' + ts.replace('T', '_') + '.zip';
    const zipPath = path.join(BACKUP_DIR, filename);

    const zip = new AdmZip();

    // Safe SQLite backup
    const dbBackupPath = path.join(BACKUP_DIR, 'app.db.tmp');
    await db.backup(dbBackupPath);
    zip.addLocalFile(dbBackupPath, '', 'app.db');

    // Uploads
    if (fs.existsSync(UPLOAD_DIR)) {
      zip.addLocalFolder(UPLOAD_DIR, 'uploads');
    }

    // Templates + settings JSON
    const templatesJson = JSON.stringify(db.prepare('SELECT * FROM templates').all(), null, 2);
    zip.addFile('templates.json', Buffer.from(templatesJson));
    const settingsJson = JSON.stringify(db.prepare('SELECT * FROM settings').all(), null, 2);
    zip.addFile('settings.json', Buffer.from(settingsJson));

    // Latest build
    if (fs.existsSync(BUILD_DIR)) {
      const dirs = fs.readdirSync(BUILD_DIR).filter(d => fs.statSync(path.join(BUILD_DIR, d)).isDirectory());
      if (dirs.length > 0) {
        zip.addLocalFolder(path.join(BUILD_DIR, dirs[dirs.length - 1]), 'site');
      }
    }

    zip.writeZip(zipPath);

    // Clean temp
    if (fs.existsSync(dbBackupPath)) fs.unlinkSync(dbBackupPath);

    const size = fs.statSync(zipPath).size;
    const info = db.prepare('INSERT INTO backups (filename, size) VALUES (?,?)').run(filename, size);
    logActivity('backup', filename);

    res.json({ id: info.lastInsertRowid, filename, size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backups/:id/download', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM backups WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const full = path.join(BACKUP_DIR, row.filename);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'File not found' });
  res.download(full, row.filename);
});

app.delete('/api/backups/:id', requireAuth, csrfCheck, (req, res) => {
  const row = db.prepare('SELECT * FROM backups WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const full = path.join(BACKUP_DIR, row.filename);
  if (fs.existsSync(full)) fs.unlinkSync(full);
  db.prepare('DELETE FROM backups WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/backups/restore', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const tmpZip = path.join(BACKUP_DIR, 'restore-tmp.zip');
    fs.writeFileSync(tmpZip, req.file.buffer);
    const zip = new AdmZip(tmpZip);

    // Restore DB
    const dbEntry = zip.getEntries().find(e => e.entryName === 'app.db');
    if (dbEntry) {
      db.close();
      fs.writeFileSync(DB_PATH, dbEntry.getData());
    }

    // Restore uploads
    const uploadEntries = zip.getEntries().filter(e => e.entryName.startsWith('uploads/'));
    if (fs.existsSync(UPLOAD_DIR)) fs.rmSync(UPLOAD_DIR, { recursive: true });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    for (const entry of uploadEntries) {
      if (entry.isDirectory) continue;
      const relPath = entry.entryName.replace(/^uploads\//, '');
      const fullPath = path.join(UPLOAD_DIR, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, entry.getData());
    }

    fs.unlinkSync(tmpZip);
    logActivity('backup', 'Restored from uploaded backup');
    res.json({ ok: true, message: 'Backup restored. Server restarting...' });

    // Restart to reload DB
    setTimeout(() => process.exit(0), 1000);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/site/download', requireAuth, (req, res) => {
  const buildPath = path.join(BUILD_DIR, 'download-' + Date.now());
  buildToDir(buildPath);

  const zipPath = path.join(BACKUP_DIR, 'site-' + Date.now() + '.zip');
  const zip = new AdmZip();
  zip.addLocalFolder(buildPath);
  zip.writeZip(zipPath);

  fs.rmSync(buildPath, { recursive: true, force: true });

  res.download(zipPath, 'site.zip', () => {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  });
});

/* ============================ API: INDEXNOW ============================ */
app.post('/api/indexnow/generate-key', requireAuth, csrfCheck, (req, res) => {
  const key = generateToken(16);
  setSetting('indexnow_key', key);
  res.json({ key });
});

/* ============================ 404 JSON ============================ */
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

/* ============================ AUTO BACKUP ============================ */
function autoBackup() {
  try {
    const hour = parseInt(getSetting('backup_hour', '3'), 10);
    const now = new Date();
    if (now.getHours() !== hour) return;

    const today = now.toISOString().slice(0, 10);
    const existing = db.prepare("SELECT id FROM backups WHERE filename LIKE ?").get('auto-' + today + '%');
    if (existing) return;

    const filename = 'auto-' + today + '.zip';
    const zipPath = path.join(BACKUP_DIR, filename);
    const zip = new AdmZip();

    const dbBackupPath = path.join(BACKUP_DIR, 'auto-db.tmp');
    db.backup(dbBackupPath).then(() => {
      zip.addLocalFile(dbBackupPath, '', 'app.db');
      if (fs.existsSync(UPLOAD_DIR)) zip.addLocalFolder(UPLOAD_DIR, 'uploads');
      const templatesJson = JSON.stringify(db.prepare('SELECT * FROM templates').all(), null, 2);
      zip.addFile('templates.json', Buffer.from(templatesJson));
      const settingsJson = JSON.stringify(db.prepare('SELECT * FROM settings').all(), null, 2);
      zip.addFile('settings.json', Buffer.from(settingsJson));
      zip.writeZip(zipPath);

      if (fs.existsSync(dbBackupPath)) fs.unlinkSync(dbBackupPath);

      const size = fs.statSync(zipPath).size;
      db.prepare('INSERT INTO backups (filename, size) VALUES (?,?)').run(filename, size);
      logActivity('backup', 'Auto backup: ' + filename);

      // Keep only last N
      const keep = parseInt(getSetting('backup_keep', '14'), 10);
      const files = db.prepare("SELECT * FROM backups WHERE filename LIKE 'auto-%' ORDER BY id DESC").all();
      for (const f of files.slice(keep)) {
        const full = path.join(BACKUP_DIR, f.filename);
        if (fs.existsSync(full)) fs.unlinkSync(full);
        db.prepare('DELETE FROM backups WHERE id=?').run(f.id);
      }
    });
  } catch (e) { /* ignore */ }
}

setInterval(autoBackup, 60 * 60 * 1000); // Check every hour
setTimeout(autoBackup, 10000);

/* ============================ START ============================ */
app.listen(PORT, () => {
  console.log('[iDomainX Manager] listening on :' + PORT);
  console.log('  DATA_DIR         =', DATA_DIR);
  console.log('  NODE_ENV         =', NODE_ENV);
  console.log('  Cloudflare       =', CF_PAGES_PROJECT || '(not configured)');
  console.log('  GitHub mirror    =', GITHUB_OWNER + '/' + GITHUB_REPO || '(not configured)');
});
