// app.js — Leaflet + KML → локальные иконки icon-N.png в корне репо
// Что делает:
// 1) Загружает doc.kml (или ?kml=...).
// 2) Парсит <Style>/<StyleMap> и styleUrl у Placemark.
// 3) Для каждой точки подбирает локальную иконку icon-N.png (номер из имени/стиля).
//    Цвет берется из styleId/ColorStyle и влияет только на fallback-булавку.
// 4) Светлая тема тайлов на мобиле, рабочее «Показать всё», «Где я?».

/* ===== Fallback pins (если локальной icon-N.png нет / номер не найден) ===== */
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
  try{ if (window.matchMedia){ prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches; } }catch(_){}
  var next = isMobile ? tilesLight : (prefersDark ? tilesDark : tilesLight);
  if (currentTiles !== next){ if (currentTiles) map.removeLayer(currentTiles); next.addTo(map); currentTiles = next; }
}
addEventListener('resize', function(){ setTilesByColorScheme(); map.invalidateSize(); });

/* ===== Загрузка KML ===== */
function loadKmlAuto(){
  var p = new URLSearchParams(location.search).get('kml');
  var candidates = []; if (p) candidates.push(p);
  candidates.push('doc.kml','./doc.kml','data.kml','./data.kml');
  var tryOne = function(i){
    if (i>=candidates.length) return Promise.reject(new Error('KML not found'));
    return fetch(candidates[i]).then(function(res){
      if (!res.ok) throw new Error(String(res.status)+' '+res.statusText);
      return res.text();
    }).catch(function(){ return tryOne(i+1); });
  };
  return tryOne(0);
}

/* ===== Разбор <Style>/<StyleMap> для styleUrl → Style node ===== */
function buildStyleMap(xml){
  var mapHref = new Map();
  Array.prototype.forEach.call(xml.querySelectorAll('Style,StyleMap'), function(s){
    var id = s.getAttribute('id');
    if (id) mapHref.set('#'+id, s);
  });
  return mapHref;
}

/* ===== Извлечение номера и цвета из стиля / имени ===== */

// Префикс цифрами в названии точки: "12. Точка" / "12) ..." / "12 - ..."
function numFromName(name){
  if (!name) return null;
  var m = String(name).trim().match(/^(\d{1,3})[.)\s-]/);
  return m ? parseInt(m[1],10) : null;
}

// Пытаемся достать номер из href (если это уже icon-XX.png) или из style id
function numFromStyle(styleId, href){
  if (href){
    var m1 = href.match(/icon-(\d+)\.png/i);
    if (m1) return parseInt(m1[1],10);
  }
  if (styleId){
    var m2 = styleId.match(/icon-(\d+)(?:-|$)/i);
    if (m2) return parseInt(m2[1],10);
  }
  return null;
}

