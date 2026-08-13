'use strict';

const BRAND = {
  ink: '#07140D',
  green: '#0B6839',
  greenDeep: '#1A4A31',
  yellow: '#FEE101',
  pink: '#FF0080',
  sand: '#F4F5F7',
  gold: '#C6A152',
  blueText: '#1B365D',
  bluePill: '#4A7C94',
  grayText: '#6D7C8A',
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

const CARD_W = 1600;
const CARD_H = 1000;
const EXPORT_SCALE = 2;
const HEADER_H = 216;

const FRAME = { x: 96, y: 286, w: 360, h: 360, r: 16 };

const SITE_URL = 'https://hhgoa-bid.vercel.app';
const HASHTAG = '#FrameInGoa';

const state = {
  source: null,
  srcW: 0, srcH: 0,
  fx: 0.5, fy: 0.5,
  zoom: 1,
  idCode: null,
  title: pickTitle(),
  dragging: false,
  lastPointer: null,
  fontsReady: false,
  logo: null,
  scene: null,
  qr: null,
};

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

init();

async function init() {
  titleChip.textContent = `< ${state.title} />`;
  setCanvasBackingStore();

  loadFonts();
  state.logo = await loadImage('assets/word.png').catch(() => null);
  state.scene = await loadImage('assets/scene-linework.png').catch(() => null);
  state.qr = await loadImage('assets/qr.png').catch(() => null);

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleNewPhoto(file);
  });

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
  } catch (_) { }
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

  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(workingFile, { imageOrientation: 'from-image' });
    } catch (_) { }
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

function drawCard() {
  if (!state.source) return;

  ctx.save();
  ctx.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, 0, 0);
  ctx.clearRect(0, 0, CARD_W, CARD_H);

  ctx.save();
  roundedRectPath(0, 0, CARD_W, CARD_H, 48);
  ctx.clip();

  drawBody();
  drawHeader();
  drawScene();
  drawPhoto();
  drawInfo();
  drawFooter();

  ctx.restore();

  drawOuterBorder();

  ctx.restore();
}

function drawBody() {
  ctx.fillStyle = BRAND.sand;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

function drawHeader() {
  const g = ctx.createLinearGradient(0, 0, CARD_W, HEADER_H);
  g.addColorStop(0, '#103322');
  g.addColorStop(1, BRAND.greenDeep);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, HEADER_H);

  if (state.logo && state.logo.complete && state.logo.naturalWidth) {
    const lh = 70;
    const lw = lh * (state.logo.naturalWidth / state.logo.naturalHeight);
    ctx.drawImage(state.logo, 70, (HEADER_H - lh) / 2, lw, lh);
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = BRAND.yellow;
    ctx.font = font(700, 46, 'serif');
    ctx.fillText('HACKER HOUSE GOA', 70, HEADER_H / 2 + 16);
  }

  ctx.textAlign = 'right';
  ctx.font = font(400, 32, 'sans');
  ctx.fillStyle = '#C4D2C9';
  ctx.fillText('BUILDER ID    ', CARD_W - 150, HEADER_H / 2 + 10);
  ctx.font = font(600, 38, 'sans');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('2026', CARD_W - 70, HEADER_H / 2 + 10);
}

function drawScene() {
  if (!(state.scene && state.scene.complete && state.scene.naturalWidth)) return;
  const sceneW = CARD_W, sceneH = sceneW * (state.scene.naturalHeight / state.scene.naturalWidth);
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.drawImage(state.scene, 0, CARD_H - sceneH, sceneW, sceneH);
  ctx.restore();

  ctx.textAlign = 'left';
  const lx = 1250, ly = 900;
  drawPin(lx, ly - 20, 16, BRAND.blueText);
  ctx.font = font(800, 34, 'sans');
  ctx.fillStyle = BRAND.blueText;
  ctx.fillText('GOA - INDIA', lx + 36, ly);
}

