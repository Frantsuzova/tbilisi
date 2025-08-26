// ---------- Фолбэк-булавки ----------
const SHADOW = "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-shadow.png";
const IconBlue   = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-blue.png",   shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });
const IconRed    = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-red.png",    shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });
const IconGreen  = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-green.png",  shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });
const IconYellow = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-yellow.png", shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });

// ---------- Персональные PNG ----------
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

// ---------- Нормализация текста ----------
function toText(v){
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(' ');
  if (typeof v === 'object') {
    const prefer = ['__cdata', '#cdata-section', '#text', 'text', 'value', 'content'];
    for (const k of prefer) if (k in v) return toText(v[k]);
    const parts = [];
    for (const x of Object.values(v)) {
      const s = toText(x);
      if (s) parts.push(s);
    }
    return parts.join(' ');
  }
  return '';
}
function cleanText(v){
  const s = toText(v).trim();
  return (s === '[object Object]') ? '' : s.replace(/\[object Object\]/g, '').trim();
}
function stripHtmlToText(input) {
  const html = cleanText(input);
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  tmp.querySelectorAll('img, picture, source, iframe, video, audio, svg, script, style').forEach(el => el.remove());
  return (tmp.textContent || '').replace(/\s+\n/g, '\n').replace(/\s{2,}/g, ' ').trim();
}
function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}

// ---------- Категории/иконки ----------
function detectCategory(p){
  const name = cleanText(p?.name).toLowerCase();
  const desc = cleanText(p?.description).toLowerCase();
  if (name.includes('лестниц') || desc.includes('лестниц')) return 'stairs';
  if (name.includes('парадн')  || desc.includes('парадн'))  return 'porches';
  if (name.includes('обсерватор') || name.includes('apollo') || name.includes('аполло')) return 'special';
  return 'other';
}
const CAT_LABEL = { stairs:"Лестницы", porches:"Парадные", special:"Особые", other:"Прочее" };

// ---------- Стили из KML ----------
const HREF_TO_ID = Object.create(null);
function idFromHref(href){
  if (!href) return null;
  if (HREF_TO_ID[href]) return HREF_TO_ID[href];
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

// ---------- Очистка KML от внешних IMG ----------
function sanitizeKmlString(txt){
  return String(txt)
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/url\((['"]?)https?:\/\/mymaps\.usercontent\.google\.com\/[^)]+?\1\)/gi, 'none')
    .replace(/<\/?(?:iframe|audio|video|source|script)\b[^>]*>/gi, '');
}
function makePopupHtml(name, description) {
  const nameText = escapeHtml(cleanText(name)) || 'Без названия';
  const descText = stripHtmlToText(description);
  return descText ? `<strong>${nameText}</strong><br>${escapeHtml(descText)}`
                  : `<strong>${nameText}</strong>`;
}

// ---------- Карта ----------
const map = L.map('map', { zoomControl:false });
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

// ---------- Данные/слои ----------
let geoLayer = null;
const markersById = new Map();
let boundsAll = null;
let allFeatures = [];

function computeIconId(feature, styleHrefMap){
  const p = feature.properties || {};
  const href = typeof p.styleUrl === 'string' ? (styleHrefMap[p.styleUrl] || null) : null;
  const idFromKml = idFromHref(href);
  if (idFromKml) return idFromKml;
  const seq = Number.isFinite(p._seq) ? p._seq : 0;
  return ((seq % ICONS.count) + 1);
}

function renderGeoJSON(geojson, styleHrefMap){
  if (Array.isArray(geojson.features)) {
    geojson.features.forEach((f,i)=>{ f.properties = { ...(f.properties||{}), _seq:i }; });
  }
  allFeatures = geojson.features || [];

  // Нормализуем свойства сразу
  allFeatures.forEach(f=>{
    const p = f.properties || {};
    p.name = cleanText(p.name);
    p.description = stripHtmlToText(p.description);
  });

  geoLayer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => {
      const marker = L.marker(latlng, { icon: IconBlue });
      const id = computeIconId(feature, styleHrefMap);
      const url = `${ICONS.prefix}${id}.${ICONS.ext}`;
      imageExists(url).then(ok => { if (ok) marker.setIcon(personalIcon(id)); });
      markersById.set(feature.properties._seq, marker);
      marker.featureCat = detectCategory(feature.properties);
      marker.featureProps = feature.properties;
      return marker;
    },
    onEachFeature: (feature, layer) => {
      const p = feature.properties || {};
      layer.bindPopup(makePopupHtml(p.name, p.description));
    }
  }).addTo(map);

  try { boundsAll = geoLayer.getBounds(); if (boundsAll.isValid()) map.fitBounds(boundsAll, { padding:[20,20] }); }
  catch { map.setView([41.6938,44.8015], 14); }

  updateCounters();
  buildList();
  buildLegend();
}

// ---------- UI ----------
function updateCounters(){
  const total = allFeatures.length;
  const cats = { stairs:0, porches:0, special:0, other:0 };
  allFeatures.forEach(f => { cats[detectCategory(f.properties)]++; });
  document.getElementById('countTotal').textContent = total;
  document.getElementById('countCat').textContent =
    `лестницы ${cats.stairs}, парадные ${cats.porches}, особые ${cats.special}, прочее ${cats.other}`;
}

function buildLegend(){
  const el = document.getElementById('legend');
  el.innerHTML = '';
  const items = [
    { label:'Лестницы', icon: IconGreen.options.iconUrl },
    { label:'Парадные', icon: IconRed.options.iconUrl },
    { label:'Особые',   icon: IconYellow.options.iconUrl },
    { label:'Прочее',   icon: IconBlue.options.iconUrl },
  ];
  items.forEach(it=>{
    const box = document.createElement('div');
    box.className = 'legend';
    box.innerHTML = `<img src="${it.icon}" alt=""><span>${it.label}</span>`;
    el.appendChild(box);
  });
}

function buildList(){
  const list = document.getElementById('list');
  list.innerHTML = '';
  allFeatures.forEach(f=>{
    const p = f.properties || {};
    const seq = p._seq;
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
      const m = markersById.get(seq);
      if (!m) return;
      map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 17), { duration: .8 });
      setTimeout(()=>m.openPopup(), 850);
    });

    list.appendChild(item);
  });
  applyVisibility();
}

