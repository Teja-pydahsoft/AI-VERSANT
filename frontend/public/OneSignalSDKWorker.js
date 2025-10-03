importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// Add message event handler to prevent the warning
self.addEventListener('message', function(event) {
  // Forward messages to OneSignal SDK
  if (event.data && event.data.type) {
    // Handle any custom messages if needed
    console.log('Service Worker received message:', event.data);
  }
});

// Add install event handler for better service worker lifecycle management
self.addEventListener('install', function(event) {
  console.log('OneSignal Service Worker installing...');
  self.skipWaiting();
});

// Add activate event handler
self.addEventListener('activate', function(event) {
  console.log('OneSignal Service Worker activating...');
  event.waitUntil(self.clients.claim());
}); 