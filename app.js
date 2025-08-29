// Правки по запросу: компактный сайдбар, рабочее закрытие,
// список без описаний, убраны A/B/C и icon-17..25.

var SHADOW="https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-shadow.png";
function mkIcon(url){return L.icon({iconUrl:url,shadowUrl:SHADOW,iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34],shadowSize:[41,41]});}
var IconBlue=mkIcon("https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@v1.0/img/marker-icon-2x-blue.png");

var ICONS={prefix:'icon-',ext:'png',count:28,size:[32,32],anchor:[16,32],popupAnchor:[0,-28]};
var iconCache=new Map();
function personalIcon(id){ if(!id||id<1||id>ICONS.count) return null;
  if(iconCache.has(id)) return iconCache.get(id);
  var ic=L.icon({iconUrl:ICONS.prefix+id+'.'+ICONS.ext,iconSize:ICONS.size,iconAnchor:ICONS.anchor,popupAnchor:ICONS.popupAnchor});
  iconCache.set(id,ic); return ic;
}
var imgExistsCache=new Map();
function imageExists(url){
  if(imgExistsCache.has(url)) return imgExistsCache.get(url);
  var p=new Promise(function(res){ var im=new Image(); im.onload=function(){res(true)}; im.onerror=function(){res(false)}; im.src=url+(url.includes('?')?'&':'?')+'v='+Date.now(); })
    .then(function(ok){ imgExistsCache.set(url,ok); return ok; });
  imgExistsCache.set(url,p); return p;
}

