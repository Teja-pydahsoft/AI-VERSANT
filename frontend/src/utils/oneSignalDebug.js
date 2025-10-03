/**
 * OneSignal Debug Utility
 * Helps debug OneSignal API availability and structure
 */

export const debugOneSignalAPI = () => {
  console.log('🔍 OneSignal Debug Information');
  console.log('================================');
  
  if (typeof window.OneSignal === 'undefined') {
    console.log('❌ OneSignal SDK not loaded');
    return;
  }

  console.log('✅ OneSignal SDK loaded');
  console.log('OneSignal object:', window.OneSignal);
  
  // Check main APIs
  console.log('\n📋 OneSignal API Structure:');
  console.log('- OneSignal.init:', typeof window.OneSignal.init);
  console.log('- OneSignal.Notifications:', window.OneSignal.Notifications);
  console.log('- OneSignal.User:', window.OneSignal.User);
  console.log('- OneSignal.getUserId:', typeof window.OneSignal.getUserId);
  console.log('- OneSignal.sendTags:', typeof window.OneSignal.sendTags);
  
  // Check Notifications API
  if (window.OneSignal.Notifications) {
    console.log('\n🔔 Notifications API:');
    console.log('- permission:', window.OneSignal.Notifications.permission);
    console.log('- requestPermission:', typeof window.OneSignal.Notifications.requestPermission);
    console.log('- setConsentGiven:', typeof window.OneSignal.Notifications.setConsentGiven);
  }
  
  // Check User API
  if (window.OneSignal.User) {
    console.log('\n👤 User API:');
    console.log('- onesignalId:', window.OneSignal.User.onesignalId);
    console.log('- addTags:', typeof window.OneSignal.User.addTags);
    console.log('- addAlias:', typeof window.OneSignal.User.addAlias);
  }
  
  // Check for other common methods
  console.log('\n🔧 Other Methods:');
  console.log('- showNativePrompt:', typeof window.OneSignal.showNativePrompt);
  console.log('- getNotificationPermission:', typeof window.OneSignal.getNotificationPermission);
  console.log('- isPushSupported:', typeof window.OneSignal.isPushSupported);
  console.log('- setSubscription:', typeof window.OneSignal.setSubscription);
  
  console.log('\n================================');
};

export const waitForOneSignalAPI = (timeout = 10000) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkAPI = () => {
      if (window.OneSignal && window.OneSignal.Notifications) {
        console.log('✅ OneSignal API ready');
        resolve(window.OneSignal);
        return;
      }
      
      if (Date.now() - startTime > timeout) {
        console.error('❌ OneSignal API timeout');
        reject(new Error('OneSignal API timeout'));
        return;
      }
      
      setTimeout(checkAPI, 100);
    };
    
    checkAPI();
  });
};

export const testOneSignalMethods = async () => {
  console.log('🧪 Testing OneSignal Methods');
  console.log('============================');
  
  try {
    await waitForOneSignalAPI(5000);
    
    const oneSignal = window.OneSignal;
    
    // Test permission check
    if (oneSignal.Notifications) {
      console.log('📱 Permission status:', oneSignal.Notifications.permission);
    }
    
    // Test user ID
    if (oneSignal.User && oneSignal.User.onesignalId) {
      console.log('🆔 User ID:', oneSignal.User.onesignalId);
    }
    
    console.log('✅ OneSignal methods test completed');
    
  } catch (error) {
    console.error('❌ OneSignal methods test failed:', error);
  }
};
