// ======================= anti-embed (защита от <iframe>) =======================
(function antiEmbed() {
  try {
    if (window.top !== window.self) {
      window.top.location = window.location.href;
    }
  } catch (e) {
    // если нарушение CSP/сопровождение — просто не показываем документ
    document.documentElement.innerHTML = "";
  }
})();

// ======================= Service Worker =======================
(function sw() {
  if (!("serviceWorker" in navigator)) return;

  let refreshed = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshed) return;
    refreshed = true;
    // перезагрузка один раз, когда SW впервые берёт под контроль страницу
    window.location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    } catch (e) {
      console.warn("[sw] register error:", e);
    }
  });
})();

// ======================= Установка PWA (Android) =======================
(function installBtn() {
  const isAndroid   = /Android/i.test(navigator.userAgent);
  const isIOS       = /iPad|iPhone|iPod/i.test(navigator.userAgent);
  const isStandalone = () =>
    (typeof navigator.standalone === "boolean" && navigator.standalone) ||
    window.matchMedia("(display-mode: standalone)").matches;

  let deferredPrompt = null;
  const btn = document.getElementById("btnInstall");
  if (btn) btn.style.display = "none"; // по умолчанию скрыто

  // Показываем кнопку только когда браузер прислал событие и мы не в PWA
  window.addEventListener("beforeinstallprompt", (e) => {
    // На iOS официального beforeinstallprompt нет — скрываем кнопку
    if (isIOS) return;
    // На десктопе не показываем (по задаче нужна именно Android-кнопка)
    if (!isAndroid) { e.preventDefault(); return; }

    e.preventDefault();
    deferredPrompt = e;
    if (btn && !isStandalone()) btn.style.display = "inline-grid";
  });

  // Клик по нашей кнопке
  btn?.addEventListener("click", async () => {
    if (!deferredPrompt) {
      // Фолбэк: если событие потеряно (редкий случай)
      alert('Откройте меню браузера и выберите «Установить приложение».');
      return;
    }
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch {}
    deferredPrompt = null;
    btn.style.display = "none";
  });

  // Если приложение установили — кнопку больше не показываем
  window.addEventListener("appinstalled", () => {
    if (btn) btn.style.display = "none";
    try { localStorage.setItem("pwa-installed", "1"); } catch {}
  });

  // Если вошли уже как PWA (standalone), кнопку также прячем
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isStandalone() && btn) {
      btn.style.display = "none";
    }
  });
})();
