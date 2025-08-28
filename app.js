/* ===================== app.js (фикс иконок + без 404) ===================== */

/* --- базовые утилиты --- */
const toText = v => v == null ? '' :
  Array.isArray(v) ? v.map(toText).join(' ') :
  typeof v === 'object' ? Object.values(v).map(toText).join(' ') : String(v);

const clean = s => toText(s).replace(/\[object Object\]/gi, ' ').replace(/\s{2,}/g, ' ').trim();
const escapeHtml = s => String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
const stripHtmlToText = html => {
  const d = document.createElement('div'); d.innerHTML = clean(html);
  d.querySelectorAll('img,picture,source,iframe,video,audio,svg,script,style').forEach(el=>el.remove());
  return (d.textContent||'').replace(/\s+\n/g,'\n').replace(/\s{2,}/g,' ').trim();
};
const popupHtml = (name, desc) => {
  const n = escapeHtml(clean(name)) || 'Без названия';
  const t = stripHtmlToText(desc);
  return t ? `<strong>${n}</strong><br>${escapeHtml(t)}` : `<strong>${n}</strong>`;
};

/* --- категории для фильтра --- */
const CAT_LABEL = { stairs:'Лестницы', porches:'Парадные', temples:'Храмы', other:'Остальное' };
function detectCat(p){
  const n = clean(p?.name).toLowerCase();
  const d = clean(p?.description).toLowerCase();
  if (/(храм|церк|собор|монастыр|кост(?:е|ё)л)/.test(n) || /(храм|церк|собор|монастыр|кост(?:е|ё)л)/.test(d)) return 'temples';
  if (n.includes('лестниц') || d.includes('лестниц')) return 'stairs';
  if (n.includes('парадн')  || d.includes('парадн'))  return 'porches';
  return 'other';
}

