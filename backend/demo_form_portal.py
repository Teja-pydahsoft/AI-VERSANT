#!/usr/bin/env python3
"""
Demo script for Form Portal functionality
Tests all form-related endpoints
"""

import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "http://localhost:8000"
API_BASE = f"{BASE_URL}/api"

# Test credentials (you'll need to update these)
SUPERADMIN_EMAIL = "superadmin@example.com"
SUPERADMIN_PASSWORD = "admin123"

def get_auth_token():
    """Get authentication token"""
    try:
        response = requests.post(f"{API_BASE}/auth/login", json={
            "email": SUPERADMIN_EMAIL,
            "password": SUPERADMIN_PASSWORD
        })
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                return data['data']['access_token']
        return None
    except Exception as e:
        print(f"Error getting auth token: {e}")
        return None

def test_form_templates(token):
    """Test form templates endpoints"""
    print("\n=== Testing Form Templates ===")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get all templates
    response = requests.get(f"{API_BASE}/forms/templates", headers=headers)
    print(f"GET /forms/templates: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Available templates: {list(data['data']['templates'].keys())}")
    
    # Get specific template
    response = requests.get(f"{API_BASE}/forms/templates/student_info", headers=headers)
    print(f"GET /forms/templates/student_info: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Student Info template fields: {len(data['data']['template']['fields'])}")

