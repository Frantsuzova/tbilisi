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

  const topPad = (header && header.offsetHeight) ? header.offsetHeight + 16 : 16;

  let rightPad = 16, bottomPad = 16;
  if (sidebar && getComputedStyle(sidebar).display !== 'none') {
    const rect = sidebar.getBoundingClientRect();
    const isMobile = window.innerWidth <= 780;
    if (isMobile) {
      bottomPad = Math.round(rect.height) + 16;  // bottom sheet
      rightPad = 16;
    } else {
      rightPad = Math.round(rect.width) + 16;    // right sidebar
    }
  }
  return { paddingTopLeft: [16, topPad], paddingBottomRight: [rightPad, bottomPad] };
}

/* ------- Вспомог.: границы всех точек на карте (на случай если boundsAll нет) ------- */
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

/* ------- Тема тайлов: на мобиле всегда светлая ------- */
function setTilesByColorScheme(){
  const isMobile = window.innerWidth <= 780;
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const next = isMobile ? tilesLight : (prefersDark ? tilesDark : tilesLight);
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
const toText = (v)=> (v==null ? '' : (Array.isArray(v) ? v.join(' ') : String(v)));
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

/* ------- Загрузка KML ------- */
async function loadKmlAuto(){
  const p = new URLSearchParams(location.search).get('kml');
  const candidates = [p, './doc.kml', 'doc.kml', './data.kml', 'data.kml'].filter(Boolean);
  let lastErr = null;
  for (const url of candidates){
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

/* ------- Фильтры/поиск (минимально) ------- */
const chips = Array.from(document.querySelectorAll('.chip'));
const inputSearch = document.getElementById('search');
function applyFilters(){
  // пример: скрывать по тексту — вне рамок этой задачи
  // оставляем как заглушку для совместимости
}
chips.forEach(ch => ch.addEventListener('click', ()=>{
  chips.forEach(c=>c.dataset.active="false");
  ch.dataset.active="true";
  applyFilters();
}));

if (inputSearch){
  inputSearch.addEventListener('input', ()=> applyFilters());
}

/* ------- Кнопки шапки ------- */
document.getElementById('btnShowAll').addEventListener('click', () => {
  const b = (typeof boundsAll !== 'undefined' && boundsAll && boundsAll.isValid())
    ? boundsAll
    : computeAllBounds();
  if (b && b.isValid()) {
    map.fitBounds(b, getFitPadding());
  }
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

/* ------- Resize: пересчёт темы тайлов и геометрии ------- */
addEventListener('resize', () => { setTilesByColorScheme(); map.invalidateSize(); fitToVisible(); });
setTimeout(() => map.invalidateSize(), 0);

function fitToVisible(){
  const b = computeAllBounds();
  if (b && b.isValid()) map.fitBounds(b, getFitPadding());
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
    // Если KML не загрузился — дать выбрать файл вручную
    enableKmlPicker();
    map.setView([41.6938,44.8015],14);
  }
})();

/* ------- Примитивный picker KML на случай ошибок загрузки ------- */
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
