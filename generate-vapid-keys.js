// VAPID Key Generation Script
// Run this script to generate VAPID keys for Web Push

const webpush = require('web-push');

console.log('🔑 Generating VAPID Keys for Web Push...\n');

// Generate VAPID keys
const vapidKeys = webpush.generateVAPIDKeys();

console.log('✅ VAPID Keys Generated Successfully!\n');
console.log('📋 Copy these keys to your server.js file:\n');
console.log('='.repeat(60));
console.log(`const publicVapidKey = '${vapidKeys.publicKey}';`);
console.log(`const privateVapidKey = '${vapidKeys.privateKey}';`);
console.log('='.repeat(60));
console.log('\n📝 Instructions:');
console.log('1. Replace the placeholder keys in server.js with these generated keys');
console.log('2. Update the email in webpush.setVapidDetails() to your actual email');
console.log('3. Run: npm run dev');
console.log('4. Open: http://localhost:3000');
console.log('\n🚀 Your Web Push application will be ready to test!');
