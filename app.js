// app.js — Leaflet + toGeoJSON + LocateControl
// Без кластеров. Цвет из KML, персональные иконки, фильтры, фиксы iOS.
// Легенды нет. Храмы ищутся по «церк».

/* ------- Фолбэк-булавки (на случай отсутствия персональных PNG) ------- */
const SHADOW = "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-shadow.png";
const IconBlue   = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-blue.png",   shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });
const IconRed    = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-red.png",    shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });
const IconGreen  = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-green.png",  shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });
const IconYellow = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-yellow.png", shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });

/* ---------------- Персональные PNG и кеш ---------------- */
const ICONS = { prefix: 'icon-', ext: 'png', count: 28, size: [32,32], anchor: [16,32], popupAnchor: [0,-28] };
const iconCache = new Map();
function personalIcon(id){
  if (!id || id < 1 || id > ICONS.count) return null;
  if (iconCache.has(id)) return iconCache.get(id);
  const ic = L.icon({ iconUrl: `${ICONS.prefix}${id}.${ICONS.ext}`, iconSize: ICONS.size, iconAnchor: ICONS.anchor, popupAnchor: ICONS.popupAnchor });
  iconCache.set(id, ic); return ic;
}
const imgExistsCache = new Map();
function imageExists(url){
  if (imgExistsCache.has(url)) return imgExistsCache.get(url);
  const p = new Promise(res=>{
    const im = new Image();
    im.onload = ()=>res(true);
    im.onerror = ()=>res(false);
    im.src = url + (url.includes('?')?'&':'?') + 'v=' + Date.now();
  }).then(ok=>{ imgExistsCache.set(url, ok); return ok; });
  imgExistsCache.set(url, p); return p;
}

/* ---------------- Текст/HTML нормализация ---------------- */
function toText(v){
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(' ');
  if (typeof v === 'object') {
    const prefer = ['__cdata', '#cdata-section', '#text', 'text', 'value', 'content', 'description'];
    for (const k of prefer) if (k in v) return toText(v[k]);
    return Object.values(v).map(toText).filter(Boolean).join(' ');
  }
  return '';
}
function cleanText(v){
  let s = toText(v);
  s = s.replace(/\[object Object\]/gi, ' ');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}
function stripHtmlToText(input) {
  const html = cleanText(input);
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('img, picture, source, iframe, video, audio, svg, script, style').forEach(el => el.remove());
  let t = (tmp.textContent || '').replace(/\s+\n/g, '\n').replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/\[object Object\]/gi, '').replace(/\s{2,}/g, ' ').trim();
  return t;
}
function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'","&#39;");
}
function makePopupHtml(name, description) {
  const nameText = escapeHtml(cleanText(name)) || 'Без названия';
  const descText = stripHtmlToText(description);
  return descText ? `<strong>${nameText}</strong><br>${escapeHtml(descText)}`
                  : `<strong>${nameText}</strong>`;
}

/* ---------------- Категории ---------------- */
function detectCategory(p){
  const name = cleanText(p?.name).toLowerCase();
  const desc = cleanText(p?.description).toLowerCase();

  // Храмы/церкви — «церк*» + общие ключи
  if (/(храм|церк|собор|монастыр|кост(?:е|ё)л)/i.test(name) ||
      /(храм|церк|собор|монастыр|кост(?:е|ё)л)/i.test(desc)) {
    return 'temples';
  }

  if (name.includes('лестниц') || desc.includes('лестниц')) return 'stairs';   // Лестницы
  if (name.includes('парадн')  || desc.includes('парадн'))  return 'porches';  // Парадные
  return 'other';                                                               // Остальное
}
const CAT_LABEL = {
  stairs:"Лестницы",
  porches:"Парадные",
  temples:"Храмы",
  other:"Остальное"
};

