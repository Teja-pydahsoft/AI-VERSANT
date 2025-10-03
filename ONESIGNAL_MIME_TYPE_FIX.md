# OneSignal MIME Type Fix Guide

## Problem
OneSignal service worker files are being served with incorrect MIME type (`text/html` instead of `application/javascript`), causing service worker registration to fail.

## Solution
The following configurations ensure service worker files are served with the correct MIME type:

### 1. Nginx Configuration
Updated `frontend/nginx.conf` with specific location block for service worker files:

```nginx
# Service Worker files - must be served with correct MIME type
location ~* \.(sw\.js|OneSignalSDKWorker\.js|OneSignalSDK\.sw\.js)$ {
    add_header Content-Type "application/javascript";
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Pragma "no-cache";
    add_header Expires "0";
}
```

### 2. Apache Configuration
Created `frontend/public/.htaccess` for Apache servers:

```apache
# Service Worker files - must be served with correct MIME type
<FilesMatch "\.(sw\.js|OneSignalSDKWorker\.js|OneSignalSDK\.sw\.js)$">
    Header set Content-Type "application/javascript"
    Header set Cache-Control "no-cache, no-store, must-revalidate"
    Header set Pragma "no-cache"
    Header set Expires "0"
</FilesMatch>
```

### 3. Files That Need Correct MIME Type
- `sw.js` - Application service worker
- `OneSignalSDKWorker.js` - OneSignal service worker
- `OneSignalSDK.sw.js` - OneSignal SDK service worker

## Deployment Steps

### For Nginx:
1. Update your nginx configuration with the provided location block
2. Reload nginx: `sudo nginx -s reload`
3. Test: `curl -I https://yourdomain.com/OneSignalSDKWorker.js`

### For Apache:
1. Ensure mod_headers is enabled: `sudo a2enmod headers`
2. Place `.htaccess` file in your web root
3. Restart Apache: `sudo systemctl restart apache2`
4. Test: `curl -I https://yourdomain.com/OneSignalSDKWorker.js`

### For Other Servers:
Ensure these files are served with `Content-Type: application/javascript`:
- `sw.js`
- `OneSignalSDKWorker.js` 
- `OneSignalSDK.sw.js`

## Verification
Check that service worker files return the correct MIME type:

```bash
curl -I https://yourdomain.com/OneSignalSDKWorker.js
# Should return: Content-Type: application/javascript
```

## Expected Result
- ✅ Service worker registration succeeds
- ✅ OneSignal push notifications work
- ✅ No more MIME type errors in console
- ✅ Push notification subscription works properly
