"""
Convert base64 VAPID keys to PEM format
"""

import base64
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.backends import default_backend

def convert_base64_to_pem():
    """Convert base64 VAPID private key to PEM format"""
    
    # Your current base64 private key
    base64_private_key = "meUDvxYOfVw9KTAfsRw3Ue0rP5CykBZxbsGyiB8y5L4"
    
    try:
        # Decode base64 (add padding if needed)
        padding = 4 - len(base64_private_key) % 4
        if padding != 4:
            base64_private_key += '=' * padding
        
        private_key_bytes = base64.urlsafe_b64decode(base64_private_key)
        
        # Create EC private key from bytes
        private_key = ec.derive_private_key(
            int.from_bytes(private_key_bytes, 'big'),
            ec.SECP256R1(),
            default_backend()
        )
        
        # Serialize to PEM format
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        ).decode('utf-8')
        
        print("✅ VAPID Private Key converted to PEM format!")
        print("=" * 80)
        print("Copy this to your .env file as VAPID_PRIVATE_KEY:")
        print("=" * 80)
        print(private_pem)
        print("=" * 80)
        print("\n📋 Update your .env file:")
        print('VAPID_PRIVATE_KEY="' + private_pem.replace('\n', '\\n') + '"')
        print("\nOr use multi-line format:")
        print("VAPID_PRIVATE_KEY='")
        print(private_pem + "'")
        
        return private_pem
        
    except Exception as e:
        print(f"❌ Error converting key: {e}")
        print("\n💡 Alternative: Generate new VAPID keys")
        print("Run: python generate_vapid_keys.py")
        return None

if __name__ == "__main__":
    convert_base64_to_pem()