function applyVisibility(){
  const q = document.getElementById('search').value.trim().toLowerCase();
  const activeCatBtn = document.querySelector('.chip[data-active="true"]');
  const activeCat = activeCatBtn ? activeCatBtn.dataset.cat : 'all';

  const list = Array.from(document.querySelectorAll('#list .item'));
  list.forEach(el=>{
    const cat = el.dataset.cat;
    const name = el.querySelector('h4').textContent.toLowerCase();
    const meta = el.querySelector('.meta').textContent.toLowerCase();
    const matchCat = activeCat==='all' || cat===activeCat;
    const matchText = !q || name.includes(q) || meta.includes(q);
    el.classList.toggle('hidden', !(matchCat && matchText));
  });

  markersById.forEach((marker)=>{
    const p = marker.featureProps || {};
    const cat = marker.featureCat || 'other';
    const name = cleanText(p.name).toLowerCase();
    const desc = cleanText(p.description).toLowerCase();
    const matchCat = activeCat==='all' || cat===activeCat;
    const matchText = !q || name.includes(q) || desc.includes(q);
    const shouldShow = matchCat && matchText;
    if (shouldShow){
      if (!geoLayer.hasLayer(marker)) geoLayer.addLayer(marker);
    } else {
      if (geoLayer.hasLayer(marker)) geoLayer.removeLayer(marker);
    }
  });
}

// Кнопки/фильтры
document.getElementById('search').addEventListener('input', applyVisibility);
document.querySelectorAll('.chip').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.chip').forEach(b=>b.dataset.active='false');
    btn.dataset.active = 'true';
    applyVisibility();
  });
});
document.getElementById('btnShowAll').addEventListener('click', ()=>{
  if (boundsAll && boundsAll.isValid()) map.fitBounds(boundsAll, { padding:[20,20] });
});
document.getElementById('btnLocate').addEventListener('click', ()=> {
  document.querySelector('.leaflet-control-locate a')?.click();
});
document.getElementById('btnToggleSidebar').addEventListener('click', ()=>{
  const sb = document.getElementById('sidebar');
  sb.style.display = (sb.style.display === 'none') ? '' : 'none';
});

// ---------- Загрузка KML ----------
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

// Пикер KML (без инлайна)
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
  document.body.appendChild(bar);

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

// Bootstrap
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
