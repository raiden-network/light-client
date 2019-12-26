importScripts("/precache-manifest.83a087e65e7d49a5d05a742e0427b6ed.js", "https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js");

self.addEventListener('message', e => {
  if (!e.data) {
    return;
  }

  switch (e.data) {
    case 'skipWaiting':
      self.skipWaiting();
      break;
    default:
      break;
  }
});

