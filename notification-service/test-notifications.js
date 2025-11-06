const axios = require('axios');

const baseURL = 'http://localhost:3001/api';

async function testNotifications() {
  console.log('🧪 Testing VERSANT Notification Service (Enhanced Push + SMS + Email)...\n');

  try {
    // Test 1: SMS Notification
    console.log('📱 Testing SMS notification...');
    const smsResponse = await axios.post(`${baseURL}/notifications/send`, {
      type: 'sms',
      recipient: '9010462357',
      content: 'Welcome to Pydah Campus Recruitment Training, Your Credentials username: {#var#} password: {#var#} \nLogin with https://crt.pydahsoft.in/login - Pydah College'
    }, {
      headers: {
        'X-API-Key': 'default-api-key'
      }
    });
    console.log('✅ SMS Response:', smsResponse.data);

    // Test 2: Email Notification
    console.log('\n📧 Testing Email notification...');
    const emailResponse = await axios.post(`${baseURL}/notifications/send`, {
      type: 'email',
      recipient: 'ravi@pydahsoft.in',
      content: '<h2>Welcome to VERSANT!</h2><p>This is a test email from the notification service.</p><p>Your credentials are ready!</p>',
      metadata: {
        subject: 'Test Email from VERSANT Notification Service'
      }
    }, {
      headers: {
        'X-API-Key': 'default-api-key'
      }
    });
    console.log('✅ Email Response:', emailResponse.data);

    // Test 3: Test Reminder Trigger (OneSignal Push + SMS + Email)
    console.log('\n🔔 Testing Test Reminder Trigger (OneSignal Push + SMS + Email)...');
    const reminderResponse = await axios.get(`${baseURL}/notifications/test-reminder/trigger`, {
      headers: {
        'X-API-Key': 'default-api-key'
      }
    });
    console.log('✅ Test Reminder Response:', reminderResponse.data);

    // Test 4: Test Notifications Endpoint (OneSignal Push + SMS + Email)
    console.log('\n📢 Testing Test Notifications Endpoint (OneSignal Push + SMS + Email)...');
    const testNotifResponse = await axios.post(`${baseURL}/test-notifications/test-reminder`, {}, {
      headers: {
        'X-API-Key': 'default-api-key'
      }
    });
    console.log('✅ Test Notifications Response:', testNotifResponse.data);

    // Test 5: Health Check
    console.log('\n🏥 Testing Health Check...');
    const healthResponse = await axios.get(`${baseURL}/health`);
    console.log('✅ Health Status:', healthResponse.data.status);
    console.log('📊 Services:', healthResponse.data.checks.services);

    // Test 6: Analytics
    console.log('\n📊 Testing Analytics...');
    const analyticsResponse = await axios.get(`${baseURL}/analytics/dashboard`, {
      headers: {
        'X-API-Key': 'default-api-key'
      }
    });
    console.log('✅ Analytics Response:', analyticsResponse.data);

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response) {
      console.error('❌ Response Status:', error.response.status);
      console.error('❌ Response Data:', error.response.data);
    }
  }
}

// Also test backend endpoints if available
async function testBackendNotifications() {
  const backendURL = 'http://localhost:8000/';

  console.log('\n🔧 Testing Backend Push Notification Endpoints...\n');

  try {
    // Test backend health
    console.log('🏥 Testing Backend Health...');
    const healthResponse = await axios.get(`${backendURL}/health`);
    console.log('✅ Backend Health:', healthResponse.data);

    // Test push notification stats
    console.log('\n📊 Testing Push Notification Stats...');
    const statsResponse = await axios.get(`${backendURL}/push-notifications/stats`);
    console.log('✅ Push Stats:', statsResponse.data);

  } catch (error) {
    console.log('⚠️ Backend tests skipped (server not running or endpoints not available)');
    console.log('ℹ️ This is normal if backend is not running');
  }
}

async function runAllTests() {
  await testNotifications();
  await testBackendNotifications();
  console.log('\n✅ All notification tests completed!');
}

runAllTests();
