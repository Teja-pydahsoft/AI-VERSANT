import os
import requests
import logging
from typing import Dict, List, Optional, Tuple

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# BulkSMS Configuration
BULKSMS_API_KEY = os.getenv('BULKSMS_API_KEY', "7c9c967a-4ce9-4748-9dc7-d2aaef847275")
BULKSMS_SENDER_ID = os.getenv('BULKSMS_SENDER_ID', "PYDAHK")

# API URLs based on BulkSMS documentation
BULKSMS_ENGLISH_API_URL = os.getenv('BULKSMS_ENGLISH_API_URL', "https://www.bulksmsapps.com/api/apismsv2.aspx")
BULKSMS_UNICODE_API_URL = os.getenv('BULKSMS_UNICODE_API_URL', "https://www.bulksmsapps.com/api/apibulkv2.aspx")




# Study Edge Apex specific templates
STUDENT_CREDENTIALS_TEMPLATE = "Welcome to Pydah Campus Recruitment Training, Your Credentials username: {#var#} password: {#var#} \nLogin with https://crt.pydahsoft.in/login - Pydah College"
TEST_SCHEDULED_TEMPLATE = "A new test {#var#} has been scheduled at {#var#} for you. Please make sure to attempt it within 24hours. exam link: https://crt.pydahsoft.in/student/exam/{#var#} - Pydah College"
TEST_REMINDER_TEMPLATE = "you haven't attempted your scheduled test {#var#} yet. Please complete it as soon as possible. \nexam link: https://crt.pydahsoft.in/student/exam/{#var#} - Pydah College"

# Result notification template
VERSANT_RESULT_TEMPLATE = "Hello {#var#}, Your test {#var#} result is {#var#}%. Check your results at https://crt.pydahsoft.in/student/results - Pydah College"

# Check if SMS service is available
SMS_AVAILABLE = bool(BULKSMS_API_KEY and BULKSMS_SENDER_ID and BULKSMS_ENGLISH_API_URL)

if SMS_AVAILABLE:
    logger.info("✅ BulkSMS service is available")
else:
    logger.warning("⚠️ Warning: BulkSMS configuration missing. SMS functionality will be disabled.")

def is_valid_sms_response(response_data: str) -> bool:
    """Check if SMS response is valid"""
    if not response_data or not isinstance(response_data, str):
        return False
    
    # Check for valid message ID patterns
    if 'MessageId-' in response_data or response_data.strip().isdigit():
        return True
    
    # Check if HTML response contains MessageId
    if any(tag in response_data for tag in ['<!DOCTYPE', '<html', '<body']):
        import re
        message_id_match = re.search(r'MessageId-(\d+)', response_data)
        if message_id_match:
            return True
    
    return False

def extract_message_id(response_data: str) -> Optional[str]:
    """Extract message ID from response"""
    import re
    
    # Try to extract MessageId using regex
    message_id_match = re.search(r'MessageId-(\d+)', response_data)
    if message_id_match:
        return message_id_match.group(1)
    
    # Fallback methods
    if 'MessageId-' in response_data:
        return response_data.split('MessageId-')[1].split('\n')[0].strip()
    
    if response_data.strip().isdigit():
        return response_data.strip()
    
    return None

