// Полностью самодостаточный JS без троеточий.
// Делает: загрузка KML -> маркеры -> список, поиск, простая категоризация для чипов,
// принудительно светлые тайлы на мобиле, "Показать всё", "Где я?".

/* ===== Фолбэк-иконки ===== */
const SHADOW = "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-shadow.png";
const IconBlue   = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-blue.png",  shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });
const IconRed    = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-red.png",   shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });
const IconGreen  = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-green.png", shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });
const IconOrange = L.icon({ iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-orange.png",shadowUrl: SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });

/* ===== Тайлы ===== */
const tilesLight = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:19, attribution:'&copy; OpenStreetMap' });
const tilesDark  = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{ maxZoom:19, attribution:'&copy; OpenStreetMap &copy; CARTO' });
let currentTiles = null;

/* ===== Карта ===== */
const map = L.map('map',{ zoomControl:false, preferCanvas:true });
L.control.zoom({ position:'bottomright' }).addTo(map);

const lc = L.control.locate({
  position: 'bottomright',
  strings: { title: 'Где я?' },
  locateOptions: { enableHighAccuracy:true }
}).addTo(map);

/* ===== Хелперы ===== */
const $ = (sel,root=document)=>root.querySelector(sel);
const $$ = (sel,root=document)=>Array.from(root.querySelectorAll(sel));
const byId = (id)=>document.getElementById(id);

function getFitPadding() {
  const header  = byId('headerPanel');
  const sidebar = byId('sidebar');
  const topPad = (header && header.offsetHeight) ? header.offsetHeight + 16 : 16;

  let rightPad = 16, bottomPad = 16;
  if (sidebar && getComputedStyle(sidebar).display !== 'none') {
    const rect = sidebar.getBoundingClientRect();
    const isMobile = window.innerWidth <= 780;
    if (isMobile) { bottomPad = Math.round(rect.height) + 16; }
    else { rightPad = Math.round(rect.width) + 16; }
  }
  return { paddingTopLeft:[16, topPad], paddingBottomRight:[rightPad, bottomPad] };
}

function setTilesByColorScheme(){
  const isMobile = window.innerWidth <= 780;
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const next = isMobile ? tilesLight : (prefersDark ? tilesDark : tilesLight);
  if (currentTiles !== next){ if (currentTiles) map.removeLayer(currentTiles); next.addTo(map); currentTiles = next; }
}

function computeAllBounds(){
  const b = L.latLngBounds();
  map.eachLayer(l => {
    if (l instanceof L.TileLayer) return;
    if (typeof l.getLatLng === 'function') b.extend(l.getLatLng());
    else if (typeof l.getBounds === 'function') { try{ const gb=l.getBounds(); if (gb?.isValid()) b.extend(gb); }catch{} }
    else if (typeof l.eachLayer === 'function') {
      l.eachLayer(sl => {
        if (typeof sl.getLatLng === 'function') b.extend(sl.getLatLng());
        else if (typeof sl.getBounds === 'function') { try{ const gb=sl.getBounds(); if (gb?.isValid()) b.extend(gb); }catch{} }
      });
    }
  });
  return b;
}

/* ===== Данные/состояние ===== */
let allItems = [];     // {id, name, desc, latlng, cat, marker}
let visibleItems = []; // линза после фильтров
let boundsAll = null;
const catOrder = ['all','stairs','porches','temples','other'];

/* грубая категоризация по тексту (допущение!) */
function detectCat(name='', desc=''){
  const s = (name + ' ' + desc).toLowerCase();
  if (/(церк|собор|монастыр|church|cathedr|temple)/.test(s)) return 'temples';
  if (/(лестниц|ступен|stair)/.test(s)) return 'stairs';
  if (/(парадн|подъезд)/.test(s)) return 'porches';
  return 'other';
}

/* ===== Рендер ===== */
const layerGroup = L.featureGroup().addTo(map);

function renderList(items){
  const list = byId('list'); if (!list) return;
  list.innerHTML = '';
  for (const it of items){
    const el = document.createElement('div');
    el.className = 'list-item';
    el.innerHTML = `<div class="title">${escapeHtml(it.name || 'Без названия')}</div>${it.desc? `<div>${escapeHtml(it.desc)}</div>`:''}`;
    el.addEventListener('click', ()=> { map.setView(it.latlng, 17); it.marker.openPopup(); });
    list.appendChild(el);
  }
}

function updateCounts(items, total){
  const ct = byId('countTotal'); const cc = byId('countCat');
  if (ct) ct.textContent = total;
  if (cc) cc.textContent = items.length;
}

