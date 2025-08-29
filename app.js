// app.js — стабильная версия без optional chaining и без шаблонных строк

/* ===== Фолбэк-иконки ===== */
var SHADOW = "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-shadow.png";
function mkIcon(url){
  return L.icon({ iconUrl:url, shadowUrl:SHADOW, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41] });
}
var IconBlue   = mkIcon("https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-blue.png");
var IconRed    = mkIcon("https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-red.png");
var IconGreen  = mkIcon("https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-green.png");
var IconOrange = mkIcon("https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-orange.png");

/* ===== Тайлы ===== */
var tilesLight = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:19, attribution:'© OpenStreetMap' });
var tilesDark  = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{ maxZoom:19, attribution:'© OpenStreetMap © CARTO' });
var currentTiles = null;

/* ===== Карта ===== */
var map = L.map('map', { zoomControl:false, preferCanvas:true });
L.control.zoom({ position:'bottomright' }).addTo(map);

/* Locate */
if (L.control && L.control.locate){
  L.control.locate({
    position:'bottomright',
    strings:{ title:'Где я?' },
    locateOptions:{ enableHighAccuracy:true }
  }).addTo(map);
}

/* ===== Утилиты ===== */
function byId(id){ return document.getElementById(id); }
function escapeHtml(s){
  s = String(s == null ? '' : s);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function getFitPadding(){
  var header  = byId('headerPanel');
  var sidebar = byId('sidebar');
  var topPad = (header && header.offsetHeight) ? header.offsetHeight + 16 : 16;
  var rightPad = 16, bottomPad = 16;
  if (sidebar && window.getComputedStyle(sidebar).display !== 'none'){
    var rect = sidebar.getBoundingClientRect();
    var isMobile = window.innerWidth <= 780;
    if (isMobile){ bottomPad = Math.round(rect.height) + 16; }
    else { rightPad = Math.round(rect.width) + 16; }
  }
  return { paddingTopLeft:[16, topPad], paddingBottomRight:[rightPad, bottomPad] };
}
function setTilesByColorScheme(){
  var isMobile = window.innerWidth <= 780;
  var prefersDark = false;
  try{
    if (window.matchMedia){ prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches; }
  }catch(_){}
  var next = isMobile ? tilesLight : (prefersDark ? tilesDark : tilesLight);
  if (currentTiles !== next){ if (currentTiles) map.removeLayer(currentTiles); next.addTo(map); currentTiles = next; }
}
function computeAllBounds(){
  var b = L.latLngBounds();
  map.eachLayer(function(l){
    if (l instanceof L.TileLayer) return;
    if (typeof l.getLatLng === 'function'){ b.extend(l.getLatLng()); return; }
    if (typeof l.getBounds === 'function'){ try{ var gb=l.getBounds(); if (gb && gb.isValid()) b.extend(gb); }catch(e){} }
    if (typeof l.eachLayer === 'function'){
      l.eachLayer(function(sl){
        if (typeof sl.getLatLng === 'function') b.extend(sl.getLatLng());
        else if (typeof sl.getBounds === 'function'){ try{ var gb2=sl.getBounds(); if (gb2 && gb2.isValid()) b.extend(gb2); }catch(e){} }
      });
    }
  });
  return b;
}

/* ===== Данные ===== */
var allItems = [];     // {name, desc, latlng, cat, marker}
var visibleItems = [];
var boundsAll = null;

function detectCat(name, desc){
  name = (name||'').toLowerCase(); desc = (desc||'').toLowerCase();
  var s = name + ' ' + desc;
  if (/(церк|собор|монастыр|church|cathedr|temple)/.test(s)) return 'temples';
  if (/(лестниц|ступен|stair)/.test(s)) return 'stairs';
  if (/(парадн|подъезд)/.test(s)) return 'porches';
  return 'other';
}

/* ===== Рендер ===== */
var layerGroup = L.featureGroup().addTo(map);
function renderList(items){
  var list = byId('list'); if (!list) return;
  var html = '';
  for (var i=0;i<items.length;i++){
    var it = items[i];
    html += '<div class="list-item" data-i="'+i+'">'
          + '<div class="title">'+escapeHtml(it.name||'Без названия')+'</div>'
          + (it.desc ? '<div>'+escapeHtml(it.desc)+'</div>' : '')
          + '</div>';
  }
  list.innerHTML = html;
  list.querySelectorAll('.list-item').forEach(function(el){
    el.addEventListener('click', function(){
      var idx = parseInt(el.getAttribute('data-i'),10);
      var it = items[idx]; if (!it) return;
      map.setView(it.latlng, 17); it.marker.openPopup();
    });
  });
}
function updateCounts(items, total){
  var ct = byId('countTotal'); var cc = byId('countCat');
  if (ct) ct.textContent = total;
  if (cc) cc.textContent = items.length;
}

/* ===== Фильтры ===== */
function currentCat(){
  var chips = document.querySelectorAll('.chip');
  for (var i=0;i<chips.length;i++){ if (chips[i].dataset && chips[i].dataset.active === 'true') return chips[i].dataset.cat || 'all'; }
  return 'all';
}
function applyFilters(){
  var cat = currentCat();
  var qel = byId('search'); var q = qel ? String(qel.value||'').trim().toLowerCase() : '';
  visibleItems = allItems.filter(function(it){
    var okCat = (cat === 'all') ? true : (it.cat === cat);
    var okText = !q || (String(it.name||'').toLowerCase().indexOf(q)>=0 || String(it.desc||'').toLowerCase().indexOf(q)>=0);
    return okCat && okText;
  });
  layerGroup.clearLayers();
  visibleItems.forEach(function(it){ it.marker.addTo(layerGroup); });
  renderList(visibleItems);
  updateCounts(visibleItems, allItems.length);
}

/* ===== Загрузка KML ===== */
function loadKmlAuto(){
  var p = new URLSearchParams(location.search).get('kml');
  var candidates = []; if (p) candidates.push(p);
  ['doc.kml','./doc.kml','data.kml','./data.kml'].forEach(function(u){ candidates.push(u); });
  var tryOne = function(i){
    if (i>=candidates.length) return Promise.reject(new Error('KML not found'));
    return fetch(candidates[i]).then(function(res){
      if (!res.ok) throw new Error(String(res.status)+' '+res.statusText);
      return res.text();
    }).catch(function(){ return tryOne(i+1); });
  };
  return tryOne(0);
}
function parsePlacemark(pm){
  var nameEl = pm.querySelector('name');
  var descEl = pm.querySelector('description');
  var name = nameEl ? nameEl.textContent.trim() : '';
  var descHtml = descEl ? descEl.textContent.trim() : '';
  var desc = descHtml.replace(/<[^>]*>/g,' ').replace(/\s{2,}/g,' ').trim();
  var coordEl = pm.querySelector('coordinates');
  var coordText = coordEl ? coordEl.textContent.trim() : '';
  var parts = coordText.split(/[\s,]+/);
  var lon = parseFloat(parts[0]); var lat = parseFloat(parts[1]);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  return { name:name, desc:desc, latlng:L.latLng(lat, lon) };
}

/* ===== Инициализация ===== */
setTilesByColorScheme();

loadKmlAuto().then(function(txt){
  var xml = new DOMParser().parseFromString(txt, 'application/xml');
  var placemarks = Array.prototype.slice.call(xml.querySelectorAll('Placemark'));
  allItems = []; boundsAll = L.latLngBounds();
  placemarks.forEach(function(pm){
    var p = parsePlacemark(pm); if (!p) return;
    var cat = detectCat(p.name, p.desc);
    var icon = (cat==='temples') ? IconOrange : (cat==='stairs' ? IconGreen : (cat==='porches' ? IconRed : IconBlue));
    var m = L.marker(p.latlng, { icon:icon });
    var html = '<div class="title" style="font-weight:600;margin-bottom:4px">'+escapeHtml(p.name||'Без названия')+'</div>'
             + (p.desc ? escapeHtml(p.desc) : '');
    m.bindPopup(html);
    allItems.push({ name:p.name, desc:p.desc, latlng:p.latlng, cat:cat, marker:m });
    boundsAll.extend(p.latlng);
  });
  applyFilters();
  if (boundsAll.isValid()) map.fitBounds(boundsAll, getFitPadding()); else map.setView([41.6938,44.8015],13);
}).catch(function(e){
  console.error('KML load error:', e);
  map.setView([41.6938,44.8015],13);
});

/* ===== События UI ===== */
document.querySelectorAll('.chip').forEach(function(ch){
  ch.addEventListener('click', function(){
    document.querySelectorAll('.chip').forEach(function(c){ c.dataset.active = 'false'; });
    ch.dataset.active = 'true';
    applyFilters();
  });
});
var searchEl = byId('search'); if (searchEl) searchEl.addEventListener('input', applyFilters);

var btnShowAll = byId('btnShowAll');
if (btnShowAll) btnShowAll.addEventListener('click', function(){
  var b;
  if (visibleItems.length){
    b = L.latLngBounds(visibleItems.map(function(i){ return i.latlng; }));
  } else {
    b = boundsAll;
  }
  if (b && b.isValid()) map.fitBounds(b, getFitPadding());
});

var btnLocate = byId('btnLocate');
if (btnLocate) btnLocate.addEventListener('click', function(){
  var a = document.querySelector('.leaflet-control-locate a');
  if (a) a.click();
});

var btnToggleSidebar = byId('btnToggleSidebar');
if (btnToggleSidebar) btnToggleSidebar.addEventListener('click', function(){
  var sb = byId('sidebar'); if (!sb) return;
  var disp = window.getComputedStyle(sb).display;
  sb.style.display = (disp === 'none') ? '' : 'none';
  var b = visibleItems.length ? L.latLngBounds(visibleItems.map(function(i){ return i.latlng; })) : boundsAll;
  if (b && b.isValid()) map.fitBounds(b, getFitPadding());
});

window.addEventListener('resize', function(){ setTilesByColorScheme(); map.invalidateSize(); });
