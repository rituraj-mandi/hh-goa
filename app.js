'use strict';

/* =========================================================================
   Hacker House Goa 2026 — Builder ID Generator
   ========================================================================= */

const BRAND = {
  ink: '#07140D',
  green: '#0B6839',
  greenDeep: '#052213',
  yellow: '#FEE101',
  pink: '#FF0080',
  sand: '#EFEAD8',
};

const TITLES = [
  '10x Shipper', 'Terminal Dweller', 'VIM Enthusiast', 'Goa Local',
  'Hackathon Final-Boss', 'Console.log Debugger', 'AI Whisperer',
  'Sleep-Deprived Coder', 'The Midnight Deployer', 'Pixel Perfecter',
  'Production Breaker', 'StackOverflow Resident', 'Caffeine Metabolizer',
  'Open Source Contributor', 'Bug Hunter', 'Prompt Engineer',
  'Merge Conflict Survivor', 'Recovering Perfectionist', 'Demo Day Gambler',
  'Ships In Prod', 'Rubber Duck Whisperer',
];

// Design-space card dimensions (all drawing math happens in these units;
// the canvas backing store is supersampled at EXPORT_SCALE for crisp output).
const CARD_W = 1080;
const CARD_H = 1350;
const EXPORT_SCALE = 2;

// Photo frame geometry within the card (design units).
const FRAME = { x: 210, y: 258, w: 660, h: 660, r: 34 };

const SITE_URL = 'https://hhgoa-id-generator.vercel.app'; // ⚠️ update after deploy
const HASHTAG = '#FrameInGoa';

/* ---------------------------------------------------------------------
   State
   --------------------------------------------------------------------- */
const state = {
  source: null,        // decoded image (ImageBitmap | HTMLCanvasElement | HTMLImageElement)
  srcW: 0, srcH: 0,
  fx: 0.5, fy: 0.5,     // focal point within source image, 0..1
  zoom: 1,              // 1 = tightest cover fit, up to 2.6
  idCode: null,
  title: pickTitle(),
  dragging: false,
  lastPointer: null,
  fontsReady: false,
  logo: null,           // wordmark.svg image
  stamp: null,          // goa_hindi.svg image
};

/* ---------------------------------------------------------------------
   DOM refs
   --------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);

const fileInput = $('fileInput');
const dropLabel = $('dropLabel');
const uploader = $('uploader');
const repositionUI = $('repositionUI');
const zoomRange = $('zoomRange');
const recenterBtn = $('recenterBtn');
const statusMsg = $('statusMsg');

const nameInput = $('nameInput');
const roleInput = $('roleInput');
const titleChip = $('titleChip');
const rerollBtn = $('rerollBtn');

const downloadBtn = $('downloadBtn');
const shareBtn = $('shareBtn');

const canvas = $('idCanvas');
const ctx = canvas.getContext('2d');
const emptyState = $('emptyState');
const toastEl = $('toast');

/* ---------------------------------------------------------------------
   Boot
   --------------------------------------------------------------------- */
init();

async function init() {
  titleChip.textContent = `< ${state.title} />`;
  setCanvasBackingStore();

  loadFonts(); // fire and forget; drawCard() re-checks readiness before painting text
  state.logo = await loadImage('assets/wordmark.svg').catch(() => null);
  state.stamp = await loadImage('assets/goa_hindi.svg').catch(() => null);

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleNewPhoto(file);
  });

  // Drag-and-drop straight onto the upload label.
  ['dragover', 'dragenter'].forEach((evt) =>
    dropLabel.addEventListener(evt, (e) => { e.preventDefault(); dropLabel.style.borderColor = BRAND.yellow; })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropLabel.addEventListener(evt, (e) => { e.preventDefault(); dropLabel.style.borderColor = ''; })
  );
  dropLabel.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleNewPhoto(file);
  });

  nameInput.addEventListener('input', drawCard);
  roleInput.addEventListener('input', drawCard);

  rerollBtn.addEventListener('click', () => {
    state.title = pickTitle(state.title);
    titleChip.textContent = `< ${state.title} />`;
    drawCard();
  });

  zoomRange.addEventListener('input', () => {
    state.zoom = Number(zoomRange.value) / 100;
    drawCard();
  });

  recenterBtn.addEventListener('click', () => {
    state.fx = 0.5; state.fy = 0.5; state.zoom = 1;
    zoomRange.value = 100;
    drawCard();
  });

  bindDragToReposition();

  downloadBtn.addEventListener('click', downloadCard);
  shareBtn.addEventListener('click', shareToX);
}

