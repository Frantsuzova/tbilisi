(function () {
  'use strict';

  // ========= Утилиты =========
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const norm = (s) => (s || '').toString().trim();
  const lc   = (s) => norm(s).toLowerCase();
  const debounce = (fn, ms=250) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  const isSmallScreen = () => Math.min(window.innerWidth, window.innerHeight) <= 420;
  const defer = (fn) => ('requestIdleCallback' in window)
    ? requestIdleCallback(fn, { timeout: 2000 })
    : setTimeout(fn, 0);

  // квантиль и «границы большинства»
  function quantile(sorted, q){
    if (sorted.length === 0) return NaN;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined){
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
  }
  function majorityBounds(list, frac = 0.7){
    const lowQ = (1 - frac) / 2, highQ = 1 - lowQ;
    const lats = list.map(it => it.latlng.lat).sort((a,b)=>a-b);
    const lngs = list.map(it => it.latlng.lng).sort((a,b)=>a-b);
    const b = L.latLngBounds(
      [quantile(lats, lowQ),  quantile(lngs, lowQ)],
      [quantile(lats, highQ), quantile(lngs, highQ)]
    );
    return b.isValid() ? b : null;
  }

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
  const isLetterMarker = (name) => {
    const s = norm(name);
    return s.length === 1 && LETTERS.includes(s.toUpperCase());
  };

  // ========= DOM =========
  const mapEl        = $('#map');
  const chipsBox     = $('.chips');
  const searchInput  = $('#search');
  const btnShowAll   = $('#btnShowAll');
  const btnLocate    = $('#btnLocate');
  const countCatEl   = $('#countCat');
  const countTotalEl = $('#countTotal');

  // нижний лист
  const sidebarEl   = $('#sidebar');
  const sheetHandle = $('#sheetHandle');
  const btnArrow    = $('#btnCloseSidebar');
  const listEl      = $('#list');

  // стрелки
  const svgUp   = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const svgDown = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 10l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const isOpen = () => sidebarEl.classList.contains('open');
  function updateArrow(){
    if (!btnArrow) return;
    if (isOpen()){
      btnArrow.innerHTML = svgDown;
      btnArrow.title = 'Свернуть';
      btnArrow.setAttribute('aria-label','Свернуть');
    } else {
      btnArrow.innerHTML = svgUp;
      btnArrow.title = 'Развернуть (1/2)';
      btnArrow.setAttribute('aria-label','Развернуть (1/2)');
    }
    btnArrow.style.visibility = 'visible';
  }
  updateArrow();

  // тост
  let toastEl = null;
  const showToast = (text, ttl=3500) => {
    if (!toastEl){ toastEl = document.createElement('div'); toastEl.className = 'toast-hint'; document.body.appendChild(toastEl); }
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=>toastEl.classList.remove('show'), ttl);
  };

  // ========= КАРТА =========
  const map = L.map(mapEl, {
    zoomControl: true,
    attributionControl: true,
    preferCanvas: true, // на iOS/моб. быстрее
    zoomSnap: 0,
    zoomDelta: 0.25,
    updateWhenIdle: true,
    inertia: true
  }).setView([41.716, 44.783], 14);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    maxNativeZoom: 18,     // последние тайлы будут масштабироваться → меньше загрузок
    detectRetina: false,   // не тянуть «ретина»-тайлы на мобилке
    subdomains: 'abcd',
    crossOrigin: true,
    noWrap: true,
    updateWhenIdle: true,
    keepBuffer: 2,
    attribution: '© OpenStreetMap & CARTO'
  }).addTo(map);

  const poiLayer = L.layerGroup().addTo(map);

  // locate (кнопку плагина мы скрываем в CSS, используем для маркера/компаса)
  const locateCtl = L.control.locate({
    position: 'topleft',
    setView: false, keepCurrentZoom: true, flyTo: false,
    showCompass: true, drawCircle: true, drawMarker: true,
    strings: { title: 'Где я?' }
  }).addTo(map);
  $('.leaflet-control-locate')?.classList.add('hidden');

  // ========= Состояние/категории =========
  const state = { items: [], cat: 'all', q: '' };

  const CAT_KEYWORDS = {
    stairs:   [/лестниц/i],
    porches:  [/парадн/i],
    temples:  [/храм/i, /церк/i, /собор/i, /монаст/i]
  };
  const detectCategory = (name, desc) => {
    const s = `${lc(name)} ${lc(desc)}`;
    if (CAT_KEYWORDS.stairs.some(r=>r.test(s)))  return 'stairs';
    if (CAT_KEYWORDS.porches.some(r=>r.test(s))) return 'porches';
    if (CAT_KEYWORDS.temples.some(r=>r.test(s))) return 'temples';
    return 'other';
  };

  function buildStyleHrefMap(kmlDoc){
    const m = new Map();
    kmlDoc.querySelectorAll('Style,StyleMap').forEach(st=>{
      const id = st.getAttribute('id'); if (!id) return;
      if (st.tagName === 'StyleMap'){
        st.querySelectorAll('Pair').forEach(p=>{
          const key = p.querySelector('key')?.textContent.trim();
          const ref = p.querySelector('styleUrl')?.textContent.trim().replace(/^#/, '');
          if (key === 'normal' && ref && m.has(ref)) m.set(id, m.get(ref));
        });
      }
      const href = st.querySelector('IconStyle Icon href, IconStyle href, Icon href')?.textContent?.trim();
      if (href) m.set(id, href);
    });
    return m;
  }
  const iconNumFromHref = (href) => { const mm=(href||'').match(/icon-(\d+)\.png/i); return mm?parseInt(mm[1],10):null; };
  const makeIcon = (num) => L.icon({ iconUrl:`./icon-${num}.png`, iconSize:[30,30], iconAnchor:[15,29], popupAnchor:[0,-28] });

  // ========= Маркеры порциями =========
  function addMarkersChunked(list, layer, batch=120){
    let i = 0;
    function step(){
      const end = Math.min(i + batch, list.length);
      for (; i < end; i++){
        const it = list[i];
        if (!it.marker){
          const m = L.marker(it.latlng, { icon: makeIcon(it.iconNum) });
          m.bindPopup(`<strong>${escapeHtml(it.name)}</strong>`);
          m.on('click', ()=> m.openPopup());
          it.marker = m;
        }
        it.marker.addTo(layer);
      }
      if (i < list.length) {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  // ========= Загрузка данных =========
  async function loadKml(){
    try{
      const res = await fetch('./doc.kml', { cache:'no-store' });
      const txt = await res.text();
      const kmlDoc = new DOMParser().parseFromString(txt,'application/xml');
      const styleHref = buildStyleHrefMap(kmlDoc);
      const gj = toGeoJSON.kml(kmlDoc);
      const feats = Array.isArray(gj.features)? gj.features : [];

      const items=[]; let idSeq=1;
      for(const f of feats){
        if(!f || f.geometry?.type!=='Point') continue;

        const name=norm(f.properties?.name);
        const desc=norm(f.properties?.description);
        if (isLetterMarker(name)) continue;

        let iconNum=null;
        const styleUrl=norm(f.properties?.styleUrl).replace(/^#/,'');
        if(styleUrl && styleHref.has(styleUrl)) iconNum=iconNumFromHref(styleHref.get(styleUrl));
        if(!iconNum && typeof f.properties?.icon==='string') iconNum=iconNumFromHref(f.properties.icon);
        if(iconNum && iconNum>=17 && iconNum<=25) continue; // служебные

        const [lng,lat]=f.geometry.coordinates||[];
        if(typeof lat!=='number'||typeof lng!=='number') continue;
        const latlng=L.latLng(lat,lng);
        const cat=detectCategory(name,desc);

        items.push({ id:idSeq++, name, desc, latlng, cat, iconNum: iconNum||1, marker:null });
      }

      state.items = items;
      countTotalEl.textContent = items.length.toString();
      applyFilters(true); // сначала фокус/список…

      // …а маркеры добавим в слой плавно (если активно есть фильтр — добавятся текущие)
      // (applyFilters сам вызовет addMarkersChunked для текущего набора)
    }catch(e){
      console.error('[KML] load error', e);
      showToast('Ошибка загрузки данных.');
    }
  }

  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

  // ========= Фильтрация / фокус =========
  function applyFilters(fitAll=false){
    const q = lc(state.q), cat = state.cat;
    const filtered = state.items.filter(it=>{
      if (cat!=='all' && it.cat!==cat) return false;
      if (q){ const hay = lc(`${it.name} ${it.desc}`); if (!hay.includes(q)) return false; }
      return true;
    });

    // список
    renderList(filtered);

    // фокус сразу (без ожидания создания маркеров)
    if (fitAll) fitToItems(filtered.length?filtered:state.items);

    // слой: очищаем и добавляем порциями
    poiLayer.clearLayers();
    if (filtered.length > 120) addMarkersChunked(filtered, poiLayer, 140);
    else addMarkersChunked(filtered, poiLayer, filtered.length || 1);

    countCatEl.textContent = filtered.length.toString();
  }

  function fitToItems(list){
    if (!list.length) return;

    const full = L.latLngBounds(list.map(it=>it.latlng));
    if (!full.isValid()) return;

    let target = full;
    const majority = list.length >= 8 ? majorityBounds(list, 0.7) : null;
    if (majority){
      const areaFull = Math.abs((full.getNorth()-full.getSouth()) * (full.getEast()-full.getWest()));
      const areaMaj  = Math.abs((majority.getNorth()-majority.getSouth()) * (majority.getEast()-majority.getWest()));
      if (areaMaj > 0 && areaFull / areaMaj >= 1.8) target = majority;
    }

    const small = isSmallScreen();
    map.fitBounds(target.pad(small ? 0.015 : 0.03));
    const minZoom = small ? 15.5 : 14;
    if (map.getZoom() < minZoom) map.setZoom(minZoom);
  }

  function renderList(arr){
    listEl.innerHTML='';
    const frag=document.createDocumentFragment();
    arr.forEach(it=>{
      const li=document.createElement('div');
      li.className='list-item'; li.dataset.id=it.id;
      li.innerHTML=`<div class="title">${escapeHtml(it.name)}</div>`;
      li.addEventListener('click', ()=>{
        map.setView(it.latlng, Math.max(map.getZoom(), 17), { animate:true });
        if (!it.marker){
          it.marker = L.marker(it.latlng, { icon: makeIcon(it.iconNum) })
            .bindPopup(`<strong>${escapeHtml(it.name)}</strong>`)
            .addTo(poiLayer);
        }
        it.marker.openPopup();
        setOpen(false);
      });
      frag.appendChild(li);
    });
    listEl.appendChild(frag);
  }

  // ========= Лист =========
  function setOpen(open){
    if (!open && sidebarEl.contains(document.activeElement)){
      try { sheetHandle?.focus({ preventScroll:true }); } catch{}
    }
    sidebarEl.classList.toggle('open', open);
    sheetHandle?.setAttribute('aria-expanded', open ? 'true' : 'false');
    updateArrow();
  }
  btnArrow?.addEventListener('click', ()=> setOpen(!isOpen()));
  sheetHandle?.addEventListener('click', ()=> setOpen(!isOpen()));

  // ========= UI =========
  chipsBox.addEventListener('click', (e)=>{
    const btn=e.target.closest('.chip'); if(!btn) return;
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

  searchInput.addEventListener('input', debounce(()=>{
    state.q = searchInput.value || '';
    applyFilters(false);
  }, 200));

  // ========= Геолокация =========
  let locating = false;
  const hasGeo = 'geolocation' in navigator;

  function startLocate(){
    if (locating) return;
    locating = true; btnLocate.classList.add('active');

    if (hasGeo){
      navigator.geolocation.getCurrentPosition(
        (pos)=>{
          const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
          map.setView(latlng, Math.max(map.getZoom(), 17), { animate:true });
          try { locateCtl.start(); } catch {}
          try { localStorage.setItem('autoLocate','1'); } catch {}
          locating = false;
        },
        (err)=>{
          showToast('Геолокация недоступна: ' + (err && err.message ? err.message : 'ошибка'));
          btnLocate.classList.remove('active');
          locating = false;
        },
        { enableHighAccuracy:true, timeout:30000, maximumAge:10000 } // терпимее к медленному GPS
      );
    } else {
      try { locateCtl.start(); } catch {}
      locating = false;
    }
  }
  function stopLocate(){
    btnLocate.classList.remove('active');
    try { locateCtl.stop(); } catch {}
    try { localStorage.setItem('autoLocate','0'); } catch {}
    locating = false;
  }
  btnLocate.addEventListener('click', ()=> (btnLocate.classList.contains('active') ? stopLocate() : startLocate()));

  // не переспрашивать — автозапуск, если уже выдано и ранее включали
  async function initGeoPermission(){
    try{
      const auto = localStorage.getItem('autoLocate') === '1';
      if ('permissions' in navigator) {
        const p = await navigator.permissions.query({ name:'geolocation' });
        if (p.state === 'granted' && auto) startLocate();
        p.onchange = () => { if (p.state !== 'granted') stopLocate(); };
      } else {
        if (auto) startLocate(); // iOS Safari без Permissions API
      }
    } catch {}
  }
  initGeoPermission();

  // ========= Старт =========
  // Сначала рендерятся тайлы, потом — в idle загрузим и распарсим KML
  defer(loadKml);
})();
