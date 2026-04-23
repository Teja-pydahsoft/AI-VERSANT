import os
import boto3
from dotenv import load_dotenv

load_dotenv()

class AWSConfig:
    AWS_ACCESS_KEY = os.getenv('AWS_ACCESS_KEY')
    AWS_SECRET_KEY = os.getenv('AWS_SECRET_KEY')
    AWS_REGION = os.getenv('AWS_REGION')
    AWS_S3_BUCKET = os.getenv('AWS_S3_BUCKET')
    
    @staticmethod
    def get_s3_client():
        """Get S3 client instance"""
        if not (AWSConfig.AWS_ACCESS_KEY and AWSConfig.AWS_SECRET_KEY and AWSConfig.AWS_REGION):
            print("⚠️  AWS credentials or region not set in environment variables.")
            print("   Audio file uploads will not work without proper AWS configuration.")
            return None
        try:
            print(f"🔍 Creating S3 client with:")
            print(f"   Region: {AWSConfig.AWS_REGION}")
            print(f"   Access Key: {'✅ Set' if AWSConfig.AWS_ACCESS_KEY else '❌ Missing'}")
            print(f"   Secret Key: {'✅ Set' if AWSConfig.AWS_SECRET_KEY else '❌ Missing'}")
            
            client = boto3.client(
                's3',
                aws_access_key_id=AWSConfig.AWS_ACCESS_KEY,
                aws_secret_access_key=AWSConfig.AWS_SECRET_KEY,
                region_name=AWSConfig.AWS_REGION
            )
            print("✅ S3 client created successfully")
            return client
        except Exception as e:
            print(f"❌ Error creating S3 client: {e}")
            print(f"❌ Error type: {type(e)}")
            print(f"❌ Error details: {str(e)}")
            return None
    
    @staticmethod
    def get_s3_resource():
        """Get S3 resource instance"""
        if not (AWSConfig.AWS_ACCESS_KEY and AWSConfig.AWS_SECRET_KEY and AWSConfig.AWS_REGION):
            print("⚠️  AWS credentials or region not set in environment variables.")
            return None
        try:
            return boto3.resource(
                's3',
                aws_access_key_id=AWSConfig.AWS_ACCESS_KEY,
                aws_secret_access_key=AWSConfig.AWS_SECRET_KEY,
                region_name=AWSConfig.AWS_REGION
            )
        except Exception as e:
            print(f"❌ Error creating S3 resource: {e}")
            return None

# Global instances for easy import
s3_client = None
S3_BUCKET_NAME = AWSConfig.AWS_S3_BUCKET

# Create a module-level instance that can be shared
_aws_instance = None

def init_aws():
    """Initialize AWS S3 connection"""
    global s3_client
    try:
        # Check if environment variables are set
        if not (AWSConfig.AWS_ACCESS_KEY and AWSConfig.AWS_SECRET_KEY and AWSConfig.AWS_REGION and AWSConfig.AWS_S3_BUCKET):
            print("❌ AWS environment variables not set:")
            print(f"   AWS_ACCESS_KEY: {'✅ Set' if AWSConfig.AWS_ACCESS_KEY else '❌ Missing'}")
            print(f"   AWS_SECRET_KEY: {'✅ Set' if AWSConfig.AWS_SECRET_KEY else '❌ Missing'}")
            print(f"   AWS_REGION: {'✅ Set' if AWSConfig.AWS_REGION else '❌ Missing'}")
            print(f"   AWS_S3_BUCKET: {'✅ Set' if AWSConfig.AWS_S3_BUCKET else '❌ Missing'}")
            print("   ❌ Audio generation requires AWS S3 - cannot proceed without proper configuration")
            s3_client = None
            return False
        
        print(f"🔍 AWS Config Debug:")
        print(f"   AWS_ACCESS_KEY: {'✅ Set' if AWSConfig.AWS_ACCESS_KEY else '❌ Missing'}")
        print(f"   AWS_SECRET_KEY: {'✅ Set' if AWSConfig.AWS_SECRET_KEY else '❌ Missing'}")
        print(f"   AWS_REGION: {'✅ Set' if AWSConfig.AWS_REGION else '❌ Missing'}")
        print(f"   AWS_S3_BUCKET: {'✅ Set' if AWSConfig.AWS_S3_BUCKET else '❌ Missing'}")
        
        s3_client = AWSConfig.get_s3_client()
        
        if s3_client is None:
            print("❌ AWS S3 client initialization failed - credentials missing or invalid")
            return False
            
        # Test S3 connection by listing buckets
        try:
            print("🔍 Testing S3 connection...")
            response = s3_client.list_buckets()
            bucket_names = [bucket['Name'] for bucket in response['Buckets']]
            print(f"✅ S3 connection successful. Available buckets: {bucket_names}")
            
            if AWSConfig.AWS_S3_BUCKET in bucket_names:
                print(f"✅ AWS S3 connection successful - Bucket '{AWSConfig.AWS_S3_BUCKET}' found")
                return True
            else:
                print(f"⚠️  AWS S3 connection successful but bucket '{AWSConfig.AWS_S3_BUCKET}' not found")
                print(f"Available buckets: {bucket_names}")
                return False
        except Exception as bucket_error:
            print(f"❌ Error testing S3 bucket access: {bucket_error}")
            print(f"❌ Error type: {type(bucket_error)}")
            print(f"❌ Error details: {str(bucket_error)}")
            return False
            
    except Exception as e:
        print(f"❌ AWS S3 initialization error: {e}")
        print(f"❌ Error type: {type(e)}")
        print("⚠️  Audio file uploads may not work properly")
        s3_client = None
        return False

