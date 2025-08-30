(function antiEmbed(){
  try {
    if (window.top !== window.self) {
      window.top.location = window.self.location;
    }
  } catch (e) {
    document.documentElement.innerHTML = "";
  }
})();

// Service Worker: авто-перезагрузка при первом контроле + регистрация
(function sw(){
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (sessionStorage.getItem("sw-refreshed")) return;
      sessionStorage.setItem("sw-refreshed", "1");
      window.location.reload();
    });
    window.addEventListener("load", async function () {
      try { await navigator.serviceWorker.register("./sw.js", { scope: "./" }); }
      catch (e) { console.warn(e); }
    });
  }
})();

// Установка PWA: своя кнопка на Android; на десктопе системный баннер скрываем
(function installBtn(){
  var deferredPrompt = null;
  var btn = null;

  function isStandalone() {
    if ("standalone" in navigator && navigator.standalone) return true; // iOS
    return window.matchMedia("(display-mode: standalone)").matches;     // Chrome
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    var isAndroid = /Android/i.test(navigator.userAgent);
    if (!isAndroid) { e.preventDefault(); return; } // десктоп — скрыть
    e.preventDefault();
    deferredPrompt = e;

    btn = document.getElementById("btnInstall");
    if (btn && !isStandalone()) btn.style.display = "inline-grid";
  });

  window.addEventListener("DOMContentLoaded", function () {
    btn = document.getElementById("btnInstall");
    if (!btn) return;

    btn.addEventListener("click", async function () {
      if (!deferredPrompt) {
        alert('Откройте меню Chrome и выберите «Установить приложение».');
        return;
      }
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; }
      finally { deferredPrompt = null; btn.style.display = "none"; }
    });

    if (isStandalone() && btn) btn.style.display = "none";
  });
})();
