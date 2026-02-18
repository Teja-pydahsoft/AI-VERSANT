import os
import ssl
from pymongo import MongoClient
import certifi
from dotenv import load_dotenv

load_dotenv()

def test_connection():
    uri = os.getenv('MONGODB_URI', 'mongodb+srv://teja:teja0000@versant.ia46v3i.mongodb.net/suma_madam?retryWrites=true&w=majority&appName=Versant')
    print(f"Testing connection to: {uri.split('@')[-1]}") # Print only the host part for privacy
    
    print("\n--- Test 1: Standard Connection ---")
    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        print("✅ Standard connection successful!")
    except Exception as e:
        print(f"❌ Standard connection failed: {e}")

    print("\n--- Test 2: With certifi CA Bundle ---")
    try:
        client = MongoClient(uri, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        print("✅ Connection with certifi successful!")
    except Exception as e:
        print(f"❌ Connection with certifi failed: {e}")

    print("\n--- Test 3: Disabling SSL Verification (TEST ONLY) ---")
    try:
        client = MongoClient(uri, tlsAllowInvalidCertificates=True, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        print("✅ Connection ignoring certificates successful!")
    except Exception as e:
        print(f"❌ Connection ignoring certificates failed: {e}")

if __name__ == "__main__":
    test_connection()