def is_aws_configured():
    """Check if AWS is properly configured"""
    return s3_client is not None and S3_BUCKET_NAME is not None

def get_aws_status():
    """Get AWS configuration status"""
    return {
        'configured': is_aws_configured(),
        's3_client_available': s3_client is not None,
        'bucket_name': S3_BUCKET_NAME,
        'has_credentials': bool(AWSConfig.AWS_ACCESS_KEY and AWSConfig.AWS_SECRET_KEY and AWSConfig.AWS_REGION),
        'policy': 'S3_ONLY',  # No local storage fallback
        'audio_storage': 'AWS_S3_REQUIRED'  # Audio files must be stored on S3
    }

def get_s3_client_safe():
    """Get S3 client safely, reinitializing if needed"""
    global s3_client
    
    # If s3_client is None but we have credentials, try to reinitialize
    if s3_client is None and (AWSConfig.AWS_ACCESS_KEY and AWSConfig.AWS_SECRET_KEY and AWSConfig.AWS_REGION):
        print("🔄 S3 client is None, attempting to reinitialize...")
        init_aws()
    
    return s3_client

def ensure_aws_initialized():
    """Ensure AWS is initialized, reinitializing if needed"""
    global s3_client
    
    if s3_client is None:
        print("🔄 AWS not initialized, attempting to initialize...")
        return init_aws()
    return True


def s3_object_key_from_audio_reference(audio_ref, bucket_name=None):
    """
    Normalize stored audio references to an S3 object key.
    Accepts relative keys (audio/...), virtual-hosted URLs, and path-style S3 URLs.
    """
    if not audio_ref or not isinstance(audio_ref, str):
        return None
    audio_ref = audio_ref.strip()
    if not audio_ref:
        return None
    bucket = bucket_name or S3_BUCKET_NAME
    if not audio_ref.startswith('http'):
        return audio_ref.lstrip('/')

    from urllib.parse import urlparse, unquote

    parsed = urlparse(audio_ref)
    path = unquote((parsed.path or '').lstrip('/'))
    if not path:
        return None
    host = (parsed.hostname or '').lower()
    bucket_l = (bucket or '').lower()
    if bucket_l and host.startswith(f'{bucket_l}.s3'):
        return path
    if 'amazonaws.com' in host and host.startswith('s3'):
        parts = path.split('/', 1)
        if len(parts) == 2 and bucket_l and parts[0].lower() == bucket_l:
            return parts[1]
    return path


def presigned_url_for_audio(audio_ref, expires_in=None):
    """
    Time-limited GET URL for browser <audio> playback (private buckets).
    Falls back to None if S3 is unavailable or signing fails.
    """
    import os

    if expires_in is None:
        try:
            expires_in = int(os.getenv('AUDIO_PRESIGNED_URL_EXPIRES', '7200'))
        except ValueError:
            expires_in = 7200
    expires_in = max(60, min(int(expires_in), 604800))

    bucket = S3_BUCKET_NAME
    key = s3_object_key_from_audio_reference(audio_ref, bucket)
    if not key or not bucket:
        return None
    client = get_s3_client_safe()
    if not client:
        return None
    try:
        return client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=expires_in,
        )
    except Exception as e:
        print(f'presigned_url_for_audio error: {e}')
        return None