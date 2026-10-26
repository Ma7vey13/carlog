// Runs before the app bundle so the saved theme is applied without a flash.
// Keep in sync with src/app/theme.ts (storage key and values).
(function () {
  try {
    var saved = localStorage.getItem('carlog.theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch (e) {
    // Storage may be unavailable (private mode): fall back to the system theme.
  }
})();
