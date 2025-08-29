// app.js — Leaflet + toGeoJSON + LocateControl
// Без кластеров. Цвет из KML, персональные иконки, фильтры, фиксы iOS.
// Легенды нет. Храмы ищутся по «церк».

/* ------- Фолбэк-булавки (на случай отсутствия персональных PNG) ------- */
const SHADOW = "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-shadow.png";
const IconBlue   = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-blue.png",  shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });
const IconRed    = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-red.png",   shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });
const IconGreen  = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-green.png", shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });
const IconOrange = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-orange.png",shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });
const IconGold   = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-gold.png",  shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });

/* ------- ТАЙЛЫ ------- */
const tilesLight = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap'
});
const tilesDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO'
});
let currentTiles = null;

/* ------- КАРТА ------- */
const map = L.map('map', {
  zoomControl: false,
  preferCanvas: true
});
L.control.zoom({ position:'bottomright' }).addTo(map);

/* ------- Locate control ------- */
const lc = L.control.locate({
  position: 'bottomright',
  strings: { title: "Где я?" },
  locateOptions: { enableHighAccuracy:true }
}).addTo(map);

/* ------- UI ссылочки ------- */
const byId = (id)=>document.getElementById(id);

/* ------- Пэддинги под fitBounds (учёт шапки и сайдбара/нижнего листа) ------- */
function getFitPadding() {
  const header  = document.getElementById('headerPanel');
  const sidebar = document.getElementById('sidebar');

  const topPad   = (header  && header.offsetHeight) ? header.offsetHeight + 16 : 16;
  const rightPad = (sidebar && getComputedStyle(sidebar).display !== 'none'
    ? (window.innerWidth <= 780 ? 16 : Math.round(sidebar.getBoundingClientRect().width) + 16)
    : 16);
  const bottomPad = (sidebar && getComputedStyle(sidebar).display !== 'none' && window.innerWidth <= 780)
    ? Math.round(sidebar.getBoundingClientRect().height) + 16
    : 16;

  return { paddingTopLeft: [16, topPad], paddingBottomRight: [rightPad, bottomPad] };
}

/* ------- Тема тайлов: на мобиле всегда светлая ------- */
function setTilesByColorScheme(){
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const next = prefersDark ? tilesDark : tilesLight;
  if (currentTiles !== next){
    if (currentTiles) map.removeLayer(currentTiles);
    next.addTo(map); currentTiles = next;
  }
}

/* ------- Геометрия/иконки из KML ------- */
function iconByStyleHref(href){
  const h = (href || '').toLowerCase();
  if (h.includes('green')) return IconGreen;
  if (h.includes('orange') || h.includes('yellow')) return IconOrange;
  if (h.includes('gold')) return IconGold;
  if (h.includes('red')) return IconRed;
  return IconBlue;
}

/* ------- Простейшие утилиты ------- */
const toText = (v)=>{
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(toText).join(' ');
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object'){
    const prefer = ['text', 'value', 'content', 'description'];
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
  const descText = escapeHtml(stripHtmlToText(description));
  return `<div class="popup"><div class="title">${nameText}</div>${descText? `<div class="desc">${descText}</div>`:''}</div>`;
}

/* ------- Рендер GeoJSON ------- */
let layerGroup = L.featureGroup().addTo(map);
let boundsAll = null;

function renderGeoJSON(geojson, styleHrefMap){
  if (!geojson) return;
  layerGroup.clearLayers();
  boundsAll = L.latLngBounds();

  const getStyleHref = (feat)=>{
    const id = feat?.properties?.styleUrl || feat?.properties?.styleUrlHref || '';
    return id || '';
  };

  L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => {
      const href = getStyleHref(feature);
      const icon = iconByStyleHref(href);
      const m = L.marker(latlng, { icon });
      const p = feature?.properties || {};
      m.bindPopup(makePopupHtml(p.name, p.description), { autoPan:true, closeButton:true });
      boundsAll.extend(latlng);
      return m;
    }
  }).addTo(layerGroup);

  if (boundsAll.isValid()){
    map.fitBounds(boundsAll, getFitPadding());
  } else {
    map.setView([41.6938, 44.8015], 13);
  }
}

