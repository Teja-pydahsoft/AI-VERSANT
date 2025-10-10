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

// IMPORTANT: Handle VAPID push notifications
// OneSignal SDK handles its own push events, but we need to handle VAPID too
self.addEventListener('push', function(event) {
  console.log('🔔 [SW] Push event received', event);
  console.log('🔔 [SW] Has data:', !!event.data);
  
  // If no data, show default notification
  if (!event.data) {
    console.log('📬 [SW] No data in push event, showing default notification');
    event.waitUntil(
      self.registration.showNotification('VERSANT Notification', {
        body: 'You have a new notification',
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        timestamp: Date.now()
      })
    );
    return;
  }
  
  // Try to parse the data
  try {
    const data = event.data.json();
    console.log('📦 [SW] Push data parsed:', data);
    
    // Check if this is a OneSignal notification
    if (data.custom || data.alert || data.heading || data.headings) {
      console.log('📱 [SW] OneSignal notification detected - letting SDK handle it');
      // Don't return - let OneSignal SDK handle it, but also show our own notification as backup
      // This ensures notification is shown even if OneSignal SDK fails
    }
    
    // Handle VAPID notification or show backup notification
    console.log('📬 [SW] Showing notification...');
    
    const title = data.title || data.heading || data.headings?.en || 'VERSANT Notification';
    const body = data.body || data.alert || data.contents?.en || 'You have a new notification';
    
    const options = {
      body: body,
      icon: data.icon || data.chrome_web_icon || '/icon-192x192.png',
      badge: data.badge || data.chrome_web_badge || '/badge-72x72.png',
      data: data.data || data,
      tag: data.tag || 'versant-notification-' + Date.now(),
      requireInteraction: data.requireInteraction || false,
      renotify: true,
      silent: false,
      timestamp: Date.now(),
      vibrate: [200, 100, 200]
    };
    
    console.log('📢 [SW] Notification options:', { title, ...options });
    
    event.waitUntil(
      self.registration.showNotification(title, options)
        .then(() => {
          console.log('✅ [SW] Notification shown successfully');
        })
        .catch(err => {
          console.error('❌ [SW] Error showing notification:', err);
        })
    );
  } catch (e) {
    console.error('❌ [SW] Error parsing push data:', e);
    // Fallback: try to get text data
    let body = 'You have a new notification';
    try {
      body = event.data.text();
      console.log('📝 [SW] Got text data:', body);
    } catch (textError) {
      console.error('❌ [SW] Could not get text data:', textError);
    }
    
    event.waitUntil(
      self.registration.showNotification('VERSANT Notification', {
        body: body,
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        timestamp: Date.now(),
        tag: 'versant-fallback-' + Date.now()
      })
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', function(event) {
  console.log('🖱️ Notification clicked', event);
  
  event.notification.close();
  
  // Get URL from notification data
  const data = event.notification.data || {};
  let url = data.url || data.launchURL || '/';
  
  // Make sure URL is absolute
  if (!url.startsWith('http')) {
    url = self.registration.scope + url.replace(/^\//, '');
  }
  
  console.log('🔗 Opening URL:', url);
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus().then(client => {
            // Navigate to the URL if needed
            if (client.navigate) {
              return client.navigate(url);
            }
          });
        }
      }
      // If no window/tab is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
}); 