function setCanvasBackingStore() {
  canvas.width = CARD_W * EXPORT_SCALE;
  canvas.height = CARD_H * EXPORT_SCALE;
}

async function loadFonts() {
  try {
    const specs = [
      '400 16px "Outfit"', '600 16px "Outfit"', '700 16px "Outfit"', '800 16px "Outfit"',
      '600 16px "Victor Mono"', '700 16px "Victor Mono"',
      '500 16px "Bodoni Moda"', '600 16px "Bodoni Moda"', '700 16px "Bodoni Moda"', '800 16px "Bodoni Moda"',
    ];
    await Promise.all(specs.map((f) => document.fonts.load(f)));
    await document.fonts.ready;
  } catch (_) { /* non-fatal — canvas will fall back to system fonts */ }
  state.fontsReady = true;
  if (state.source) drawCard();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/* ---------------------------------------------------------------------
   Photo pipeline — handles jpg/png/webp/HEIC, corrects EXIF rotation,
   downsizes huge phone photos, and resets crop state per upload.
   --------------------------------------------------------------------- */
async function handleNewPhoto(file) {
  if (!isLikelyImage(file)) {
    setStatus('That file type isn\u2019t supported — try a JPG, PNG, or HEIC photo.', 'error');
    return;
  }
  if (file.size > 30 * 1024 * 1024) {
    setStatus('That photo is quite large — it may take a moment to process.', '');
  } else {
    setStatus('Processing photo\u2026', '');
  }

  fileInput.disabled = true;

  try {
    const decoded = await decodeImageFile(file);
    const capped = await capToMaxDimension(decoded, 2200);

    state.source = capped.image;
    state.srcW = capped.w;
    state.srcH = capped.h;
    state.fx = 0.5;
    state.fy = 0.5;
    state.zoom = 1;
    state.idCode = generateIdCode();
    zoomRange.value = 100;

    emptyState.classList.add('hidden');
    canvas.classList.add('active');
    downloadBtn.disabled = false;
    shareBtn.disabled = false;
    repositionUI.hidden = false;

    setStatus('Looking good. Drag the photo to reposition it.', '');
    drawCard();
  } catch (err) {
    console.error(err);
    setStatus('Couldn\u2019t read that photo. Try a different file.', 'error');
  } finally {
    fileInput.disabled = false;
  }
}

function isLikelyImage(file) {
  if (file.type && file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || '');
}

async function decodeImageFile(file) {
  const isHeic = /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');
  let workingFile = file;

  if (isHeic) {
    try {
      await loadScriptOnce('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js');
      const out = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      workingFile = Array.isArray(out) ? out[0] : out;
    } catch (err) {
      console.warn('HEIC conversion failed, will attempt native decode', err);
    }
  }

  // Preferred path: createImageBitmap auto-corrects EXIF orientation, which
  // handles the classic "phone photo comes out sideways" bug.
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(workingFile, { imageOrientation: 'from-image' });
    } catch (_) { /* fall through to <img> path below */ }
  }

  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = URL.createObjectURL(workingFile);
  });
}

