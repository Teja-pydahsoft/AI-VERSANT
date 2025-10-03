#!/usr/bin/env python3
"""
Test script to verify OneSignal service worker files are served with correct MIME type
"""

import requests
import sys

def test_mime_type(url, expected_content_type="application/javascript"):
    """Test if a URL returns the expected MIME type"""
    try:
        response = requests.head(url, timeout=10)
        content_type = response.headers.get('content-type', '').split(';')[0].strip()
        
        print(f"URL: {url}")
        print(f"Expected: {expected_content_type}")
        print(f"Actual: {content_type}")
        print(f"Status: {'✅ PASS' if content_type == expected_content_type else '❌ FAIL'}")
        print("-" * 50)
        
        return content_type == expected_content_type
    except Exception as e:
        print(f"URL: {url}")
        print(f"Error: {str(e)}")
        print("Status: ❌ ERROR")
        print("-" * 50)
        return False

def main():
    """Test all OneSignal service worker files"""
    base_url = "https://crt.pydahsoft.in"
    
    # Files to test
    files_to_test = [
        "/OneSignalSDKWorker.js",
        "/OneSignalSDK.sw.js", 
        "/sw.js"
    ]
    
    print("Testing OneSignal Service Worker MIME Types")
    print("=" * 50)
    
    all_passed = True
    
    for file_path in files_to_test:
        url = base_url + file_path
        if not test_mime_type(url):
            all_passed = False
    
    print("\nOverall Result:")
    if all_passed:
        print("✅ All service worker files have correct MIME type!")
        print("OneSignal subscription should work properly now.")
    else:
        print("❌ Some service worker files have incorrect MIME type.")
        print("Please check your server configuration and redeploy.")
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