function drawPin(cx, cy, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.15, Math.PI * 0.85, true);
  ctx.lineTo(cx, cy + r * 2.1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = BRAND.sand;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPhoto() {
  const { x, y, w, h, r } = FRAME;
  const pad = 16;
  const outX = x - pad, outY = y - pad, outW = w + pad*2, outH = h + pad*2, outR = 24;

  const { sx, sy, sW, sH } = computeCrop(w, h, state.srcW, state.srcH, state.zoom, state.fx, state.fy);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  roundedRectPath(outX, outY, outW, outH, outR);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRectPath(outX, outY, outW, outH, outR);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#D1D5DB';
  ctx.stroke();
  ctx.restore();

  ctx.save();
  roundedRectPath(x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(state.source, sx, sy, sW, sH, x, y, w, h);
  ctx.restore();

  ctx.save();
  roundedRectPath(x, y, w, h, r);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#E5E7EB';
  ctx.stroke();
  ctx.restore();

  ctx.save();
  const iconR = 28;
  const iconX = outX + outW - 12 - iconR;
  const iconY = outY + outH - 12 - iconR;

  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
  ctx.fillStyle = '#E8EDF2';
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = BRAND.blueText;
  ctx.stroke();

  ctx.fillStyle = BRAND.blueText;
  ctx.beginPath();
  ctx.arc(iconX, iconY - 6, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(iconX, iconY + 16, 15, Math.PI, 0);
  ctx.fill();
}

function drawInfo() {
  const left = FRAME.x + FRAME.w + 40;
  ctx.textAlign = 'left';

  const pillX = left, pillY = 460, pillW = 460, pillH = 74;

  if (state.qr && state.qr.complete) {
    const qrSize = 220;
    const qrX = pillX + pillW + 50;
    const qrY = pillY - 70;

    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 6;
    roundedRectPath(qrX, qrY, qrSize, qrSize, 12);
    ctx.fillStyle = '#FFF';
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundedRectPath(qrX, qrY, qrSize, qrSize, 12);
    ctx.clip();
    ctx.globalAlpha = 0.6;
    ctx.drawImage(state.qr, qrX, qrY, qrSize, qrSize);
    ctx.restore();
  }

  ctx.font = font(500, 22, 'sans');
  ctx.fillStyle = BRAND.grayText;
  ctx.fillText('NAME', left, 340);

  const name = nameInput.value.trim();
  fitText(ctx, name, 600, 60, 34, 700, 'sans');
  ctx.fillStyle = BRAND.blueText;
  ctx.fillText(name, left, 396);

  ctx.font = font(500, 22, 'sans');
  ctx.fillStyle = BRAND.grayText;
  ctx.fillText('DESIGNATION', left, 446);

  const role = roleInput.value.trim();

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 6;
  roundedRectPath(pillX, pillY, pillW, pillH, 12);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();

  const pg = ctx.createLinearGradient(pillX, pillY, pillX + pillW, pillY + pillH);
  pg.addColorStop(0, '#D4B872');
  pg.addColorStop(0.5, '#FCECA5');
  pg.addColorStop(1, '#C6A152');
  ctx.fillStyle = pg;
  ctx.fill();
  drawCircuitTexture(pillX, pillY, pillW, pillH);

  ctx.font = font(700, 36, 'sans');
  ctx.fillStyle = '#2B2B2B';
  let dRole = role;
  while (ctx.measureText(dRole).width > pillW - 40 && dRole.length > 4) dRole = dRole.slice(0, -1);
  if (dRole !== role) dRole = dRole.trim() + '\u2026';
  ctx.fillText(dRole, pillX + 24, pillY + pillH / 2 + 12);

  const idY = 586;

  const idW = 260;
  roundedRectPath(left, idY, idW, 76, 12);
  ctx.fillStyle = BRAND.bluePill;
  ctx.fill();

  ctx.font = font(500, 20, 'sans');
  ctx.fillStyle = '#A3C6D9';
  ctx.fillText('ID NO.', left + 20, idY + 30);
  ctx.font = font(700, 26, 'sans');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(state.idCode || 'HH-GOA-0047', left + 20, idY + 62);

  const vx = left + 300;
  drawCalendar(vx, idY + 16, 40, BRAND.blueText);
  ctx.font = font(500, 20, 'sans');
  ctx.fillStyle = BRAND.grayText;
  ctx.fillText('VALID DATES', vx + 54, idY + 32);
  ctx.font = font(700, 26, 'sans');
  ctx.fillStyle = BRAND.blueText;
  ctx.fillText('28\u201331 OCT 2026', vx + 54, idY + 64);
}

function drawCircuitTexture(x, y, w, h) {
  ctx.save();
  roundedRectPath(x, y, w, h, 12);
  ctx.clip();
  ctx.strokeStyle = 'rgba(7,20,13,0.10)';
  ctx.lineWidth = 2;
  const step = 34;
  for (let cx = x + w - 40; cx < x + w + 20; cx += step) {
    ctx.beginPath();
    ctx.moveTo(cx, y - 10);
    ctx.lineTo(cx, y + h * 0.4);
    ctx.lineTo(cx - 16, y + h * 0.4 + 16);
    ctx.lineTo(cx - 16, y + h + 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, y + h * 0.4, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(7,20,13,0.14)';
    ctx.fill();
  }
  ctx.restore();
}

function drawCalendar(x, y, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  roundedRectPath(x, y + size * 0.15, size, size * 0.85, 6);
  ctx.stroke();

  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.25, y);
  ctx.lineTo(x + size * 0.25, y + size * 0.3);
  ctx.moveTo(x + size * 0.75, y);
  ctx.lineTo(x + size * 0.75, y + size * 0.3);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.45);
  ctx.lineTo(x + size, y + size * 0.45);
  ctx.stroke();

  ctx.fillStyle = color;
  const dotR = 2.5;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
       ctx.beginPath();
       ctx.arc(x + size * 0.22 + col * size * 0.28, y + size * 0.65 + row * size * 0.22, dotR, 0, Math.PI*2);
       ctx.fill();
    }
  }
  ctx.restore();
}

