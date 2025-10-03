# OneSignal Deployment Guide

## 📁 Required Files for OneSignal

### 1. OneSignalSDKWorker.js
**Location**: Must be accessible at `https://crt.pydahsoft.in/OneSignalSDKWorker.js`

**Content**:
```javascript
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
```

**File Locations**:
- ✅ `OneSignalSDKWorker.js` (root directory)
- ✅ `frontend/public/OneSignalSDKWorker.js` (for Vite build)

## 🚀 Deployment Steps

### For Development (Vite)
1. The file `frontend/public/OneSignalSDKWorker.js` will be automatically served at `/OneSignalSDKWorker.js`
2. Start your dev server: `npm run dev`
3. OneSignal will work at `http://localhost:3000`

### For Production (Vercel/Netlify)
1. The file `frontend/public/OneSignalSDKWorker.js` will be copied to the build output
2. It will be accessible at `https://crt.pydahsoft.in/OneSignalSDKWorker.js`
3. Deploy your frontend normally

### For Production (Server with Nginx/Apache)
1. Copy `OneSignalSDKWorker.js` to your web server's root directory
2. Ensure it's accessible at `https://crt.pydahsoft.in/OneSignalSDKWorker.js`
3. Configure your server to serve `.js` files with correct MIME type

## 🔧 Server Configuration

### Nginx Configuration
```nginx
# Ensure .js files are served with correct MIME type
location ~* \.(js)$ {
    add_header Content-Type application/javascript;
    add_header Cache-Control "public, max-age=31536000";
}

# Specifically for OneSignal files
location = /OneSignalSDKWorker.js {
    add_header Content-Type application/javascript;
    add_header Cache-Control "public, max-age=31536000";
}
```

### Apache Configuration (.htaccess)
```apache
# Ensure .js files are served with correct MIME type
<FilesMatch "\.js$">
    Header set Content-Type "application/javascript"
</FilesMatch>

<Files "OneSignalSDKWorker.js">
    Header set Content-Type "application/javascript"
</Files>
```

## ✅ Verification

### Check if OneSignalSDKWorker.js is accessible:
1. Visit: `https://crt.pydahsoft.in/OneSignalSDKWorker.js`
2. You should see the content: `importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");`
3. The response should have `Content-Type: application/javascript`

### Check OneSignal Integration:
1. Open browser developer tools
2. Go to Application > Service Workers
3. You should see OneSignal service worker registered
4. No MIME type errors in console

## 🐛 Troubleshooting

### MIME Type Error
**Error**: `The script has an unsupported MIME type ('text/html')`

**Solution**: 
1. Ensure `OneSignalSDKWorker.js` is accessible at the correct URL
2. Configure server to serve `.js` files with `Content-Type: application/javascript`
3. Check that the file contains the correct import statement

### Service Worker Not Registering
**Error**: Service worker registration failed

**Solution**:
1. Verify HTTPS is working
2. Check that the file is accessible
3. Ensure correct MIME type
4. Check browser console for errors

### OneSignal Bell Not Appearing
**Solution**:
1. Verify JavaScript code is in `<head>` section
2. Check that App ID is correct
3. Ensure OneSignalSDKWorker.js is accessible
4. Check browser console for errors

## 📋 Checklist

- [ ] `OneSignalSDKWorker.js` created with correct content
- [ ] File accessible at `https://crt.pydahsoft.in/OneSignalSDKWorker.js`
- [ ] Server serves `.js` files with correct MIME type
- [ ] OneSignal JavaScript code added to HTML
- [ ] HTTPS is working properly
- [ ] No console errors
- [ ] OneSignal bell icon appears
- [ ] Test notification works

## 🎯 Next Steps

1. **Deploy the files** to your production server
2. **Test the integration** using the OneSignal testing interface
3. **Verify service worker registration** in browser dev tools
4. **Send test notifications** to ensure everything works
5. **Monitor for any errors** in production

The OneSignal integration should now work correctly following the official documentation!
