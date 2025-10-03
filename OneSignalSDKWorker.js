// OneSignal Service Worker for VERSANT Application
// This service worker handles OneSignal push notifications

importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// OneSignal configuration
const ONESIGNAL_APP_ID = "ee224f6c-70c4-4414-900b-c283db5ea114";

// Initialize OneSignal in the service worker
OneSignal.init({
  appId: ONESIGNAL_APP_ID,
  // Enable automatic prompt for permission
  autoResubscribe: true,
  // Enable notification click tracking
  notifyButton: {
    enable: true,
    showCredit: false,
    text: {
      "tip.state.unsubscribed": "Subscribe to notifications",
      "tip.state.subscribed": "You're subscribed to notifications",
      "tip.state.blocked": "You've blocked notifications",
      "message.prenotify": "Click to subscribe to notifications",
      "message.action.subscribed": "Thanks for subscribing!",
      "message.action.resubscribed": "You're subscribed to notifications",
      "message.action.unsubscribed": "You won't receive notifications again",
      "dialog.main.title": "Manage Site Notifications",
      "dialog.main.button.subscribe": "SUBSCRIBE",
      "dialog.main.button.unsubscribe": "UNSUBSCRIBE",
      "dialog.blocked.title": "Unblock Notifications",
      "dialog.blocked.message": "Follow these instructions to allow notifications:"
    }
  }
});

// Handle push events
self.addEventListener('push', function(event) {
  console.log('OneSignal: Push received');
  
  if (event.data) {
    const data = event.data.json();
    console.log('OneSignal: Push data:', data);
    
    const options = {
      body: data.body || 'You have a new notification',
      icon: data.icon || '/icon-192x192.png',
      badge: data.badge || '/badge-72x72.png',
      image: data.image || null,
      data: data.data || {},
      tag: data.tag || `onesignal-${Date.now()}`,
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
          console.log('OneSignal: Notification displayed successfully');
        })
        .catch(error => {
          console.error('OneSignal: Error showing notification:', error);
        })
    );
  }
});

// Handle notification click events
self.addEventListener('notificationclick', function(event) {
  console.log('OneSignal: Notification clicked');
  
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
  console.log('OneSignal: Notification closed');
  
  // Track notification dismissal if needed
  const data = event.notification.data || {};
  if (data.trackDismissal) {
    console.log('OneSignal: Notification dismissed:', data);
  }
});

// Handle background sync
self.addEventListener('sync', function(event) {
  console.log('OneSignal: Background sync');
  
  if (event.tag === 'onesignal-sync') {
    event.waitUntil(doOneSignalSync());
  }
});

function doOneSignalSync() {
  // Implement OneSignal-specific background sync logic here
  return Promise.resolve();
}

// Handle push subscription changes
self.addEventListener('pushsubscriptionchange', function(event) {
  console.log('OneSignal: Push subscription changed');
  
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

// OneSignal specific event handlers
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'ONESIGNAL_NOTIFICATION') {
    console.log('OneSignal: Custom message received:', event.data);
  }
});

console.log('OneSignal Service Worker: Initialized successfully');