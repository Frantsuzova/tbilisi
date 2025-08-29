// app.js — Leaflet + KML → локальные icon-N.png из корня репозитория
// 1) Загружаем doc.kml (или ?kml=...).
// 2) Извлекаем из <Style>/<StyleMap> исходные href иконок, формируем список уникальных href.
// 3) Строим маппинг: href[0] → icon-1.png, href[1] → icon-2.png, ... (из корня).
// 4) Для каждой точки берём её styleUrl → href → локальный icon-N.png.
// 5) Если локального файла нет — fallback по цвету стиля.

/////////////////////// Fallback булавки ///////////////////////
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

function fallbackByColorHex(rrggbb){
  if (!rrggbb) return IconBlue;
  var c = rrggbb.toLowerCase();
  if (/^ff0000$|^cc0000$|^990000$/.test(c)) return IconRed;
  if (/^00ff00$|^009900$|^00cc00$/.test(c)) return IconGreen;
  if (/^ffa500$|^ff8c00$|^ff7f00$/.test(c)) return IconOrange;
  if (/^ffd700$/.test(c)) return IconGold;
  return IconBlue;
}

/////////////////////// Тайлы ///////////////////////
var tilesLight = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:19, attribution:'© OpenStreetMap' });
var tilesDark  = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{ maxZoom:19, attribution:'© OpenStreetMap © CARTO' });
var currentTiles = null;

/////////////////////// Карта ///////////////////////
var map = L.map('map', { zoomControl:false, preferCanvas:true });
L.control.zoom({ position:'bottomright' }).addTo(map);

// Locate
if (L.control && L.control.locate){
  L.control.locate({
    position:'bottomright',
    strings:{ title:'Где я?' },
    locateOptions:{ enableHighAccuracy:true }
  }).addTo(map);
}

function byId(id){ return document.getElementById(id); }

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

/////////////////////// Загрузка KML ///////////////////////
function loadKmlAuto(){
  var p = new URLSearchParams(location.search).get('kml');
  var candidates = []; if (p) candidates.push(p);
  candidates.push('doc.kml','./doc.kml');
  var tryOne = function(i){
    if (i>=candidates.length) return Promise.reject(new Error('KML not found'));
    return fetch(candidates[i]).then(function(res){
      if (!res.ok) throw new Error(String(res.status)+' '+res.statusText);
      return res.text();
    }).catch(function(){ return tryOne(i+1); });
  };
  return tryOne(0);
}

/////////////////////// Парсинг стилей ///////////////////////
// color из <IconStyle><color>aabbggrr</color> → rrggbb
function colorFromStyleNode(styleNode){
  try{
    var c = styleNode.querySelector('IconStyle > color, color');
    if (c && c.textContent){
      var v = c.textContent.trim();
      if (/^[0-9a-fA-F]{8}$/.test(v)){
        var rr = v.substr(6,2), gg = v.substr(4,2), bb = v.substr(2,2);
        return (rr+gg+bb).toLowerCase();
      }
    }
  }catch(_){}
  return null;
}

// возвращает href и цвет для Style (или для StyleMap → его normal-Style)
function resolveStyleInfo(node, xml){
  if (!node) return { href:'', color:null };
  var tag = (node.tagName || '').toLowerCase();
  if (tag === 'stylemap'){
    var pairs = node.querySelectorAll('Pair');
    var normal = null;
    for (var i=0;i<pairs.length;i++){
      var key = pairs[i].querySelector('key');
      if (key && /normal/i.test(key.textContent||'')) { normal = pairs[i]; break; }
    }
    if (!normal && pairs.length) normal = pairs[0];
    if (normal){
      var su = normal.querySelector('styleUrl');
      var ref = su ? (su.textContent||'').trim() : '';
      if (ref){
        var id = ref.charAt(0)==='#' ? ref.slice(1) : ref;
        var st = xml.querySelector('Style[id="'+id+'"]');
        if (st) return resolveStyleInfo(st, xml);
      }
    }
  }
  // Style
  try{
    var hrefNode = node.querySelector('IconStyle href, IconStyle > Icon > href, Icon > href');
    var href = hrefNode ? String(hrefNode.textContent||'').trim() : '';
    var color = colorFromStyleNode(node);
    return { href: href, color: color };
  }catch(_){
    return { href:'', color:null };
  }
}

