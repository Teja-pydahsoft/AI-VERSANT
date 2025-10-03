const axios = require('axios');

const baseURL = 'http://localhost:3001/api';

async function testNotifications() {
  console.log('🧪 Testing VERSANT Notification Service...\n');

  try {
    // Test 1: SMS Notification
    console.log('📱 Testing SMS notification...');
    const smsResponse = await axios.post(`${baseURL}/notifications/send`, {
      type: 'sms',
      recipient: '9010462357',
      content: 'Welcome to Pydah Campus Recruitment Training, Your Credentials username: {#var#} password: {#var#} \nLogin with https://crt.pydahsoft.in/login - Pydah College'
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
    });
    console.log('✅ Email Response:', emailResponse.data);

    // Test 3: Health Check
    console.log('\n🏥 Testing Health Check...');
    const healthResponse = await axios.get(`${baseURL}/health`);
    console.log('✅ Health Status:', healthResponse.data.status);
    console.log('📊 Services:', healthResponse.data.checks.services);

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testNotifications();