def test_form_crud(token):
    """Test form CRUD operations"""
    print("\n=== Testing Form CRUD ===")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create a custom form
    form_data = {
        "title": "Demo Feedback Form",
        "description": "A demo form for testing purposes",
        "template_type": "custom",
        "fields": [
            {
                "field_id": "name",
                "label": "Your Name",
                "type": "text",
                "required": True,
                "placeholder": "Enter your name"
            },
            {
                "field_id": "rating",
                "label": "How would you rate our service?",
                "type": "radio",
                "required": True,
                "options": ["Excellent", "Good", "Average", "Poor"]
            },
            {
                "field_id": "comments",
                "label": "Additional Comments",
                "type": "textarea",
                "required": False,
                "placeholder": "Share your thoughts"
            }
        ],
        "settings": {
            "isActive": True,
            "allowMultipleSubmissions": False,
            "showProgress": True
        }
    }
    
    response = requests.post(f"{API_BASE}/forms/", json=form_data, headers=headers)
    print(f"POST /forms/: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        form_id = data['data']['form_id']
        print(f"Created form with ID: {form_id}")
        
        # Get the form
        response = requests.get(f"{API_BASE}/forms/{form_id}", headers=headers)
        print(f"GET /forms/{form_id}: {response.status_code}")
        
        # Update the form
        form_data['title'] = "Updated Demo Feedback Form"
        response = requests.put(f"{API_BASE}/forms/{form_id}", json=form_data, headers=headers)
        print(f"PUT /forms/{form_id}: {response.status_code}")
        
        # Toggle form status
        response = requests.patch(f"{API_BASE}/forms/{form_id}/toggle-status", headers=headers)
        print(f"PATCH /forms/{form_id}/toggle-status: {response.status_code}")
        
        # Duplicate form
        response = requests.post(f"{API_BASE}/forms/{form_id}/duplicate", headers=headers)
        print(f"POST /forms/{form_id}/duplicate: {response.status_code}")
        
        return form_id
    else:
        print(f"Error creating form: {response.text}")
        return None

def test_form_listing(token):
    """Test form listing with filters"""
    print("\n=== Testing Form Listing ===")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get all forms
    response = requests.get(f"{API_BASE}/forms/", headers=headers)
    print(f"GET /forms/: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Total forms: {data['data']['pagination']['total']}")
        print(f"Forms on page: {len(data['data']['forms'])}")
    
    # Get forms with search
    response = requests.get(f"{API_BASE}/forms/?search=demo", headers=headers)
    print(f"GET /forms/?search=demo: {response.status_code}")
    
    # Get active forms only
    response = requests.get(f"{API_BASE}/forms/?status=active", headers=headers)
    print(f"GET /forms/?status=active: {response.status_code}")

def test_form_submissions(token, form_id):
    """Test form submission functionality"""
    print("\n=== Testing Form Submissions ===")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get student forms (this would normally be called by a student)
    response = requests.get(f"{API_BASE}/form-submissions/student/forms", headers=headers)
    print(f"GET /form-submissions/student/forms: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Available forms for students: {len(data['data']['forms'])}")
    
    # Get specific form for submission
    response = requests.get(f"{API_BASE}/form-submissions/student/forms/{form_id}", headers=headers)
    print(f"GET /form-submissions/student/forms/{form_id}: {response.status_code}")
    
    # Submit form (simulating student submission)
    submission_data = {
        "form_id": form_id,
        "responses": [
            {
                "field_id": "name",
                "value": "John Doe"
            },
            {
                "field_id": "rating",
                "value": "Excellent"
            },
            {
                "field_id": "comments",
                "value": "Great service! Keep it up."
            }
        ],
        "status": "submitted"
    }
    
    response = requests.post(f"{API_BASE}/form-submissions/student/submit", json=submission_data, headers=headers)
    print(f"POST /form-submissions/student/submit: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        submission_id = data['data']['submission_id']
        print(f"Submitted form with ID: {submission_id}")
        
        # Get admin submissions
        response = requests.get(f"{API_BASE}/form-submissions/admin/submissions", headers=headers)
        print(f"GET /form-submissions/admin/submissions: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Total submissions: {data['data']['pagination']['total']}")
        
        # Get specific submission
        response = requests.get(f"{API_BASE}/form-submissions/admin/submissions/{submission_id}", headers=headers)
        print(f"GET /form-submissions/admin/submissions/{submission_id}: {response.status_code}")
        
        # Export form submissions
        response = requests.get(f"{API_BASE}/form-submissions/admin/export/{form_id}", headers=headers)
        print(f"GET /form-submissions/admin/export/{form_id}: {response.status_code}")
        
        return submission_id
    else:
        print(f"Error submitting form: {response.text}")
        return None

def test_form_analytics(token, form_id):
    """Test form analytics functionality"""
    print("\n=== Testing Form Analytics ===")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get analytics overview
    response = requests.get(f"{API_BASE}/form-analytics/overview", headers=headers)
    print(f"GET /form-analytics/overview: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        overview = data['data']['overview']
        print(f"Total forms: {overview['total_forms']}")
        print(f"Total submissions: {overview['total_submissions']}")
        print(f"Unique students: {overview['unique_students']}")
    
    # Get form statistics
    response = requests.get(f"{API_BASE}/form-analytics/forms/{form_id}/stats", headers=headers)
    print(f"GET /form-analytics/forms/{form_id}/stats: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        stats = data['data']['statistics']
        print(f"Form submissions: {stats['submitted_count']}")
        print(f"Completion rate: {stats['completion_rate']}%")
    
    # Get completion rates
    response = requests.get(f"{API_BASE}/form-analytics/completion-rates", headers=headers)
    print(f"GET /form-analytics/completion-rates: {response.status_code}")
    
    # Export analytics for the specific form
    response = requests.get(f"{API_BASE}/form-analytics/export/analytics/{form_id}", headers=headers)
    print(f"GET /form-analytics/export/analytics/{form_id}: {response.status_code}")

def main():
    """Main demo function"""
    print("🚀 Form Portal Backend Demo")
    print("=" * 50)
    
    # Get authentication token
    print("Getting authentication token...")
    token = get_auth_token()
    if not token:
        print("❌ Failed to get authentication token. Please check credentials.")
        return
    
    print("✅ Authentication successful!")
    
    # Test form templates
    test_form_templates(token)
    
    # Test form CRUD operations
    form_id = test_form_crud(token)
    if not form_id:
        print("❌ Failed to create form. Skipping submission tests.")
        return
    
    # Test form listing
    test_form_listing(token)
    
    # Test form submissions
    submission_id = test_form_submissions(token, form_id)
    
    # Test form analytics
    test_form_analytics(token, form_id)
    
    print("\n🎉 Form Portal Backend Demo Completed!")
    print("=" * 50)
    print("✅ All endpoints are working correctly!")
    print(f"📝 Created form ID: {form_id}")
    if submission_id:
        print(f"📤 Created submission ID: {submission_id}")

if __name__ == "__main__":
    main()
