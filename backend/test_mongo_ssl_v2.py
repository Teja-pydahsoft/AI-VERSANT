import os
import ssl
import sys
from pymongo import MongoClient
import certifi
from dotenv import load_dotenv

load_dotenv()

def test_connection():
    uri = os.getenv('MONGODB_URI', 'mongodb+srv://teja:teja0000@versant.ia46v3i.mongodb.net/suma_madam?retryWrites=true&w=majority&appName=Versant')
    
    print("--- Environment Info ---")
    print(f"Python version: {sys.version}")
    print(f"OpenSSL version: {ssl.OPENSSL_VERSION}")
    print(f"Certifi where: {certifi.where()}")
    
    try:
        import dnspython
        print("dnspython: Installed (via import)")
    except ImportError:
        try:
            import dns
            print("dnspython: Installed (via dns import)")
        except ImportError:
            print("dnspython: NOT INSTALLED")

    print(f"\nTesting connection to host part: {uri.split('@')[-1]}")
    
    # Increase timeout for better diagnostics
    timeout = 10000 

    print("\n--- Test 1: With certifi CA Bundle ---")
    try:
        client = MongoClient(uri, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=timeout, connectTimeoutMS=timeout)
        client.admin.command('ping')
        print("✅ Connection with certifi successful!")
    except Exception as e:
        print(f"❌ Connection with certifi failed: {e}")

    print("\n--- Test 2: Disabling SSL Verification (TEST ONLY) ---")
    try:
        client = MongoClient(uri, tlsAllowInvalidCertificates=True, serverSelectionTimeoutMS=timeout, connectTimeoutMS=timeout)
        client.admin.command('ping')
        print("✅ Connection ignoring certificates successful!")
    except Exception as e:
        print(f"❌ Connection ignoring certificates failed: {e}")

    print("\n--- Test 3: Standard Connection (Retry) ---")
    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=timeout, connectTimeoutMS=timeout)
        client.admin.command('ping')
        print("✅ Standard connection successful!")
    except Exception as e:
        print(f"❌ Standard connection failed: {e}")

if __name__ == "__main__":
    test_connection()
