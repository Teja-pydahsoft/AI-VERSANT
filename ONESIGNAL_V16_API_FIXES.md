# OneSignal v16 API Fixes

## 🚨 **Fixed OneSignal API Methods**

### **Problem**: Using deprecated OneSignal API methods that don't exist in v16

### **Solution**: Updated all methods to use correct OneSignal v16 API

## 📋 **API Method Changes**

### **1. User Tags (`sendTags` → `User.addTags`)**
```javascript
// OLD (Deprecated)
await this.oneSignal.sendTags(tags);

// NEW (OneSignal v16)
if (this.oneSignal.User && this.oneSignal.User.addAlias) {
  // Set external user ID if provided
  if (tags.userId) {
    await this.oneSignal.User.addAlias('external_user_id', tags.userId);
  }
  
  // Set other tags
  const tagEntries = Object.entries(tags).filter(([key]) => key !== 'userId');
  if (tagEntries.length > 0) {
    const tagObject = Object.fromEntries(tagEntries);
    await this.oneSignal.User.addTags(tagObject);
  }
}
```

### **2. Get User ID (`getUserId` → `User.onesignalId`)**
```javascript
// OLD (Deprecated)
const userId = await this.oneSignal.getUserId();

// NEW (OneSignal v16)
if (this.oneSignal.User && this.oneSignal.User.onesignalId) {
  const userId = this.oneSignal.User.onesignalId;
}
```

### **3. Unsubscribe (`setSubscription` → `Notifications.setConsentGiven`)**
```javascript
// OLD (Deprecated)
await this.oneSignal.setSubscription(false);

// NEW (OneSignal v16)
if (this.oneSignal.Notifications && this.oneSignal.Notifications.setConsentGiven) {
  await this.oneSignal.Notifications.setConsentGiven(false);
}
```

### **4. Permission Check (`getNotificationPermission` → `Notifications.permission`)**
```javascript
// OLD (Deprecated)
const permission = await this.oneSignal.getNotificationPermission();

// NEW (OneSignal v16)
const permission = this.oneSignal.Notifications.permission;
```

### **5. Request Permission (`showNativePrompt` → `Notifications.requestPermission`)**
```javascript
// OLD (Deprecated)
const permission = await this.oneSignal.showNativePrompt();

// NEW (OneSignal v16)
const permission = await this.oneSignal.Notifications.requestPermission();
```

## 🔧 **OneSignal v16 API Structure**

```javascript
OneSignal = {
  Notifications: {
    permission: boolean,                    // Check permission status
    requestPermission: function(),          // Request permission
    setConsentGiven: function(boolean)      // Set consent
  },
  User: {
    onesignalId: string,                    // Get user ID
    addAlias: function(key, value),         // Set external user ID
    addTags: function(tags)                 // Set user tags
  }
}
```

## ✅ **Fixed Methods**

1. **`setUserTags()`** - Now uses `User.addTags()` and `User.addAlias()`
2. **`getUserId()`** - Now uses `User.onesignalId`
3. **`unsubscribe()`** - Now uses `Notifications.setConsentGiven()`
4. **`checkSubscriptionStatus()`** - Now uses `Notifications.permission`
5. **`subscribe()`** - Now uses `Notifications.requestPermission()`

## 🚀 **Expected Results**

After these fixes:
- ✅ **No more "sendTags is not a function" errors**
- ✅ **No more "getUserId is not a function" errors**
- ✅ **No more "setSubscription is not a function" errors**
- ✅ **User tagging works properly**
- ✅ **User ID retrieval works**
- ✅ **Subscription management works**

## 📁 **Updated File**

- **`frontend/src/services/oneSignalService.js`** - All OneSignal API methods updated to v16

The OneSignal integration should now work perfectly with the correct v16 API methods! 🎉