def send_sms_post(params: Dict, is_unicode: bool = False) -> requests.Response:
    """Send SMS using POST method with GET fallback"""
    api_url = BULKSMS_UNICODE_API_URL if is_unicode else BULKSMS_ENGLISH_API_URL
    
    logger.info(f"Using API URL for {'Unicode' if is_unicode else 'English'} SMS: {api_url}")
    
    headers = {
        'Accept': 'text/plain',
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    
    try:
        # Try POST method first
        response = requests.post(api_url, params=params, headers=headers, timeout=30)
        return response
    except Exception as e:
        logger.warning(f"POST method failed, trying GET: {e}")
        # Fallback to GET method
        response = requests.get(api_url, params=params, headers=headers, timeout=30)
        return response

def send_student_credentials_sms(phone: str, student_name: str, username: str, password: str, login_url: str = "crt.pydahsoft.in") -> Dict:
    """Send student credentials SMS"""
    try:
        if not SMS_AVAILABLE:
            logger.warning(f"⚠️ SMS service disabled. Would send to {phone}: Credentials for {username}")
            return {'success': False, 'error': 'SMS service not configured'}
        
        logger.info(f"📱 Sending student credentials SMS to: {phone}")
        
        # Replace template variables: Welcome to {#var#}, Your Credentials\nusername: {#var#}\npassword: {#var#}\nLogin with {#var#} - Pydah {#var#}
        message = STUDENT_CREDENTIALS_TEMPLATE.replace('{#var#}', username, 1) \
                                             .replace('{#var#}', password, 1) 
        
        params = {
            'apikey': BULKSMS_API_KEY,
            'sender': BULKSMS_SENDER_ID,
            'number': phone,
            'message': message
        }
        
        logger.info(f"📱 Student credentials SMS params: {params}")
        
        response = send_sms_post(params, False)  # English SMS
        
        logger.info(f"📱 Student credentials SMS response: {response.text}")
        
        if is_valid_sms_response(response.text):
            message_id = extract_message_id(response.text)
            if message_id:
                logger.info(f"✅ Student credentials SMS sent successfully with MessageId: {message_id}")
                return {
                    'success': True,
                    'messageId': message_id,
                    'type': 'student_credentials',
                    'language': 'English'
                }
        
        raise Exception('Failed to send student credentials SMS')
        
    except Exception as e:
        logger.error(f"📱 Error sending student credentials SMS: {e}")
        return {'success': False, 'error': str(e)}

def send_test_scheduled_sms(phone_number: str, test_name: str, start_time: str, test_id: str) -> Dict:
    """Send test scheduled SMS to student"""
    try:
        if not SMS_AVAILABLE:
            logger.warning(f"⚠️ SMS service disabled. Would send to {phone_number}: Test scheduled {test_name}")
            return {'success': False, 'error': 'SMS service not configured'}
        
        logger.info(f"📱 Sending test scheduled SMS to: {phone_number}")
        
        # Replace template variables: A new test {#var#} has been scheduled at {#var#} for you. Please make sure to attempt it within 24hours.\nexam link: https://crt.pydahsoft.in/student/exam/{#var#} - Pydah College
        message = TEST_SCHEDULED_TEMPLATE.replace('{#var#}', test_name, 1) \
                                       .replace('{#var#}', start_time, 1) \
                                       .replace('{#var#}', test_id, 1)
        
        params = {
            'apikey': BULKSMS_API_KEY,
            'sender': BULKSMS_SENDER_ID,
            'number': phone_number,
            'message': message
        }
        
        logger.info(f"📱 Test scheduled SMS params: {params}")
        
        response = send_sms_post(params, False)  # English SMS
        
        logger.info(f"📱 Test scheduled SMS response: {response.text}")
        
        if is_valid_sms_response(response.text):
            message_id = extract_message_id(response.text)
            if message_id:
                logger.info(f"✅ Test scheduled SMS sent successfully with MessageId: {message_id}")
                return {
                    'success': True,
                    'messageId': message_id,
                    'type': 'test_scheduled',
                    'language': 'English'
                }
        
        raise Exception('Failed to send test scheduled SMS')
        
    except Exception as e:
        logger.error(f"📱 Error sending test scheduled SMS: {e}")
        return {'success': False, 'error': str(e)}

def send_credentials_sms(phone_number: str, username: str, password: str, login_url: str = "crt.pydahsoft.in") -> Dict:
    """Send credentials SMS to student/admin"""
    try:
        if not SMS_AVAILABLE:
            logger.warning(f"⚠️ SMS service disabled. Would send to {phone_number}: Credentials for {username}")
            return {'success': False, 'error': 'SMS service not configured'}
        
        logger.info(f"📱 Sending credentials SMS to: {phone_number}")
        
        # Replace template variables
        message = STUDENT_CREDENTIALS_TEMPLATE.replace('{#var#}', username, 1) \
                                             .replace('{#var#}', password, 1)
        
        params = {
            'apikey': BULKSMS_API_KEY,
            'sender': BULKSMS_SENDER_ID,
            'number': phone_number,
            'message': message
        }
        
        logger.info(f"📱 Credentials SMS params: {params}")
        
        response = send_sms_post(params, False)  # English SMS
        
        logger.info(f"📱 Credentials SMS response: {response.text}")
        
        if is_valid_sms_response(response.text):
            message_id = extract_message_id(response.text)
            if message_id:
                logger.info(f"✅ Credentials SMS sent successfully with MessageId: {message_id}")
                return {
                    'success': True,
                    'messageId': message_id,
                    'type': 'credentials',
                    'language': 'English'
                }
        
        raise Exception('Failed to send credentials SMS')
        
    except Exception as e:
        logger.error(f"📱 Error sending credentials SMS: {e}")
        return {'success': False, 'error': str(e)}

def send_test_reminder_sms(phone_number: str, test_name: str, test_id: str) -> Dict:
    """Send test reminder SMS to student"""
    try:
        if not SMS_AVAILABLE:
            logger.warning(f"⚠️ SMS service disabled. Would send to {phone_number}: Test reminder for {test_name}")
            return {'success': False, 'error': 'SMS service not configured'}
        
        logger.info(f"📱 Sending test reminder SMS to: {phone_number}")
        
        # Replace template variables: you haven't attempted your scheduled test {#var#} yet. Please complete it as soon as possible.\nexam link: https://crt.pydahsoft.in/student/exam/{#var#} - Pydah College
        message = TEST_REMINDER_TEMPLATE.replace('{#var#}', test_name, 1) \
                                       .replace('{#var#}', test_id, 1)
        
        params = {
            'apikey': BULKSMS_API_KEY,
            'sender': BULKSMS_SENDER_ID,
            'number': phone_number,
            'message': message
        }
        
        logger.info(f"📱 Test reminder SMS params: {params}")
        
        response = send_sms_post(params, False)  # English SMS
        
        logger.info(f"📱 Test reminder SMS response: {response.text}")
        
        if is_valid_sms_response(response.text):
            message_id = extract_message_id(response.text)
            if message_id:
                logger.info(f"✅ Test reminder SMS sent successfully with MessageId: {message_id}")
                return {
                    'success': True,
                    'messageId': message_id,
                    'type': 'test_reminder',
                    'language': 'English'
                }
        
        raise Exception('Failed to send test reminder SMS')
        
    except Exception as e:
        logger.error(f"📱 Error sending test reminder SMS: {e}")
        return {'success': False, 'error': str(e)}

def send_result_notification_sms(phone_number: str, student_name: str, test_name: str, score: float, login_url: str = "crt.pydahsoft.in") -> Dict:
    """Send test result notification SMS to student"""
    try:
        if not SMS_AVAILABLE:
            logger.warning(f"⚠️ SMS service disabled. Would send to {phone_number}: Result for {test_name}")
            return {'success': False, 'error': 'SMS service not configured'}
        
        logger.info(f"📱 Sending result notification SMS to: {phone_number}")
        
        # Replace template variables
        message = VERSANT_RESULT_TEMPLATE.replace('{#var#}', student_name, 1) \
                                        .replace('{#var#}', test_name, 1) \
                                        .replace('{#var#}', str(score), 1) \
                                        .replace('{#var#}', login_url, 1)
        
        params = {
            'apikey': BULKSMS_API_KEY,
            'sender': BULKSMS_SENDER_ID,
            'number': phone_number,
            'message': message
        }
        
        logger.info(f"📱 Result notification SMS params: {params}")
        
        response = send_sms_post(params, False)  # English SMS
        
        logger.info(f"📱 Result notification SMS response: {response.text}")
        
        if is_valid_sms_response(response.text):
            message_id = extract_message_id(response.text)
            if message_id:
                logger.info(f"✅ Result notification SMS sent successfully with MessageId: {message_id}")
                return {
                    'success': True,
                    'messageId': message_id,
                    'type': 'result_notification',
                    'language': 'English'
                }
        
        raise Exception('Failed to send result notification SMS')
        
    except Exception as e:
        logger.error(f"📱 Error sending result notification SMS: {e}")
        return {'success': False, 'error': str(e)}

def send_custom_sms(phone_number: str, message: str, is_unicode: bool = False) -> Dict:
    """Send custom SMS message"""
    try:
        if not SMS_AVAILABLE:
            logger.warning(f"⚠️ SMS service disabled. Would send to {phone_number}: {message}")
            return {'success': False, 'error': 'SMS service not configured'}
        
        logger.info(f"📱 Sending custom SMS to: {phone_number}")
        
        params = {
            'apikey': BULKSMS_API_KEY,
            'sender': BULKSMS_SENDER_ID,
            'number': phone_number,
            'message': message
        }
        
        if is_unicode:
            params['coding'] = '3'  # Unicode parameter
        
        logger.info(f"📱 Custom SMS params: {params}")
        
        response = send_sms_post(params, is_unicode)
        
        logger.info(f"📱 Custom SMS response: {response.text}")
        
        if is_valid_sms_response(response.text):
            message_id = extract_message_id(response.text)
            if message_id:
                logger.info(f"✅ Custom SMS sent successfully with MessageId: {message_id}")
                return {
                    'success': True,
                    'messageId': message_id,
                    'type': 'custom',
                    'language': 'Unicode' if is_unicode else 'English'
                }
        
        raise Exception('Failed to send custom SMS')
        
    except Exception as e:
        logger.error(f"📱 Error sending custom SMS: {e}")
        return {'success': False, 'error': str(e)}

def check_sms_balance() -> Dict:
    """Check SMS balance"""
    try:
        if not SMS_AVAILABLE:
            return {'success': False, 'error': 'SMS service not configured'}
        
        url = f"http://www.bulksmsapps.com/api/apicheckbalancev2.aspx?apikey={BULKSMS_API_KEY}"
        response = requests.get(url, timeout=30)
        
        return {
            'success': True,
            'balance': response.text
        }
        
    except Exception as e: 
        logger.error(f"Error checking SMS balance: {e}")
        return {'success': False, 'error': str(e)}

def check_delivery_status(message_id: str) -> Dict:
    """Check SMS delivery status"""
    try:
        if not SMS_AVAILABLE:
            return {'success': False, 'error': 'SMS service not configured'}
        
        url = f"http://www.bulksmsapps.com/api/apiDeliveryStatusv2.aspx?apikey={BULKSMS_API_KEY}&messageid={message_id}"
        response = requests.get(url, timeout=30)
        
        return {
            'success': True,
            'status': response.text
        }
        
    except Exception as e:
        logger.error(f"Error checking delivery status: {e}")
        return {'success': False, 'error': str(e)}

def check_sms_configuration() -> Dict:
    """Check if SMS service is properly configured"""
    return {
        'available': SMS_AVAILABLE,
        'api_key_configured': bool(BULKSMS_API_KEY),
        'sender_id_configured': bool(BULKSMS_SENDER_ID),
        'english_api_configured': bool(BULKSMS_ENGLISH_API_URL),
        'unicode_api_configured': bool(BULKSMS_UNICODE_API_URL),
        'dlt_template_configured': bool(BULKSMS_DLT_TEMPLATE_ID),
        'english_dlt_template_configured': bool(BULKSMS_ENGLISH_DLT_TEMPLATE_ID)
    }