/* --- KML sanitation --- */
const sanitizeKmlString = txt => String(txt)
  .replace(/<img\b[^>]*>/gi,'')
  .replace(/url\((['"]?)https?:\/\/mymaps\.usercontent\.google\.com\/[^)]+?\1\)/gi,'none')
  .replace(/<\/?(?:iframe|audio|video|source|script)\b[^>]*>/gi,'');

/* --- парс цвета из KML --- */
function kmlColorToHex(s){
  if(!s) return null; s=String(s).trim().replace(/^0x/i,'').toLowerCase();
  if(s.length!==8 && s.length!==6) return null;
  let aa='ff', bb, gg, rr;
  if(s.length===8){ aa=s.slice(0,2); bb=s.slice(2,4); gg=s.slice(4,6); rr=s.slice(6,8); }
  else { rr=s.slice(0,2); gg=s.slice(2,4); bb=s.slice(4,6); }
  return '#'+rr+gg+bb;
}
const hexFromHref = href => {
  const m = href && href.match(/(?:[?&#]color=)(?:0x)?([0-9a-fA-F]{6,8})/);
  return m ? kmlColorToHex(m[1]) : null;
};
const namedHexFromHref = href => {
  if(!href) return null; const s=href.toLowerCase();
  if(/(yellow|ylw)/.test(s)) return '#f5c400';
  if(/(green|grn)/.test(s))  return '#2cad5b';
  if(/(blue|blu|ltblue|ltblu)/.test(s)) return '#2b7bff';
  if(/(orange|ora)/.test(s)) return '#ff8a00';
  if(/(red|_rd\b|-red|red-)/.test(s)) return '#d33';
  if(/(violet|purple)/.test(s)) return '#8a5cff';
  if(/(gray|grey|gry)/.test(s)) return '#7a7a7a';
  if(/black/.test(s)) return '#111111';
  if(/(white|wht)/.test(s)) return '#ffffff';
  return null;
};

/* --- извлечение стилей из KML --- */
function buildStyleMaps(kml){
  const styles = Object.create(null), orderIdx = Object.create(null); let i=0;
  kml.querySelectorAll('Style[id],StyleMap[id]').forEach(el=>{
    const id=el.getAttribute('id'); if(id && !orderIdx['#'+id]) orderIdx['#'+id]=++i;
  });

  // Style
  kml.querySelectorAll('Style[id]').forEach(st=>{
    const key='#'+st.getAttribute('id'); if(!styles[key]) styles[key]={};
    const href=st.querySelector('IconStyle Icon href')?.textContent?.trim()||null;
    const iconHex=kmlColorToHex(st.querySelector('IconStyle color')?.textContent?.trim());
    const lineHex=kmlColorToHex(st.querySelector('LineStyle color')?.textContent?.trim());
    const width=parseFloat(st.querySelector('LineStyle width')?.textContent||'')||undefined;
    const polyHex=kmlColorToHex(st.querySelector('PolyStyle color')?.textContent?.trim());
    if(href) styles[key].iconHref=href;
    styles[key].iconHex = iconHex || hexFromHref(href) || namedHexFromHref(href) || styles[key].iconHex;
    if(lineHex) styles[key].lineHex=lineHex;
    if(polyHex) styles[key].polyHex=polyHex;
    if(width)   styles[key].width=width;
  });

  // StyleMap (normal)
  kml.querySelectorAll('StyleMap[id]').forEach(sm=>{
    const key='#'+sm.getAttribute('id'); if(!styles[key]) styles[key]={};
    const pairs=[...sm.querySelectorAll('Pair')];
    const normal=pairs.find(p=> (p.querySelector('key')?.textContent?.trim()||'')==='normal')||pairs[0];
    if(normal){
      let su=normal.querySelector('styleUrl')?.textContent?.trim()||null;
      if(su && !su.startsWith('#')) su='#'+su;
      if(su && styles[su]) styles[key]={...styles[su],...styles[key]};
    }
    const href=sm.querySelector('IconStyle Icon href')?.textContent?.trim()||null;
    const iconHex=kmlColorToHex(sm.querySelector('IconStyle color')?.textContent?.trim());
    const lineHex=kmlColorToHex(sm.querySelector('LineStyle color')?.textContent?.trim());
    const width=parseFloat(sm.querySelector('LineStyle width')?.textContent||'')||undefined;
    const polyHex=kmlColorToHex(sm.querySelector('PolyStyle color')?.textContent?.trim());
    if(href) styles[key].iconHref=href;
    styles[key].iconHex = iconHex || hexFromHref(href) || namedHexFromHref(href) || styles[key].iconHex;
    if(lineHex) styles[key].lineHex=lineHex;
    if(polyHex) styles[key].polyHex=polyHex;
    if(width)   styles[key].width=width;
  });

  return {styles, orderIdx};
}
const normStyleUrl = su => (su ? (su.startsWith('#')?su:'#'+su) : null);

/* --- карта --- */
const ICON_SIZE = [32,32];
const BASE = location.pathname.replace(/\/[^/]*$/,''); // '/tbilisi' на GitHub Pages
const ICON_MAX = 28;                                    // у тебя icon-1.png … icon-28.png

const map = L.map('map',{zoomControl:false,tap:false,wheelDebounceTime:10,inertia:true});
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  {subdomains:'abcd',maxZoom:20,attribution:'&copy; OpenStreetMap &copy; CARTO'}).addTo(map);
L.control.zoom({position:'topright'}).addTo(map);
L.control.scale({imperial:false}).addTo(map);
L.control.locate({position:'topright', setView:'untilPan', keepCurrentZoomLevel:true, strings:{title:'Показать моё местоположение'}}).addTo(map);

function headerH(){ const h=document.getElementById('headerPanel')?.offsetHeight||0; document.documentElement.style.setProperty('--header-h',`${h+12}px`); }
function fitPad(){
  const header=document.getElementById('headerPanel'); const sidebar=document.getElementById('sidebar');
  const top=(header?.offsetHeight||0)+16; const right=(getComputedStyle(sidebar||document.body).display!=='none')?(sidebar.offsetWidth+16):16;
  return {paddingTopLeft:[16,top], paddingBottomRight:[right,16]};
}
headerH();

/* --- иконки --- */
const isLetterish = href => /(waypoint|letters?[-_/]|dir[-_]|direction|route|track[-_]|letter[-_a-z]*\.png)/i.test(href||'');

const iconSvgPin  = hex => {
  const w=26,h=40,ax=Math.round(w/2),ay=h;
  const html=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 26 40">
    <path d="M13 0C6 0 0.5 5.4 0.5 12.3c0 8.9 10.4 18.8 11.2 19.6.7.7 1.8.7 2.6 0 .8-.8 11.2-10.7 11.2-19.6C25.5 5.4 20 0 13 0z" fill="${(hex||'#2b7bff')}" stroke="#08213a" stroke-width="1"/>
    <circle cx="13" cy="12" r="4.2" fill="#fff" opacity="0.95"/></svg>`;
  return L.divIcon({className:'pin-svg', html, iconSize:[w,h], iconAnchor:[w/2,h], popupAnchor:[0,-30]});
};
const iconLocal = n => L.icon({ iconUrl: `${BASE}/icon-${n}.png`, iconSize: ICON_SIZE, iconAnchor:[ICON_SIZE[0]/2, ICON_SIZE[1]/2], popupAnchor:[0,-16] });
const iconRemote = href => L.icon({ iconUrl: href, iconSize: ICON_SIZE, iconAnchor:[ICON_SIZE[0]/2, ICON_SIZE[1]], popupAnchor:[0,-18] });

/* --- состояние --- */
let styleMaps=null, shapesLayer=null, markerGroup=L.layerGroup().addTo(map), markersById=new Map(), pointFeatures=[], boundsAll=null;
let lastSummaryBase='';

/* --- стили геометрий --- */
function styleForShape(props){
  const st=styleMaps && styleMaps.styles[normStyleUrl(props?.styleUrl)];
  const color=st?.lineHex || st?.polyHex || '#2563eb';
  const weight=st?.width || 3;
  return { color, weight, opacity:0.9, fillColor:st?.polyHex||color, fillOpacity:0.2 };
}

/* --- рендер --- */
function chooseMarkerIconByStyle(st){
  const href = st?.iconHref || '';
  // 1) если href содержит icon-N.png → используем локальный icon-N.png из корня
  const m = href.match(/icon-(\d+)\.png/i);
  if (m) {
    const n = parseInt(m[1],10);
    if (Number.isFinite(n) && n>=1 && n<=ICON_MAX) return iconLocal(n);
  }
  // 2) если «буквенные/служебные» — не подменяем, но если это абсолютный URL, отдадим оригинал
  if (href && /^https?:\/\//i.test(href) && !isLetterish(href)) return iconRemote(href);
  // 3) фолбэк — цветной пин из цвета KML/URL
  const hex = st?.iconHex || hexFromHref(href) || namedHexFromHref(href) || '#2b7bff';
  return iconSvgPin(hex);
}

async function renderGeoJSON(geojson){
  const feats=Array.isArray(geojson.features)?geojson.features:[];
  feats.forEach((f,i)=>{ f.properties={...(f.properties||{}), _seq:i}; });

  pointFeatures = feats.filter(f=>f.geometry?.type==='Point');
  const shapeFeatures = feats.filter(f=>f.geometry && f.geometry.type!=='Point');

  if(shapesLayer){ try{ map.removeLayer(shapesLayer); }catch{} }
  shapesLayer = shapeFeatures.length ? L.geoJSON(shapeFeatures,{style:(ft)=>styleForShape(ft.properties||{})}).addTo(map) : null;

  markerGroup.clearLayers(); markersById.clear();

  const layer=L.geoJSON(pointFeatures,{
    pointToLayer:(feature,latlng)=>{
      const p=feature.properties||{}; const su=normStyleUrl(p.styleUrl);
      const st = styleMaps?.styles[su] || {};
      const icon = chooseMarkerIconByStyle(st);
      const m=L.marker(latlng,{icon});
      markersById.set(p._seq,m);
      m.featureCat=detectCat(p);
      m.featureProps=p;
      return m;
    },
    onEachFeature:(feature,layer)=>{
      const p=feature.properties||{}; layer.bindPopup(popupHtml(p.name,p.description));
    }
  });
  layer.eachLayer(l=>markerGroup.addLayer(l));

  try{
    const g=L.featureGroup([markerGroup,shapesLayer].filter(Boolean));
    const b=g.getBounds(); if(b.isValid()){ boundsAll=b; map.fitBounds(b,fitPad()); } else { map.setView([41.6938,44.8015],14); }
  }catch{ map.setView([41.6938,44.8015],14); }

  updateCounters(); buildList(); applyFilter();
}

/* --- счётчики и список --- */
function updateCounters(){
  const cats={stairs:0,porches:0,temples:0,other:0};
  pointFeatures.forEach(f=>{ cats[detectCat(f.properties)]++; });
  document.getElementById('countTotal').textContent=pointFeatures.length;
  lastSummaryBase=`лестницы ${cats.stairs}, парадные ${cats.porches}, храмы ${cats.temples}, остальное ${cats.other}`;
  document.getElementById('countCat').textContent=lastSummaryBase;
}
function buildList(){
  const list=document.getElementById('list'); list.innerHTML='';
  pointFeatures.forEach(f=>{
    const p=f.properties||{}; const title=escapeHtml(clean(p.name)||'Без названия');
    const desc=stripHtmlToText(p.description||''); const short=desc.length>180?desc.slice(0,180)+'…':desc;
    const item=document.createElement('div'); item.className='item'; item.dataset.cat=detectCat(p);
    item.innerHTML=`<h4>${title}</h4><div class="meta"></div>`;
    item.querySelector('.meta').textContent=`${CAT_LABEL[item.dataset.cat]} · ${short}`;
    item.addEventListener('click',()=>{
      const m=markersById.get(p._seq); if(!m)return;
      map.flyTo(m.getLatLng(),Math.max(map.getZoom(),17),{duration:.8}); setTimeout(()=>m.openPopup(),820);
    });
    list.appendChild(item);
  });
}
function pass(p,active,q){
  const cat=detectCat(p); const name=clean(p.name).toLowerCase(), d=clean(p.description).toLowerCase();
  return ((active==='all')||(cat===active)) && (!q||name.includes(q)||d.includes(q));
}
function applyFilter(){
  const q=document.getElementById('search').value.trim().toLowerCase();
  const active=(document.querySelector('.chip[data-active="true"]')?.dataset.cat)||'all';

  Array.from(document.querySelectorAll('#list .item')).forEach((el,idx)=>{
    const show=pass(pointFeatures[idx]?.properties||{},active,q); el.classList.toggle('hidden',!show);
  });

  markerGroup.clearLayers(); let visible=0;
  pointFeatures.forEach(f=>{
    const p=f.properties||{}; if(!pass(p,active,q)) return;
    const m=markersById.get(p._seq); if(m){ markerGroup.addLayer(m); visible++; }
  });

  const sub=document.getElementById('countCat'); if(sub) sub.textContent=`${lastSummaryBase} · Показано: ${visible}`;
}
function fitToVisible(){
  const layers=markerGroup.getLayers(); if(!layers.length) return;
  const b=L.featureGroup(layers).getBounds(); if(b.isValid()) map.fitBounds(b,fitPad());
}

/* --- UI --- */
const search=document.getElementById('search');
search.addEventListener('input',applyFilter);
document.querySelectorAll('.chip').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.chip').forEach(b=>b.dataset.active='false'); btn.dataset.active='true';
    if(search.value.trim()!=='') search.value='';
    applyFilter(); fitToVisible();
  });
});
document.getElementById('btnShowAll')?.addEventListener('click',()=>{ if(boundsAll?.isValid()) map.fitBounds(boundsAll,fitPad()); });
document.getElementById('btnLocate')?.addEventListener('click',()=>{ document.querySelector('.leaflet-control-locate a')?.click(); });

/* Свернуть/развернуть правую панель */
document.getElementById('btnCollapse')?.addEventListener('click',()=>{
  document.body.classList.toggle('sidebar-hidden');
  requestAnimationFrame(()=>{ headerH(); map.invalidateSize(); fitToVisible(); });
});

/* iOS прокрутка списка поверх карты */
(function(){
  const body=document.querySelector('.panel-sidebar .sidebar-body'); if(!body) return;
  if(L && L.DomEvent){ L.DomEvent.disableScrollPropagation(body); L.DomEvent.disableClickPropagation(body); }
  const lock=on=>{ (on?map.dragging.disable:map.dragging.enable).call(map);
                   (on?map.touchZoom.disable:map.touchZoom.enable).call(map);
                   (on?map.scrollWheelZoom.disable:map.scrollWheelZoom.enable).call(map);
                   (on?map.boxZoom.disable:map.boxZoom.enable).call(map);
                   (on?map.keyboard.disable:map.keyboard.enable).call(map); };
  body.addEventListener('touchstart',()=>lock(true),{passive:true});
  body.addEventListener('touchend',()=>lock(false),{passive:true});
  body.addEventListener('touchcancel',()=>lock(false),{passive:true});
})();

/* --- загрузка KML --- */
const KML_CANDIDATES=[new URLSearchParams(location.search).get('kml'),'./doc.kml','doc.kml','../doc.kml'].filter(Boolean);
async function fetchText(url){ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }
async function loadKmlAuto(){ let last;
  for(const u of KML_CANDIDATES){ try{ const raw=await fetchText(u); const txt=sanitizeKmlString(raw); console.log('[KML] loaded from',u); return txt; } catch(e){ last=e; } }
  throw last||new Error('KML not found');
}

/* --- bootstrap --- */
(async()=>{
  try{
    const kmlTxt=await loadKmlAuto();
    const kmlXml=new DOMParser().parseFromString(kmlTxt,'application/xml');
    styleMaps=buildStyleMaps(kmlXml);
    const geojson=toGeoJSON.kml(kmlXml);
    await renderGeoJSON(geojson);
  }catch(e){
    console.error('KML load error:',e); map.setView([41.6938,44.8015],14);
    alert('Не удалось загрузить KML.');
  }
})();
