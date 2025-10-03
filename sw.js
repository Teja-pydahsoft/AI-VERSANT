// Service Worker for VERSANT Application
// This handles both our app's service worker and OneSignal integration

// Import OneSignal SDK
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// OneSignal configuration
const ONESIGNAL_APP_ID = "ee224f6c-70c4-4414-900b-c283db5ea114";

// Initialize OneSignal in the service worker
OneSignal.init({
  appId: ONESIGNAL_APP_ID,
  autoResubscribe: true,
  notifyButton: {
    enable: true,
    showCredit: false
  }
});

// Handle push events
self.addEventListener('push', function(event) {
  console.log('Service Worker: Push received');
  
  if (event.data) {
    const data = event.data.json();
    console.log('Service Worker: Push data:', data);
    
    const options = {
      body: data.body || 'You have a new notification',
      icon: data.icon || '/icon-192x192.png',
      badge: data.badge || '/badge-72x72.png',
      image: data.image || null,
      data: data.data || {},
      tag: data.tag || `notification-${Date.now()}`,
      requireInteraction: data.requireInteraction || false,
      actions: data.actions || [],
      vibrate: data.vibrate || [200, 100, 200],
      timestamp: Date.now(),
      renotify: true,
      silent: false
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'VERSANT Notification', options)
        .then(() => {
          console.log('Service Worker: Notification displayed successfully');
        })
        .catch(error => {
          console.error('Service Worker: Error showing notification:', error);
        })
    );
  }
});

// Handle notification click events
self.addEventListener('notificationclick', function(event) {
  console.log('Service Worker: Notification clicked');
  
  event.notification.close();

  const data = event.notification.data || {};
  const url = data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(clientList) {
      // Check if there's already a window/tab open with the target URL
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      
      // If no existing window, open a new one
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Handle notification close events
self.addEventListener('notificationclose', function(event) {
  console.log('Service Worker: Notification closed');
  
  const data = event.notification.data || {};
  if (data.trackDismissal) {
    console.log('Service Worker: Notification dismissed:', data);
  }
});

// Handle background sync
self.addEventListener('sync', function(event) {
  console.log('Service Worker: Background sync');
  
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

function doBackgroundSync() {
  // Implement background sync logic here
  return Promise.resolve();
}

// Handle push subscription changes
self.addEventListener('pushsubscriptionchange', function(event) {
  console.log('Service Worker: Push subscription changed');
  
  event.waitUntil(
    // Re-subscribe to OneSignal push notifications
    OneSignal.pushManager.subscribe({
      userVisibleOnly: true
    }).then(function(subscription) {
      // Send new subscription to server
      return fetch('/api/onesignal/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription),
        headers: {
          'Content-Type': 'application/json'
        }
      });
    })
  );
});

console.log('Service Worker: Initialized successfully');
