// Test script to check what the global settings API returns for campus admin
const axios = require('axios');

async function testCampusAdminAPI() {
  const BASE_URL = 'http://localhost:8000';
  
  try {
    // First, let's login as a campus admin to get a token
    console.log('🔐 Testing Campus Admin Global Settings API...');
    
    // You'll need to replace these with actual campus admin credentials
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      username: 'campus_admin_username', // Replace with actual campus admin username
      password: 'campus_admin_password'  // Replace with actual campus admin password
    });
    
    if (loginResponse.data.success) {
      const token = loginResponse.data.access_token;
      console.log('✅ Login successful');
      
      // Now test the global settings API
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      const response = await axios.get(`${BASE_URL}/global-settings/user/features`, { headers });
      
      console.log('\n📊 Global Settings API Response:');
      console.log('Status:', response.status);
      console.log('Success:', response.data.success);
      console.log('User Role:', response.data.data?.role);
      console.log('Features:', JSON.stringify(response.data.data?.features, null, 2));
      
      // Check what features are enabled
      const features = response.data.data?.features || {};
      console.log('\n🔍 Enabled Features:');
      Object.keys(features).forEach(feature => {
        console.log(`  - ${feature}: ${features[feature].name} (${features[feature].required ? 'required' : 'optional'})`);
      });
      
    } else {
      console.log('❌ Login failed:', loginResponse.data.message);
    }
    
  } catch (error) {
    console.error('❌ Error testing API:', error.response?.data || error.message);
    
    // If login fails, let's check what happens with a direct API call
    console.log('\n🔍 Checking API endpoint directly...');
    try {
      const response = await axios.get(`${BASE_URL}/global-settings/features/campus_admin`);
      console.log('Direct API response:', response.data);
    } catch (directError) {
      console.error('Direct API call failed:', directError.response?.data || directError.message);
    }
  }
}

// Run the test
testCampusAdminAPI();
