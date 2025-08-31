/* app.js — двухсостояние нижнего листа: ручка ↔ 50vh
 * Зависимости: Leaflet, togeojson, leaflet.locatecontrol
 */
(function () {
  'use strict';

  // --- Утилиты ---
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const norm = (s) => (s || '').toString().trim();
  const lc = (s) => norm(s).toLowerCase();
  const debounce = (fn, ms = 250) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
  const isLetterMarker = (name) => { const s = norm(name); return s.length === 1 && LETTERS.includes(s.toUpperCase()); };

  // --- DOM ---
  const mapEl = $('#map');
  const chipsBox = $('.chips');
  const searchInput = $('#search');
  const btnShowAll = $('#btnShowAll');
  const btnLocate = $('#btnLocate');
  const countCatEl = $('#countCat');
  const countTotalEl = $('#countTotal');

  // Нижний лист
  const sidebarEl = $('#sidebar');
  const sheetHandle = $('#sheetHandle');
  const btnArrow = $('#btnCloseSidebar'); // стрелка вверх/вниз
  const listEl = $('#list');

  // Тост
  let toastEl = null;
  const showToast = (text, ttl = 3500) => {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast-hint';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('show'), ttl);
  };

  // --- Map ---
  const map = L.map(mapEl, { zoomControl: true, attributionControl: true })
    .setView([41.716, 44.783], 12);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap & CARTO'
  }).addTo(map);

  const poiLayer = L.layerGroup().addTo(map);

  const locate = L.control.locate({
    position: 'topleft', setView: true, keepCurrentZoom: false, flyTo: true,
    showCompass: true, drawCircle: true, drawMarker: true, strings: { title: 'Где я?' }
  });
  locate.addTo(map);
  const lcBtn = $('.leaflet-control-locate a'); if (lcBtn) lcBtn.parentElement.style.display = 'none';

  // --- Данные ---
  const state = { items: [], cat: 'all', q: '' };

  const CAT_KEYWORDS = {
    stairs:   [/лестниц/i],
    porches:  [/парадн/i],
    temples:  [/храм/i, /церк/i, /собор/i, /монаст/i]
  };
  const detectCategory = (name, desc) => {
    const s = `${lc(name)} ${lc(desc)}`;
    if (CAT_KEYWORDS.stairs.some(r => r.test(s)))  return 'stairs';
    if (CAT_KEYWORDS.porches.some(r => r.test(s))) return 'porches';
    if (CAT_KEYWORDS.temples.some(r => r.test(s))) return 'temples';
    return 'other';
  };

  function buildStyleHrefMap(kmlDoc) {
    const map = new Map();
    const styles = kmlDoc.querySelectorAll('Style,StyleMap');
    styles.forEach(st => {
      const id = st.getAttribute('id');
      if (!id) return;
      if (st.tagName === 'StyleMap') {
        st.querySelectorAll('Pair').forEach(p => {
          const key = p.querySelector('key')?.textContent.trim();
          const ref = p.querySelector('styleUrl')?.textContent.trim().replace(/^#/, '');
          if (key === 'normal' && ref && map.has(ref)) map.set(id, map.get(ref));
        });
      }
      const href = st.querySelector('IconStyle Icon href, IconStyle href, Icon href')?.textContent?.trim();
      if (href) map.set(id, href);
    });
    return map;
  }
  const iconNumFromHref = (href) => { const m = (href||'').match(/icon-(\d+)\.png/i); return m ? parseInt(m[1], 10) : null; };
  const makeIcon = (num) => L.icon({ iconUrl:`./icon-${num}.png`, iconSize:[30,30], iconAnchor:[15,29], popupAnchor:[0,-28] });

  async function loadKml() {
    try {
      const res = await fetch('./doc.kml', { cache: 'no-store' });
      const txt = await res.text();
      const kmlDoc = new DOMParser().parseFromString(txt, 'application/xml');
      const styleHref = buildStyleHrefMap(kmlDoc);
      const gj = toGeoJSON.kml(kmlDoc);
      const features = Array.isArray(gj.features) ? gj.features : [];

      const items = [];
      let idSeq = 1;

      for (const f of features) {
        if (!f || f.geometry?.type !== 'Point') continue;

        const name = norm(f.properties?.name);
        const desc = norm(f.properties?.description);
        if (isLetterMarker(name)) continue;

        let iconNum = null;
        const styleUrl = norm(f.properties?.styleUrl).replace(/^#/, '');
        if (styleUrl && styleHref.has(styleUrl)) iconNum = iconNumFromHref(styleHref.get(styleUrl));
        if (!iconNum && typeof f.properties?.icon === 'string') iconNum = iconNumFromHref(f.properties.icon);
        if (iconNum && iconNum >= 17 && iconNum <= 25) continue;

        const [lng, lat] = f.geometry.coordinates || [];
        if (typeof lat !== 'number' || typeof lng !== 'number') continue;
        const latlng = L.latLng(lat, lng);
        const cat = detectCategory(name, desc);

        const item = { id:idSeq++, name, desc, latlng, cat, iconNum: iconNum || 1 };
        const marker = L.marker(latlng, { icon: makeIcon(item.iconNum) });
        marker.bindPopup(`<strong>${escapeHtml(item.name)}</strong>`);
        marker.on('click', () => { marker.openPopup(); });
        item.marker = marker;

        items.push(item);
      }

      state.items = items;
      countTotalEl.textContent = items.length.toString();
      applyFilters(true);
    } catch (e) {
      console.error('[KML] load error', e);
      showToast('Ошибка загрузки данных.');
    }
  }

  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

  function applyFilters(fitAll=false){
    const q = lc(state.q), cat = state.cat;
    const filtered = state.items.filter(it=>{
      if (cat!=='all' && it.cat!==cat) return false;
      if (q){ const hay = lc(`${it.name} ${it.desc}`); if (!hay.includes(q)) return false; }
      return true;
    });
    poiLayer.clearLayers();
    filtered.forEach(it=>it.marker.addTo(poiLayer));
    countCatEl.textContent = filtered.length.toString();
    renderList(filtered);
    if (fitAll) fitToItems(filtered.length?filtered:state.items);
  }
  function fitToItems(list){
    if (!list.length) return;
    const b = L.latLngBounds(list.map(it=>it.latlng));
    if (b.isValid()) map.fitBounds(b.pad(0.12));
  }

  function renderList(arr){
    listEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    arr.forEach(it=>{
      const li = document.createElement('div');
      li.className = 'list-item'; li.dataset.id = it.id;
      li.innerHTML = `<div class="title">${escapeHtml(it.name)}</div>`;
      li.addEventListener('click', ()=>{
        map.setView(it.latlng, Math.max(map.getZoom(), 16), { animate:true });
        it.marker.openPopup();
        // по клику на локацию — закрыть до ручки
        setOpen(false);
      });
      frag.appendChild(li);
    });
    listEl.appendChild(frag);
  }

  // --- Нижний лист: два состояния (closed ↔ open(50vh)) ---
  const svgUp = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const svgDown = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 10l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function isOpen(){ return sidebarEl.classList.contains('open'); }

  function updateArrow(){
    if (isOpen()){
      btnArrow.innerHTML = svgDown;
      btnArrow.title = 'Свернуть';
      btnArrow.setAttribute('aria-label','Свернуть');
    } else {
      btnArrow.innerHTML = svgUp;
      btnArrow.title = 'Развернуть (1/2)';
      btnArrow.setAttribute('aria-label','Развернуть (1/2)');
    }
  }

  function setOpen(open){
    sidebarEl.classList.toggle('open', open);
    sidebarEl.setAttribute('aria-hidden', open ? 'false' : 'true');
    sheetHandle?.setAttribute('aria-expanded', open ? 'true' : 'false');
    updateArrow();
  }

  // Стрелка: переключает open/closed
  btnArrow?.addEventListener('click', ()=> setOpen(!isOpen()));
  // Ручка: тоже переключает
  sheetHandle?.addEventListener('click', ()=> setOpen(!isOpen()));

  // --- UI события ---
  chipsBox.addEventListener('click', (e)=>{
    const btn = e.target.closest('.chip'); if (!btn) return;
    $$('.chip').forEach(c=>c.dataset.active='false'); btn.dataset.active='true';
    state.cat = btn.getAttribute('data-cat') || 'all';
    applyFilters(true);
  });

  btnShowAll.addEventListener('click', ()=>{
    const allBtn = $('.chip[data-cat="all"]');
    if (allBtn){ $$('.chip').forEach(c=>c.dataset.active='false'); allBtn.dataset.active='true'; }
    state.cat='all'; state.q=''; searchInput.value='';
    applyFilters(true);
  });

  const handleSearch = debounce(()=>{
    state.q = searchInput.value || '';
    applyFilters(false);
  }, 200);
  searchInput.addEventListener('input', handleSearch);

  // Геолокация
  let following=false;
  function startLocate(){
    following=true; btnLocate.classList.add('active'); locate.start();
    try{
      map.once('locationfound', (ev)=>{
        const user = ev.latlng;
        const all = state.items; if (!all.length) return;
        const b = L.latLngBounds(all.map(it=>it.latlng));
        const d = user.distanceTo(b.getCenter());
        if (d > 3000) showToast('Вы далеко от точек. Отключите «Где я?» для свободного просмотра.');
        map.setView(user, Math.max(map.getZoom(),16), { animate:true });
      });
    }catch{}
  }
  function stopLocate(){ following=false; btnLocate.classList.remove('active'); locate.stop(); }
  btnLocate.addEventListener('click', ()=>{ following?stopLocate():startLocate(); });

  // --- Старт ---
  loadKml();
})();
