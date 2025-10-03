// Service Worker for VERSANT Application
// This is a simple service worker that works with OneSignal

console.log('VERSANT Service Worker: Starting...');

// Handle push events
self.addEventListener('push', function(event) {
  console.log('Service Worker: Push received');
  
  if (event.data) {
    try {
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
    } catch (error) {
      console.error('Service Worker: Error processing push data:', error);
    }
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

// Handle messages from main thread
self.addEventListener('message', function(event) {
  console.log('Service Worker: Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('VERSANT Service Worker: Initialized successfully');