function drawFooter() {
  const barcodeY = 850;

  const label = `< ${state.title} />`;
  ctx.font = font(800, 40, 'mono');
  ctx.fillStyle = BRAND.grayText;
  ctx.textAlign = 'left';
  ctx.fillText(label, 100, 780);

  drawBarcode(100, barcodeY, 300, 60, state.idCode);

  ctx.font = font(500, 22, 'mono');
  ctx.fillStyle = '#1B365D';
  ctx.textAlign = 'left';
  ctx.fillText(digitStringFor(state.idCode), 120, barcodeY + 85);
}

function drawBarcode(x, y, w, h, seed) {
  let s = hashSeed(seed || 'HHGOA');
  let cx = x;
  ctx.save();
  ctx.fillStyle = BRAND.ink;
  while (cx < x + w) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const barW = 1 + (s % 4);
    if (s % 7 !== 0) ctx.fillRect(cx, y, barW, h);
    cx += barW + 2;
  }
  ctx.restore();
}

function digitStringFor(seed) {
  let s = hashSeed(seed || 'HHGOA');
  let out = '';
  for (let i = 0; i < 13; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out += s % 10;
    if (i === 0 || i === 5) out += ' ';
  }
  return out;
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

function drawOuterBorder() {
  ctx.strokeStyle = '#C6A152';
  ctx.lineWidth = 8;
  roundedRectPath(3, 3, CARD_W - 6, CARD_H - 6, 50);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 2;
  roundedRectPath(7, 7, CARD_W - 14, CARD_H - 14, 50);
  ctx.stroke();
}

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

function canvasToBlob() {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1.0));
}

function buildFilename() {
  const n = (nameInput.value.trim() || 'builder').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `hh-goa-2026-${n || 'id'}.png`;
}

function buildCaption() {
  return `Built my Hacker House Goa 2026 Builder ID \u{1F334}\u{1F680}\n\n${HASHTAG}`;
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

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      showToast('Shared!');
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.warn('navigator.share failed, falling back', err);
    }
  }

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