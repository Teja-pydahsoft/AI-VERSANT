const axios = require('axios');
const logger = require('../utils/logger');

/**
 * BulkSMS Service
 * Handles SMS sending using BulkSMS API (same as backend)
 */
class BulkSmsService {
  constructor() {
    this.apiKey = process.env.BULKSMS_API_KEY || '7c9c967a-4ce9-4748-9dc7-d2aaef847275';
    this.senderId = process.env.BULKSMS_SENDER_ID || 'PYDAHK';
    this.englishApiUrl = process.env.BULKSMS_ENGLISH_API_URL || 'https://www.bulksmsapps.com/api/apismsv2.aspx';
    this.unicodeApiUrl = process.env.BULKSMS_UNICODE_API_URL || 'https://www.bulksmsapps.com/api/apibulkv2.aspx';
    this.isConfigured = this.checkConfiguration();
    
    // Templates (same as backend)
    this.templates = {
      studentCredentials: 'Welcome to Pydah Campus Recruitment Training, Your Credentials username: {#var#} password: {#var#} \nLogin with https://crt.pydahsoft.in/login - Pydah College',
      testScheduled: 'A new test {#var#} has been scheduled at {#var#} for you. Please make sure to attempt it within 24hours. exam link: https://crt.pydahsoft.in/student/exam/{#var#} - Pydah College',
      testReminder: 'you haven\'t attempted your scheduled test {#var#} yet. Please complete it as soon as possible. \nexam link: https://crt.pydahsoft.in/student/exam/{#var#} - Pydah College',
      result: 'Hello {#var#}, Your test {#var#} result is {#var#}%. Check your results at https://crt.pydahsoft.in/student/results - Pydah College'
    };
  }

  checkConfiguration() {
    if (!this.apiKey) {
      logger.warn('⚠️ BULKSMS_API_KEY not configured');
      return false;
    }
    if (!this.senderId) {
      logger.warn('⚠️ BULKSMS_SENDER_ID not configured');
      return false;
    }
    logger.info('✅ BulkSMS service configured');
    return true;
  }

  /**
   * Check if SMS response is valid
   */
  isValidResponse(responseText) {
    if (!responseText || typeof responseText !== 'string') {
      return false;
    }
    
    // Check for valid message ID patterns
    if (responseText.includes('MessageId-') || responseText.trim().match(/^\d+$/)) {
      return true;
    }
    
    // Check if HTML response contains MessageId
    if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
      const messageIdMatch = responseText.match(/MessageId-(\d+)/);
      if (messageIdMatch) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Extract message ID from response
   */
  extractMessageId(responseText) {
    // Try to extract MessageId using regex
    const messageIdMatch = responseText.match(/MessageId-(\d+)/);
    if (messageIdMatch) {
      return messageIdMatch[1];
    }
    
    // Fallback methods
    if (responseText.includes('MessageId-')) {
      return responseText.split('MessageId-')[1].split('\n')[0].trim();
    }
    
    if (responseText.trim().match(/^\d+$/)) {
      return responseText.trim();
    }
    
    return null;
  }

  /**
   * Send SMS using BulkSMS API
   */
  async sendSms({ phone, message, isUnicode = false }) {
    if (!this.isConfigured) {
      throw new Error('BulkSMS service not configured');
    }

    try {
      const apiUrl = isUnicode ? this.unicodeApiUrl : this.englishApiUrl;
      
      const params = {
        apikey: this.apiKey,
        sender: this.senderId,
        number: phone,
        message: message
      };

      if (isUnicode) {
        params.coding = '3'; // Unicode parameter
      }

      logger.info(`📱 Sending SMS to: ${phone}`);
      logger.info(`📱 API URL: ${apiUrl}`);

      // Try POST first, fallback to GET
      let response;
      try {
        response = await axios.post(apiUrl, null, {
          params,
          headers: {
            'Accept': 'text/plain',
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 30000
        });
      } catch (postError) {
        logger.warn('⚠️ POST failed, trying GET:', postError.message);
        response = await axios.get(apiUrl, {
          params,
          headers: {
            'Accept': 'text/plain'
          },
          timeout: 30000
        });
      }

      logger.info(`📱 SMS response: ${response.data}`);

      if (this.isValidResponse(response.data)) {
        const messageId = this.extractMessageId(response.data);
        if (messageId) {
          logger.info(`✅ SMS sent successfully. MessageId: ${messageId}`);
          return {
            success: true,
            messageId: messageId,
            provider: 'BulkSMS',
            language: isUnicode ? 'Unicode' : 'English'
          };
        }
      }

      throw new Error('Failed to send SMS - Invalid response');
    } catch (error) {
      logger.error('❌ BulkSMS error:', error.message);
      throw error;
    }
  }

  /**
   * Send student credentials SMS
   */
  async sendStudentCredentials({ phone, username, password }) {
    const message = this.templates.studentCredentials
      .replace('{#var#}', username)
      .replace('{#var#}', password);

    return this.sendSms({ phone, message, isUnicode: false });
  }

  /**
   * Send test scheduled SMS
   */
  async sendTestScheduled({ phone, testName, startTime, testId }) {
    const message = this.templates.testScheduled
      .replace('{#var#}', testName)
      .replace('{#var#}', startTime)
      .replace('{#var#}', testId);

    return this.sendSms({ phone, message, isUnicode: false });
  }

  /**
   * Send test reminder SMS
   */
  async sendTestReminder({ phone, testName, testId }) {
    const message = this.templates.testReminder
      .replace('{#var#}', testName)
      .replace('{#var#}', testId);

    return this.sendSms({ phone, message, isUnicode: false });
  }

  /**
   * Send result notification SMS
   */
  async sendResultNotification({ phone, studentName, testName, score }) {
    const message = this.templates.result
      .replace('{#var#}', studentName)
      .replace('{#var#}', testName)
      .replace('{#var#}', score.toString());

    return this.sendSms({ phone, message, isUnicode: false });
  }

  /**
   * Send custom SMS
   */
  async sendCustomSms({ phone, message, isUnicode = false }) {
    return this.sendSms({ phone, message, isUnicode });
  }

  /**
   * Check SMS balance
   */
  async checkBalance() {
    if (!this.isConfigured) {
      throw new Error('BulkSMS service not configured');
    }

    try {
      const url = `http://www.bulksmsapps.com/api/apicheckbalancev2.aspx?apikey=${this.apiKey}`;
      const response = await axios.get(url, { timeout: 30000 });
      
      return {
        success: true,
        balance: response.data
      };
    } catch (error) {
      logger.error('❌ Error checking SMS balance:', error.message);
      throw error;
    }
  }

  /**
   * Check delivery status
   */
  async checkDeliveryStatus(messageId) {
    if (!this.isConfigured) {
      throw new Error('BulkSMS service not configured');
    }

    try {
      const url = `http://www.bulksmsapps.com/api/apiDeliveryStatusv2.aspx?apikey=${this.apiKey}&messageid=${messageId}`;
      const response = await axios.get(url, { timeout: 30000 });
      
      return {
        success: true,
        status: response.data
      };
    } catch (error) {
      logger.error('❌ Error checking delivery status:', error.message);
      throw error;
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      configured: this.isConfigured,
      provider: 'BulkSMS',
      apiKeySet: !!this.apiKey,
      senderIdSet: !!this.senderId,
      senderId: this.senderId
    };
  }
}

module.exports = new BulkSmsService();