/* --- текстовые утилы --- */
function toText(v){ if(v==null) return ''; if(typeof v==='string') return v;
  if(typeof v==='number'||typeof v==='boolean') return String(v);
  if(Array.isArray(v)) return v.map(toText).filter(Boolean).join(' ');
  if(typeof v==='object'){ var pref=['__cdata','#cdata-section','#text','text','value','content','description'];
    for(var i=0;i<pref.length;i++){ var k=pref[i]; if(k in v) return toText(v[k]); }
    return Object.keys(v).map(function(k){return toText(v[k])}).filter(Boolean).join(' ');
  } return '';
}
function cleanText(v){ var s=toText(v); return s.replace(/\[object Object\]/gi,' ').replace(/\s{2,}/g,' ').trim(); }
function stripHtmlToText(input){ var html=cleanText(input); if(!html) return '';
  var tmp=document.createElement('div'); tmp.innerHTML=html;
  tmp.querySelectorAll('img,picture,source,iframe,video,audio,svg,script,style').forEach(function(n){n.remove()});
  var t=(tmp.textContent||'').replace(/\s+\n/g,'\n').replace(/\s{2,}/g,' ').trim();
  return t.replace(/\[object Object\]/gi,'').replace(/\s{2,}/g,' ').trim();
}
function esc(s){ s=String(s==null?'':s); return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function popupHtml(name,desc){ var n=esc(cleanText(name))||'Без названия'; var d=stripHtmlToText(desc); return d?('<strong>'+n+'</strong><br>'+esc(d)):('<strong>'+n+'</strong>'); }

/* --- категории --- */
function detectCategory(p){
  var n=cleanText(p&&p.name).toLowerCase(), d=cleanText(p&&p.description).toLowerCase();
  if (/(храм|церк|собор|монастыр|кост(?:е|ё)л)/i.test(n)||/(храм|церк|собор|монастыр|кост(?:е|ё)л)/i.test(d)) return 'temples';
  if (n.indexOf('лестниц')>=0||d.indexOf('лестниц')>=0) return 'stairs';
  if (n.indexOf('парадн')>=0||d.indexOf('парадн')>=0) return 'porches';
  return 'other';
}

/* --- styleUrl → href --- */
function qText(node,sel){ var el=node?node.querySelector(sel):null; return (el&&el.textContent)?el.textContent.trim():''; }
function idFromHref(href){ if(!href) return null; var fn=href.split('?')[0].split('#')[0].split('/').pop()||""; var m=fn.match(/(?:^|[^\d])([1-9]\d{0,2})(?=\D|$)/); if(!m) return null; var n=parseInt(m[1],10); return (n>=1 && n<=ICONS.count) ? n : null; }
function buildStyleHrefMap(xml){
  var map=Object.create(null);
  xml.querySelectorAll('Style[id]').forEach(function(st){ var id=st.getAttribute('id'); var href=qText(st,'IconStyle Icon href'); if(id&&href) map['#'+id]=href; });
  xml.querySelectorAll('StyleMap[id]').forEach(function(sm){
    var id=sm.getAttribute('id'), href=null;
    var p=sm.querySelector('Pair key:contains("normal")')||sm.querySelector('Pair');
    if(p){ var su=qText(p,'styleUrl'); if(su && map[su]) href=map[su]; }
    if(!href){ var inner=qText(sm,'IconStyle Icon href'); if(inner) href=inner; }
    if(id&&href) map['#'+id]=href;
  });
  return map;
}

/* --- цвет из href --- */
function colorFromHref(href){
  if(!href) return null;
  var m=href.match(/(?:[?&#]color=)(?:0x)?([0-9a-f]{6,8})/i);
  if(m){ var hex=m[1].toLowerCase(); return '#'+(hex.length===8?hex.slice(2):hex).slice(0,6); }
  var s=href.toLowerCase();
  if(/blue|ltblu/.test(s)) return '#2b7bff';
  if(/green|grn/.test(s)) return '#2cad5b';
  if(/yellow|ylw/.test(s)) return '#f5c400';
  if(/red/.test(s)) return '#d33';
  if(/orange|ora/.test(s)) return '#ff8a00';
  return null;
}
function styleColor(feature, hrefMap){
  var p=feature.properties||{}, su=typeof p.styleUrl==='string' ? p.styleUrl : null;
  return colorFromHref(su ? hrefMap[su] : null);
}
function svgIcon(hex){
  var c=(hex||'#2b7bff').toLowerCase(), stroke='#08213a', w=26, h=40, ax=Math.round(w/2), ay=h;
  var html='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 26 40"><path d="M13 0C6 0 0.5 5.4 0.5 12.3c0 8.9 10.4 18.8 11.2 19.6.7.7 1.8.7 2.6 0 .8-.8 11.2-10.7 11.2-19.6C25.5 5.4 20 0 13 0z" fill="'+c+'" stroke="'+stroke+'" stroke-width="1"/><circle cx="13" cy="12" r="4.2" fill="#fff" opacity="0.95"/></svg>';
  return L.divIcon({className:'pin-svg',html:html,iconSize:[w,h],iconAnchor:[ax,ay],popupAnchor:[0,-34]});
}

/* --- фильтры специальных точек --- */
function isLetterPlacemark(feature, hrefMap){
  var p=feature && feature.properties ? feature.properties : {};
  var nm=String(p.name||'').trim();
  if (/^[A-Za-zА-ЯЁІЇЄҐ]$/.test(nm)) return true; // одиночная буква
  var su=typeof p.styleUrl==='string' ? p.styleUrl : '';
  var href=su ? (hrefMap[su]||'') : '';
  if(!href) return false;
  var file=(href.split('?')[0].split('#')[0].split('/').pop()||'').toLowerCase();
  if (/^([a-z])\.png$/.test(file)) return true;        // A.png и т.п.
  if (/\/paddle\/[a-z]\.png$/.test(href.toLowerCase())) return true;
  return false;
}
function isServiceIconFeature(feature, hrefMap){
  var p=feature && feature.properties ? feature.properties : {};
  var su=typeof p.styleUrl==='string' ? p.styleUrl : '';
  var href=su ? (hrefMap[su]||'') : '';
  var id=idFromHref(href);
  return id!=null && id>=17 && id<=25;
}

/* --- карта --- */
var map=L.map('map',{zoomControl:false,tap:false,wheelDebounceTime:10,inertia:true});
var tilesLight=L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20,attribution:'&copy; OpenStreetMap & CARTO'});
var tilesDark =L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' ,{subdomains:'abcd',maxZoom:20,attribution:'&copy; OpenStreetMap & CARTO'});
var curTiles=null; function setTiles(){ var dark=false; try{ if(window.matchMedia) dark=window.matchMedia('(prefers-color-scheme: dark)').matches; }catch(_){}
  var next=dark?tilesDark:tilesLight; if(curTiles!==next){ if(curTiles) map.removeLayer(curTiles); next.addTo(map); curTiles=next; } }
setTiles(); if(window.matchMedia){ var mm=window.matchMedia('(prefers-color-scheme: dark)'); if(mm.addEventListener) mm.addEventListener('change',setTiles); else if(mm.addListener) mm.addListener(setTiles); }
L.control.zoom({position:'topright'}).addTo(map);
L.control.scale({imperial:false}).addTo(map);

L.control.locate({
  position:'topright', setView:'always', keepCurrentZoomLevel:false,
  initialZoomLevel:17, flyTo:true,
  strings:{ title:'Где я?' },
  locateOptions:{ enableHighAccuracy:true, maximumAge:10000, timeout:10000 }
}).addTo(map);
map.on('locationfound', function(e){ if(e&&e.latlng){ var z=map.getZoom(); map.flyTo(e.latlng, z<17?17:z, {duration:.8}); }});

/* --- fitBounds padding --- */
function fitPadding(){
  var header=document.getElementById('headerPanel');
  var sidebar=document.getElementById('sidebar');
  var top=(header&&header.offsetHeight)? header.offsetHeight+16 : 16;
  var right=(sidebar && getComputedStyle(sidebar).display!=='none') ? sidebar.offsetWidth+16 : 16;
  return { paddingTopLeft:[16, top], paddingBottomRight:[right, 16] };
}

/* --- закрытие/высота списка --- */
function bindClose(){
  var btn=document.getElementById('btnCloseSidebar');
  var sb =document.getElementById('sidebar');
  if(btn && sb){
    btn.addEventListener('click', function(){
      sb.style.display='none';
      setTimeout(function(){ map.invalidateSize(); }, 0);
    });
  }
  // делегирование на случай другой разметки
  if(sb){
    sb.addEventListener('click', function(e){
      if (e.target.closest('.sidebar-close,[data-close-sidebar]')) {
        sb.style.display='none';
        setTimeout(function(){ map.invalidateSize(); }, 0);
      }
    });
  }
}
function adjustListHeight(){
  var sb=document.getElementById('sidebar'), list=document.getElementById('list');
  var head=sb?sb.querySelector('.sidebar-header'):null; if(!sb||!list) return;
  var rect=sb.getBoundingClientRect(), top=rect.top, h=head?head.offsetHeight:0;
  var avail=window.innerHeight - top - 12;
  list.style.maxHeight=Math.max(180, avail - h) + 'px';
}
window.addEventListener('resize', adjustListHeight);
bindClose();

/* --- данные/состояние --- */
var markerGroup=L.layerGroup().addTo(map);
var shapesLayer=null;
var markersById=new Map();
var featuresPoints=[];
var summaryBase='';

function iconIdFor(feature, hrefMap){
  var p=feature.properties||{}, href=typeof p.styleUrl==='string' ? (hrefMap[p.styleUrl]||null) : null;
  var n=idFromHref(href); if(n) return n;
  var seq=isFinite(p._seq) ? p._seq : 0;
  return ((seq % ICONS.count) + 1);
}

/* --- рендер --- */
function renderGeoJSON(geojson, hrefMap){
  var feats=Array.isArray(geojson.features)?geojson.features:[];
  feats.forEach(function(f,i){ f.properties=Object.assign({}, f.properties||{}, {_seq:i}); });

  // Только точки + вырезаем A/B/C и icon-17..25
  featuresPoints = feats.filter(function(f){
    return f.geometry && f.geometry.type==='Point'
           && !isLetterPlacemark(f, hrefMap)
           && !isServiceIconFeature(f, hrefMap);
  });
  var shapes=feats.filter(function(f){ return !f.geometry || f.geometry.type!=='Point'; });

  featuresPoints.forEach(function(f,idx){
    var p=f.properties||{};
    p._ptSeq=idx;
    p.name=cleanText(p.name);
    p.description=stripHtmlToText(p.description);
  });

  if(shapesLayer){ try{ map.removeLayer(shapesLayer); }catch(_){ } }
  shapesLayer = shapes.length ? L.geoJSON(shapes,{ style:function(){ return {color:'#2563eb', weight:3, opacity:.8}; } }).addTo(map) : null;

  markerGroup.clearLayers(); markersById.clear();

  var tmp=L.geoJSON(featuresPoints,{
    pointToLayer:function(feat,latlng){
      var hex=styleColor(feat, hrefMap);
      var m=L.marker(latlng,{icon:svgIcon(hex)});
      var id=iconIdFor(feat, hrefMap);
      imageExists(ICONS.prefix+id+'.'+ICONS.ext).then(function(ok){ if(ok) m.setIcon(personalIcon(id)); });

      var p=feat.properties||{};
      markersById.set(p._ptSeq, m);
      m.featureCat = detectCategory(p);
      m.featureProps = p;
      return m;
    },
    onEachFeature:function(feat,layer){
      var p=feat.properties||{};
      layer.bindPopup(popupHtml(p.name, p.description));
    }
  });
  tmp.eachLayer(function(l){ markerGroup.addLayer(l); });

  try{
    var group=L.featureGroup([markerGroup, shapesLayer].filter(Boolean));
    var b=group.getBounds();
    if (b.isValid()) map.fitBounds(b, fitPadding()); else map.setView([41.6938,44.8015],14);
  }catch(_){ map.setView([41.6938,44.8015],14); }

  updateCounters(); buildList(); applyVisibility(); adjustListHeight();
}

/* --- счётчики/список --- */
function updateCounters(){
  var c={stairs:0, porches:0, temples:0, other:0};
  featuresPoints.forEach(function(f){ c[detectCategory(f.properties)]++; });
  summaryBase='лестницы '+c.stairs+', парадные '+c.porches+', храмы '+c.temples+', остальное '+c.other;
  var el=document.getElementById('countCat'); if(el) el.textContent=summaryBase;
  var t=document.getElementById('countTotal'); if(t) t.textContent=featuresPoints.length;
}
function buildList(){
  var list=document.getElementById('list'); if(!list) return;
  list.className='list'; list.innerHTML='';
  featuresPoints.forEach(function(f){
    var p=f.properties||{}, idx=p._ptSeq, cat=detectCategory(p);
    var item=document.createElement('div');
    item.className='list-item'; item.dataset.cat=cat;
    item.innerHTML='<h4 class="title">'+esc(cleanText(p.name)||'Без названия')+'</h4>'; // без описаний
    item.addEventListener('click', function(){
      var m=markersById.get(idx); if(!m) return;
      map.flyTo(m.getLatLng(), Math.max(map.getZoom(),17), {duration:.8});
      setTimeout(function(){ m.openPopup(); }, 850);
    });
    list.appendChild(item);
  });
}

/* --- фильтр/видимость --- */
function match(p, cat, q){
  var c=detectCategory(p), n=cleanText(p.name).toLowerCase(), d=cleanText(p.description).toLowerCase();
  var okCat=(cat==='all')||(c===cat);
  var okText=!q || n.includes(q) || d.includes(q);
  return okCat && okText;
}
function fitToVisible(){
  var layers=markerGroup.getLayers();
  if(!layers.length && markersById.size){
    layers=Array.from(markersById.values()).filter(function(m){ return m && m.getLatLng; });
  }
  if(!layers.length) return;
  var b=L.featureGroup(layers).getBounds();
  if(b && b.isValid()) map.fitBounds(b, fitPadding());
}
function applyVisibility(){
  var qEl=document.getElementById('search'); var q=qEl? qEl.value.trim().toLowerCase() : '';
  var active=document.querySelector('.chip[data-active="true"]');
  var cat=active? active.dataset.cat : 'all';

  var items=[].slice.call(document.querySelectorAll('#list .list-item'));
  items.forEach(function(el, i){
    var p=featuresPoints[i] && featuresPoints[i].properties || {};
    var show=match(p, cat, q);
    el.classList.toggle('hidden', !show);
  });

  markerGroup.clearLayers(); var shown=0;
  featuresPoints.forEach(function(f){
    var p=f.properties||{}; if (!match(p, cat, q)) return;
    var m=markersById.get(p._ptSeq); if(m){ markerGroup.addLayer(m); shown++; }
  });
  var sub=document.getElementById('countCat');
  if(sub) sub.textContent=summaryBase+' · Показано: '+shown;
}

/* --- категории/кнопки --- */
function selectCategory(cat){
  document.querySelectorAll('.chip').forEach(function(ch){
    ch.dataset.active = (ch.dataset.cat===cat ? 'true' : 'false');
  });
  var q=document.getElementById('search'); if(q&&q.value) q.value='';
  applyVisibility(); fitToVisible();
}
var searchInput=document.getElementById('search'); if(searchInput) searchInput.addEventListener('input', applyVisibility);
document.querySelectorAll('.chip').forEach(function(btn){ btn.addEventListener('click', function(){ selectCategory(btn.dataset.cat); }); });
var btnShowAll=document.getElementById('btnShowAll'); if(btnShowAll) btnShowAll.addEventListener('click', function(){ selectCategory('all'); });
var btnLocate=document.getElementById('btnLocate'); if(btnLocate) btnLocate.addEventListener('click', function(){ var a=document.querySelector('.leaflet-control-locate a'); if(a) a.click(); });
var btnToggleSidebar=document.getElementById('btnToggleSidebar');
if(btnToggleSidebar) btnToggleSidebar.addEventListener('click', function(){
  var sb=document.getElementById('sidebar'); if(!sb) return;
  sb.style.display = (sb.style.display==='none') ? '' : 'none';
  setTimeout(function(){ adjustListHeight(); map.invalidateSize(); fitToVisible(); }, 0);
});

/* --- загрузка KML --- */
function sanitizeKmlString(txt){
  return String(txt)
   .replace(/<img\b[^>]*>/gi,'')
   .replace(/url\((['"]?)https?:\/\/mymaps\.usercontent\.google\.com\/[^)]+?\1\)/gi,'none')
   .replace(/<\/?(?:iframe|audio|video|source|script)\b[^>]*>/gi,'');
}
var kmlParam=new URLSearchParams(location.search).get('kml');
var CANDS=[kmlParam,'./doc.kml','doc.kml','../doc.kml'].filter(Boolean);
async function getKml(url){ var r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error(r.status); return r.text(); }
(async function(){
  try{
    var raw=null, last=null;
    for(var i=0;i<CANDS.length;i++){ try{ raw=await getKml(CANDS[i]); break; }catch(e){ last=e; } }
    if(!raw) throw last||new Error('no KML');
    var txt=sanitizeKmlString(raw);
    var xml=new DOMParser().parseFromString(txt,'application/xml');
    var hrefMap=buildStyleHrefMap(xml);
    var gj=toGeoJSON.kml(xml);
    renderGeoJSON(gj, hrefMap);
  }catch(e){
    console.error('KML load error', e);
    map.setView([41.6938,44.8015],14);
  }
})();
