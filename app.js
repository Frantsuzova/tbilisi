// app.js — Leaflet + toGeoJSON + LocateControl
// «Где я?» зумирует близко (17), кнопка «Показать всё» эквивалент чипу «Все».
// Без optional chaining.

/* ------- Фолбэк-булавки ------- */
var SHADOW = "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-shadow.png";
function mkIcon(url){
  return L.icon({
    iconUrl:url, shadowUrl:SHADOW,
    iconSize:[25,41], iconAnchor:[12,41],
    popupAnchor:[1,-34], shadowSize:[41,41]
  });
}
var IconBlue   = mkIcon("https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-blue.png");
var IconRed    = mkIcon("https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-red.png");
var IconGreen  = mkIcon("https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-green.png");
var IconOrange = mkIcon("https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-orange.png");
var IconGold   = mkIcon("https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-gold.png");

/* ------- Персональные PNG и кеш ------- */
var ICONS = { prefix:'icon-', ext:'png', count:28, size:[32,32], anchor:[16,32], popupAnchor:[0,-28] };
var iconCache = new Map();
function personalIcon(id){
  if (!id || id < 1 || id > ICONS.count) return null;
  if (iconCache.has(id)) return iconCache.get(id);
  var ic = L.icon({ iconUrl: ICONS.prefix + id + '.' + ICONS.ext, iconSize: ICONS.size, iconAnchor: ICONS.anchor, popupAnchor: ICONS.popupAnchor });
  iconCache.set(id, ic); return ic;
}
var imgExistsCache = new Map();
function imageExists(url){
  if (imgExistsCache.has(url)) return imgExistsCache.get(url);
  var p = new Promise(function(res){
    var im = new Image();
    im.onload = function(){ res(true); };
    im.onerror = function(){ res(false); };
    im.src = url + (url.indexOf('?')>=0 ? '&' : '?') + 'v=' + Date.now();
  }).then(function(ok){ imgExistsCache.set(url, ok); return ok; });
  imgExistsCache.set(url, p); return p;
}

/* ------- Текст/HTML нормализация ------- */
function toText(v){
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(' ');
  if (typeof v === 'object') {
    var prefer = ['__cdata','#cdata-section','#text','text','value','content','description'];
    for (var i=0;i<prefer.length;i++){
      var k = prefer[i]; if (k in v) return toText(v[k]);
    }
    return Object.keys(v).map(function(k){ return toText(v[k]); }).filter(Boolean).join(' ');
  }
  return '';
}
function cleanText(v){
  var s = toText(v);
  s = s.replace(/\[object Object\]/gi, ' ');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}