// обходит все Style/StyleMap и строит:
//  - styleId → {href, color}
//  - ordered unique href list (порядок появления в файле)
function buildStyleTables(xml){
  var styleTable = new Map();   // '#id' -> {href,color}
  var hrefList = [];            // уникальные href в порядке появления

  var nodes = xml.querySelectorAll('Style,StyleMap');
  for (var i=0;i<nodes.length;i++){
    var n = nodes[i];
    var id = n.getAttribute('id');
    if (!id) continue;
    var info = resolveStyleInfo(n, xml);
    var key = '#'+id;
    styleTable.set(key, info);
    if (info.href){
      if (hrefList.indexOf(info.href) === -1) hrefList.push(info.href);
    }
  }
  return { styleTable: styleTable, hrefList: hrefList };
}

/////////////////////// Локальные icon-N.png ///////////////////////
function makeLocalIcon(index1){
  // index1 — 1..N
  var url = 'icon-' + index1 + '.png';
  // размер пользовательских PNG чаще 32–48 → ставим 40
  return L.icon({ iconUrl:url, iconSize:[40,40], iconAnchor:[20,40], popupAnchor:[0,-26] });
}

/////////////////////// Рендер ///////////////////////
var layerGroup = L.featureGroup().addTo(map);
var boundsAll = null;

function makePopupHtml(name, descHtml){
  var n = String(name||'Без названия');
  var d = String(descHtml||'')
    .replace(/<img[^>]*>/gi,' ')   // не грузим внешние <img>
    .replace(/<[^>]*>/g,' ')       // plain text
    .replace(/\s{2,}/g,' ')
    .trim();
  // простое экранирование
  n = n.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  d = d.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return '<div class="title" style="font-weight:600;margin-bottom:4px">'+n+'</div>' + (d? d : '');
}

function renderGeoJSON(geojson, styleTable, hrefList){
  if (!geojson) return;
  layerGroup.clearLayers();
  boundsAll = L.latLngBounds();

  L.geoJSON(geojson, {
    pointToLayer: function(feature, latlng){
      var props = feature && feature.properties ? feature.properties : {};
      var styleId = props.styleUrl || props.styleUrlHref || '';

      var info = styleTable && styleTable.get ? styleTable.get(styleId) : null;
      var href = info ? (info.href || '') : '';
      var colorHex = info ? info.color : null;

      // индекс href в списке уникальных (0..N-1) → локальный icon-(i+1).png
      var icon = null;
      if (href){
        var pos = hrefList.indexOf(href);
        if (pos >= 0){
          icon = makeLocalIcon(pos+1);
        }
      }
      if (!icon){
        icon = fallbackByColorHex(colorHex);
      }

      var m = L.marker(latlng, { icon: icon });
      m.bindPopup(makePopupHtml(props.name, props.description));
      boundsAll.extend(latlng);
      return m;
    }
  }).addTo(layerGroup);

  if (boundsAll.isValid()) map.fitBounds(boundsAll, getFitPadding());
  else map.setView([41.6938,44.8015],13);
}

/////////////////////// Кнопки ///////////////////////
var btnShowAll = byId('btnShowAll');
if (btnShowAll) btnShowAll.addEventListener('click', function(){
  var b = boundsAll;
  if (!b || !b.isValid()){
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
  var a = document.querySelector('.leaflet-control-locate a'); if (a) a.click();
});

var btnToggleSidebar = byId('btnToggleSidebar');
if (btnToggleSidebar) btnToggleSidebar.addEventListener('click', function(){
  var sb = byId('sidebar'); if (!sb) return;
  var disp = window.getComputedStyle(sb).display;
  sb.style.display = (disp === 'none') ? '' : 'none';
  if (boundsAll && boundsAll.isValid()) map.fitBounds(boundsAll, getFitPadding());
});

/////////////////////// Старт ///////////////////////
setTilesByColorScheme();

loadKmlAuto()
  .then(function(txt){
    var xml = new DOMParser().parseFromString(txt, 'application/xml');
    var tables = buildStyleTables(xml);
    var styleTable = tables.styleTable;
    var hrefList = tables.hrefList;     // ПОРЯДОК → icon-1.png, icon-2.png, ...

    var geojson = toGeoJSON.kml(xml);
    renderGeoJSON(geojson, styleTable, hrefList);
  })
  .catch(function(e){
    console.error('KML load error:', e);
    map.setView([41.6938,44.8015],14);
  });