let _scriptCache = {};
function loadScriptOnce(src) {
  if (_scriptCache[src]) return _scriptCache[src];
  _scriptCache[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
  return _scriptCache[src];
}

// Downscale very large source photos before they ever touch the drawing
// canvas — keeps things fast and avoids mobile memory crashes.
async function capToMaxDimension(imageLike, maxDim) {
  const w = imageLike.width, h = imageLike.height;
  const longest = Math.max(w, h);
  if (longest <= maxDim) return { image: imageLike, w, h };

  const scale = maxDim / longest;
  const nw = Math.round(w * scale), nh = Math.round(h * scale);
  const off = document.createElement('canvas');
  off.width = nw; off.height = nh;
  off.getContext('2d').drawImage(imageLike, 0, 0, nw, nh);
  return { image: off, w: nw, h: nh };
}

/* ---------------------------------------------------------------------
   Drag-to-reposition — pointer-based, clamped so the frame never shows
   empty space. This is what lets an off-center or oddly-cropped phone
   photo still end up looking intentional.
   --------------------------------------------------------------------- */
function bindDragToReposition() {
  canvas.addEventListener('pointerdown', (e) => {
    if (!state.source) return;
    state.dragging = true;
    state.lastPointer = { x: e.clientX, y: e.clientY };
    canvas.classList.add('dragging');
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    const rect = canvas.getBoundingClientRect();
    const dxCss = e.clientX - state.lastPointer.x;
    const dyCss = e.clientY - state.lastPointer.y;
    state.lastPointer = { x: e.clientX, y: e.clientY };

    // CSS px -> design-space px (canvas is displayed at CARD_W wide, CSS-scaled)
    const cssToDesign = CARD_W / rect.width;
    const scale = coverScale(FRAME.w, FRAME.h, state.srcW, state.srcH) * state.zoom;

    state.fx -= (dxCss * cssToDesign) / scale / state.srcW;
    state.fy -= (dyCss * cssToDesign) / scale / state.srcH;
    state.fx = clamp(state.fx, 0, 1);
    state.fy = clamp(state.fy, 0, 1);
    drawCard();
  });

  const endDrag = (e) => {
    if (!state.dragging) return;
    state.dragging = false;
    canvas.classList.remove('dragging');
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
}

function coverScale(frameW, frameH, imgW, imgH) {
  return Math.max(frameW / imgW, frameH / imgH);
}

// Returns the source rectangle to draw from, given the current focal point
// and zoom, clamped so it never runs past the source image's edges.
function computeCrop(frameW, frameH, imgW, imgH, zoom, fx, fy) {
  const scale = coverScale(frameW, frameH, imgW, imgH) * zoom;
  const sW = frameW / scale;
  const sH = frameH / scale;
  let sx = fx * imgW - sW / 2;
  let sy = fy * imgH - sH / 2;
  sx = clamp(sx, 0, Math.max(0, imgW - sW));
  sy = clamp(sy, 0, Math.max(0, imgH - sH));
  return { sx, sy, sW, sH };
}

function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

/* ---------------------------------------------------------------------
   Rendering
   --------------------------------------------------------------------- */
function drawCard() {
  if (!state.source) return;

  ctx.save();
  ctx.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, 0, 0);
  ctx.clearRect(0, 0, CARD_W, CARD_H);

  drawBackground();
  drawPhoto();
  drawLockup();
  drawTypography();
  drawMetaRow();
  drawHoloSheen();
  drawPerforation();

  ctx.restore();
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  g.addColorStop(0, '#0a0a0a');
  g.addColorStop(0.55, '#0e1712');
  g.addColorStop(1, BRAND.greenDeep);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const glow = ctx.createRadialGradient(CARD_W, 0, 0, CARD_W, 0, 900);
  glow.addColorStop(0, 'rgba(254,225,1,0.10)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // outer badge border
  ctx.strokeStyle = 'rgba(239,234,216,0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, CARD_W - 32, CARD_H - 32);
  ctx.strokeStyle = BRAND.yellow;
  ctx.lineWidth = 1;
  ctx.strokeRect(24, 24, CARD_W - 48, CARD_H - 48);
}

function drawPhoto() {
  const { x, y, w, h, r } = FRAME;
  const { sx, sy, sW, sH } = computeCrop(w, h, state.srcW, state.srcH, state.zoom, state.fx, state.fy);

  ctx.save();
  roundedRectPath(x, y, w, h, r);
  ctx.lineWidth = 6;
  ctx.strokeStyle = BRAND.yellow;
  ctx.stroke();
  ctx.clip();
  ctx.drawImage(state.source, sx, sy, sW, sH, x, y, w, h);
  ctx.restore();

  // inner shadow ring for depth
  ctx.save();
  roundedRectPath(x, y, w, h, r);
  ctx.clip();
  const inner = ctx.createLinearGradient(x, y, x, y + h);
  inner.addColorStop(0, 'rgba(0,0,0,0.18)');
  inner.addColorStop(0.15, 'rgba(0,0,0,0)');
  inner.addColorStop(0.85, 'rgba(0,0,0,0)');
  inner.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = inner;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function drawLockup() {
  if (state.logo && state.logo.complete && state.logo.naturalWidth) {
    const lw = 128;
    const lh = lw * (state.logo.naturalHeight / state.logo.naturalWidth);
    ctx.drawImage(state.logo, (CARD_W - lw) / 2, 64, lw, lh);
  } else {
    ctx.textAlign = 'center';
    ctx.fillStyle = BRAND.yellow;
    ctx.font = font(700, 40, 'sans');
    ctx.fillText('HACKER HOUSE GOA', CARD_W / 2, 110);
  }

  // small brand stamp near the bottom-right corner of the photo, like a hallmark
  if (state.stamp && state.stamp.complete && state.stamp.naturalWidth) {
    const sw = 64;
    const sh = sw * (state.stamp.naturalHeight / state.stamp.naturalWidth);
    const sx = FRAME.x + FRAME.w - sw + 14;
    const sy = FRAME.y + FRAME.h - sh + 14;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 10;
    ctx.drawImage(state.stamp, sx, sy, sw, sh);
    ctx.restore();
  }
}

function drawTypography() {
  const name = (nameInput.value.trim() || 'HACKER').toUpperCase();
  const role = (roleInput.value.trim() || 'BUILDER').toUpperCase();

  ctx.textAlign = 'center';

  fitText(ctx, name, CARD_W - 140, 78, 40, 700, 'serif');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(name, CARD_W / 2, 980);

  ctx.font = font(600, 32, 'sans');
  ctx.fillStyle = BRAND.yellow;
  let displayRole = role;
  while (ctx.measureText(displayRole).width > CARD_W - 160 && displayRole.length > 4) {
    displayRole = displayRole.slice(0, -1);
  }
  if (displayRole !== role) displayRole = displayRole.trim() + '\u2026';
  ctx.fillText(displayRole, CARD_W / 2, 1028);

  // builder title pill
  const label = `< ${state.title} />`;
  ctx.font = font(700, 27, 'mono');
  const tw = ctx.measureText(label).width;
  const padX = 34, padY = 20;
  const pillW = tw + padX * 2, pillH = padY * 2 + 6;
  const pillX = (CARD_W - pillW) / 2, pillY = 1058;

  ctx.fillStyle = 'rgba(11,104,57,0.45)';
  ctx.strokeStyle = BRAND.green;
  ctx.lineWidth = 2;
  roundedRectPath(pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(label, CARD_W / 2, pillY + pillH / 2 + 9);
}

function drawMetaRow() {
  const y1 = CARD_H - 96;
  const y2 = CARD_H - 66;

  ctx.textAlign = 'left';
  ctx.font = font(600, 30, 'sans');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('HACKER HOUSE GOA', 60, y1);
  ctx.fillStyle = BRAND.yellow;
  const w1 = ctx.measureText('HACKER HOUSE GOA ').width;
  ctx.fillText('2026', 60 + w1, y1);

  ctx.textAlign = 'right';
  ctx.font = font(400, 20, 'mono');
  ctx.fillStyle = 'rgba(244,241,232,0.85)';
  ctx.fillText(`ID: ${state.idCode}`, CARD_W - 60, y1);
  ctx.fillText('VALID: 28\u201331 OCT 2026', CARD_W - 60, y2);

  drawBarcode(60, y2 - 14, 300, 22, state.idCode);
}

function drawBarcode(x, y, w, h, seed) {
  let s = hashSeed(seed || 'HHGOA');
  let cx = x;
  ctx.save();
  ctx.fillStyle = 'rgba(244,241,232,0.55)';
  while (cx < x + w) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const barW = 1 + (s % 3);
    if (s % 5 !== 0) ctx.fillRect(cx, y, barW, h);
    cx += barW + 2;
  }
  ctx.restore();
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

// A soft diagonal foil/holographic sheen — the thing that reads as
// "laminated event badge" rather than "flat PNG with text on it".
function drawHoloSheen() {
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  const g = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  g.addColorStop(0.32, 'rgba(255,255,255,0)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.30)');
  g.addColorStop(0.48, 'rgba(255,0,128,0.22)');
  g.addColorStop(0.55, 'rgba(254,225,1,0.28)');
  g.addColorStop(0.65, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.restore();
}

// Real die-cut ticket-stub notches along the left edge — punched through
// to true transparency so it reads correctly on any background.
function drawPerforation() {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const r = 9, start = 46, end = CARD_H - 46, step = 48;
  for (let y = start; y <= end; y += step) {
    ctx.beginPath();
    ctx.arc(0, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(CARD_W, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------------------------------------------------------------------
   Text/shape helpers
   --------------------------------------------------------------------- */
function font(weight, size, family) {
  const map = { serif: 'Bodoni Moda', sans: 'Outfit', mono: 'Victor Mono' };
  const fam = state.fontsReady ? map[family] : (family === 'mono' ? 'monospace' : 'sans-serif');
  return `${weight} ${size}px "${fam}"`;
}

function fitText(ctx2, text, maxWidth, baseSize, minSize, weight, family) {
  let size = baseSize;
  ctx2.font = font(weight, size, family);
  while (ctx2.measureText(text).width > maxWidth && size > minSize) {
    size -= 2;
    ctx2.font = font(weight, size, family);
  }
}

function roundedRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pickTitle(exclude) {
  let t = TITLES[Math.floor(Math.random() * TITLES.length)];
  if (exclude && TITLES.length > 1) {
    while (t === exclude) t = TITLES[Math.floor(Math.random() * TITLES.length)];
  }
  return t;
}

function generateIdCode() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `HH-GOA-${n}`;
}

/* ---------------------------------------------------------------------
   Export / Share
   --------------------------------------------------------------------- */
function canvasToBlob() {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1.0));
}

function buildFilename() {
  const n = (nameInput.value.trim() || 'builder').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `hh-goa-2026-${n || 'id'}.png`;
}

function buildCaption() {
  return `Built my Hacker House Goa 2026 Builder ID \u{1F334}\u{1F680}\n\n${SITE_URL}\n\n${HASHTAG} #HHGoa2026`;
}

async function downloadCard() {
  const blob = await canvasToBlob();
  if (!blob) { setStatus('Couldn\u2019t generate the image — try again.', 'error'); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = buildFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  showToast('Saved to your downloads.');
}

async function shareToX() {
  const blob = await canvasToBlob();
  if (!blob) { setStatus('Couldn\u2019t generate the image — try again.', 'error'); return; }

  const filename = buildFilename();
  const text = buildCaption();
  const file = new File([blob], filename, { type: 'image/png' });

  // Preferred path (works on essentially all mobile browsers): hand the
  // actual generated image straight to the OS share sheet, pre-filled
  // caption included, and let the person pick X. No link, no OG-image
  // gamble — the real graphic goes out attached.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      showToast('Shared!');
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // user cancelled — do nothing
      console.warn('navigator.share failed, falling back', err);
    }
  }

  // Fallback (mainly desktop browsers without file-sharing support):
  // download the image and open a pre-filled compose window so the
  // person can attach it manually in two clicks.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);

  const composeUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(composeUrl, '_blank', 'noopener');
  showToast('Image saved — attach it in the X tab that just opened.');
}

/* ---------------------------------------------------------------------
   UI feedback
   --------------------------------------------------------------------- */
function setStatus(msg, tone) {
  statusMsg.textContent = msg;
  if (tone) statusMsg.setAttribute('data-tone', tone);
  else statusMsg.removeAttribute('data-tone');
}

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}