function escapeHtml(s=''){ return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;'); }

/* ===== Загрузка KML ===== */
async function loadKmlAuto(){
  const p = new URLSearchParams(location.search).get('kml');
  const candidates = [p, './doc.kml', 'doc.kml', './data.kml', 'data.kml'].filter(Boolean);
  let lastErr = null;
  for (const url of candidates){
    try{ const res = await fetch(url); if (!res.ok) throw new Error(res.status+' '+res.statusText); return await res.text(); }
    catch(e){ lastErr=e; }
  }
  throw lastErr || new Error('KML not found');
}

function parsePlacemark(pm){
  const name = (pm.querySelector('name')?.textContent || '').trim();
  const descHtml = (pm.querySelector('description')?.textContent || '').trim();
  const desc = descHtml.replace(/<[^>]*>/g,' ').replace(/\s{2,}/g,' ').trim();
  const coordText = pm.querySelector('coordinates')?.textContent?.trim() || '';
  const [lon,lat] = coordText.split(/[\s,]+/).map(Number);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  return { name, desc, latlng: L.latLng(lat, lon) };
}

/* ===== Применение фильтров ===== */
function applyFilters(){
  const activeCat = ($$('.chip').find(c=>c.dataset.active==='true')?.dataset.cat) || 'all';
  const q = (byId('search')?.value || '').trim().toLowerCase();

  visibleItems = allItems.filter(it=>{
    const okCat = (activeCat==='all' ? true : it.cat===activeCat);
    const okText = !q || (String(it.name||'').toLowerCase().includes(q) || String(it.desc||'').toLowerCase().includes(q));
    return okCat && okText;
  });

  // показать/скрыть маркеры
  layerGroup.clearLayers();
  for (const it of visibleItems){ it.marker.addTo(layerGroup); }

  renderList(visibleItems);
  updateCounts(visibleItems, allItems.length);
}

/* ===== Start ===== */
setTilesByColorScheme();

(async ()=>{
  try{
    const txt = await loadKmlAuto();
    const xml = new DOMParser().parseFromString(txt, 'application/xml');
    const placemarks = Array.from(xml.querySelectorAll('Placemark'));
    allItems = [];
    boundsAll = L.latLngBounds();

    for (const pm of placemarks){
      const p = parsePlacemark(pm); if (!p) continue;
      const cat = detectCat(p.name, p.desc);
      const icon = (cat==='temples') ? IconOrange : (cat==='stairs' ? IconGreen : (cat==='porches' ? IconRed : IconBlue));
      const m = L.marker(p.latlng, { icon }).bindPopup(
        `<div class="title" style="font-weight:600;margin-bottom:4px">${escapeHtml(p.name||'Без названия')}</div>${p.desc? escapeHtml(p.desc):''}`
      );
      boundsAll.extend(p.latlng);
      allItems.push({ ...p, cat, marker:m });
    }

    // начальная отрисовка
    applyFilters();

    if (boundsAll.isValid()) map.fitBounds(boundsAll, getFitPadding());
    else map.setView([41.6938, 44.8015], 13);

  }catch(e){
    console.error('KML load error:', e);
    map.setView([41.6938,44.8015],14);
  }
})();

/* ===== UI ===== */
$$('.chip').forEach(ch => ch.addEventListener('click', ()=>{
  $$('.chip').forEach(c=>c.dataset.active='false');
  ch.dataset.active='true';
  applyFilters();
}));

byId('search')?.addEventListener('input', applyFilters);

byId('btnShowAll')?.addEventListener('click', ()=>{
  // по видимым; если пусто — по всем
  const b = (visibleItems.length ? L.latLngBounds(visibleItems.map(i=>i.latlng)) : boundsAll);
  if (b && b.isValid()) map.fitBounds(b, getFitPadding());
});

byId('btnLocate')?.addEventListener('click', ()=> { document.querySelector('.leaflet-control-locate a')?.click(); });

byId('btnToggleSidebar')?.addEventListener('click', ()=>{
  const sb = byId('sidebar'); if (!sb) return;
  sb.style.display = (getComputedStyle(sb).display === 'none') ? '' : 'none';
  const b = visibleItems.length ? L.latLngBounds(visibleItems.map(i=>i.latlng)) : boundsAll;
  if (b && b.isValid()) map.fitBounds(b, getFitPadding());
});

/* пересчёт темы/геометрии при ресайзе */
addEventListener('resize', ()=>{ setTilesByColorScheme(); map.invalidateSize(); });

/* утилиты */
function escapeHtml(s=''){ return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;'); }
