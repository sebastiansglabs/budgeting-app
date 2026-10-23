'use strict';

// ---- Settings you might want to change ----
// Budgets and totals are in BASE. Other currencies convert at a fixed rate (BZD is pegged 2:1 to USD).
const BASE = 'USD';
const CURRENCIES = {
  USD: { symbol: '$', perBase: 1 },
  BZD: { symbol: 'BZ$', perBase: 2 },
};
const WARN_AT = 0.8; // "close to budget" alert threshold
const COLORS = ['#E07A5F', '#3D8B7D', '#E3B04B', '#6A8FC7', '#A26EA1', '#8DB596', '#E89AAE'];
const IRONMAN_RED = '#E4002B'; // PMS 185 C
const SWATCHES = [...COLORS, IRONMAN_RED];

// Category icons (24x24). "dot" shows a plain color dot.
// shift = [dx, dy] that moves each drawing's bounding box to the exact center.
const ICONS = {
  dot: { label: 'Dot' },
  coffee: { label: 'Coffee', shift: [0.5, -0.25], svg: '<path d="M4 9h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3.5c-.7.9-.7 1.6 0 2.5M12 3.5c-.7.9-.7 1.6 0 2.5"/><path d="M3 21h14"/>' },
  bag: { label: 'Shopping', shift: [0, -0.5], svg: '<path d="M5 8h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 8z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>' },
  food: { label: 'Food', svg: '<path d="M6 3v6a3 3 0 0 0 6 0V3"/><path d="M9 3v18"/><path d="M18 21V3c-2.2 1.2-3 3.8-3 7v1h3"/>' },
  fitness: { label: 'Fitness', fill: true, shift: [0, 0.65], svg: '<circle cx="12" cy="4.3" r="2.6"/><path d="M2.5 21V8.2h4.2L12 14.4l5.3-6.2h4.2V21h-3.9v-7.4L12 20l-5.6-6.4V21z"/>' },
  plane: { label: 'Vacation', svg: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>' },
  car: { label: 'Transport', shift: [0, -1], svg: '<path d="M5 17h14v-4.5l-1.8-4.6A1.5 1.5 0 0 0 15.8 7H8.2a1.5 1.5 0 0 0-1.4.9L5 12.5V17z"/><path d="M5 12.5h14M7 17v2M17 17v2"/>' },
  list: { label: 'General', shift: [-0.25, 0], svg: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>' },
};

function iconSvg(name) {
  const ic = ICONS[name];
  if (!ic || !ic.svg) return '<span class="dot"></span>';
  const [dx, dy] = ic.shift || [0, 0];
  const body = `<g transform="translate(${dx} ${dy})">${ic.svg}</g>`;
  return ic.fill
    ? `<svg viewBox="0 0 24 24" fill="currentColor">${body}</svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
// Ironman red shows as a solid badge so the official red stays true
const badge = (color, icon, size = '') =>
  `<span class="badge ${size}${color === IRONMAN_RED ? ' solid' : ''}" style="--c:${color}">${iconSvg(icon)}</span>`;
// Custom colors are always pastel: brightness runs from dusty dark (45%) to light (85%),
// and saturation drops as it darkens so darker shades stay soft.
const LIGHT_MIN = 45, LIGHT_MAX = 85;
const pastel = (hue, light = 80) => {
  const l = Math.min(LIGHT_MAX, Math.max(LIGHT_MIN, Math.round(light)));
  return `hsl(${Math.round(hue)}, ${Math.round(40 + (l - LIGHT_MIN) * 0.75)}%, ${l}%)`;
};
const parseHsl = c => {
  const m = String(c).match(/hsl\(\s*([\d.]+)\s*,\s*[\d.]+%\s*,\s*([\d.]+)%/);
  return m ? { hue: +m[1], light: +m[2] } : { hue: 0, light: 80 };
};

const STORE_KEY = 'budget.v1';
const UNCATEGORIZED = { id: null, name: 'Uncategorized', color: '#A8A29E', budget: 0 };

const $ = sel => document.querySelector(sel);
const number = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const symbol = cur => (CURRENCIES[cur] || CURRENCIES[BASE]).symbol;
const fmtIn = (cents, cur) => (cents < 0 ? '-' : '') + symbol(cur) + number.format(Math.abs(cents) / 100);
const fmt = cents => fmtIn(cents, BASE);
const toBase = (cents, cur = BASE) => Math.round(cents / (CURRENCIES[cur]?.perBase || 1));
const baseAmount = e => toBase(e.amount, e.currency);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- Data ----
// Amounts are stored as integer cents in the expense's own currency. Expenses carry their own timestamp,
// so each month is just a filter over the full history.
let db = load();

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY));
    if (d && Array.isArray(d.categories) && Array.isArray(d.expenses)) return d;
  } catch {}
  return {
    categories: [
      { id: uid(), name: 'Coffee', color: COLORS[0], icon: 'coffee', budget: 0 },
      { id: uid(), name: 'Food', color: COLORS[1], icon: 'food', budget: 0 },
      { id: uid(), name: 'Shopping', color: COLORS[2], icon: 'bag', budget: 0 },
      { id: uid(), name: 'Transport', color: COLORS[3], icon: 'car', budget: 0 },
    ],
    expenses: [],
  };
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch { toast('Could not save', 'Storage is full or unavailable.'); }
}

const catOf = id => db.categories.find(c => c.id === id) || UNCATEGORIZED;

function thisMonth() {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() };
}
const sameMonth = (a, b) => a.y === b.y && a.m === b.m;
const monthOf = ts => { const d = new Date(ts); return { y: d.getFullYear(), m: d.getMonth() }; };

function expensesIn(month) {
  return db.expenses.filter(e => sameMonth(monthOf(e.ts), month)).sort((a, b) => b.ts - a.ts);
}
function spent(catId, month) {
  return expensesIn(month).filter(e => e.categoryId === catId).reduce((s, e) => s + baseAmount(e), 0);
}

function parseAmount(v) {
  let s = String(v).replace(/[^\d.,]/g, '');
  s = s.includes('.') ? s.replace(/,/g, '') : s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

// ---- Rendering ----
let view = thisMonth();

function render() {
  const current = thisMonth();
  const isCurrent = sameMonth(view, current);
  const label = new Date(view.y, view.m, 1).toLocaleDateString(undefined, { month: 'long' });
  $('#monthLabel').innerHTML = `${esc(label)} <span>${view.y}</span>`;
  $('#nextMonth').disabled = isCurrent;
  const earliest = db.expenses.reduce((min, e) => Math.min(min, e.ts), Date.now());
  const first = monthOf(earliest);
  $('#prevMonth').disabled = view.y * 12 + view.m <= first.y * 12 + first.m;

  const list = expensesIn(view);
  const total = list.reduce((s, e) => s + baseAmount(e), 0);

  // Per-category totals for the month
  const byCat = new Map();
  for (const e of list) byCat.set(e.categoryId, (byCat.get(e.categoryId) || 0) + baseAmount(e));

  renderRing(byCat, total);

  $('#ringLabel').textContent = isCurrent ? 'Spent this month' : `Spent in ${label}`;
  $('#ringTotal').textContent = fmt(total);
  const over = db.categories.filter(c => c.budget && (byCat.get(c.id) || 0) >= c.budget).length;
  const sub = $('#ringSub');
  sub.classList.toggle('over', over > 0);
  sub.textContent = over
    ? `${over} ${over === 1 ? 'budget' : 'budgets'} reached`
    : `${list.length} ${list.length === 1 ? 'expense' : 'expenses'}`;

  renderCategories(byCat);
  renderLog(list);
}

function renderRing(byCat, total) {
  const R = 84, W = 16, C = 2 * Math.PI * R;
  const segs = [...byCat].map(([id, amt]) => ({ cat: catOf(id), amt })).sort((a, b) => b.amt - a.amt);
  const scale = total || 1;
  const gap = segs.length > 1 ? 2 : 0;
  let svg = `<circle cx="100" cy="100" r="${R}" fill="none" style="stroke:var(--track)" stroke-width="${W}"/>`;
  let offset = 0;
  for (const s of segs) {
    const len = (s.amt / scale) * C;
    const dash = Math.max(len - gap, 0.8);
    svg += `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${s.cat.color}" stroke-width="${W}"
      stroke-dasharray="${dash} ${C}" stroke-dashoffset="${-offset}"/>`;
    offset += len;
  }
  $('#ring').innerHTML = svg;
}

function renderCategories(byCat) {
  const rows = db.categories.map(c => ({ cat: c, amt: byCat.get(c.id) || 0 }));
  if (byCat.has(null)) rows.push({ cat: UNCATEGORIZED, amt: byCat.get(null) });
  rows.sort((a, b) => b.amt - a.amt || a.cat.name.localeCompare(b.cat.name));

  if (!rows.length) {
    $('#catList').className = '';
    $('#catList').innerHTML = `<div class="empty">No categories yet.</div>`;
    return;
  }
  $('#catList').className = 'card-list';
  $('#catList').innerHTML = rows.map(({ cat, amt }) => {
    const b = cat.budget || 0;
    const pct = b ? amt / b : 0;
    const state = b && pct >= 1 ? 'over' : b && pct >= WARN_AT ? 'near' : '';
    const tag = cat.id ? 'button' : 'div';
    return `<${tag} class="row ${state}" ${cat.id ? `data-cat="${cat.id}"` : ''} style="--c:${cat.color}">
      ${badge(cat.color, cat.icon)}
      <span class="row-name truncate">${esc(cat.name)}</span>
      <span class="row-amt num">${fmt(amt)}${b ? `<span class="of">of ${fmt(b)}</span>` : ''}</span>
      ${b ? `<span class="bar"><i style="width:${Math.min(pct, 1) * 100}%"></i></span>` : ''}
    </${tag}>`;
  }).join('');
}

function dayLabel(ts) {
  const d = new Date(ts), t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
const timeLabel = ts => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const fullStamp = ts => new Date(ts).toLocaleString(undefined, {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

function renderLog(list) {
  if (!list.length) {
    $('#logList').innerHTML = `<div class="empty">Nothing logged ${sameMonth(view, thisMonth()) ? 'this month yet' : 'this month'}.</div>`;
    return;
  }
  const days = [];
  for (const e of list) {
    const key = new Date(e.ts).toDateString();
    if (!days.length || days[days.length - 1].key !== key) days.push({ key, ts: e.ts, items: [] });
    days[days.length - 1].items.push(e);
  }
  $('#logList').innerHTML = days.map(d => `
    <div class="day">
      <div class="day-head"><span>${dayLabel(d.ts)}</span><span class="num">${fmt(d.items.reduce((s, e) => s + baseAmount(e), 0))}</span></div>
      <div class="card-list">
        ${d.items.map(e => {
          const c = catOf(e.categoryId);
          const cur = e.currency || BASE;
          const meta = [c.name, timeLabel(e.ts), e.note].filter(Boolean).map(esc).join(' · ');
          return `<button class="row" data-exp="${e.id}">
            ${badge(c.color, c.icon)}
            <span class="row-main"><span class="row-name truncate">${esc(e.title)}</span><span class="row-meta truncate">${meta}</span></span>
            <span class="row-amt num">${fmtIn(e.amount, cur)}${cur !== BASE ? `<small>${fmt(baseAmount(e))}</small>` : ''}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`).join('');
}

// ---- Sheets ----
function openSheet(id) {
  document.querySelectorAll('.sheet.open').forEach(s => s.classList.remove('open'));
  $(id).classList.add('open');
  $('#scrim').classList.add('open');
  document.body.classList.add('locked');
}
function closeSheets() {
  document.activeElement?.blur?.();
  document.querySelectorAll('.sheet.open').forEach(s => s.classList.remove('open'));
  $('#scrim').classList.remove('open');
  document.body.classList.remove('locked');
}

// Keep sheets above the iOS keyboard
if (window.visualViewport) {
  const vv = window.visualViewport;
  const sync = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', kb + 'px');
    document.documentElement.style.setProperty('--vvh', vv.height + 'px');
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

// ---- Expense sheet ----
let editingExp = null;
let selCat = null;
let lastCat = null;
let selCur = BASE;

// Size the amount input to its text so "$ + amount" stays centered as a group
const measure = document.createElement('canvas').getContext('2d');
function sizeAmount() {
  const input = $('#expAmount');
  const cs = getComputedStyle(input);
  const text = input.value || input.placeholder;
  measure.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const spacing = (parseFloat(cs.letterSpacing) || 0) * text.length;
  input.style.width = Math.ceil(measure.measureText(text).width + spacing + 4) + 'px';
  const cents = parseAmount(input.value);
  $('#expConv').textContent = selCur !== BASE && cents > 0 ? `= ${fmt(toBase(cents, selCur))} ${BASE}` : '';
}

function renderCurrency() {
  $('#expSym').textContent = symbol(selCur);
  $('#expCur').innerHTML = Object.keys(CURRENCIES).map(c =>
    `<button type="button" class="${c === selCur ? 'on' : ''}" data-cur="${c}">${c}</button>`
  ).join('');
  sizeAmount();
}

$('#expCur').addEventListener('click', e => {
  const b = e.target.closest('[data-cur]');
  if (!b) return;
  selCur = b.dataset.cur;
  renderCurrency();
});

function openExpense(exp) {
  editingExp = exp || null;
  selCur = exp ? exp.currency || BASE : CURRENCIES[db.lastCurrency] ? db.lastCurrency : BASE;
  $('#expHeading').textContent = exp ? 'Expense' : 'New expense';
  $('#expAmount').value = exp ? (exp.amount / 100).toFixed(2) : '';
  $('#expTitle').value = exp ? exp.title : '';
  $('#expNote').value = exp ? exp.note || '' : '';
  $('#expStamp').textContent = exp ? `Logged ${fullStamp(exp.ts)}` : '';
  $('#expSubmit').textContent = exp ? 'Save' : 'Log expense';
  $('#expDelete').hidden = !exp;
  const fallback = db.categories.some(c => c.id === lastCat) ? lastCat : db.categories[0]?.id ?? null;
  selCat = exp ? exp.categoryId : fallback;
  renderChips();
  renderCurrency();
  openSheet('#expenseSheet');
  growNote();
  if (!exp) $('#expAmount').focus();
}

function renderChips() {
  $('#expCats').innerHTML = db.categories.map(c =>
    `<button type="button" class="chip${c.id === selCat ? ' on' : ''}" data-id="${c.id}">${badge(c.color, c.icon, 'sm')}${esc(c.name)}</button>`
  ).join('') + `<button type="button" class="chip add" data-new>+ New</button>`;
}

// The description box grows with its text
function growNote() {
  const t = $('#expNote');
  t.style.height = 'auto';
  t.style.height = t.scrollHeight + (t.offsetHeight - t.clientHeight) + 'px'; // include the border
}
$('#expNote').addEventListener('input', growNote);

$('#expCats').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  if (chip.hasAttribute('data-new')) return openCategory(null, true);
  selCat = chip.dataset.id;
  renderChips();
});

$('#expAmount').addEventListener('input', sizeAmount);

$('#expenseSheet').addEventListener('submit', e => {
  e.preventDefault();
  const amount = parseAmount($('#expAmount').value);
  if (!(amount > 0)) return shake($('#amountField'));
  if (!selCat && db.categories.length) return shake($('#expCats'));

  const title = $('#expTitle').value.trim() || catOf(selCat).name;
  const note = $('#expNote').value.trim();
  const now = thisMonth();
  const before = spent(selCat, now);
  let exp;

  if (editingExp) {
    exp = editingExp;
    Object.assign(exp, { amount, currency: selCur, title, note, categoryId: selCat });
  } else {
    exp = { id: uid(), title, categoryId: selCat, amount, currency: selCur, note, ts: Date.now() };
    db.expenses.push(exp);
    view = now;
  }
  lastCat = selCat;
  db.lastCurrency = selCur;
  save();
  closeSheets();
  render();

  const alerted = sameMonth(monthOf(exp.ts), now) && checkBudget(selCat, before, spent(selCat, now));
  if (!alerted && !editingExp) toast('Logged', `${fmtIn(amount, selCur)} · ${timeLabel(exp.ts)}`);
});

$('#expDelete').addEventListener('click', () => {
  if (!editingExp || !confirm(`Delete "${editingExp.title}"?`)) return;
  db.expenses = db.expenses.filter(e => e.id !== editingExp.id);
  save();
  closeSheets();
  render();
});

// ---- Category sheet ----
let editingCat = null;
let selColor = COLORS[0];
let selIcon = 'dot';
let returnToExpense = false;

function openCategory(cat, fromExpense = false) {
  editingCat = cat || null;
  returnToExpense = fromExpense;
  $('#catHeading').textContent = cat ? 'Edit category' : 'New category';
  $('#catName').value = cat ? cat.name : '';
  $('#catBudget').value = cat && cat.budget ? (cat.budget / 100).toFixed(2) : '';
  $('#catDelete').hidden = !cat;
  const used = new Set(db.categories.map(c => c.color));
  selColor = cat ? cat.color : COLORS.find(c => !used.has(c)) || COLORS[db.categories.length % COLORS.length];
  selIcon = cat && ICONS[cat.icon] ? cat.icon : 'dot';
  renderSwatches();
  openSheet('#categorySheet');
  if (!cat) $('#catName').focus();
}

function renderIcons() {
  $('#catIcons').innerHTML = Object.entries(ICONS).map(([key, ic]) =>
    `<button type="button" class="icon-opt${key === selIcon ? ' on' : ''}" data-icon="${key}" aria-label="${ic.label}">${badge(selColor, key, 'md')}</button>`
  ).join('');
}

$('#catIcons').addEventListener('click', e => {
  const b = e.target.closest('[data-icon]');
  if (!b) return;
  selIcon = b.dataset.icon;
  renderIcons();
});

function renderSwatches() {
  renderIcons();
  const custom = !SWATCHES.includes(selColor);
  $('#catColors').innerHTML = SWATCHES.map(c =>
    `<button type="button" class="swatch${c === selColor ? ' on' : ''}" data-color="${c}" style="--c:${c}" aria-label="${c === IRONMAN_RED ? 'Ironman red' : `Color ${c}`}"></button>`
  ).join('') +
    `<button type="button" class="swatch custom${custom ? ' on' : ''}" data-custom style="--c:${custom ? selColor : pastel(0)}" aria-label="Custom pastel color"></button>`;
  $('#hueRow').hidden = !custom;
  if (custom) {
    const { hue, light } = parseHsl(selColor);
    $('#hue').value = hue;
    $('#light').value = light;
    syncPicker();
  }
}

function syncPicker() {
  const hue = $('#hue').value;
  $('#catColors [data-custom]').style.setProperty('--c', selColor);
  $('#hue').style.setProperty('--c', selColor);
  $('#light').style.setProperty('--c', selColor);
  $('#light').style.background = `linear-gradient(to right, ${pastel(hue, LIGHT_MIN)}, ${pastel(hue, LIGHT_MAX)})`;
}

$('#catColors').addEventListener('click', e => {
  const sw = e.target.closest('.swatch');
  if (!sw) return;
  selColor = sw.hasAttribute('data-custom')
    ? SWATCHES.includes(selColor) ? pastel(Math.random() * 360) : selColor
    : sw.dataset.color;
  renderSwatches();
});

$('#hueRow').addEventListener('input', () => {
  selColor = pastel($('#hue').value, $('#light').value);
  syncPicker();
  renderIcons();
});

$('#categorySheet').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#catName').value.trim();
  if (!name) return shake($('#catName'));
  const raw = $('#catBudget').value.trim();
  const budget = raw ? parseAmount(raw) : 0;
  if (raw && !(budget >= 0)) return shake($('#catBudget').closest('.budget-field'));

  if (editingCat) {
    Object.assign(editingCat, { name, color: selColor, icon: selIcon, budget });
  } else {
    editingCat = { id: uid(), name, color: selColor, icon: selIcon, budget };
    db.categories.push(editingCat);
  }
  save();
  // Setting a budget is a good moment to ask for notification permission
  if (budget > 0 && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
  render();
  if (returnToExpense) {
    selCat = editingCat.id;
    renderChips();
    openSheet('#expenseSheet');
  } else {
    closeSheets();
  }
});

$('#catDelete').addEventListener('click', () => {
  if (!editingCat) return;
  const count = db.expenses.filter(e => e.categoryId === editingCat.id).length;
  const msg = count
    ? `Delete "${editingCat.name}"? Its ${count} logged ${count === 1 ? 'expense stays' : 'expenses stay'} as Uncategorized.`
    : `Delete "${editingCat.name}"?`;
  if (!confirm(msg)) return;
  for (const e of db.expenses) if (e.categoryId === editingCat.id) e.categoryId = null;
  db.categories = db.categories.filter(c => c.id !== editingCat.id);
  save();
  closeSheets();
  render();
});

// ---- Budget alerts ----
// Fires once when spending crosses 80%, and once when it crosses 100%.
function checkBudget(catId, before, after) {
  const c = catOf(catId);
  if (!c.budget) return false;
  const warn = c.budget * WARN_AT;
  if (before < c.budget && after >= c.budget) {
    notify(`${c.name} budget reached`, `You've spent ${fmt(after)} of your ${fmt(c.budget)} budget this month.`);
    return true;
  }
  if (before < warn && after >= warn) {
    notify(`${c.name} is close to budget`, `${fmt(after)} of ${fmt(c.budget)} spent. ${fmt(c.budget - after)} left this month.`);
    return true;
  }
  return false;
}

async function notify(title, body) {
  toast(title, body);
  if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: title });
    else new Notification(title, { body, icon: 'icon-192.png' });
  } catch {}
}

