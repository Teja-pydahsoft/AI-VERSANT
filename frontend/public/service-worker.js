// Service Worker for Web Push Notifications (VAPID)
// This handles VAPID push notifications
// OneSignal notifications are handled by OneSignalSDKWorker.js

self.addEventListener('install', function(event) {
  console.log('🔧 [VAPID-SW] Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('✅ [VAPID-SW] Service Worker activating...');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function(event) {
  console.log('🔔 [VAPID-SW] Push event received', event);
  console.log('🔔 [VAPID-SW] Has data:', !!event.data);

  // If no data, show default notification
  if (!event.data) {
    console.log('📬 [VAPID-SW] No data in push event, showing default notification');
    event.waitUntil(
      self.registration.showNotification('VERSANT Notification', {
        body: 'You have a new notification',
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        tag: 'versant-default-' + Date.now(),
        timestamp: Date.now()
      })
    );
    return;
  }

  let notificationData = {};
  let title = 'VERSANT Notification';
  let body = 'You have a new notification';

  try {
    notificationData = event.data.json();
    console.log('📦 [VAPID-SW] Notification data:', notificationData);
    
    // Extract title and body - support multiple formats
    title = notificationData.title || 
            notificationData.notification?.title || 
            notificationData.heading ||
            notificationData.headings?.en || 
            title;
            
    body = notificationData.body || 
           notificationData.notification?.body || 
           notificationData.alert ||
           notificationData.contents?.en ||
           body;
           
    console.log('📢 [VAPID-SW] Parsed title:', title);
    console.log('📢 [VAPID-SW] Parsed body:', body);
  } catch (e) {
    console.error('❌ [VAPID-SW] Error parsing notification data:', e);
    try {
      body = event.data.text();
      console.log('📝 [VAPID-SW] Got text data:', body);
    } catch (textError) {
      console.error('❌ [VAPID-SW] Could not get text data:', textError);
    }
  }

  const options = {
    body: body,
    icon: notificationData.icon || notificationData.chrome_web_icon || '/icon-192x192.png',
    badge: notificationData.badge || notificationData.chrome_web_badge || '/badge-72x72.png',
    data: notificationData.data || notificationData || {},
    tag: notificationData.tag || 'versant-notification-' + Date.now(),
    actions: notificationData.actions || notificationData.web_buttons || [],
    requireInteraction: notificationData.requireInteraction || false,
    renotify: true,
    silent: false,
    timestamp: Date.now(),
    vibrate: [200, 100, 200]
  };

  console.log('📢 [VAPID-SW] Showing notification with options:', { title, ...options });

  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => {
        console.log('✅ [VAPID-SW] Notification shown successfully');
      })
      .catch(err => {
        console.error('❌ [VAPID-SW] Error showing notification:', err);
        // Fallback: try showing basic notification
        return self.registration.showNotification('VERSANT Notification', {
          body: body,
          icon: '/icon-192x192.png',
          tag: 'versant-fallback-' + Date.now()
        });
      })
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('🖱️ [VAPID-SW] Notification clicked', event);
  console.log('🖱️ [VAPID-SW] Notification data:', event.notification.data);

  event.notification.close();

  // Get URL from notification data - support multiple formats
  const data = event.notification.data || {};
  let url = data.url || data.launchURL || data.link || '/';

  // Make sure URL is absolute
  if (!url.startsWith('http')) {
    // Get the origin from the service worker scope
    const origin = self.registration.scope.replace(/\/$/, '');
    url = origin + (url.startsWith('/') ? url : '/' + url);
  }

  console.log('🔗 [VAPID-SW] Opening URL:', url);

  event.waitUntil(
    clients.matchAll({ 
      type: 'window',
      includeUncontrolled: true 
    }).then(windowClients => {
      console.log('🪟 [VAPID-SW] Found', windowClients.length, 'window clients');
      
      // Check if there is already a window/tab open with our app
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        // Check if client is from our app
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          console.log('✅ [VAPID-SW] Focusing existing window');
          return client.focus().then(focusedClient => {
            // Navigate to the URL if client supports navigation
            if (focusedClient.navigate && url) {
              console.log('🧭 [VAPID-SW] Navigating to:', url);
              return focusedClient.navigate(url);
            }
            return focusedClient;
          });
        }
      }
      
      // If no window/tab is open, open a new one
      if (clients.openWindow) {
        console.log('🆕 [VAPID-SW] Opening new window');
        return clients.openWindow(url);
      }
    })
    .then(() => {
      console.log('✅ [VAPID-SW] Notification click handled successfully');
    })
    .catch(err => {
      console.error('❌ [VAPID-SW] Error handling notification click:', err);
    })
  );
});

// Handle push subscription change
self.addEventListener('pushsubscriptionchange', function(event) {
  console.log('🔄 [VAPID-SW] Push subscription changed', event);
  
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: event.oldSubscription.options.applicationServerKey
    })
    .then(function(newSubscription) {
      console.log('✅ [VAPID-SW] New subscription created:', newSubscription);
      // TODO: Send new subscription to backend
      return fetch('/api/push-notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscription: newSubscription.toJSON(),
          oldEndpoint: event.oldSubscription ? event.oldSubscription.endpoint : null
        })
      });
    })
    .catch(function(error) {
      console.error('❌ [VAPID-SW] Failed to resubscribe:', error);
    })
  );
});

// Handle errors
self.addEventListener('error', function(event) {
  console.error('❌ [VAPID-SW] Service Worker error:', event.error);
});

// Handle unhandled promise rejections
self.addEventListener('unhandledrejection', function(event) {
  console.error('❌ [VAPID-SW] Unhandled promise rejection:', event.reason);
});