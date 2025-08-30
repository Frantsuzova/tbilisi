/* app.js
 * Совместим с index.html/app.css из последнего шага
 * Зависимости: Leaflet, togeojson, leaflet.locatecontrol
 */

(function () {
  'use strict';

  // ---------- УТИЛИТЫ ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const norm = (s) => (s || '').toString().trim();
  const lc = (s) => norm(s).toLowerCase();

  // Дебаунс для поиска
  const debounce = (fn, ms = 250) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  // Проверка «буквенного» маркера (A, B, C… / А, Б, В…)
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
  const isLetterMarker = (name) => {
    const s = norm(name);
    return s.length === 1 && LETTERS.includes(s.toUpperCase());
  };

  // ---------- DOM ----------
  const mapEl = $('#map');
  const chipsBox = $('.chips');
  const searchInput = $('#search');
  const btnShowAll = $('#btnShowAll');   // «Дом»
  const btnLocate = $('#btnLocate');
  const countCatEl = $('#countCat');
  const countTotalEl = $('#countTotal');

  // Нижний лист
  const sidebarEl = $('#sidebar');
  const sheetHandle = $('#sheetHandle');
  const btnCloseSidebar = $('#btnCloseSidebar');
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

  // ---------- MAP ----------
  const map = L.map(mapEl, {
    zoomControl: true,
    attributionControl: true
  }).setView([41.716, 44.783], 12);

  // Тайллейер (Carto Light)
  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution:
        '© OpenStreetMap & CARTO'
    }
  ).addTo(map);

  // Слой для точек
  const poiLayer = L.layerGroup().addTo(map);

  // Locate control (не показываем стандартную кнопку, управляем своей)
  const locate = L.control
    .locate({
      position: 'topleft',
      setView: true,
      keepCurrentZoom: false,
      flyTo: true,
      showCompass: true,
      drawCircle: true,
      drawMarker: true,
      strings: { title: 'Где я?' }
    });

  // создадим, но не добавляем иконку-кнопку плагина
  locate.addTo(map);
  // Спрячем штатную кнопку
  const lcBtn = $('.leaflet-control-locate a');
  if (lcBtn) lcBtn.parentElement.style.display = 'none';

  // ---------- ДАННЫЕ ----------
  const state = {
    items: [],           // { id, name, desc, latlng, cat, iconNum, iconUrl, marker }
    cat: 'all',
    q: ''
  };

  const CAT_KEYWORDS = {
    stairs:   [/лестниц/i],
    porches:  [/парадн/i],
    temples:  [/храм/i, /церк/i, /собор/i, /монаст/i]
  };

  const detectCategory = (name, desc) => {
    const s = `${lc(name)} ${lc(desc)}`;
    if (CAT_KEYWORDS.stairs.some(r => r.test(s))) return 'stairs';
    if (CAT_KEYWORDS.porches.some(r => r.test(s))) return 'porches';
    if (CAT_KEYWORDS.temples.some(r => r.test(s))) return 'temples';
    return 'other';
  };

  // Построить map стилей styleId -> href
  function buildStyleHrefMap(kmlDoc) {
    const map = new Map();
    const styles = kmlDoc.querySelectorAll('Style,StyleMap');
    styles.forEach(st => {
      const id = st.getAttribute('id');
      if (!id) return;
      // StyleMap normal->#styleId
      if (st.tagName === 'StyleMap') {
        const pairNodes = st.querySelectorAll('Pair');
        pairNodes.forEach(p => {
          const keyEl = p.querySelector('key');
          const styleUrlEl = p.querySelector('styleUrl');
          if (!keyEl || !styleUrlEl) return;
          const key = keyEl.textContent.trim();
          if (key !== 'normal') return;
          const ref = styleUrlEl.textContent.trim().replace(/^#/, '');
          if (ref && map.has(ref)) {
            map.set(id, map.get(ref));
          }
        });
      }
      // Style -> Icon href
      const href = st.querySelector('IconStyle Icon href, IconStyle href, Icon href');
      if (href && href.textContent) {
        map.set(id, href.textContent.trim());
      }
    });
    return map;
  }

  // Достать номер иконки из href
  const iconNumFromHref = (href) => {
    if (!href) return null;
    // ищем .../icon-123.png
    const m = href.match(/icon-(\d+)\.png/i);
    if (m) return parseInt(m[1], 10);
    return null;
  };

  // Создание Leaflet-иконки
  function makeIcon(num) {
    const url = `./icon-${num}.png`;
    return L.icon({
      iconUrl: url,
      iconSize: [30, 30],
      iconAnchor: [15, 29],
      popupAnchor: [0, -28]
    });
  }

  // ---------- ЗАГРУЗКА KML ----------
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

      // Собираем точки
      for (const f of features) {
        if (!f || f.geometry?.type !== 'Point') continue;

        const name = norm(f.properties?.name);
        const desc = norm(f.properties?.description);

        // skip буквенные маркеры маршрутов
        if (isLetterMarker(name)) continue;

        // styleUrl -> href -> icon-XX.png
        let iconNum = null;
        const styleUrl = norm(f.properties?.styleUrl).replace(/^#/, '');
        if (styleUrl && styleHref.has(styleUrl)) {
          iconNum = iconNumFromHref(styleHref.get(styleUrl));
        }
        // Если styleUrl не дал результата — попробуем внутри feature (редкость)
        if (!iconNum && f.properties?.icon && typeof f.properties.icon === 'string') {
          iconNum = iconNumFromHref(f.properties.icon);
        }

        // отбрасываем служебные 17..25
        if (iconNum && iconNum >= 17 && iconNum <= 25) continue;

        const [lng, lat] = f.geometry.coordinates || [];
        if (typeof lat !== 'number' || typeof lng !== 'number') continue;

        const latlng = L.latLng(lat, lng);
        const cat = detectCategory(name, desc);

        const item = {
          id: idSeq++,
          name, desc, latlng, cat,
          iconNum: iconNum || 1
        };

        // Маркер
        const marker = L.marker(latlng, {
          icon: makeIcon(item.iconNum)
        });
        marker.bindPopup(`<strong>${escapeHtml(item.name)}</strong>`);
        marker.on('click', () => {
          openPopupAndMaybeOpenSheet(item);
        });

        item.marker = marker;
        items.push(item);
      }

      state.items = items;
      countTotalEl.textContent = items.length.toString();

      // Отрисовка
      applyFilters(true);      // initial, зум ко всем
    } catch (err) {
      console.error('[KML] load error', err);
      showToast('Ошибка загрузки данных.');
    }
  }

  // ---------- ФИЛЬТР/ПОИСК/ОТРИСОВКА ----------
  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function applyFilters(fitAll = false) {
    const q = lc(state.q);
    const cat = state.cat;

    // фильтр по категории и поиску
    const filtered = state.items.filter(it => {
      if (cat !== 'all' && it.cat !== cat) return false;
      if (q) {
        const hay = lc(`${it.name} ${it.desc}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // слой
    poiLayer.clearLayers();
    filtered.forEach(it => it.marker.addTo(poiLayer));

    // счётчики
    countCatEl.textContent = filtered.length.toString();

    // лист
    renderList(filtered);

    // fit
    if (fitAll) {
      fitToItems(filtered.length ? filtered : state.items);
    }
  }

  function fitToItems(list) {
    if (!list.length) return;
    const b = L.latLngBounds(list.map(it => it.latlng));
    if (b.isValid()) {
      map.fitBounds(b.pad(0.12));
    }
  }

  // ---------- СПИСОК ----------
  function renderList(arr) {
    listEl.innerHTML = '';
    const frag = document.createDocumentFragment();

    arr.forEach(it => {
      const li = document.createElement('div');
      li.className = 'list-item';
      li.setAttribute('data-id', it.id);

      li.innerHTML = `
        <div class="title">${escapeHtml(it.name)}</div>
      `;
      li.addEventListener('click', () => {
        map.setView(it.latlng, Math.max(map.getZoom(), 16), { animate: true });
        it.marker.openPopup();
        setSheet(false); // закрыть лист после перехода
      });

      frag.appendChild(li);
    });

    listEl.appendChild(frag);
  }

  // ---------- НИЖНИЙ ЛИСТ ----------
  function setSheet(open) {
    sidebarEl.classList.toggle('open', open);
    sidebarEl.setAttribute('aria-hidden', open ? 'false' : 'true');
    sheetHandle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function openPopupAndMaybeOpenSheet(it) {
    // просто открыть попап; лист открывать не обязательно
    it.marker.openPopup();
  }

  sheetHandle?.addEventListener('click', () => {
    setSheet(!sidebarEl.classList.contains('open'));
  });
  btnCloseSidebar?.addEventListener('click', () => setSheet(false));

  // ---------- СОБЫТИЯ UI ----------
  // Чипы категорий
  chipsBox.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;

    $$('.chip').forEach(c => c.dataset.active = 'false');
    btn.dataset.active = 'true';
    state.cat = btn.getAttribute('data-cat') || 'all';

    applyFilters(true);
  });

  // Дом (= показать всё)
  btnShowAll.addEventListener('click', () => {
    // Активируем «Все», чистим поиск
    const allBtn = $('.chip[data-cat="all"]');
    if (allBtn) {
      $$('.chip').forEach(c => c.dataset.active = 'false');
      allBtn.dataset.active = 'true';
    }
    state.cat = 'all';
    state.q = '';
    searchInput.value = '';

    applyFilters(true);
  });

  // Поиск
  const handleSearch = debounce(() => {
    state.q = searchInput.value || '';
    applyFilters(false);
  }, 200);
  searchInput.addEventListener('input', handleSearch);

  // Геолокация
  let following = false;

  function startLocate() {
    following = true;
    btnLocate.classList.add('active');
    locate.start();

    // Если пользователь далеко от облака точек — подскажем
    try {
      map.once('locationfound', (ev) => {
        const user = ev.latlng;
        const all = state.items;
        if (!all.length) return;
        const b = L.latLngBounds(all.map(it => it.latlng));
        const center = b.getCenter();
        const d = user.distanceTo(center); // метры
        if (d > 3000) {
          showToast('Вы далеко от точек. Отключите «Где я?» для свободного просмотра.');
        }
        map.setView(user, Math.max(map.getZoom(), 16), { animate: true });
      });
    } catch {}
  }

  function stopLocate() {
    following = false;
    btnLocate.classList.remove('active');
    locate.stop();
  }

  btnLocate.addEventListener('click', () => {
    if (following) stopLocate(); else startLocate();
  });

  // ---------- СТАРТ ----------
  loadKml();
})();
