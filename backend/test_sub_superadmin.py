#!/usr/bin/env python3
"""
Test script for Sub Superadmin system
Tests the complete permission system functionality
"""

import requests
import json
from datetime import datetime

# Configuration
BASE_URL = 'http://localhost:8000'
SUPERADMIN_EMAIL = 'superadmin'
SUPERADMIN_PASSWORD = 'superadmin123'

def test_sub_superadmin_system():
    """Test the complete sub superadmin system"""
    print("🧪 Testing Sub Superadmin System...\n")

    # Step 1: Login as superadmin
    print("1️⃣ Logging in as superadmin...")
    login_response = requests.post(f'{BASE_URL}/auth/login', json={
        'username': SUPERADMIN_EMAIL,
        'password': SUPERADMIN_PASSWORD
    })

    if login_response.status_code != 200:
        print(f"❌ Login failed: {login_response.text}")
        return False

    token = login_response.json()['access_token']
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    print("✅ Login successful")

    # Step 2: Get permission templates
    print("\n2️⃣ Getting permission templates...")
    templates_response = requests.get(f'{BASE_URL}/sub-superadmin/templates', headers=headers)

    if templates_response.status_code != 200:
        print(f"❌ Failed to get templates: {templates_response.text}")
        return False

    templates = templates_response.json()['templates']
    print(f"✅ Found {len(templates)} permission templates:")
    for name, template in templates.items():
        print(f"   - {name}: {template['description']}")

    # Step 3: Create a test sub superadmin
    print("\n3️⃣ Creating test sub superadmin...")
    test_user_id = "507f1f77bcf86cd799439011"  # Example user ID

    create_response = requests.post(f'{BASE_URL}/sub-superadmin/create', headers=headers, json={
        'user_id': test_user_id,
        'name': 'Test Sub Superadmin',
        'username': 'testsubadmin',  # Use username instead of email
        'role_name': 'student_manager',
        'use_template': True
    })

    if create_response.status_code not in [200, 201]:
        print(f"❌ Failed to create sub superadmin: {create_response.text}")
        return False

    print("✅ Sub superadmin created successfully")

    # Step 4: Get user permissions
    print("\n4️⃣ Getting user permissions...")
    permissions_response = requests.get(f'{BASE_URL}/sub-superadmin/permissions/{test_user_id}', headers=headers)

    if permissions_response.status_code != 200:
        print(f"❌ Failed to get permissions: {permissions_response.text}")
        return False

    permissions = permissions_response.json()
    print(f"✅ User permissions: {permissions['permissions']}")

    # Step 5: Test permission checking
    print("\n5️⃣ Testing permission checks...")
    check_response = requests.post(f'{BASE_URL}/sub-superadmin/check-permission', headers=headers, json={
        'page': 'student_management',
        'access': 'write'
    })

    if check_response.status_code != 200:
        print(f"❌ Permission check failed: {check_response.text}")
        return False

    has_permission = check_response.json()['has_permission']
    print(f"✅ Permission check result: {has_permission}")

    # Step 6: List all sub superadmins
    print("\n6️⃣ Listing all sub superadmins...")
    list_response = requests.get(f'{BASE_URL}/sub-superadmin/list', headers=headers)

    if list_response.status_code != 200:
        print(f"❌ Failed to list sub superadmins: {list_response.text}")
        return False

    sub_admins = list_response.json()['data']['sub_superadmins']
    print(f"✅ Found {len(sub_admins)} sub superadmins")

    print("\n🎉 All tests passed! Sub Superadmin system is working correctly.")
    return True

def test_access_control_fix():
    """Test that the access control fix is working"""
    print("\n🔧 Testing Access Control Fix...\n")

    # Login as superadmin
    login_response = requests.post(f'{BASE_URL}/auth/login', json={
        'username': SUPERADMIN_EMAIL,
        'password': SUPERADMIN_PASSWORD
    })

    if login_response.status_code != 200:
        print("❌ Superadmin login failed")
        return False

    token = login_response.json()['access_token']
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }

    # Test accessing sub superadmin management
    print("1️⃣ Testing sub superadmin management access...")
    response = requests.get(f'{BASE_URL}/sub-superadmin/templates', headers=headers)

    if response.status_code == 200:
        print("✅ Superadmin can access sub superadmin management")
        templates = response.json()
        print(f"📊 Available templates: {list(templates.get('templates', {}).keys())}")
    else:
        print(f"❌ Superadmin access failed: {response.status_code} - {response.text}")
        return False

    # Test permission checking
    print("\n2️⃣ Testing permission checking...")
    check_response = requests.post(f'{BASE_URL}/sub-superadmin/check-permission', headers=headers, json={
        'page': 'sub_superadmin_management',
        'access': 'write'
    })

    if check_response.status_code == 200:
        has_permission = check_response.json()['has_permission']
        print(f"✅ Permission check result: {has_permission}")
    else:
        print(f"❌ Permission check failed: {check_response.text}")
        return False

    # Test debug endpoint
    print("\n3️⃣ Testing debug endpoint...")
    debug_response = requests.get(f'{BASE_URL}/access-control/debug-user', headers=headers)

    if debug_response.status_code == 200:
        debug_data = debug_response.json()
        print(f"✅ Debug info: role={debug_data['data']['role']}, is_super_admin={debug_data['data']['is_super_admin']}")
    else:
        print(f"❌ Debug endpoint failed: {debug_response.status_code} - {debug_response.text}")

    return True

if __name__ == '__main__':
    try:
        success1 = test_sub_superadmin_system()
        success2 = test_access_control_fix()

        if success1 and success2:
            print("\n🎉 All tests passed! Sub Superadmin system is working correctly.")
        else:
            print("\n❌ Some tests failed. Please check the errors above.")
    except Exception as e:
        print(f"❌ Test failed with error: {e}")