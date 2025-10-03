# OneSignal Vercel Deployment Fix

## 🎯 **Current Setup: Vercel**

You're using **Vercel** for deployment, not nginx. The issue was that Vercel's rewrite rules were causing service worker files to be served as `index.html`.

## 🔧 **What I Fixed**

### **`frontend/vercel.json`** ✅
```json
{
  "rewrites": [
    {
      "source": "/((?!api|_next|static|favicon.ico|OneSignalSDKWorker.js|OneSignalSDK.sw.js|sw.js).*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(OneSignalSDKWorker.js|OneSignalSDK.sw.js|sw.js)",
      "headers": [
        {
          "key": "Content-Type",
          "value": "application/javascript"
        },
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        },
        {
          "key": "Pragma",
          "value": "no-cache"
        },
        {
          "key": "Expires",
          "value": "0"
        }
      ]
    }
  ]
}
```

## 🚀 **Deployment Steps**

### **Step 1: Deploy to Vercel**
```bash
# If using Vercel CLI
vercel --prod

# Or push to your connected Git repository
git add .
git commit -m "Fix OneSignal service worker MIME types"
git push
```

### **Step 2: Verify Service Worker Files**
After deployment, test these URLs:
```bash
# Should return JavaScript content with correct MIME type
curl -I "https://crt.pydahsoft.in/OneSignalSDKWorker.js"
curl -I "https://crt.pydahsoft.in/sw.js"
```

**Expected Response:**
```
Content-Type: application/javascript
Status: 200 OK
```

### **Step 3: Test OneSignal Integration**
1. Open `https://crt.pydahsoft.in` in browser
2. Open browser console (F12)
3. Check for OneSignal initialization logs
4. Test push notification subscription

## 🔍 **How the Fix Works**

### **Before Fix:**
```
Vercel rewrite rule: /OneSignalSDKWorker.js → /index.html
Result: Service worker file served as HTML
MIME Type: text/html ❌
```

### **After Fix:**
```
Vercel rewrite rule: /OneSignalSDKWorker.js → (excluded from rewrite)
Result: Service worker file served as JavaScript
MIME Type: application/javascript ✅
```

## 📋 **Key Changes Made**

1. **Excluded service worker files from rewrite rule**
   - Added `OneSignalSDKWorker.js|OneSignalSDK.sw.js|sw.js` to exclusion list
   - This prevents Vercel from rewriting these files to `index.html`

2. **Added specific headers for service worker files**
   - `Content-Type: application/javascript`
   - `Cache-Control: no-cache, no-store, must-revalidate`
   - `Pragma: no-cache`
   - `Expires: 0`

## ✅ **Expected Results**

After deployment:
- ✅ Service worker files return `Content-Type: application/javascript`
- ✅ OneSignal can register service workers successfully
- ✅ Push notification subscription works
- ✅ No MIME type errors in console
- ✅ OneSignal initialization succeeds

## 🚨 **If Issues Persist**

1. **Check Vercel deployment logs**
2. **Verify files are in `frontend/public/` directory**
3. **Clear browser cache and hard refresh**
4. **Check OneSignal dashboard for app configuration**

## 📁 **File Structure (Vercel)**
```
frontend/
├── public/
│   ├── OneSignalSDKWorker.js  ✅ Served by Vercel
│   └── sw.js                  ✅ Served by Vercel
├── vercel.json                ✅ Updated configuration
└── src/
    └── services/
        └── oneSignalService.js ✅ Updated OneSignal v16 API
```

The OneSignal integration should now work perfectly with Vercel! 🎉
