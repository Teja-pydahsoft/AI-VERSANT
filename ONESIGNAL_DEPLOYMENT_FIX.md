# OneSignal Deployment Fix Guide

## 🚨 **Critical Issues Fixed**

### 1. **MIME Type Issue** ✅
**Problem**: Server was serving service worker files as `text/html` instead of `application/javascript`

**Root Cause**: Nginx location block order - service worker location was AFTER the general location block

**Solution**: Moved service worker location block BEFORE the general location block in `nginx.conf`

### 2. **OneSignal API Methods** ✅
**Problem**: Using deprecated/non-existent OneSignal API methods

**Root Cause**: OneSignal SDK v16 has different API structure

**Solution**: Updated to use correct OneSignal v16 API methods

## 📁 **Files Updated**

### **`frontend/nginx.conf`**
```nginx
# Service Worker files - must be served with correct MIME type (BEFORE general location)
location ~* \.(sw\.js|OneSignalSDKWorker\.js|OneSignalSDK\.sw\.js)$ {
    add_header Content-Type "application/javascript";
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Pragma "no-cache";
    add_header Expires "0";
    try_files $uri =404;
}

# Handle client-side routing
location / {
    try_files $uri $uri/ /index.html;
}
```

### **`frontend/src/services/oneSignalService.js`**
```javascript
// OLD (Incorrect)
const isOptedIn = await this.oneSignal.getNotificationPermission();
const permission = await this.oneSignal.showNativePrompt();

// NEW (Correct OneSignal v16 API)
const isOptedIn = this.oneSignal.Notifications.permission;
const permission = await this.oneSignal.Notifications.requestPermission();
```

## 🚀 **Deployment Steps**

### **Step 1: Deploy Nginx Configuration**
```bash
# Copy updated nginx.conf to server
scp frontend/nginx.conf user@server:/etc/nginx/sites-available/default

# Test nginx configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### **Step 2: Verify Service Worker Files**
```bash
# Test service worker URLs
curl -I "https://crt.pydahsoft.in/OneSignalSDKWorker.js"
curl -I "https://crt.pydahsoft.in/sw.js"

# Should return:
# Content-Type: application/javascript
# Status: 200 OK
```

### **Step 3: Test OneSignal Integration**
1. Open browser console
2. Check for OneSignal initialization logs
3. Test push notification subscription
4. Verify no MIME type errors

## 🔧 **Expected Results**

### **Before Fix:**
```
❌ Content-Type: text/html
❌ Status: 200 (but serving index.html)
❌ OneSignal.getNotificationPermission is not a function
❌ Service worker registration failed
```

### **After Fix:**
```
✅ Content-Type: application/javascript
✅ Status: 200 (serving actual JS file)
✅ OneSignal.Notifications.permission works
✅ Service worker registration succeeds
```

## 📋 **Verification Commands**

### **Test MIME Types:**
```bash
python test_mime_type.py
```

### **Test Service Worker URLs:**
```bash
# Should return JavaScript content, not HTML
curl "https://crt.pydahsoft.in/OneSignalSDKWorker.js"
curl "https://crt.pydahsoft.in/sw.js"
```

### **Test OneSignal API:**
```javascript
// In browser console
console.log('OneSignal available:', typeof window.OneSignal);
console.log('Notifications API:', window.OneSignal.Notifications);
console.log('Permission status:', window.OneSignal.Notifications.permission);
```

## 🎯 **Key Changes Made**

1. **Nginx Configuration**: Fixed location block order
2. **OneSignal API**: Updated to v16 correct methods
3. **Service Worker Files**: Cleaned up duplicates
4. **MIME Type Headers**: Added proper JavaScript MIME type

## ✅ **Success Indicators**

- ✅ Service worker files return `Content-Type: application/javascript`
- ✅ OneSignal initializes without errors
- ✅ Push notification subscription works
- ✅ No MIME type errors in console
- ✅ Service worker registration succeeds

## 🚨 **If Issues Persist**

1. **Check nginx error logs**: `sudo tail -f /var/log/nginx/error.log`
2. **Verify file permissions**: Ensure service worker files are readable
3. **Clear browser cache**: Hard refresh (Ctrl+F5)
4. **Check OneSignal dashboard**: Verify app configuration

The OneSignal integration should now work perfectly with proper MIME types and correct API usage!