/* ---------------- styleUrl → href (для цвета/иконки) ---------------- */
function idFromHref(href){
  if (!href) return null;
  const fn = href.split('?')[0].split('#')[0].split('/').pop() || "";
  const m = fn.match(/(?:^|[^\d])([1-9]\d{0,2})(?=\D|$)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return (n>=1 && n<=ICONS.count) ? n : null;
}
function buildStyleHrefMap(kmlXml){
  const byId = Object.create(null);
  kmlXml.querySelectorAll('Style[id]').forEach(st=>{
    const id = st.getAttribute('id');
    const href = st.querySelector('IconStyle Icon href')?.textContent?.trim();
    if (id && href) byId['#'+id] = href;
  });
  kmlXml.querySelectorAll('StyleMap[id]').forEach(sm=>{
    const id = sm.getAttribute('id');
    let href = null, target = null;
    sm.querySelectorAll('Pair').forEach(p=>{
      const key = p.querySelector('key')?.textContent?.trim();
      if (!target && key === 'normal') target = p;
    });
    if (!target) target = sm.querySelector('Pair');
    if (target){
      const styleUrl = target.querySelector('styleUrl')?.textContent?.trim();
      if (styleUrl && byId[styleUrl]) href = byId[styleUrl];
    }
    if (!href){
      const innerHref = sm.querySelector('IconStyle Icon href')?.textContent?.trim();
      if (innerHref) href = innerHref;
    }
    if (id && href) byId['#'+id] = href;
  });
  return byId;
}

/* ---------------- Цвет из href + SVG-пин ---------------- */
function extractHexFromHref(href){
  if (!href) return null;
  const m = href.match(/(?:[?&#]color=)(?:0x)?([0-9a-fA-F]{6,8})/);
  if (m) {
    const hex = m[1].toLowerCase();
    return '#' + (hex.length === 8 ? hex.slice(2) : hex).padStart(6, '0');
  }
  return null;
}
function guessNamedColorFromHref(href){
  if (!href) return null;
  const s = href.toLowerCase();
  if (/(red|_rd\b|-red|red-)/.test(s)) return '#d33';
  if (/(blue|blu|ltblue|ltblu)/.test(s)) return '#2b7bff';
  if (/(green|grn)/.test(s)) return '#2cad5b';
  if (/(yellow|ylw)/.test(s)) return '#f5c400';
  if (/(orange|ora)/.test(s)) return '#ff8a00';
  if (/(violet|purple)/.test(s)) return '#8a5cff';
  if (/(pink|magenta)/.test(s)) return '#ff4fa3';
  if (/(gray|grey|gry)/.test(s)) return '#7a7a7a';
  if (/black/.test(s)) return '#111111';
  if (/(white|wht)/.test(s)) return '#ffffff';
  return null;
}
function getStyleColor(feature, styleHrefMap){
  const p = feature?.properties || {};
  const styleUrl = typeof p.styleUrl === 'string' ? p.styleUrl : null;
  const href = styleUrl ? (styleHrefMap[styleUrl] || null) : null;
  let hex = extractHexFromHref(href);
  if (hex) return hex;
  hex = guessNamedColorFromHref(href);
  if (hex) return hex;
  return null;
}
function svgPinIcon(hex){
  const fill = (hex || '#2b7bff').toLowerCase();
  const stroke = '#08213a';
  const w = 26, h = 40, ax = Math.round(w/2), ay = h;
  const html =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 26 40" aria-hidden="true">
      <defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="1.5"/><feOffset dx="0" dy="1" result="o"/>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <path filter="url(#s)" d="M13 0C6 0 0.5 5.4 0.5 12.3c0 8.9 10.4 18.8 11.2 19.6.7.7 1.8.7 2.6 0 .8-.8 11.2-10.7 11.2-19.6C25.5 5.4 20 0 13 0z" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
      <circle cx="13" cy="12" r="4.2" fill="#fff" opacity="0.95"/>
    </svg>`;
  return L.divIcon({ className: 'pin-svg', html, iconSize: [w, h], iconAnchor: [ax, ay], popupAnchor: [0, -34] });
}

/* ---------------- Очистка KML ---------------- */
function sanitizeKmlString(txt){
  return String(txt)
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/url\((['"]?)https?:\/\/mymaps\.usercontent\.google\.com\/[^)]+?\1\)/gi, 'none')
    .replace(/<\/?(?:iframe|audio|video|source|script)\b[^>]*>/gi, '');
}

/* ---------------- Карта ---------------- */
const map = L.map('map', {
  zoomControl: false,
  tap: false,
  wheelDebounceTime: 10,
  inertia: true
});
const tilesLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { subdomains:'abcd', maxZoom:20, attribution:'&copy; OpenStreetMap contributors &copy; CARTO' });
const tilesDark  = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',  { subdomains:'abcd', maxZoom:20, attribution:'&copy; OpenStreetMap contributors &copy; CARTO' });
let currentTiles = null;
function setTilesByColorScheme(){
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const next = prefersDark ? tilesDark : tilesLight;
  if (currentTiles !== next){
    if (currentTiles) map.removeLayer(currentTiles);
    next.addTo(map); currentTiles = next;
  }
}
setTilesByColorScheme();
if (window.matchMedia) {
  const mm = window.matchMedia('(prefers-color-scheme: dark)');
  if (mm.addEventListener) mm.addEventListener('change', setTilesByColorScheme);
  else if (mm.addListener) mm.addListener(setTilesByColorScheme);
}
L.control.zoom({ position:'topright' }).addTo(map);
L.control.scale({ imperial:false }).addTo(map);
L.control.locate({ position:'topright', setView:'untilPan', keepCurrentZoomLevel:true, strings:{ title:'Показать моё местоположение' } }).addTo(map);

/* ---------------- iOS: UI внутрь карты + жесты ---------------- */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
document.documentElement.classList.toggle('is-ios', !!isIOS);

if (isIOS) {
  const mapEl = document.getElementById('map');
  [
    document.getElementById('headerPanel'),
    document.getElementById('sidebar'),
    document.getElementById('fabToggleUI'),
    document.querySelector('.kml-picker')
  ].forEach(el => { if (el) mapEl.appendChild(el); });

  map.touchZoom.enable();
  map.dragging.enable();
  map.doubleClickZoom.enable();
  map.boxZoom.disable();
  map.keyboard.disable();

  ['gesturestart','gesturechange','gestureend'].forEach(t =>
    document.addEventListener(t, e => e.preventDefault(), { passive:false })
  );
}

/* ---------------- Служебное: паддинги под UI при fitBounds ---------------- */
function getFitPadding() {
  const header  = document.getElementById('headerPanel');
  const sidebar = document.getElementById('sidebar');

  const topPad   = (header  && header.offsetHeight) ? header.offsetHeight + 16 : 16;
  const rightPad = (sidebar && getComputedStyle(sidebar).display !== 'none')
    ? sidebar.offsetWidth + 16 : 16;

  return { paddingTopLeft: [16, topPad], paddingBottomRight: [rightPad, 16] };
}

/* ---------------- Состояние данных ---------------- */
let shapesLayer = null;
let markerGroup = L.layerGroup().addTo(map);
const markersById = new Map();
let boundsAll = null;
let pointFeatures = [];
let lastSummaryBase = '';

/* ---------------- Иконка из стиля/порядка ---------------- */
function computeIconId(feature, styleHrefMap){
  const p = feature.properties || {};
  const href = typeof p.styleUrl === 'string' ? (styleHrefMap[p.styleUrl] || null) : null;
  const idFromKml = idFromHref(href);
  if (idFromKml) return idFromKml;
  const seq = Number.isFinite(p._seq) ? p._seq : 0;
  return ((seq % ICONS.count) + 1);
}

/* ---------------- Рендер GeoJSON ---------------- */
function renderGeoJSON(geojson, styleHrefMap){
  const feats = Array.isArray(geojson.features) ? geojson.features : [];
  feats.forEach((f,i)=>{ f.properties = { ...(f.properties||{}), _seq:i }; });

  pointFeatures = feats.filter(f => f.geometry && f.geometry.type === 'Point');
  const shapeFeatures = feats.filter(f => !f.geometry || f.geometry.type !== 'Point');

  pointFeatures.forEach((f,pi)=>{
    const p = f.properties || {};
    p._ptSeq = pi;
    p.name = cleanText(p.name);
    p.description = stripHtmlToText(p.description);
  });

  if (shapesLayer) { try { map.removeLayer(shapesLayer); } catch(e){} }
  shapesLayer = shapeFeatures.length
    ? L.geoJSON(shapeFeatures, { style: () => ({ color:'#2563eb', weight:3, opacity:0.8 }) }).addTo(map)
    : null;

  markerGroup.clearLayers();
  markersById.clear();

  const tmp = L.geoJSON(pointFeatures, {
    pointToLayer: (feature, latlng) => {
      const hex = getStyleColor(feature, styleHrefMap);
      const marker = L.marker(latlng, { icon: svgPinIcon(hex) });

      const id = computeIconId(feature, styleHrefMap);
      const url = `${ICONS.prefix}${id}.${ICONS.ext}`;
      imageExists(url).then(ok => { if (ok) marker.setIcon(personalIcon(id)); });

      const p = feature.properties || {};
      markersById.set(p._ptSeq, marker);
      marker.featureCat = detectCategory(p);
      marker.featureProps = p;
      return marker;
    },
    onEachFeature: (feature, layer) => {
      const p = feature.properties || {};
      layer.bindPopup(makePopupHtml(p.name, p.description));
    }
  });
  tmp.eachLayer(l => markerGroup.addLayer(l));

  try {
    const group = L.featureGroup([markerGroup, shapesLayer].filter(Boolean));
    const b = group.getBounds();
    if (b.isValid()) { boundsAll = b; map.fitBounds(b, getFitPadding()); }
    else { map.setView([41.6938,44.8015], 14); }
  } catch { map.setView([41.6938,44.8015], 14); }

  updateCounters();
  buildList();
  applyVisibility();
}

/* ---------------- Подсчёт/список ---------------- */
function updateCounters(){
  const total = pointFeatures.length;
  const cats = { stairs:0, porches:0, temples:0, other:0 };
  pointFeatures.forEach(f => { cats[detectCategory(f.properties)]++; });
  document.getElementById('countTotal').textContent = total;
  lastSummaryBase = `лестницы ${cats.stairs}, парадные ${cats.porches}, храмы ${cats.temples}, остальное ${cats.other}`;
  document.getElementById('countCat').textContent = lastSummaryBase;
}
function buildList(){
  const list = document.getElementById('list');
  list.innerHTML = '';
  pointFeatures.forEach(f=>{
    const p = f.properties || {};
    const ptIdx = p._ptSeq;
    const cat = detectCategory(p);

    const item = document.createElement('div');
    item.className = 'item';
    item.dataset.cat = cat;
    item.innerHTML = `
      <h4>${escapeHtml(cleanText(p.name) || 'Без названия')}</h4>
      <div class="meta"></div>
    `;
    const meta = item.querySelector('.meta');
    const short = p.description.length > 180 ? p.description.slice(0, 180) + '…' : p.description;
    meta.textContent = `${CAT_LABEL[cat]} · ${short}`;

    item.addEventListener('click', ()=>{
      const m = markersById.get(ptIdx);
      if (!m) return;
      map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 17), { duration: .8 });
      setTimeout(()=>m.openPopup(), 850);
    });

    list.appendChild(item);
  });
}

/* ---------------- Фильтрация/видимость ---------------- */
function isMatchProps(p, activeCat, qLower){
  const cat = detectCategory(p);
  const name = cleanText(p.name).toLowerCase();
  const desc = cleanText(p.description).toLowerCase();
  const matchCat  = (activeCat === 'all') || (cat === activeCat);
  const matchText = !qLower || name.includes(qLower) || desc.includes(qLower);
  return matchCat && matchText;
}
function fitToVisible(){
  let layers = markerGroup.getLayers();

  // если вдруг ничего не добавлено в markerGroup (например, сразу после фильтров),
  // соберём все маркеры из markersById
  if (!layers.length && typeof markersById !== 'undefined' && markersById.size){
    layers = Array.from(markersById.values()).filter(m => m && typeof m.getLatLng === 'function');
  }

  if (!layers.length) return;
  const group = L.featureGroup(layers);
  const b = group.getBounds();
  if (b && b.isValid()) map.fitBounds(b, getFitPadding());
}

function applyVisibility(){
  const q = document.getElementById('search').value.trim().toLowerCase();
  const activeCatBtn = document.querySelector('.chip[data-active="true"]');
  const activeCat = activeCatBtn ? activeCatBtn.dataset.cat : 'all';

  const items = Array.from(document.querySelectorAll('#list .item'));
  items.forEach((el, idx)=>{
    const f = pointFeatures[idx];
    const p = f?.properties || {};
    const show = isMatchProps(p, activeCat, q);
    el.classList.toggle('hidden', !show);
  });

  markerGroup.clearLayers();
  let visible = 0;
  pointFeatures.forEach((f)=>{
    const p = f.properties || {};
    const show = isMatchProps(p, activeCat, q);
    if (!show) return;
    const m = markersById.get(p._ptSeq);
    if (m){ markerGroup.addLayer(m); visible++; }
  });

  const sub = document.getElementById('countCat');
  if (sub) sub.textContent = `${lastSummaryBase} · Показано: ${visible}`;
}

// Границы по ВСЕМ точкам (не только видимым)
function fitToAllPoints(){
  const layers = [];
  // приоритет — наши маркеры из markersById (все точки)
  markersById.forEach(m => { if (m && typeof m.getLatLng === 'function') layers.push(m); });

  // fallback: если по каким-то причинам пусто — обойти все слои карты
  if (!layers.length){
    map.eachLayer(l => {
      if (l instanceof L.TileLayer) return;
      if (typeof l.getLatLng === 'function') layers.push(l);
      else if (typeof l.eachLayer === 'function'){
        l.eachLayer(sl => { if (sl && typeof sl.getLatLng === 'function') layers.push(sl); });
      }
    });
  }

  if (!layers.length) return;
  const group = L.featureGroup(layers);
  const b = group.getBounds();
  if (b && b.isValid()) map.fitBounds(b, getFitPadding());
}

/* ---------------- UI ---------------- */
const searchInput = document.getElementById('search');

searchInput.addEventListener('input', ()=> { applyVisibility(); });

document.querySelectorAll('.chip').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.chip').forEach(b=>b.dataset.active='false');
    btn.dataset.active = 'true';

    // Сбрасываем поиск при смене категории
    if (searchInput.value.trim() !== '') searchInput.value = '';

    applyVisibility();
    fitToVisible();
  });
});

document.getElementById('btnShowAll').addEventListener('click', fitToVisible);


document.getElementById('btnLocate').addEventListener('click', ()=> {
  document.querySelector('.leaflet-control-locate a')?.click();
});
document.getElementById('btnToggleSidebar').addEventListener('click', ()=>{
  const sb = document.getElementById('sidebar');
  sb.style.display = (sb.style.display === 'none') ? '' : 'none';
  // при изменении ширины сайдбара — пересчитать паддинги
  setTimeout(()=>{ map.invalidateSize(); fitToVisible(); }, 0);
});
const fab = document.getElementById('fabToggleUI');
if (fab){
  fab.addEventListener('click', ()=> { document.body.classList.toggle('ui-hidden'); setTimeout(()=>{ map.invalidateSize(); fitToVisible(); }, 0); });
}
function ensureMobileUI(){
  if (window.innerWidth <= 780) document.body.classList.remove('ui-hidden');
}
ensureMobileUI();
window.addEventListener('resize', () => { map.invalidateSize(); fitToVisible(); });
setTimeout(() => map.invalidateSize(), 0);

/* ---------------- Загрузка KML ---------------- */
const kmlParam = new URLSearchParams(location.search).get('kml');
const KML_CANDIDATES = [kmlParam, './doc.kml', 'doc.kml', '../doc.kml'].filter(Boolean);

async function tryFetch(url){
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}
async function loadKmlAuto(){
  let lastErr;
  for (const url of KML_CANDIDATES){
    try {
      const raw = await tryFetch(url);
      const txt = sanitizeKmlString(raw);
      console.log('[KML] loaded from', url);
      return { txt, url };
    } catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('KML not found');
}

/* ---------------- Пикер KML (если нет файла) ---------------- */
function enableKmlPicker(){
  const bar = document.createElement('div');
  bar.className = 'panel kml-picker';
  bar.innerHTML = `
    <span>Загрузить KML:</span>
    <input type="file" id="kmlFile" class="kml-file" accept=".kml,.xml">
    <input type="text" id="kmlUrl" class="kml-url" placeholder="или URL…">
    <button class="btn kml-load-btn" id="kmlLoadBtn">Загрузить</button>
    <button class="btn kml-close-btn" id="kmlCloseBtn">Отмена</button>
  `;
  const host = document.documentElement.classList.contains('is-ios') ? document.getElementById('map') : document.body;
  host.appendChild(bar);

  bar.querySelector('#kmlFile').addEventListener('change', e=>{
    const f = e.target.files?.[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      const txt = sanitizeKmlString(String(fr.result));
      const kmlXml  = new DOMParser().parseFromString(txt,'application/xml');
      const styleHrefMap = buildStyleHrefMap(kmlXml);
      const geojson = toGeoJSON.kml(kmlXml);
      renderGeoJSON(geojson, styleHrefMap);
      bar.remove();
    };
    fr.readAsText(f);
  });
  bar.querySelector('#kmlLoadBtn').addEventListener('click', async ()=>{
    const url = bar.querySelector('#kmlUrl').value.trim();
    if (!url) return;
    try {
      const raw = await tryFetch(url);
      const txt = sanitizeKmlString(raw);
      const kmlXml  = new DOMParser().parseFromString(txt,'application/xml');
      const styleHrefMap = buildStyleHrefMap(kmlXml);
      const geojson = toGeoJSON.kml(kmlXml);
      renderGeoJSON(geojson, styleHrefMap);
      bar.remove();
    } catch(e){ alert('Не удалось загрузить по URL'); console.error(e); }
  });
  bar.querySelector('#kmlCloseBtn').addEventListener('click', ()=> bar.remove());
}

/* ---------------- Bootstrap ---------------- */
(async ()=>{
  try {
    const { txt } = await loadKmlAuto();
    const kmlXml = new DOMParser().parseFromString(txt, 'application/xml');
    const styleHrefMap = buildStyleHrefMap(kmlXml);
    const geojson = toGeoJSON.kml(kmlXml);
    renderGeoJSON(geojson, styleHrefMap);
  } catch(e){
    console.error('KML load error:', e);
    enableKmlPicker();
    map.setView([41.6938,44.8015],14);
  }
})();