/* ------- Кнопки шапки ------- */
document.getElementById('btnShowAll').addEventListener('click', ()=>{
  if (boundsAll && boundsAll.isValid()) map.fitBounds(boundsAll, getFitPadding());
});
document.getElementById('btnLocate').addEventListener('click', ()=> {
  document.querySelector('.leaflet-control-locate a')?.click();
});
document.getElementById('btnToggleSidebar')?.addEventListener('click', ()=>{
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  const disp = getComputedStyle(sb).display;
  sb.style.display = (disp === 'none') ? '' : 'none';
  // пересчёт паддингов для карты
  const bounds = (boundsAll && boundsAll.isValid()) ? boundsAll : computeAllBounds();
  if (bounds && bounds.isValid()) map.fitBounds(bounds, getFitPadding());
});

/* ------- Resize ------- */
addEventListener('resize', () => { map.invalidateSize(); fitToVisible(); });
setTimeout(() => map.invalidateSize(), 0);

/* ---------------- Загрузка KML ---------------- */
const kmlParam = new URLSearchParams(location.search).get('kml');
const KML_CANDIDATES = [kmlParam, './doc.kml', 'doc.kml', './data.kml', 'data.kml'].filter(Boolean);

async function loadKmlAuto(){
  let lastErr = null;
  for (const url of KML_CANDIDATES){
    try{
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      return { txt: await res.text(), url };
    }catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('KML not found');
}

function buildStyleHrefMap(xml){
  const mapHref = new Map();
  xml.querySelectorAll('Style,StyleMap').forEach(s => {
    const id = s.getAttribute('id');
    if (id) mapHref.set('#'+id, s);
  });
  return mapHref;
}

/* ------- Панель выбора KML (fallback) ------- */
function enableKmlPicker(){
  if (document.querySelector('.kml-picker')) return;
  const wrap = document.createElement('div');
  wrap.className = 'kml-picker panel';
  wrap.style.right = '12px';
  wrap.style.top = '12px';
  wrap.style.padding = '10px';
  wrap.innerHTML = `
    <div style="font-weight:600;margin-bottom:8px">Загрузить KML</div>
    <input type="file" accept=".kml,.xml" />
  `;
  document.body.appendChild(wrap);
  wrap.querySelector('input').addEventListener('change', async (e)=>{
    const f = e.target.files?.[0];
    if (!f) return;
    const txt = await f.text();
    const kmlXml = new DOMParser().parseFromString(txt, 'application/xml');
    const styleHrefMap = buildStyleHrefMap(kmlXml);
    const geojson = toGeoJSON.kml(kmlXml);
    renderGeoJSON(geojson, styleHrefMap);
  });
}

/* ------- Вычислить границы всех видимых слоёв (если нужно) ------- */
function computeAllBounds(){
  const b = L.latLngBounds();
  map.eachLayer(l => {
    if (l instanceof L.TileLayer) return;
    if (l && typeof l.getLatLng === 'function') {
      b.extend(l.getLatLng());
    } else if (l && typeof l.getBounds === 'function') {
      try { const gb = l.getBounds(); if (gb && gb.isValid()) b.extend(gb); } catch(_) {}
    } else if (l && typeof l.eachLayer === 'function') {
      l.eachLayer(sl => {
        if (sl && typeof sl.getLatLng === 'function') { b.extend(sl.getLatLng()); }
        else if (sl && typeof sl.getBounds === 'function') {
          try { const gb = sl.getBounds(); if (gb && gb.isValid()) b.extend(gb); } catch(_) {}
        }
      });
    }
  });
  return b;
}

function fitToVisible(){
  const b = computeAllBounds();
  if (b && b.isValid()) map.fitBounds(b, getFitPadding());
}

/* ------- Патч для загрузки PNG-иконок из <IconStyle> ------- */
async function preloadImage(url){
  return new Promise(res=>{
    const im = new Image();
    im.onload = ()=> res(true);
    im.onerror = ()=> res(false);
    im.src = url;
  });
}

function styleIconFromKmlNode(styleNode){
  try{
    const href = styleNode?.querySelector('IconStyle href')?.textContent?.trim();
    if (!href) return null;
    const size = styleNode?.querySelector('IconStyle scale')?.textContent?.trim();
    const scl = size ? Math.max(0.5, Math.min(2, +size)) : 1;
    return L.icon({ iconUrl: href, iconSize:[24*scl, 24*scl], iconAnchor:[12*scl, 24*scl], popupAnchor:[0,-20*scl], shadowUrl: SHADOW, shadowSize:[41,41] });
  }catch{ return null; }
}

/* ------- Старт ------- */
setTilesByColorScheme();

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
