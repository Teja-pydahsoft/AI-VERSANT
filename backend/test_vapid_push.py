"""
Test Web Push with VAPID
"""
import os
from pywebpush import webpush, WebPushException
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_vapid_push():
    """Test VAPID push notification"""
    try:
        # Check VAPID configuration
        vapid_private_key = os.getenv('VAPID_PRIVATE_KEY')
        vapid_public_key = os.getenv('VAPID_PUBLIC_KEY')
        vapid_email = os.getenv('VAPID_EMAIL')

        if not all([vapid_private_key, vapid_public_key, vapid_email]):
            print("❌ Missing VAPID configuration")
            print(f"Private Key: {'✅' if vapid_private_key else '❌'}")
            print(f"Public Key: {'✅' if vapid_public_key else '❌'}")
            print(f"Email: {'✅' if vapid_email else '❌'}")
            return False

        # Test subscription (this would come from the browser in production)
        test_subscription = {
            "endpoint": "https://updates.push.services.mozilla.com/test",
            "keys": {
                "auth": "test-auth-key",
                "p256dh": "test-p256dh-key"
            }
        }

        # Test notification
        try:
            response = webpush(
                subscription_info=test_subscription,
                data=json.dumps({
                    "title": "Test VAPID Notification",
                    "body": "This is a test push notification using VAPID",
                    "data": {"type": "vapid-test"}
                }),
                vapid_private_key=vapid_private_key,
                vapid_claims={
                    "sub": f"mailto:{vapid_email}"
                }
            )
            print("✅ VAPID push notification test successful")
            print(f"Response: {response}")
            return True
        except WebPushException as e:
            print(f"❌ WebPush error: {e}")
            if e.response and e.response.json():
                print(f"Error details: {e.response.json()}")
            return False
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Testing VAPID Push Notifications...")
    test_vapid_push()