function stripHtmlToText(input) {
  var html = cleanText(input);
  if (!html) return '';
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  var rm = tmp.querySelectorAll('img, picture, source, iframe, video, audio, svg, script, style');
  for (var i=0;i<rm.length;i++) rm[i].remove();
  var t = (tmp.textContent || '').replace(/\s+\n/g, '\n').replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/\[object Object\]/gi, '').replace(/\s{2,}/g, ' ').trim();
  return t;
}
function escapeHtml(s) {
  s = String(s == null ? '' : s);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function makePopupHtml(name, description) {
  var nameText = escapeHtml(cleanText(name)) || 'Без названия';
  var descText = stripHtmlToText(description);
  return descText ? '<strong>'+nameText+'</strong><br>'+escapeHtml(descText)
                  : '<strong>'+nameText+'</strong>';
}

/* ------- Категории ------- */
function detectCategory(p){
  var name = cleanText(p && p.name).toLowerCase();
  var desc = cleanText(p && p.description).toLowerCase();
  if (/(храм|церк|собор|монастыр|кост(?:е|ё)л)/i.test(name) || /(храм|церк|собор|монастыр|кост(?:е|ё)л)/i.test(desc)) return 'temples';
  if (name.indexOf('лестниц')>=0 || desc.indexOf('лестниц')>=0) return 'stairs';
  if (name.indexOf('парадн')>=0  || desc.indexOf('парадн')>=0)  return 'porches';
  return 'other';
}
var CAT_LABEL = { stairs:"Лестницы", porches:"Парадные", temples:"Храмы", other:"Остальное" };

/* ------- styleUrl → href (для цвета/иконки) ------- */
function qText(node, selector){
  var el = node ? node.querySelector(selector) : null;
  return (el && el.textContent) ? el.textContent.trim() : '';
}
function idFromHref(href){
  if (!href) return null;
  var fn = href.split('?')[0].split('#')[0].split('/').pop() || "";
  var m = fn.match(/(?:^|[^\d])([1-9]\d{0,2})(?=\D|$)/);
  if (!m) return null;
  var n = parseInt(m[1],10);
  return (n>=1 && n<=ICONS.count) ? n : null;
}
function buildStyleHrefMap(kmlXml){
  var byId = Object.create(null);
  var styles = kmlXml.querySelectorAll('Style[id]');
  for (var i=0;i<styles.length;i++){
    var st = styles[i];
    var id = st.getAttribute('id');
    var href = qText(st, 'IconStyle Icon href');
    if (id && href) byId['#'+id] = href;
  }
  var maps = kmlXml.querySelectorAll('StyleMap[id]');
  for (var j=0;j<maps.length;j++){
    var sm = maps[j];
    var id2 = sm.getAttribute('id');
    var href2 = null;
    var pairs = sm.querySelectorAll('Pair');
    var target = null;
    for (var k=0;k<pairs.length;k++){
      var key = qText(pairs[k], 'key');
      if (/normal/i.test(key)) { target = pairs[k]; break; }
    }
    if (!target && pairs.length) target = pairs[0];
    if (target){
      var su = qText(target, 'styleUrl');
      if (su && byId[su]) href2 = byId[su];
    }
    if (!href2){
      var innerHref = qText(sm, 'IconStyle Icon href');
      if (innerHref) href2 = innerHref;
    }
    if (id2 && href2) byId['#'+id2] = href2;
  }
  return byId;
}

/* ------- Цвет из href + SVG-пин ------- */
function extractHexFromHref(href){
  if (!href) return null;
  var m = href.match(/(?:[?&#]color=)(?:0x)?([0-9a-fA-F]{6,8})/);
  if (m) {
    var hex = m[1].toLowerCase();
    return '#' + (hex.length === 8 ? hex.slice(2) : hex).replace(/^([0-9a-f]{6}).*$/,'$1');
  }
  return null;
}
function guessNamedColorFromHref(href){
  if (!href) return null;
  var s = href.toLowerCase();
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
  var p = (feature && feature.properties) || {};
  var styleUrl = typeof p.styleUrl === 'string' ? p.styleUrl : null;
  var href = styleUrl ? (styleHrefMap[styleUrl] || null) : null;
  var hex = extractHexFromHref(href);
  if (hex) return hex;
  hex = guessNamedColorFromHref(href);
  if (hex) return hex;
  return null;
}
function svgPinIcon(hex){
  var fill = (hex || '#2b7bff').toLowerCase();
  var stroke = '#08213a';
  var w = 26, h = 40, ax = Math.round(w/2), ay = h;
  var html =
    '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 26 40" aria-hidden="true">'+
      '<defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%">'+
        '<feGaussianBlur in="SourceAlpha" stdDeviation="1.5"/><feOffset dx="0" dy="1" result="o"/>'+
        '<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'+
      '<path filter="url(#s)" d="M13 0C6 0 0.5 5.4 0.5 12.3c0 8.9 10.4 18.8 11.2 19.6.7.7 1.8.7 2.6 0 .8-.8 11.2-10.7 11.2-19.6C25.5 5.4 20 0 13 0z" fill="'+fill+'" stroke="'+stroke+'" stroke-width="1"/>'+
      '<circle cx="13" cy="12" r="4.2" fill="#fff" opacity="0.95"/>'+
    '</svg>';
  return L.divIcon({ className: 'pin-svg', html: html, iconSize: [w, h], iconAnchor: [ax, ay], popupAnchor: [0, -34] });
}

/* ------- Очистка KML ------- */
function sanitizeKmlString(txt){
  return String(txt)
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/url\((['"]?)https?:\/\/mymaps\.usercontent\.google\.com\/[^)]+?\1\)/gi, 'none')
    .replace(/<\/?(?:iframe|audio|video|source|script)\b[^>]*>/gi, '');
}

/* ------- Карта ------- */
var map = L.map('map', {
  zoomControl: false,
  tap: false,
  wheelDebounceTime: 10,
  inertia: true
});
var tilesLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { subdomains:'abcd', maxZoom:20, attribution:'&copy; OpenStreetMap contributors &copy; CARTO' });
var tilesDark  = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',  { subdomains:'abcd', maxZoom:20, attribution:'&copy; OpenStreetMap contributors &copy; CARTO' });
var currentTiles = null;
function setTilesByColorScheme(){
  var prefersDark = false;
  try{ if (window.matchMedia){ prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches; } }catch(_){}
  var next = prefersDark ? tilesDark : tilesLight;
  if (currentTiles !== next){ if (currentTiles) map.removeLayer(currentTiles); next.addTo(map); currentTiles = next; }
}
setTilesByColorScheme();
if (window.matchMedia) {
  var mm = window.matchMedia('(prefers-color-scheme: dark)');
  if (mm.addEventListener) mm.addEventListener('change', setTilesByColorScheme);
  else if (mm.addListener) mm.addListener(setTilesByColorScheme);
}
L.control.zoom({ position:'topright' }).addTo(map);
L.control.scale({ imperial:false }).addTo(map);

// LocateControl: зум близко + плавный перелёт
L.control.locate({
  position: 'topright',
  setView: 'always',
  keepCurrentZoomLevel: false,
  initialZoomLevel: 17,   // можно 18
  flyTo: true,
  strings: { title: 'Где я?' },
  locateOptions: { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
}).addTo(map);

// Подстраховка: если initialZoomLevel не применился
map.on('locationfound', function(e){
  if (e && e.latlng) {
    var targetZoom = 17;
    var z = map.getZoom();
    map.flyTo(e.latlng, z < targetZoom ? targetZoom : z, { duration: 0.8 });
  }
});

/* ------- iOS: UI внутрь карты + жесты ------- */
var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
document.documentElement.classList.toggle('is-ios', !!isIOS);

if (isIOS) {
  var mapEl = document.getElementById('map');
  var moveEls = [
    document.getElementById('headerPanel'),
    document.getElementById('sidebar'),
    document.getElementById('fabToggleUI'),
    document.querySelector('.kml-picker')
  ];
  for (var mi=0; mi<moveEls.length; mi++){ if (moveEls[mi]) mapEl.appendChild(moveEls[mi]); }

  map.touchZoom.enable();
  map.dragging.enable();
  map.doubleClickZoom.enable();
  map.boxZoom.disable();
  map.keyboard.disable();

  ['gesturestart','gesturechange','gestureend'].forEach(function(t){
    document.addEventListener(t, function(e){ e.preventDefault(); }, { passive:false });
  });
}

/* ------- Паддинги под UI при fitBounds ------- */
function getFitPadding() {
  var header  = document.getElementById('headerPanel');
  var sidebar = document.getElementById('sidebar');
  var topPad   = (header  && header.offsetHeight) ? header.offsetHeight + 16 : 16;
  var rightPad = (sidebar && getComputedStyle(sidebar).display !== 'none') ? sidebar.offsetWidth + 16 : 16;
  return { paddingTopLeft: [16, topPad], paddingBottomRight: [rightPad, 16] };
}

/* ------- Состояние данных ------- */
var shapesLayer = null;
var markerGroup = L.layerGroup().addTo(map);
var markersById = new Map();
var boundsAll = null;
var pointFeatures = [];
var lastSummaryBase = '';

/* ------- Иконка из стиля/порядка ------- */
function computeIconId(feature, styleHrefMap){
  var p = feature && feature.properties ? feature.properties : {};
  var href = typeof p.styleUrl === 'string' ? (styleHrefMap[p.styleUrl] || null) : null;
  var idFromKml = idFromHref(href);
  if (idFromKml) return idFromKml;
  var seq = isFinite(p._seq) ? p._seq : 0;
  return ((seq % ICONS.count) + 1);
}

/* ------- Рендер GeoJSON ------- */
function renderGeoJSON(geojson, styleHrefMap){
  var feats = Array.isArray(geojson.features) ? geojson.features : [];
  feats.forEach(function(f,i){ f.properties = Object.assign({}, f.properties||{}, { _seq:i }); });

  pointFeatures = feats.filter(function(f){ return f.geometry && f.geometry.type === 'Point'; });
  var shapeFeatures = feats.filter(function(f){ return !f.geometry || f.geometry.type !== 'Point'; });

  pointFeatures.forEach(function(f,pi){
    var p = f.properties || {};
    p._ptSeq = pi;
    p.name = cleanText(p.name);
    p.description = stripHtmlToText(p.description);
  });

  if (shapesLayer) { try { map.removeLayer(shapesLayer); } catch(e){} }
  shapesLayer = shapeFeatures.length
    ? L.geoJSON(shapeFeatures, { style: function(){ return { color:'#2563eb', weight:3, opacity:0.8 }; } }).addTo(map)
    : null;

  markerGroup.clearLayers();
  markersById.clear();

  var tmp = L.geoJSON(pointFeatures, {
    pointToLayer: function(feature, latlng){
      var hex = getStyleColor(feature, styleHrefMap);
      var marker = L.marker(latlng, { icon: svgPinIcon(hex) });

      var id = computeIconId(feature, styleHrefMap);
      var url = ICONS.prefix + id + '.' + ICONS.ext;
      imageExists(url).then(function(ok){ if (ok) marker.setIcon(personalIcon(id)); });

      var p = feature.properties || {};
      markersById.set(p._ptSeq, marker);
      marker.featureCat = detectCategory(p);
      marker.featureProps = p;
      return marker;
    },
    onEachFeature: function(feature, layer){
      var p = feature.properties || {};
      layer.bindPopup(makePopupHtml(p.name, p.description));
    }
  });
  tmp.eachLayer(function(l){ markerGroup.addLayer(l); });

  try {
    var group = L.featureGroup([markerGroup, shapesLayer].filter(Boolean));
    var b = group.getBounds();
    if (b.isValid()) { boundsAll = b; map.fitBounds(b, getFitPadding()); }
    else { map.setView([41.6938,44.8015], 14); }
  } catch(e) { map.setView([41.6938,44.8015], 14); }

  updateCounters();
  buildList();
  applyVisibility();
}

/* ------- Подсчёт/список ------- */
function updateCounters(){
  var total = pointFeatures.length;
  var cats = { stairs:0, porches:0, temples:0, other:0 };
  pointFeatures.forEach(function(f){ cats[detectCategory(f.properties)]++; });
  var elT = document.getElementById('countTotal'); if (elT) elT.textContent = total;
  lastSummaryBase = 'лестницы '+cats.stairs+', парадные '+cats.porches+', храмы '+cats.temples+', остальное '+cats.other;
  var elC = document.getElementById('countCat'); if (elC) elC.textContent = lastSummaryBase;
}
function buildList(){
  var list = document.getElementById('list'); if (!list) return;
  list.innerHTML = '';
  pointFeatures.forEach(function(f){
    var p = f.properties || {};
    var ptIdx = p._ptSeq;
    var cat = detectCategory(p);

    var item = document.createElement('div');
    item.className = 'item';
    item.dataset.cat = cat;
    var short = p.description.length > 180 ? p.description.slice(0, 180) + '…' : p.description;
    item.innerHTML = '<h4>'+escapeHtml(cleanText(p.name) || 'Без названия')+'</h4><div class="meta"></div>';
    var meta = item.querySelector('.meta');
    if (meta) meta.textContent = (CAT_LABEL[cat] || '') + ' · ' + short;

    item.addEventListener('click', function(){
      var m = markersById.get(ptIdx);
      if (!m) return;
      map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 17), { duration: .8 });
      setTimeout(function(){ m.openPopup(); }, 850);
    });

    list.appendChild(item);
  });
}

/* ------- Фильтрация/видимость ------- */
function isMatchProps(p, activeCat, qLower){
  var cat = detectCategory(p);
  var name = cleanText(p.name).toLowerCase();
  var desc = cleanText(p.description).toLowerCase();
  var matchCat  = (activeCat === 'all') || (cat === activeCat);
  var matchText = !qLower || name.indexOf(qLower)>=0 || desc.indexOf(qLower)>=0;
  return matchCat && matchText;
}
function fitToVisible(){
  var layers = markerGroup.getLayers();
  if (!layers.length && typeof markersById !== 'undefined' && markersById.size){
    layers = Array.from(markersById.values()).filter(function(m){ return m && typeof m.getLatLng === 'function'; });
  }
  if (!layers.length) return;
  var group = L.featureGroup(layers);
  var b = group.getBounds();
  if (b && b.isValid()) map.fitBounds(b, getFitPadding());
}
function applyVisibility(){
  var qEl = document.getElementById('search');
  var q = qEl ? qEl.value.trim().toLowerCase() : '';
  var activeCatBtn = document.querySelector('.chip[data-active="true"]');
  var activeCat = activeCatBtn ? activeCatBtn.dataset.cat : 'all';

  var items = Array.prototype.slice.call(document.querySelectorAll('#list .item'));
  items.forEach(function(el, idx){
    var f = pointFeatures[idx];
    var p = f && f.properties ? f.properties : {};
    var show = isMatchProps(p, activeCat, q);
    if (show) el.classList.remove('hidden'); else el.classList.add('hidden');
  });

  markerGroup.clearLayers();
  var visible = 0;
  pointFeatures.forEach(function(f){
    var p = f.properties || {};
    var show = isMatchProps(p, activeCat, q);
    if (!show) return;
    var m = markersById.get(p._ptSeq);
    if (m){ markerGroup.addLayer(m); visible++; }
  });

  var sub = document.getElementById('countCat');
  if (sub) sub.textContent = lastSummaryBase + ' · Показано: ' + visible;
}

/* ------- ЕДИНЫЙ ВЫБОР КАТЕГОРИИ ------- */
function selectCategory(cat){
  var chips = document.querySelectorAll('.chip');
  for (var i=0;i<chips.length;i++){
    var ch = chips[i];
    ch.dataset.active = (ch.dataset.cat === cat ? 'true' : 'false');
  }
  var q = document.getElementById('search');
  if (q && q.value) q.value = '';
  applyVisibility();
  fitToVisible();
}

/* ------- UI ------- */
var searchInput = document.getElementById('search');
if (searchInput) searchInput.addEventListener('input', function(){ applyVisibility(); });

var chipBtns = document.querySelectorAll('.chip');
for (var cb=0; cb<chipBtns.length; cb++){
  (function(btn){
    btn.addEventListener('click', function(){ selectCategory(btn.dataset.cat); });
  })(chipBtns[cb]);
}

// «Показать всё» — эквивалент чипа «Все»
var btnShowAll = document.getElementById('btnShowAll');
if (btnShowAll) btnShowAll.addEventListener('click', function(){ selectCategory('all'); });

// «Где я?» — кликаем по контролу
var btnLocate = document.getElementById('btnLocate');
if (btnLocate) btnLocate.addEventListener('click', function(){
  var a = document.querySelector('.leaflet-control-locate a');
  if (a) a.click();
});

var btnToggleSidebar = document.getElementById('btnToggleSidebar');
if (btnToggleSidebar) btnToggleSidebar.addEventListener('click', function(){
  var sb = document.getElementById('sidebar'); if (!sb) return;
  sb.style.display = (sb.style.display === 'none') ? '' : 'none';
  setTimeout(function(){ map.invalidateSize(); fitToVisible(); }, 0);
});

var fab = document.getElementById('fabToggleUI');
if (fab){
  fab.addEventListener('click', function(){
    document.body.classList.toggle('ui-hidden');
    setTimeout(function(){ map.invalidateSize(); fitToVisible(); }, 0);
  });
}
function ensureMobileUI(){
  if (window.innerWidth <= 780) document.body.classList.remove('ui-hidden');
}
ensureMobileUI();
window.addEventListener('resize', function(){ map.invalidateSize(); fitToVisible(); });
setTimeout(function(){ map.invalidateSize(); }, 0);

/* ------- Загрузка KML ------- */
var kmlParam = new URLSearchParams(location.search).get('kml');
var KML_CANDIDATES = [kmlParam, './doc.kml', 'doc.kml', '../doc.kml'].filter(Boolean);

async function tryFetch(url){
  var r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP '+r.status+' '+url);
  return r.text();
}
async function loadKmlAuto(){
  var lastErr;
  for (var i=0;i<KML_CANDIDATES.length;i++){
    var url = KML_CANDIDATES[i];
    try{
      var raw = await tryFetch(url);
      var txt = sanitizeKmlString(raw);
      console.log('[KML] loaded from', url);
      return { txt: txt, url: url };
    }catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('KML not found');
}

/* ------- Пикер KML (если нет файла) ------- */
function enableKmlPicker(){
  var bar = document.createElement('div');
  bar.className = 'panel kml-picker';
  bar.innerHTML =
    '<span>Загрузить KML:</span>'+
    '<input type="file" id="kmlFile" class="kml-file" accept=".kml,.xml">'+
    '<input type="text" id="kmlUrl" class="kml-url" placeholder="или URL…">'+
    '<button class="btn kml-load-btn" id="kmlLoadBtn">Загрузить</button>'+
    '<button class="btn kml-close-btn" id="kmlCloseBtn">Отмена</button>';
  var host = document.documentElement.classList.contains('is-ios') ? document.getElementById('map') : document.body;
  host.appendChild(bar);

  var fileEl = bar.querySelector('#kmlFile');
  if (fileEl) fileEl.addEventListener('change', function(e){
    var f = fileEl.files && fileEl.files[0]; if (!f) return;
    var fr = new FileReader();
    fr.onload = function(){
      var txt = sanitizeKmlString(String(fr.result));
      var kmlXml  = new DOMParser().parseFromString(txt,'application/xml');
      var styleHrefMap = buildStyleHrefMap(kmlXml);
      var geojson = toGeoJSON.kml(kmlXml);
      renderGeoJSON(geojson, styleHrefMap);
      bar.remove();
    };
    fr.readAsText(f);
  });

  var loadBtn = bar.querySelector('#kmlLoadBtn');
  if (loadBtn) loadBtn.addEventListener('click', async function(){
    var urlEl = bar.querySelector('#kmlUrl');
    var url = urlEl ? urlEl.value.trim() : '';
    if (!url) return;
    try{
      var raw = await tryFetch(url);
      var txt = sanitizeKmlString(raw);
      var kmlXml  = new DOMParser().parseFromString(txt,'application/xml');
      var styleHrefMap = buildStyleHrefMap(kmlXml);
      var geojson = toGeoJSON.kml(kmlXml);
      renderGeoJSON(geojson, styleHrefMap);
      bar.remove();
    }catch(e){ alert('Не удалось загрузить по URL'); console.error(e); }
  });

  var closeBtn = bar.querySelector('#kmlCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', function(){ bar.remove(); });
}

/* ------- Bootstrap ------- */
(async function(){
  try{
    var load = await loadKmlAuto();
    var kmlXml = new DOMParser().parseFromString(load.txt, 'application/xml');
    var styleHrefMap = buildStyleHrefMap(kmlXml);
    var geojson = toGeoJSON.kml(kmlXml);
    renderGeoJSON(geojson, styleHrefMap);
  }catch(e){
    console.error('KML load error:', e);
    enableKmlPicker();
    map.setView([41.6938,44.8015],14);
  }
})();
