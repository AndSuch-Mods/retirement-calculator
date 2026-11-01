(function () {
  'use strict';

  // This time element identifies the code actually loaded on this device.
  // Every release should update its datetime, visible text and release ID.
  const version = document.getElementById('appUpdated');
  const refresh = document.getElementById('appRefresh');
  if (!version || !refresh || !window.fetch || !window.DOMParser) return;

  let checking = false;
  async function checkForNewRelease() {
    if (checking || document.visibilityState === 'hidden') return;
    checking = true;
    try {
      // Same-origin request bypasses cached home-screen HTML without relying
      // on GitHub APIs or a user installing a new shortcut.
      const response = await fetch(
        './household.html?release-check=' + Date.now(), { cache: 'no-store' }
      );
      if (!response.ok) return;
      const html = await response.text();
      const latest = new DOMParser().parseFromString(html, 'text/html')
        .getElementById('appUpdated');
      const latestId = latest?.getAttribute('data-release-id');
      const loadedId = version.getAttribute('data-release-id');
      if (latestId && loadedId && latestId !== loadedId) {
        refresh.hidden = false;
        refresh.title = 'Reload the updated retirement calculator';
        refresh.onclick = () => {
          window.location.replace('./household.html?release=' + encodeURIComponent(latestId));
        };
      }
    } catch (_) {
      // Offline home-screen apps keep showing their installed release date.
    } finally {
      checking = false;
    }
  }

  checkForNewRelease();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForNewRelease();
  });
})();