// Цвет из <IconStyle><color> (KML: aabbggrr) или из styleId "...-RRGGBB-..."
function colorFromStyle(styleNode, styleId){
  // <color>aabbggrr</color> → rrggbb
  try{
    var c = styleNode.querySelector('IconStyle > color, color');
    if (c && c.textContent){
      var v = c.textContent.trim();
      if (/^[0-9a-fA-F]{8}$/.test(v)){
        var aa=v.substr(0,2), bb=v.substr(2,2), gg=v.substr(4,2), rr=v.substr(6,2);
        return (rr+gg+bb).toLowerCase();
      }
    }
  }catch(_){}
  if (styleId){
    var m = styleId.match(/-([0-9a-fA-F]{6})(?:-|$)/);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

// Подбор fallback-булавки по цвету
function fallbackByColorHex(rrggbb){
  if (!rrggbb) return IconBlue;
  var c = rrggbb.toLowerCase();
  if (/^(ff|00)?0000$/.test(c)) return IconRed;       // ~красный
  if (/^00(ff|00)?00$/.test(c)) return IconGreen;     // ~зелёный
  if (/^ff(a5)?00$/.test(c) || /^ffa[0-9a-f]00$/.test(c)) return IconOrange; // оранжевый
  if (/^ffd700$/.test(c)) return IconGold;            // золото
  if (/^0288d1$|^1e88e5$|^2196f3$|^1976d2$/.test(c)) return IconBlue; // гугл-синие
  return IconBlue;
}

/* ===== Локальная иконка icon-N.png ===== */
var BLOCKED_HOST_RE = /(^|\/\/)mymaps\.usercontent\.google\.com\/hostedimage/i;

function localIconUrl(num){
  if (!num || num<1) return null;
  return "icon-" + num + ".png"; // корень репозитория
}
function makeLocalIcon(num){
  var url = localIconUrl(num);
  if (!url) return null;
  // типичный размер пользовательских png из MyMaps — 32..48. Берём 40 как усреднённое.
  return L.icon({ iconUrl:url, iconSize:[40,40], iconAnchor:[20,40], popupAnchor:[0,-26] });
}

/* ===== Преобразование в маркеры ===== */
var layerGroup = L.featureGroup().addTo(map);
var boundsAll = null;

function makePopupHtml(name, desc){
  var n = escapeHtml(String(name||'Без названия'));
  var d = String(desc||'')
    .replace(/<img[^>]*>/gi,' ')    // не тянуть внешние картинки
    .replace(/<[^>]*>/g,' ')        // plain text
    .replace(/\s{2,}/g,' ')
    .trim();
  return '<div class="title" style="font-weight:600;margin-bottom:4px">'+n+'</div>' + (d? escapeHtml(d) : '');
}

function renderGeoJSON(geojson, styleMap){
  if (!geojson) return;
  layerGroup.clearLayers();
  boundsAll = L.latLngBounds();

  L.geoJSON(geojson, {
    pointToLayer: function(feature, latlng){
      var props = feature && feature.properties ? feature.properties : {};
      var styleId = props.styleUrl || props.styleUrlHref || '';
      var sNode = styleMap && styleMap.get ? styleMap.get(styleId) : null;

      // Пытаемся вытащить номер
      var num = numFromName(props.name);
      // из href стиля
      try{
        if (!num && sNode){
          var hrefNode = sNode.querySelector('IconStyle href, Icon > href');
          var href = hrefNode ? String(hrefNode.textContent||'').trim() : '';
          if (!BLOCKED_HOST_RE.test(href)){
            var m = href.match(/icon-(\d+)\.png/i);
            if (m) num = parseInt(m[1],10);
          }
        }
      }catch(_){}
      // если всё ещё нет — из id стиля
      if (!num) num = numFromStyle(styleId, null);

      // Цвет для fallback
      var hex = colorFromStyle(sNode, styleId);

      // Выбор иконки: приоритет — локальная icon-N.png
      var icon = makeLocalIcon(num);
      if (!icon){
        icon = fallbackByColorHex(hex);
      }

      var m = L.marker(latlng, { icon:icon });
      m.bindPopup(makePopupHtml(props.name, props.description));
      boundsAll.extend(latlng);
      return m;
    }
  }).addTo(layerGroup);

  if (boundsAll.isValid()) map.fitBounds(boundsAll, getFitPadding());
  else map.setView([41.6938,44.8015],13);
}

/* ===== Фильтры (минимально, чтобы не ломать интерфейс) ===== */
var allMarkers = [];     // не используем сейчас, но сохраняем для совместимости
function applyFilters(){ /* при необходимости допишем */ }

/* ===== Кнопки ===== */
var btnShowAll = byId('btnShowAll');
if (btnShowAll) btnShowAll.addEventListener('click', function(){
  var b = boundsAll;
  if (!b || !b.isValid()){
    // как fallback — соберём с карты
    var bb = L.latLngBounds();
    map.eachLayer(function(l){
      if (l instanceof L.TileLayer) return;
      if (typeof l.getLatLng === 'function') bb.extend(l.getLatLng());
      else if (typeof l.eachLayer === 'function'){
        l.eachLayer(function(sl){ if (typeof sl.getLatLng === 'function') bb.extend(sl.getLatLng()); });
      }
    });
    b = bb;
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
  if (boundsAll && boundsAll.isValid()) map.fitBounds(boundsAll, getFitPadding());
});

/* ===== Старт ===== */
setTilesByColorScheme();

loadKmlAuto().then(function(txt){
  var xml = new DOMParser().parseFromString(txt, 'application/xml');
  var styleMap = buildStyleMap(xml);
  var geojson = toGeoJSON.kml(xml);
  renderGeoJSON(geojson, styleMap);
}).catch(function(e){
  console.error('KML load error:', e);
  map.setView([41.6938,44.8015],14);
});
