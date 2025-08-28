// app.js — фикс соответствия цветов/иконок стилям из KML

/* ---------- текстовые утилиты ---------- */
function toText(v){ if(v==null)return''; if(typeof v==='string')return v;
  if(typeof v==='number'||typeof v==='boolean')return String(v);
  if(Array.isArray(v))return v.map(toText).filter(Boolean).join(' ');
  if(typeof v==='object'){const pref=['__cdata','#cdata-section','#text','text','value','content','description'];
    for(const k of pref) if(k in v) return toText(v[k]);
    return Object.values(v).map(toText).filter(Boolean).join(' ');
  } return ''; }
function cleanText(v){ let s=toText(v); return s.replace(/\[object Object\]/gi,' ').replace(/\s{2,}/g,' ').trim(); }
function stripHtmlToText(input){ const html=cleanText(input); if(!html)return '';
  const tmp=document.createElement('div'); tmp.innerHTML=html;
  tmp.querySelectorAll('img,picture,source,iframe,video,audio,svg,script,style').forEach(el=>el.remove());
  let t=(tmp.textContent||'').replace(/\s+\n/g,'\n').replace(/\s{2,}/g,' ').trim();
  return t.replace(/\[object Object\]/gi,'').replace(/\s{2,}/g,' ').trim(); }