let toastTimer;
function toast(title, body = '') {
  const t = $('#toast');
  t.innerHTML = `<b>${esc(title)}</b>${body ? esc(body) : ''}`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ---- Settings ----
function renderNotifStatus() {
  const status = $('#notifStatus'), btn = $('#notifBtn');
  btn.hidden = true;
  if (!('Notification' in window)) {
    status.textContent = 'Add this app to your Home Screen first (Share → Add to Home Screen), then open it from there.';
  } else if (Notification.permission === 'granted') {
    status.textContent = 'On. You\'ll be alerted at 80% and 100% of a category budget.';
  } else if (Notification.permission === 'denied') {
    status.textContent = 'Blocked. Turn on in iPhone Settings → Notifications → Budget.';
  } else {
    status.textContent = 'Get alerted at 80% and 100% of a category budget.';
    btn.hidden = false;
  }
}

$('#notifBtn').addEventListener('click', async () => {
  try { await Notification.requestPermission(); } catch {}
  renderNotifStatus();
});

$('#exportBtn').addEventListener('click', async () => {
  const name = `budget-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(db, null, 2)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch {}
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.categories) || !Array.isArray(d.expenses)) throw new Error();
    if (!confirm(`Replace current data with this backup (${d.expenses.length} expenses)?`)) return;
    db = d;
    save();
    view = thisMonth();
    closeSheets();
    render();
    toast('Backup restored');
  } catch {
    toast('Import failed', 'That file is not a valid backup.');
  }
});

// ---- Wiring ----
function shiftMonth(delta) {
  const d = new Date(view.y, view.m + delta, 1);
  view = { y: d.getFullYear(), m: d.getMonth() };
  render();
}

$('#prevMonth').addEventListener('click', () => shiftMonth(-1));
$('#nextMonth').addEventListener('click', () => shiftMonth(1));
$('#addBtn').addEventListener('click', () => openExpense(null));
$('#newCatBtn').addEventListener('click', () => openCategory(null));
$('#settingsBtn').addEventListener('click', () => { renderNotifStatus(); openSheet('#settingsSheet'); });
$('#scrim').addEventListener('click', closeSheets);
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
  if (returnToExpense && b.closest('#categorySheet')) { returnToExpense = false; openSheet('#expenseSheet'); }
  else closeSheets();
}));

$('#catList').addEventListener('click', e => {
  const row = e.target.closest('[data-cat]');
  if (row) openCategory(db.categories.find(c => c.id === row.dataset.cat));
});
$('#logList').addEventListener('click', e => {
  const row = e.target.closest('[data-exp]');
  if (row) openExpense(db.expenses.find(x => x.id === row.dataset.exp));
});

// Roll over to the new month when the app is reopened
let lastSeen = thisMonth();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = thisMonth();
  if (!sameMonth(now, lastSeen)) {
    if (sameMonth(view, lastSeen)) view = now;
    lastSeen = now;
  }
  render();
});

document.querySelectorAll('[data-sym]').forEach(el => { el.textContent = symbol(BASE); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
navigator.storage?.persist?.().catch(() => {});
document.fonts?.ready.then(sizeAmount);

render();