function escapeHtml(s){ return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'","&#39;"); }
function makePopupHtml(name, description){ const n=escapeHtml(cleanText(name))||'Без названия';
  const d=stripHtmlToText(description); return d?`<strong>${n}</strong><br>${escapeHtml(d)}`:`<strong>${n}</strong>`; }

/* ---------- категории ---------- */
function detectCategory(p){
  const n=cleanText(p?.name).toLowerCase(), d=cleanText(p?.description).toLowerCase();
  if (/(храм|церк|собор|монастыр|кост(?:е|ё)л)/i.test(n)||/(храм|церк|собор|монастыр|кост(?:е|ё)л)/i.test(d)) return 'temples';
  if (n.includes('лестниц')||d.includes('лестниц')) return 'stairs';
  if (n.includes('парадн') ||d.includes('парадн'))  return 'porches';
  return 'other';
}
const CAT_LABEL={stairs:'Лестницы',porches:'Парадные',temples:'Храмы',other:'Остальное'};

/* ---------- чистка KML ---------- */
function sanitizeKmlString(txt){
  return String(txt)
    .replace(/<img\b[^>]*>/gi,'')
    .replace(/url\((['"]?)https?:\/\/mymaps\.usercontent\.google\.com\/[^)]+?\1\)/gi,'none')
    .replace(/<\/?(?:iframe|audio|video|source|script)\b[^>]*>/gi,'');
}

/* ---------- парсинг стилей из KML ---------- */
/* KML <color> хранится как aabbggrr, конвертируем в #rrggbb */
function kmlColorToHex(s){
  if(!s) return null;
  s=String(s).trim().replace(/^0x/i,'').toLowerCase();
  if(s.length===8){ const aa=s.slice(0,2), bb=s.slice(2,4), gg=s.slice(4,6), rr=s.slice(6,8); return '#'+rr+gg+bb; }
  if(s.length===6){ return '#'+s; }
  return null;
}
function extractHexFromHref(href){
  if(!href) return null;
  const m = href.match(/(?:[?&#]color=)(?:0x)?([0-9a-fA-F]{6,8})/);
  if(m){ return kmlColorToHex(m[1]); }
  return null;
}
function guessNamedColorFromHref(href){
  if(!href) return null; const s=href.toLowerCase();
  if(/(yellow|ylw)/.test(s)) return '#f5c400';
  if(/(green|grn)/.test(s))  return '#2cad5b';
  if(/(blue|blu|ltblue|ltblu)/.test(s)) return '#2b7bff';
  if(/(orange|ora)/.test(s)) return '#ff8a00';
  if(/(red|_rd\b|-red|red-)/.test(s)) return '#d33';
  if(/(violet|purple)/.test(s)) return '#8a5cff';
  if(/(pink|magenta)/.test(s)) return '#ff4fa3';
  if(/(gray|grey|gry)/.test(s)) return '#7a7a7a';
  if(/black/.test(s)) return '#111111';
  if(/(white|wht)/.test(s)) return '#ffffff';
  return null;
}
/* Возвращаем три карты:
   - hrefById['#id']  -> URL иконки
   - colorById['#id'] -> #rrggbb (из <color> или из href)
   - orderIdx['#id']  -> порядковый номер стиля по докум. порядку (устойчивый)
*/
function buildStyleMaps(kmlXml){
  const hrefById=Object.create(null), colorById=Object.create(null), orderIdx=Object.create(null);
  let idx = 0;

  // фиксируем документный порядок
  const nodes = kmlXml.querySelectorAll('Style[id], StyleMap[id]');
  nodes.forEach(el=>{
    const id = el.getAttribute('id'); if(!id) return;
    const key = '#'+id;
    if(!(key in orderIdx)) orderIdx[key] = ++idx;
  });

  // Style -> href/color
  kmlXml.querySelectorAll('Style[id]').forEach(st=>{
    const key = '#'+st.getAttribute('id');
    const href = st.querySelector('IconStyle Icon href')?.textContent?.trim() || null;
    const kmlCol = st.querySelector('IconStyle color')?.textContent?.trim() || null;
    if(href) hrefById[key]=href;
    if(kmlCol){ colorById[key]=kmlColorToHex(kmlCol); }
    if(!colorById[key] && href) colorById[key]=extractHexFromHref(href)||guessNamedColorFromHref(href);
  });

  // StyleMap -> normal Style
  kmlXml.querySelectorAll('StyleMap[id]').forEach(sm=>{
    const key = '#'+sm.getAttribute('id');
    let target = null;
    const pair = Array.from(sm.querySelectorAll('Pair'))
      .find(p => (p.querySelector('key')?.textContent?.trim()||'')==='normal') || sm.querySelector('Pair');
    if(pair){
      const su = pair.querySelector('styleUrl')?.textContent?.trim() || null;
      if(su){
        hrefById[key]  = hrefById[su]  || hrefById[key]  || null;
        colorById[key] = colorById[su] || colorById[key] || null;
        target = su;
      }
    }
    // fallback: прямой href/color внутри StyleMap
    if(!hrefById[key]){
      const href = sm.querySelector('IconStyle Icon href')?.textContent?.trim() || null;
      if(href) hrefById[key] = href;
    }
    if(!colorById[key]){
      const kmlCol = sm.querySelector('IconStyle color')?.textContent?.trim() || null;
      if(kmlCol) colorById[key]=kmlColorToHex(kmlCol);
    }
    if(!colorById[key] && hrefById[key]) colorById[key]=extractHexFromHref(hrefById[key])||guessNamedColorFromHref(hrefById[key]);
  });

  return { hrefById, colorById, orderIdx };
}
function getStyleColorByUrl(styleUrl, maps){
  if(!styleUrl) return null;
  return maps.colorById[styleUrl] || null;
}

/* ---------- иконки ---------- */
const ICONS={ prefix:'icon-', ext:'png', count:28, size:[32,32], anchor:[16,32], popup:[0,-28] };
const iconCache=new Map();
function personalIcon(id){
  if(!id||id<1||id>ICONS.count) return null;
  if(iconCache.has(id)) return iconCache.get(id);
  const ic=L.icon({iconUrl:`${ICONS.prefix}${id}.${ICONS.ext}`,iconSize:ICONS.size,iconAnchor:ICONS.anchor,popupAnchor:ICONS.popup});
  iconCache.set(id,ic); return ic;
}
const imgExistsCache=new Map();
function imageExists(url){
  if(imgExistsCache.has(url)) return imgExistsCache.get(url);
  const p=new Promise(res=>{ const im=new Image(); im.onload=()=>res(true); im.onerror=()=>res(false);
    im.src=url+(url.includes('?')?'&':'?')+'v='+Date.now(); }).then(ok=>{ imgExistsCache.set(url,ok); return ok; });
  imgExistsCache.set(url,p); return p;
}
function svgPinIcon(hex){
  const fill=(hex||'#2b7bff').toLowerCase(), stroke='#08213a';
  const w=26,h=40,ax=Math.round(w/2),ay=h;
  const html=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 26 40" aria-hidden="true">
    <defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.5"/>
    <feOffset dx="0" dy="1" result="o"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <path filter="url(#s)" d="M13 0C6 0 0.5 5.4 0.5 12.3c0 8.9 10.4 18.8 11.2 19.6.7.7 1.8.7 2.6 0 .8-.8 11.2-10.7 11.2-19.6C25.5 5.4 20 0 13 0z" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
    <circle cx="13" cy="12" r="4.2" fill="#fff" opacity="0.95"/></svg>`;
  return L.divIcon({className:'pin-svg',html,iconSize:[w,h],iconAnchor:[ax,ay],popupAnchor:[0,-34]});
}

/* ---------- карта ---------- */
const map=L.map('map',{zoomControl:false,tap:false,wheelDebounceTime:10,inertia:true});
const cartoLight=L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  {subdomains:'abcd',maxZoom:20,attribution:'&copy; OpenStreetMap &copy; CARTO'});
const cartoDark=L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  {subdomains:'abcd',maxZoom:20,attribution:'&copy; OpenStreetMap &copy; CARTO'});
let currentTiles=null;
function setTilesByColorScheme(){ const pref=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  const next=pref?cartoDark:cartoLight; if(currentTiles!==next){ if(currentTiles) map.removeLayer(currentTiles); next.addTo(map); currentTiles=next; } }
setTilesByColorScheme();
if(window.matchMedia){ const mm=window.matchMedia('(prefers-color-scheme: dark)');
  if(mm.addEventListener) mm.addEventListener('change',setTilesByColorScheme); else if(mm.addListener) mm.addListener(setTilesByColorScheme); }

L.control.zoom({position:'topright'}).addTo(map);
L.control.scale({imperial:false}).addTo(map);
L.control.locate({position:'topright',setView:'untilPan',keepCurrentZoomLevel:true,strings:{title:'Показать моё местоположение'}}).addTo(map);

/* ---------- fitBounds и высота шапки ---------- */
function updateHeaderHeightVar(){ const h=document.getElementById('headerPanel')?.offsetHeight||0;
  document.documentElement.style.setProperty('--header-h',`${h+12}px`); }
function getFitPadding(){ const header=document.getElementById('headerPanel');
  const sidebar=document.getElementById('sidebar');
  const topPad=(header&&header.offsetHeight)?header.offsetHeight+16:16;
  const rightPad=(sidebar&&getComputedStyle(sidebar).display!=='none')?sidebar.offsetWidth+16:16;
  return {paddingTopLeft:[16,topPad],paddingBottomRight:[rightPad,16]}; }
updateHeaderHeightVar();

/* ---------- состояние ---------- */
let shapesLayer=null, markerGroup=L.layerGroup().addTo(map), markersById=new Map(), boundsAll=null;
let pointFeatures=[], lastSummaryBase='';
let styleMaps=null; // {hrefById,colorById,orderIdx}
let styleUrlToIconIndex=Object.create(null); // итоговое сопоставление styleUrl -> 1..28

/* ---------- рендер ---------- */
function renderGeoJSON(geojson, maps){
  styleMaps=maps;
  const feats=Array.isArray(geojson.features)?geojson.features:[];
  feats.forEach((f,i)=>{ f.properties={...(f.properties||{}), _seq:i}; });

  pointFeatures=feats.filter(f=>f.geometry&&f.geometry.type==='Point');
  const shapeFeatures=feats.filter(f=>!f.geometry || f.geometry.type!=='Point');

  // Подготовим порядок стилей: берём ТОЛЬКО реально используемые styleUrl у точек,
  // сортируем по документному порядку (maps.orderIdx) и назначаем icon-1..28
  const used = [...new Set(pointFeatures.map(f=>String(f.properties?.styleUrl||'')).filter(Boolean))];
  used.sort((a,b)=>(maps.orderIdx[a]||99999)-(maps.orderIdx[b]||99999));
  styleUrlToIconIndex=Object.create(null);
  used.slice(0,ICONS.count).forEach((su,i)=>{ styleUrlToIconIndex[su]=i+1; });

  pointFeatures.forEach((f,pi)=>{
    const p=f.properties||{}; p._ptSeq=pi; p.name=cleanText(p.name); p.description=stripHtmlToText(p.description);
  });

  if(shapesLayer){ try{ map.removeLayer(shapesLayer);}catch(e){} }
  shapesLayer=shapeFeatures.length?L.geoJSON(shapeFeatures,{style:()=>({color:'#2563eb',weight:3,opacity:0.85})}).addTo(map):null;

  markerGroup.clearLayers(); markersById.clear();

  const tmp=L.geoJSON(pointFeatures,{
    pointToLayer:(feature,latlng)=>{
      const p=feature.properties||{};
      const su=typeof p.styleUrl==='string'?p.styleUrl:null;
      const color = su ? getStyleColorByUrl(su, styleMaps) : null;

      let marker;
      const idx = su ? styleUrlToIconIndex[su] : undefined;
      if(idx && idx>=1 && idx<=ICONS.count){
        const url=`${ICONS.prefix}${idx}.${ICONS.ext}`;
        marker=L.marker(latlng,{icon: svgPinIcon(color)}); // временно, потом подменим
        imageExists(url).then(ok=>{ if(ok) marker.setIcon(personalIcon(idx)); else if(color) marker.setIcon(svgPinIcon(color)); });
      }else{
        marker=L.marker(latlng,{icon: svgPinIcon(color)});
      }
      markersById.set(p._ptSeq, marker);
      marker.featureCat=detectCategory(p);
      marker.featureProps=p;
      return marker;
    },
    onEachFeature:(feature,layer)=>{
      const p=feature.properties||{}; layer.bindPopup(makePopupHtml(p.name,p.description));
    }
  });
  tmp.eachLayer(l=>markerGroup.addLayer(l));

  try{
    const group=L.featureGroup([markerGroup,shapesLayer].filter(Boolean));
    const b=group.getBounds();
    if(b.isValid()){ boundsAll=b; map.fitBounds(b,getFitPadding()); } else { map.setView([41.6938,44.8015],14); }
  }catch{ map.setView([41.6938,44.8015],14); }

  updateCounters(); buildList(); applyVisibility();
}

/* ---------- счётчики/список/фильтр и UI (без изменений) ---------- */
function updateCounters(){ const total=pointFeatures.length; const cats={stairs:0,porches:0,temples:0,other:0};
  pointFeatures.forEach(f=>{ cats[detectCategory(f.properties)]++; });
  document.getElementById('countTotal').textContent=total;
  lastSummaryBase=`лестницы ${cats.stairs}, парадные ${cats.porches}, храмы ${cats.temples}, остальное ${cats.other}`;
  document.getElementById('countCat').textContent=lastSummaryBase; }
function buildList(){ const list=document.getElementById('list'); list.innerHTML='';
  pointFeatures.forEach(f=>{ const p=f.properties||{}; const ptIdx=p._ptSeq; const cat=detectCategory(p);
    const item=document.createElement('div'); item.className='item'; item.dataset.cat=cat;
    item.innerHTML=`<h4>${escapeHtml(cleanText(p.name)||'Без названия')}</h4><div class="meta"></div>`;
    const short=p.description.length>180?p.description.slice(0,180)+'…':p.description;
    item.querySelector('.meta').textContent=`${CAT_LABEL[cat]} · ${short}`;
    item.addEventListener('click',()=>{ const m=markersById.get(ptIdx); if(!m)return;
      map.flyTo(m.getLatLng(),Math.max(map.getZoom(),17),{duration:.8}); setTimeout(()=>m.openPopup(),850); });
    list.appendChild(item); }); }
function isMatchProps(p,activeCat,qLower){ const cat=detectCategory(p);
  const name=cleanText(p.name).toLowerCase(), desc=cleanText(p.description).toLowerCase();
  return ((activeCat==='all')||(cat===activeCat)) && (!qLower||name.includes(qLower)||desc.includes(qLower)); }
function fitToVisible(){ const layers=markerGroup.getLayers(); if(!layers.length)return;
  const b=L.featureGroup(layers).getBounds(); if(b.isValid()) map.fitBounds(b,getFitPadding()); }
function applyVisibility(){ const q=document.getElementById('search').value.trim().toLowerCase();
  const btn=document.querySelector('.chip[data-active="true"]'); const active=btn?btn.dataset.cat:'all';
  Array.from(document.querySelectorAll('#list .item')).forEach((el,idx)=>{ const p=pointFeatures[idx]?.properties||{};
    const show=isMatchProps(p,active,q); el.classList.toggle('hidden',!show); });
  markerGroup.clearLayers(); let visible=0;
  pointFeatures.forEach(f=>{ const p=f.properties||{}; const show=isMatchProps(p,active,q); if(!show) return;
    const m=markersById.get(p._ptSeq); if(m){ markerGroup.addLayer(m); visible++; } });
  const sub=document.getElementById('countCat'); if(sub) sub.textContent=`${lastSummaryBase} · Показано: ${visible}`; }

const searchInput=document.getElementById('search');
searchInput.addEventListener('input',()=>applyVisibility());
document.querySelectorAll('.chip').forEach(btn=>{
  btn.addEventListener('click',()=>{ document.querySelectorAll('.chip').forEach(b=>b.dataset.active='false');
    btn.dataset.active='true'; if(searchInput.value.trim()!=='') searchInput.value=''; applyVisibility(); fitToVisible(); }); });
document.getElementById('btnShowAll').addEventListener('click',()=>{ if(boundsAll&&boundsAll.isValid()) map.fitBounds(boundsAll,getFitPadding()); });
document.getElementById('btnLocate').addEventListener('click',()=>{ document.querySelector('.leaflet-control-locate a')?.click(); });
document.getElementById('btnToggleSidebar').addEventListener('click',()=>{ const sb=document.getElementById('sidebar');
  sb.style.display=(sb.style.display==='none')?'':''; setTimeout(()=>{ updateHeaderHeightVar(); map.invalidateSize(); fitToVisible(); },0); });
const fab=document.getElementById('fabToggleUI');
if(fab){ fab.addEventListener('click',()=>{ document.body.classList.toggle('ui-hidden');
  setTimeout(()=>{ updateHeaderHeightVar(); map.invalidateSize(); fitToVisible(); },0); }); }
function ensureMobileUI(){ if(window.innerWidth<=780) document.body.classList.remove('ui-hidden'); }
ensureMobileUI();
window.addEventListener('resize',()=>{ updateHeaderHeightVar(); map.invalidateSize(); fitToVisible(); });
setTimeout(()=>{ updateHeaderHeightVar(); map.invalidateSize(); },0);

/* ---------- iOS скролл ---------- */
(function(){
  const sbBody=document.querySelector('.panel-sidebar .sidebar-body'); if(!sbBody) return;
  if(L&&L.DomEvent){ L.DomEvent.disableScrollPropagation(sbBody); L.DomEvent.disableClickPropagation(sbBody); }
  const lock=(on)=>{ if(on){ map.dragging.disable(); map.touchZoom.disable(); map.scrollWheelZoom.disable(); map.boxZoom.disable(); map.keyboard.disable(); }
                     else  { map.dragging.enable();  map.touchZoom.enable();  map.scrollWheelZoom.enable();  map.boxZoom.enable();  map.keyboard.enable(); } };
  sbBody.addEventListener('touchstart',()=>lock(true),{passive:true});
  sbBody.addEventListener('touchend',()=>lock(false),{passive:true});
  sbBody.addEventListener('touchcancel',()=>lock(false),{passive:true});
  sbBody.addEventListener('pointerenter',()=>lock(true));
  sbBody.addEventListener('pointerleave',()=>lock(false));
})();

/* ---------- загрузка KML ---------- */
const kmlParam=new URLSearchParams(location.search).get('kml');
const KML_CANDIDATES=[kmlParam,'./doc.kml','doc.kml','../doc.kml'].filter(Boolean);
async function tryFetch(url){ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.text(); }
async function loadKmlAuto(){ let last; for(const url of KML_CANDIDATES){ try{ const raw=await tryFetch(url);
    const txt=sanitizeKmlString(raw); console.log('[KML] loaded from',url); return {txt,url}; }catch(e){ last=e; } } throw last||new Error('KML not found'); }

/* ---------- fallback-пикер KML ---------- */
function enableKmlPicker(){
  const bar=document.createElement('div'); bar.className='panel kml-picker';
  bar.innerHTML=`<span>Загрузить KML:</span>
    <input type="file" id="kmlFile" class="kml-file" accept=".kml,.xml">
    <input type="text" id="kmlUrl" class="kml-url" placeholder="или URL…">
    <button class="btn kml-load-btn" id="kmlLoadBtn">Загрузить</button>
    <button class="btn kml-close-btn" id="kmlCloseBtn">Отмена</button>`;
  document.body.appendChild(bar);
  bar.querySelector('#kmlFile').addEventListener('change',e=>{
    const f=e.target.files?.[0]; if(!f) return; const fr=new FileReader();
    fr.onload=()=>{ const txt=sanitizeKmlString(String(fr.result));
      const kmlXml=new DOMParser().parseFromString(txt,'application/xml');
      const maps=buildStyleMaps(kmlXml); const geojson=toGeoJSON.kml(kmlXml);
      renderGeoJSON(geojson,maps); bar.remove(); }; fr.readAsText(f); });
  bar.querySelector('#kmlLoadBtn').addEventListener('click',async()=>{
    const url=bar.querySelector('#kmlUrl').value.trim(); if(!url) return;
    try{ const raw=await tryFetch(url); const txt=sanitizeKmlString(raw);
      const kmlXml=new DOMParser().parseFromString(txt,'application/xml');
      const maps=buildStyleMaps(kmlXml); const geojson=toGeoJSON.kml(kmlXml);
      renderGeoJSON(geojson,maps); bar.remove(); }catch(e){ alert('Не удалось загрузить по URL'); console.error(e); } });
  bar.querySelector('#kmlCloseBtn').addEventListener('click',()=>bar.remove());
}

/* ---------- bootstrap ---------- */
(async()=>{
  try{
    const {txt}=await loadKmlAuto();
    const kmlXml=new DOMParser().parseFromString(txt,'application/xml');
    const maps=buildStyleMaps(kmlXml);
    const geojson=toGeoJSON.kml(kmlXml);
    renderGeoJSON(geojson,maps);
  }catch(e){
    console.error('KML load error:',e);
    enableKmlPicker();
    map.setView([41.6938,44.8015],14);
  }
})();
