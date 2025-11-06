const logger = require('../utils/logger');
const { getDatabase } = require('../config/database');
const { ObjectId } = require('mongodb');
const notificationService = require('./notificationService');

/**
 * Test Notification Service
 * Handles test creation and reminder notifications
 */
class TestNotificationService {
  constructor() {
    this.db = null;
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    try {
      this.db = await getDatabase();
      logger.info('✅ Test Notification Service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Test Notification Service:', error);
      throw error;
    }
  }

  /**
   * Get database instance
   */
  getDb() {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Send notifications when a new test is created
   * @param {string} testId - MongoDB ObjectId of the test
   */
  async sendTestCreatedNotifications(testId) {
    try {
      const db = this.getDb();
      
      logger.info(`📋 Processing test created notifications for test: ${testId}`);

      // Fetch test details from MongoDB
      const test = await db.collection('tests').findOne({ _id: new ObjectId(testId) });
      
      if (!test) {
        logger.error(`❌ Test not found: ${testId}`);
        throw new Error(`Test not found: ${testId}`);
      }

      logger.info(`📋 Test found: ${test.name}`);
      logger.info(`📋 Test ID: ${test.test_id}`);
      logger.info(`📋 Module: ${test.module_id}`);

      // Collect student IDs for this test
      let allStudentIds = [];
      
      // Source 1: assigned_student_ids (direct assignment)
      if (test.assigned_student_ids && test.assigned_student_ids.length > 0) {
        allStudentIds.push(...test.assigned_student_ids);
        logger.info(`👥 Found ${test.assigned_student_ids.length} directly assigned students`);
      }
      
      // Source 2: Query students by batch_ids and course_ids
      if (test.batch_ids && test.batch_ids.length > 0 && test.course_ids && test.course_ids.length > 0) {
        const studentsFromBatchCourse = await db.collection('students').find({
          batch_id: { $in: test.batch_ids.map(id => new ObjectId(id)) },
          course_id: { $in: test.course_ids.map(id => new ObjectId(id)) }
        }).toArray();
        
        if (studentsFromBatchCourse.length > 0) {
          allStudentIds.push(...studentsFromBatchCourse.map(s => s._id));
          logger.info(`👥 Found ${studentsFromBatchCourse.length} students from batch/course`);
        }
      } else if (test.batch_ids && test.batch_ids.length > 0) {
        const studentsFromBatch = await db.collection('students').find({
          batch_id: { $in: test.batch_ids.map(id => new ObjectId(id)) }
        }).toArray();
        
        if (studentsFromBatch.length > 0) {
          allStudentIds.push(...studentsFromBatch.map(s => s._id));
          logger.info(`👥 Found ${studentsFromBatch.length} students from batch`);
        }
      }

      // Remove duplicates
      allStudentIds = [...new Set(allStudentIds.map(id => id.toString()))];
      
      logger.info(`👥 Total unique students: ${allStudentIds.length}`);
      
      if (allStudentIds.length === 0) {
        logger.warn('⚠️ No students found for this test');
        return {
          success: true,
          message: 'No students found',
          sent: 0
        };
      }

      // Fetch student details
      const students = await db.collection('students').find({
        _id: { $in: allStudentIds.map(id => new ObjectId(id)) }
      }).toArray();

      logger.info(`📋 Fetched ${students.length} student records`);

      // Fetch notification settings once
      const settings = await db.collection('notification_settings').findOne({});
      logger.info('⚙️ Notification Settings:', settings);

      // If both email and SMS are disabled, stop early
      if (!settings.mailEnabled && !settings.smsEnabled) {
        logger.warn('⚠️ Email and SMS notifications are disabled. Skipping test creation notifications.');
        return {
          success: true,
          message: 'Email and SMS notifications are disabled',
          testId,
          totalStudents: allStudentIds.length,
          emailsSent: 0,
          smsSent: 0,
        };
      }

      // Process each student
      let emailsSent = 0;
      let smsSent = 0;
      const errors = [];

      for (const student of students) {
        try {
          const studentName = student.name || 'Student';

          // Send email notification (check if mail is enabled)
          if (student.email) {
            if (settings.mailEnabled) {
              const emailContent = `A new test "${test.name}" (${test.test_type || 'Test'}) has been assigned to you. Please log in to attempt it.`;
              const emailMetadata = { 
                subject: `New Test Assigned: ${test.name}`,
                template: 'testCreated',
                name: studentName,
                testName: test.name,
                testType: test.test_type || 'Online Test',
                testUrl: `https://crt.pydahsoft.in/student/exam/${test.test_id}`,
                startDateTime: test.startDateTime || test.start_datetime,
                endDateTime: test.endDateTime || test.end_datetime
              };
              const emailResult = await notificationService.sendNotification('email', student.email, emailContent, emailMetadata);
              if (emailResult.success && emailResult.messageId !== 'disabled-by-settings') {
                emailsSent++;
              } else if (!emailResult.success) {
                errors.push({ studentId: student._id.toString(), email: student.email, error: emailResult.error });
              }
            }
            else{
              logger.info(`⚠️ Email notifications are disabled in settings. Skipping email to ${student.email}.`);
            }
          }

          // Send SMS notification (check if SMS is enabled)
          if (student.mobile_number) {
            // Format start time
            const startTime = test.startDateTime || new Date().toISOString();
            const formattedTime = new Date(startTime).toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              dateStyle: 'medium',
              timeStyle: 'short'
            });

            if (settings.smsEnabled) {
              const smsContent= `A new test "${test.name}" has been scheduled at ${formattedTime} for you. Please make sure to attempt it within 24 hours. Exam link: https://crt.pydahsoft.in/student/exam/ ${test.test_id} - Pydah College`;
              const smsMetadata = { template: 'testScheduled' };
              const smsResult = await notificationService.sendNotification('sms', student.mobile_number, smsContent, smsMetadata);
              if (smsResult.success && smsResult.messageId !== 'disabled-by-settings') {
                smsSent++;
              } else if (!smsResult.success) {
                errors.push({ studentId: student._id.toString(), phone: student.mobile_number, error: smsResult.error });
              }
            }
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (studentError) {
          logger.error(`❌ Error processing student ${student._id}:`, studentError.message);
          errors.push({ studentId: student._id.toString(), error: studentError.message });
        }
      }

      logger.info(`✅ Test created notifications completed: ${emailsSent} emails, ${smsSent} SMS sent`);

      return {
        success: true,
        testId,
        testName: test.name,
        totalStudents: allStudentIds.length,
        emailsSent,
        smsSent,
        notificationType: 'test_creation',
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      logger.error('❌ Error sending test created notifications:', error);
      throw error;
    }
  }

  /**
   * Send test reminder notifications (SMS and Email only)
   * Called by SMS/Email cron job - no input parameters
   * Queries database for tests that need reminders
   * Only sends SMS and Email notifications
   */
  async sendTestRemindersSmsEmailOnly() {
    try {
      const settings = await notificationService.getNotificationSettings();
      if (!settings.mailEnabled && !settings.smsEnabled) {
        logger.info('⚠️ Email and SMS notifications are disabled. Skipping test reminders.');
        return {
          success: true,
          message: 'Email and SMS notifications disabled, skipping test reminders',
        };
      }

      const db = this.getDb();
      const now = new Date();

      logger.info(`⏰ Processing SMS/Email test reminders (STUDENT-CENTRIC approach)...`);
      logger.info(`⏰ Current time: ${now.toISOString()}`);

      // 1. Get all active tests (endDateTime not passed)
      const activeTests = await db.collection('tests').find({
        $and: [
          {
            $or: [
              { endDateTime: { $gt: now } },
              { end_datetime: { $gt: now } }
            ]
          },
          {
            $or: [
              { is_active: true },
              { status: 'active' }
            ]
          }
        ]
      }).toArray();

      logger.info(`📝 Found ${activeTests.length} active tests`);

      if (activeTests.length === 0) {
        return {
          success: true,
          message: 'No active tests found',
          active_tests: 0,
          total_sent: 0
        };
      }

      logger.info(`📋 Active tests: ${activeTests.map(t => t.name).join(', ')}`);

      // 2. Build a map: student_id -> [tests they're assigned to]
      logger.info(`🔍 Building student-to-tests mapping...`);
      const studentToTests = new Map(); // student_id -> Array of test objects

      for (const test of activeTests) {
        logger.info(`📝 Mapping students for test: ${test.name}`);

        // Collect student IDs for this test
        let allStudentIds = [];

        // Source 1: assigned_student_ids
        if (test.assigned_student_ids && test.assigned_student_ids.length > 0) {
          allStudentIds.push(...test.assigned_student_ids);
        }

        // Source 2: Query students by batch_ids and course_ids
        if (test.batch_ids && test.batch_ids.length > 0 && test.course_ids && test.course_ids.length > 0) {
          const studentsFromBatchCourse = await db.collection('students').find({
            batch_id: { $in: test.batch_ids.map(id => new ObjectId(id)) },
            course_id: { $in: test.course_ids.map(id => new ObjectId(id)) }
          }).toArray();

          if (studentsFromBatchCourse.length > 0) {
            allStudentIds.push(...studentsFromBatchCourse.map(s => s._id));
          }
        } else if (test.batch_ids && test.batch_ids.length > 0) {
          const studentsFromBatch = await db.collection('students').find({
            batch_id: { $in: test.batch_ids.map(id => new ObjectId(id)) }
          }).toArray();

          if (studentsFromBatch.length > 0) {
            allStudentIds.push(...studentsFromBatch.map(s => s._id));
          }
        }

        // Remove duplicates
        allStudentIds = [...new Set(allStudentIds.map(id => id.toString()))];

        logger.info(`👥 Found ${allStudentIds.length} students for test \"${test.name}\"`);

        // Map each student to this test
        for (const studentId of allStudentIds) {
          if (!studentToTests.has(studentId)) {
            studentToTests.set(studentId, []);
          }
          studentToTests.get(studentId).push(test);
        }
      }

      logger.info(`✅ Total unique students across all tests: ${studentToTests.size}`);

      // 3. Get ALL attempts for ALL active tests at once
      logger.info(`🔍 Fetching all attempts for active tests...`);
      const allAttempts = await db.collection('student_test_attempts').find({
        $or: activeTests.flatMap(test => [
          { test_id: test._id.toString() },
          { test_id: test._id },
          { test_id: test.test_id }
        ])
      }).toArray();

      logger.info(`📋 Found ${allAttempts.length} total attempts across all tests`);

      // Build a map: student_id/user_id -> Set of attempted test_ids
      const attemptedMap = new Map(); // identifier -> Set of test_ids
      allAttempts.forEach(attempt => {
        const testId = attempt.test_id?.toString();
        if (attempt.student_id) {
          const sid = attempt.student_id.toString();
          if (!attemptedMap.has(sid)) attemptedMap.set(sid, new Set());
          attemptedMap.get(sid).add(testId);
        }
        if (attempt.user_id) {
          const uid = attempt.user_id.toString();
          if (!attemptedMap.has(uid)) attemptedMap.set(uid, new Set());
          attemptedMap.get(uid).add(testId);
        }
      });

      // 4. For EACH STUDENT, determine which tests they haven't attempted
      logger.info(`🔍 Processing each student to find their pending tests...`);

      const studentPendingTests = new Map(); // student_id -> Array of pending test objects

      for (const [studentId, assignedTests] of studentToTests.entries()) {
        const pendingTests = [];

        for (const test of assignedTests) {
          const testId = test._id.toString();
          const attemptedByStudent = attemptedMap.get(studentId)?.has(testId);

          if (!attemptedByStudent) {
            pendingTests.push(test);
          }
        }

        if (pendingTests.length > 0) {
          studentPendingTests.set(studentId, pendingTests);
        }
      }

      logger.info(`📊 Students with pending tests: ${studentPendingTests.size}/${studentToTests.size}`);

      if (studentPendingTests.size === 0) {
        logger.info(`✅ All students have attempted all their tests!`);
        return {
          success: true,
          message: 'No pending tests found',
          active_tests: activeTests.length,
          total_sent: 0
        };
      }

      // 5. Get user IDs for students with pending tests
      logger.info(`🔍 Looking up user IDs for students with pending tests...`);
      const studentIdsWithPending = Array.from(studentPendingTests.keys());

      const students = await db.collection('students').find({
        _id: { $in: studentIdsWithPending.map(id => new ObjectId(id)) }
      }).toArray();

      const studentToUser = new Map(); // student_id -> user_id
      students.forEach(s => {
        if (s.user_id) {
          studentToUser.set(s._id.toString(), s.user_id.toString());
        }
      });

      logger.info(`🆔 Mapped ${studentToUser.size} students to user IDs`);

      // 6. Double-check: Filter out users who have attempted using user_id
      logger.info(`🔍 Double-checking attempts by user_id...`);
      for (const [studentId, pendingTests] of studentPendingTests.entries()) {
        const userId = studentToUser.get(studentId);
        if (!userId) continue;

        const filteredTests = pendingTests.filter(test => {
          const testId = test._id.toString();
          const attemptedByUser = attemptedMap.get(userId)?.has(testId);
          return !attemptedByUser;
        });

        if (filteredTests.length === 0) {
          studentPendingTests.delete(studentId);
        } else if (filteredTests.length < pendingTests.length) {
          studentPendingTests.set(studentId, filteredTests);
        }
      }

      logger.info(`✅ After user_id verification: ${studentPendingTests.size} students with pending tests`);

      if (studentPendingTests.size === 0) {
        logger.info(`✅ All students have attempted all tests (verified by user_id)`);
        return {
          success: true,
          message: 'No pending tests found after verification',
          active_tests: activeTests.length,
          total_sent: 0
        };
      }

      // 7. Send email and SMS reminders to each student (Push notifications disabled for this method)
      logger.info(`📤 Sending email & SMS reminders to students (Push notifications disabled for cron job)...`);

      let totalEmailsSent = 0;
      let totalSmsSent = 0;
      const errors = [];

      for (const [studentId, pendingTests] of studentPendingTests.entries()) {
        try {
          // Fetch student details
          const student = await db.collection('students').findOne({
            _id: new ObjectId(studentId)
          });

          if (!student) {
            logger.warn(`⚠️ Student not found: ${studentId}`);
            continue;
          }

          const studentName = student.name || 'Student';
          const studentEmail = student.email;
          const studentPhone = student.mobile_number;

          // Send reminder for the FIRST pending test (most urgent)
          const test = pendingTests[0];

          logger.info(`📧 Sending SMS/Email reminder to: ${studentName} for test \"${test.name}\" (${pendingTests.length} pending tests)`);

          // Send email reminder (check if mail is enabled)
          if (studentEmail && settings.mailEnabled) {
            const emailContent = `This is a reminder to complete your test: "${test.name}".`;
            const emailMetadata = {
              subject: `Reminder: Complete Your Test - ${test.name}`,
              template: 'testReminder',
              name: studentName,
              testName: test.name,
              testId: test.test_id || test._id.toString(),
              testUrl: `https://crt.pydahsoft.in/student/exam/${test.test_id || test._id}`,
              endDateTime: test.endDateTime || test.end_datetime
            };
            const emailResult = await notificationService.sendNotification('email', studentEmail, emailContent, emailMetadata);
            if (emailResult.success && emailResult.messageId !== 'disabled-by-settings') {
              totalEmailsSent++;
            } else if (!emailResult.success) {
              errors.push({ studentId, email: studentEmail, error: emailResult.error });
            }
          }

          // Send SMS reminder (check if SMS is enabled)
          if (studentPhone && settings.smsEnabled) {
            const smsContent = `you haven\'t attempted your scheduled test {#var#} yet. Please complete it as soon as possible. \nexam link: https://crt.pydahsoft.in/student/exam/ ${test.test_id} - Pydah College`;
            const smsMetadata = { template: 'testReminder' };
            const smsResult = await notificationService.sendNotification('sms', studentPhone, smsContent, smsMetadata);
            if (smsResult.success && smsResult.messageId !== 'disabled-by-settings') {
              totalSmsSent++;
            } else if (!smsResult.success) {
              errors.push({ studentId, phone: studentPhone, error: smsResult.error });
            }
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 150));

        } catch (studentError) {
          logger.error(`❌ Error processing student ${studentId}:`, studentError.message);
          errors.push({ studentId, error: studentError.message });
        }
      }

      logger.info(`✅ SMS/Email reminders complete: ${totalEmailsSent} emails, ${totalSmsSent} SMS sent`);

      return {
        success: true,
        type: 'sms_email_reminders_only',
        active_tests: activeTests.length,
        total_students: studentToTests.size,
        students_with_pending: studentPendingTests.size,
        emailsSent: totalEmailsSent,
        smsSent: totalSmsSent,
        pushSent: 0, // Push notifications disabled for this cron job
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      logger.error('❌ Error sending SMS/Email test reminders only:', error);
      throw error;
    }
  }

  /**
   * Send test reminder notifications (Push notifications only)
   * Called by cron job every 6 hours
   * Queries database for tests that need reminders
   * Only sends push notifications
   */
  async sendTestRemindersPushOnly() {
    try {
      const settings = await notificationService.getNotificationSettings();
      if (!settings.pushEnabled) {
        logger.info('⚠️ Push notifications are disabled. Skipping push-only reminders.');
        return {
          success: true,
          message: 'Push notifications disabled, skipping push reminders',
        };
      }

      const db = this.getDb();
      const now = new Date();
      
      logger.info(`⏰ Processing push-only test reminders (STUDENT-CENTRIC approach)...`);
      logger.info(`⏰ Current time: ${now.toISOString()}`);

      // 1. Get all active tests (endDateTime not passed)
      // Filter: endDateTime in future AND (is_active=true OR status='active' OR fields missing/null)
      const activeTests = await db.collection('tests').find({
        $and: [
          {
            $or: [
              { endDateTime: { $gt: now } },
              { end_datetime: { $gt: now } }
            ]
          },
          {
            $or: [
              { is_active: true },
              { status: 'active' },
              { is_active: { $exists: false } },
              { is_active: null },
              { status: { $exists: false } },
              { status: null }
            ]
          }
        ]
      }).toArray();

      logger.info(`📝 Found ${activeTests.length} active tests`);
      
      if (activeTests.length === 0) {
        return {
          success: true,
          message: 'No active tests found',
          active_tests: 0,
          pushSent: 0
        };
      }

      // 2. Build a map: student_id -> [tests they're assigned to]
      logger.info(`🔍 Building student-to-tests mapping...`);
      const studentToTests = new Map();

      for (const test of activeTests) {
        logger.info(`📝 Mapping students for test: ${test.name}`);

        // Collect student IDs for this test
        let allStudentIds = [];
        
        // Source 1: assigned_student_ids
        if (test.assigned_student_ids && test.assigned_student_ids.length > 0) {
          allStudentIds.push(...test.assigned_student_ids);
        }
        
        // Source 2: Query students by batch_ids and course_ids
        if (test.batch_ids && test.batch_ids.length > 0 && test.course_ids && test.course_ids.length > 0) {
          const studentsFromBatchCourse = await db.collection('students').find({
            batch_id: { $in: test.batch_ids.map(id => new ObjectId(id)) },
            course_id: { $in: test.course_ids.map(id => new ObjectId(id)) }
          }).toArray();
          
          if (studentsFromBatchCourse.length > 0) {
            allStudentIds.push(...studentsFromBatchCourse.map(s => s._id));
          }
        } else if (test.batch_ids && test.batch_ids.length > 0) {
          const studentsFromBatch = await db.collection('students').find({
            batch_id: { $in: test.batch_ids.map(id => new ObjectId(id)) }
          }).toArray();
          
          if (studentsFromBatch.length > 0) {
            allStudentIds.push(...studentsFromBatch.map(s => s._id));
          }
        }

        // Remove duplicates
        allStudentIds = [...new Set(allStudentIds.map(id => id.toString()))];

        logger.info(`👥 Found ${allStudentIds.length} students for test "${test.name}"`);

        // Map each student to this test
        for (const studentId of allStudentIds) {
          if (!studentToTests.has(studentId)) {
            studentToTests.set(studentId, []);
          }
          studentToTests.get(studentId).push(test);
        }
      }

      logger.info(`✅ Total unique students across all tests: ${studentToTests.size}`);

      // 3. Get ALL attempts for ALL active tests at once
      logger.info(`🔍 Fetching all attempts for active tests...`);
      const allAttempts = await db.collection('student_test_attempts').find({
        $or: activeTests.flatMap(test => [
          { test_id: test._id.toString() },
          { test_id: test._id },
          { test_id: test.test_id }
        ])
      }).toArray();

      logger.info(`📋 Found ${allAttempts.length} total attempts across all tests`);

      // Build a map: student_id/user_id -> Set of attempted test_ids
      const attemptedMap = new Map();
      allAttempts.forEach(attempt => {
        const testId = attempt.test_id?.toString();
        if (attempt.student_id) {
          const sid = attempt.student_id.toString();
          if (!attemptedMap.has(sid)) attemptedMap.set(sid, new Set());
          attemptedMap.get(sid).add(testId);
        }
        if (attempt.user_id) {
          const uid = attempt.user_id.toString();
          if (!attemptedMap.has(uid)) attemptedMap.set(uid, new Set());
          attemptedMap.get(uid).add(testId);
        }
      });

      // 4. For EACH STUDENT, determine which tests they haven't attempted
      logger.info(`🔍 Processing each student to find their pending tests...`);
      
      const studentPendingTests = new Map();
      
      for (const [studentId, assignedTests] of studentToTests.entries()) {
        const pendingTests = [];
        
        for (const test of assignedTests) {
          const testId = test._id.toString();
          const attemptedByStudent = attemptedMap.get(studentId)?.has(testId);
          
          if (!attemptedByStudent) {
            pendingTests.push(test);
          }
        }
        
        if (pendingTests.length > 0) {
          studentPendingTests.set(studentId, pendingTests);
        }
      }

      logger.info(`📊 Students with pending tests: ${studentPendingTests.size}/${studentToTests.size}`);

      if (studentPendingTests.size === 0) {
        logger.info(`✅ All students have attempted all their tests!`);
        return {
          success: true,
          message: 'No pending tests found',
          active_tests: activeTests.length,
          pushSent: 0
        };
      }

      // 5. Get user IDs for students with pending tests
      logger.info(`🔍 Looking up user IDs for students with pending tests...`);
      const studentIdsWithPending = Array.from(studentPendingTests.keys());
      
      const students = await db.collection('students').find({
        _id: { $in: studentIdsWithPending.map(id => new ObjectId(id)) }
      }).toArray();

      const studentToUser = new Map();
      students.forEach(s => {
        if (s.user_id) {
          studentToUser.set(s._id.toString(), s.user_id.toString());
        }
      });

      logger.info(`🆔 Mapped ${studentToUser.size} students to user IDs`);

      // 6. Double-check: Filter out users who have attempted using user_id
      logger.info(`🔍 Double-checking attempts by user_id...`);
      for (const [studentId, pendingTests] of studentPendingTests.entries()) {
        const userId = studentToUser.get(studentId);
        if (!userId) continue;

        const filteredTests = pendingTests.filter(test => {
          const testId = test._id.toString();
          const attemptedByUser = attemptedMap.get(userId)?.has(testId);
          return !attemptedByUser;
        });

        if (filteredTests.length === 0) {
          studentPendingTests.delete(studentId);
        } else if (filteredTests.length < pendingTests.length) {
          studentPendingTests.set(studentId, filteredTests);
        }
      }

      logger.info(`✅ After user_id verification: ${studentPendingTests.size} students with pending tests`);

      if (studentPendingTests.size === 0) {
        logger.info(`✅ All students have attempted all tests (verified by user_id)`);
        return {
          success: true,
          message: 'No pending tests found after verification',
          active_tests: activeTests.length,
          pushSent: 0
        };
      }

      // 7. Send push notifications only
      logger.info(`📤 Sending push-only reminders to students...`);
      let totalPushSent = 0;
      const errors = [];

      for (const [studentId, pendingTests] of studentPendingTests.entries()) {
        try {
          const student = await db.collection('students').findOne({
            _id: new ObjectId(studentId)
          });

          if (!student) {
            logger.warn(`⚠️ Student not found: ${studentId}`);
            continue;
          }

          const studentName = student.name || 'Student';
          const userId = studentToUser.get(studentId);

          // Send reminder for the FIRST pending test (most urgent)
          const test = pendingTests[0];

          if (userId && settings.pushEnabled) {
            try {
              // Calculate urgency for push notification
              const endDateTime = test.endDateTime || test.end_datetime;
              if (!endDateTime) continue;

              const endDate = new Date(endDateTime);
              const timeRemaining = endDate - now;
              const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
              const daysRemaining = Math.floor(hoursRemaining / 24);

              let title, body, urgency;

              if (hoursRemaining < 2) {
                urgency = 'critical';
                title = `⚠️ URGENT: ${test.name}`;
                body = `Test ends in ${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}! Complete it now!`;
              } else if (hoursRemaining < 6) {
                urgency = 'high';
                title = `⏰ Important: ${test.name}`;
                body = `Only ${hoursRemaining} hours left to complete your test!`;
              } else if (hoursRemaining < 24) {
                urgency = 'medium';
                title = `📝 Reminder: ${test.name}`;
                body = `Test ends today! ${hoursRemaining} hours remaining.`;
              } else if (daysRemaining === 1) {
                urgency = 'medium';
                title = `📚 Reminder: ${test.name}`;
                body = `Test ends tomorrow! Don't forget to complete it.`;
              } else {
                urgency = 'low';
                title = `📖 Reminder: ${test.name}`;
                body = `You have ${daysRemaining} days to complete your test.`;
              }

              // Add info about other pending tests
              if (pendingTests.length > 1) {
                body += ` (+ ${pendingTests.length - 1} more pending test${pendingTests.length > 2 ? 's' : ''})`;
              }

              const pushData = {
                type: 'test_reminder',
                test_id: test._id.toString(),
                test_name: test.name,
                pending_tests_count: pendingTests.length,
                end_datetime: endDate.toISOString(),
                hours_remaining: hoursRemaining,
                urgency: urgency,
                url: `/student/exam/${test._id}`
              };

              // Send OneSignal notification directly (OneSignal handles user lookup)
              const pushResult = await notificationService.sendNotification('push', { user_id: userId }, body, {
                title: title,
                data: pushData
              });

              if (pushResult.success && pushResult.messageId !== 'disabled-by-settings') {
                totalPushSent++;
                logger.info(`✅ OneSignal notification sent to user ${userId}`);
              } else if (!pushResult.success) {
                errors.push({ studentId, userId, error: pushResult.error });
              }

            } catch (pushError) {
              logger.error(`❌ Error sending OneSignal push to user ${userId}:`, pushError.message);
              errors.push({ studentId, userId, error: pushError.message });
            }
          }

        } catch (studentError) {
          logger.error(`❌ Error processing student ${studentId}:`, studentError.message);
          errors.push({ studentId, error: studentError.message });
        }
      }

      logger.info(`✅ Push-only reminders complete: ${totalPushSent} push notifications sent`);

      return {
        success: true,
        type: 'push_only',
        active_tests: activeTests.length,
        total_students: studentToTests.size,
        students_with_pending: studentPendingTests.size,
        pushSent: totalPushSent,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      logger.error('❌ Error sending push-only test reminders:', error);
      throw error;
    }
  }

  /**
   * Send test reminder notifications (All types: Push, SMS, Email)
   * Called by trigger endpoint - no input parameters
   * Queries database for tests that need reminders
   * Sends all notification types when called from trigger endpoint
   */
  async sendTestReminders() {
    try {
      const settings = await notificationService.getNotificationSettings();
      if (!settings.pushEnabled && !settings.mailEnabled && !settings.smsEnabled) {
        logger.info('⚠️ All notifications are disabled. Skipping test reminders.');
        return {
          success: true,
          message: 'All notifications disabled, skipping test reminders',
        };
      }

      const db = this.getDb();
      const now = new Date();
      
      logger.info(`⏰ Processing test reminders (STUDENT-CENTRIC approach)...`);
      logger.info(`⏰ Current time: ${now.toISOString()}`);

      // 1. Get all active tests (endDateTime not passed)
      const activeTests = await db.collection('tests').find({
        $or: [
          { endDateTime: { $gt: now } },
          { end_datetime: { $gt: now } }
        ],
        $or: [
          { is_active: true },
          { status: 'active' }
        ]
      }).toArray();

      logger.info(`📝 Found ${activeTests.length} active tests`);
      
      if (activeTests.length === 0) {
        return {
          success: true,
          message: 'No active tests found',
          active_tests: 0,
          total_sent: 0
        };
      }
      
      logger.info(`📋 Active tests: ${activeTests.map(t => t.name).join(', ')}`);

      // 2. Build a map: student_id -> [tests they're assigned to]
      logger.info(`🔍 Building student-to-tests mapping...`);
      const studentToTests = new Map(); // student_id -> Array of test objects

      for (const test of activeTests) {
        logger.info(`📝 Mapping students for test: ${test.name}`);

        // Collect student IDs for this test
        let allStudentIds = [];
        
        // Source 1: assigned_student_ids
        if (test.assigned_student_ids && test.assigned_student_ids.length > 0) {
          allStudentIds.push(...test.assigned_student_ids);
        }
        
        // Source 2: Query students by batch_ids and course_ids
        if (test.batch_ids && test.batch_ids.length > 0 && test.course_ids && test.course_ids.length > 0) {
          const studentsFromBatchCourse = await db.collection('students').find({
            batch_id: { $in: test.batch_ids.map(id => new ObjectId(id)) },
            course_id: { $in: test.course_ids.map(id => new ObjectId(id)) }
          }).toArray();
          
          if (studentsFromBatchCourse.length > 0) {
            allStudentIds.push(...studentsFromBatchCourse.map(s => s._id));
          }
        } else if (test.batch_ids && test.batch_ids.length > 0) {
          const studentsFromBatch = await db.collection('students').find({
            batch_id: { $in: test.batch_ids.map(id => new ObjectId(id)) }
          }).toArray();
          
          if (studentsFromBatch.length > 0) {
            allStudentIds.push(...studentsFromBatch.map(s => s._id));
          }
        }

        // Remove duplicates
        allStudentIds = [...new Set(allStudentIds.map(id => id.toString()))];

        logger.info(`👥 Found ${allStudentIds.length} students for test \"${test.name}\"`);

        // Map each student to this test
        for (const studentId of allStudentIds) {
          if (!studentToTests.has(studentId)) {
            studentToTests.set(studentId, []);
          }
          studentToTests.get(studentId).push(test);
        }
      }

      logger.info(`✅ Total unique students across all tests: ${studentToTests.size}`);

      // 3. Get ALL attempts for ALL active tests at once
      logger.info(`🔍 Fetching all attempts for active tests...`);
      const allAttempts = await db.collection('student_test_attempts').find({
        $or: activeTests.flatMap(test => [
          { test_id: test._id.toString() },
          { test_id: test._id },
          { test_id: test.test_id }
        ])
      }).toArray();

      logger.info(`📋 Found ${allAttempts.length} total attempts across all tests`);

      // Build a map: student_id/user_id -> Set of attempted test_ids
      const attemptedMap = new Map(); // identifier -> Set of test_ids
      allAttempts.forEach(attempt => {
        const testId = attempt.test_id?.toString();
        if (attempt.student_id) {
          const sid = attempt.student_id.toString();
          if (!attemptedMap.has(sid)) attemptedMap.set(sid, new Set());
          attemptedMap.get(sid).add(testId);
        }
        if (attempt.user_id) {
          const uid = attempt.user_id.toString();
          if (!attemptedMap.has(uid)) attemptedMap.set(uid, new Set());
          attemptedMap.get(uid).add(testId);
        }
      });

      // 4. For EACH STUDENT, determine which tests they haven't attempted
      logger.info(`🔍 Processing each student to find their pending tests...`);
      
      const studentPendingTests = new Map(); // student_id -> Array of pending test objects
      
      for (const [studentId, assignedTests] of studentToTests.entries()) {
        const pendingTests = [];
        
        for (const test of assignedTests) {
          const testId = test._id.toString();
          const attemptedByStudent = attemptedMap.get(studentId)?.has(testId);
          
          if (!attemptedByStudent) {
            pendingTests.push(test);
          }
        }
        
        if (pendingTests.length > 0) {
          studentPendingTests.set(studentId, pendingTests);
        }
      }

      logger.info(`📊 Students with pending tests: ${studentPendingTests.size}/${studentToTests.size}`);

      if (studentPendingTests.size === 0) {
        logger.info(`✅ All students have attempted all their tests!`);
        return {
          success: true,
          message: 'No pending tests found',
          active_tests: activeTests.length,
          total_sent: 0
        };
      }

      // 5. Get user IDs for students with pending tests
      logger.info(`🔍 Looking up user IDs for students with pending tests...`);
      const studentIdsWithPending = Array.from(studentPendingTests.keys());
      
      const students = await db.collection('students').find({
        _id: { $in: studentIdsWithPending.map(id => new ObjectId(id)) }
      }).toArray();

      const studentToUser = new Map(); // student_id -> user_id
      students.forEach(s => {
        if (s.user_id) {
          studentToUser.set(s._id.toString(), s.user_id.toString());
        }
      });

      logger.info(`🆔 Mapped ${studentToUser.size} students to user IDs`);

      // 6. Double-check: Filter out users who have attempted using user_id
      logger.info(`🔍 Double-checking attempts by user_id...`);
      for (const [studentId, pendingTests] of studentPendingTests.entries()) {
        const userId = studentToUser.get(studentId);
        if (!userId) continue;

        const filteredTests = pendingTests.filter(test => {
          const testId = test._id.toString();
          const attemptedByUser = attemptedMap.get(userId)?.has(testId);
          return !attemptedByUser;
        });

        if (filteredTests.length === 0) {
          studentPendingTests.delete(studentId);
        } else if (filteredTests.length < pendingTests.length) {
          studentPendingTests.set(studentId, filteredTests);
        }
      }

      logger.info(`✅ After user_id verification: ${studentPendingTests.size} students with pending tests`);

      if (studentPendingTests.size === 0) {
        logger.info(`✅ All students have attempted all tests (verified by user_id)`);
        return {
          success: true,
          message: 'No pending tests found after verification',
          active_tests: activeTests.length,
          total_sent: 0
        };
      }

      // 7. Send email, SMS, and push reminders to each student (when called from trigger endpoint)
      logger.info(`📤 Sending email, SMS & push reminders to students...`);

      let totalEmailsSent = 0;
      let totalSmsSent = 0;
      let totalPushSent = 0;
      const errors = [];

      // OneSignal handles subscription management internally
      // No need to lookup subscriptions - OneSignal will handle delivery
      logger.info(`🔔 OneSignal will handle push notification delivery automatically`);

      for (const [studentId, pendingTests] of studentPendingTests.entries()) {
        try {
          // Fetch student details
          const student = await db.collection('students').findOne({
            _id: new ObjectId(studentId)
          });

          if (!student) {
            logger.warn(`⚠️ Student not found: ${studentId}`);
            continue;
          }

          const studentName = student.name || 'Student';
          const studentEmail = student.email;
          const studentPhone = student.mobile_number;
          const userId = studentToUser.get(studentId);

          // Send reminder for the FIRST pending test (most urgent)
          const test = pendingTests[0];

          logger.info(`📤 Sending reminder to: ${studentName} for test \"${test.name}\" (${pendingTests.length} pending tests)`);

          // Send email reminder (check if mail is enabled)
          if (studentEmail && settings.mailEnabled) {
            const emailContent = `This is a reminder to complete your test: "${test.name}".`;
            const emailMetadata = {
              subject: `Reminder: Complete Your Test - ${test.name}`,
              template: 'testReminder',
              name: studentName,
              testName: test.name,
              testId: test.test_id || test._id.toString(),
              testUrl: `https://crt.pydahsoft.in/student/exam/${test.test_id || test._id}`,
              endDateTime: test.endDateTime || test.end_datetime
            };
            const emailResult = await notificationService.sendNotification('email', studentEmail, emailContent, emailMetadata);
            if (emailResult.success && emailResult.messageId !== 'disabled-by-settings') {
              totalEmailsSent++;
            } else if (!emailResult.success) {
              errors.push({ studentId, email: studentEmail, error: emailResult.error });
            }
          }

          // Send SMS reminder (check if SMS is enabled)
          if (studentPhone && settings.smsEnabled) {
            const smsContent = `Reminder: You haven't attempted your test "${test.name}". Please complete it. Exam link: https://crt.pydahsoft.in/student/exam/${test.test_id} - Pydah College`;
            const smsMetadata = { template: 'testReminder' };
            const smsResult = await notificationService.sendNotification('sms', studentPhone, smsContent, smsMetadata);
            if (smsResult.success && smsResult.messageId !== 'disabled-by-settings') {
              totalSmsSent++;
            } else if (!smsResult.success) {
              errors.push({ studentId, phone: studentPhone, error: smsResult.error });
            }
          }

          // Send OneSignal push notifications (check if push is enabled)
          if (userId && settings.pushEnabled) {
            try {
              // Calculate urgency for push notification
              const endDateTime = test.endDateTime || test.end_datetime;
              if (!endDateTime) continue;

              const endDate = new Date(endDateTime);
              const timeRemaining = endDate - now;
              const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
              const daysRemaining = Math.floor(hoursRemaining / 24);

              let title, body, urgency;

              if (hoursRemaining < 2) {
                urgency = 'critical';
                title = `⚠️ URGENT: ${test.name}`;
                body = `Test ends in ${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}! Complete it now!`;
              } else if (hoursRemaining < 6) {
                urgency = 'high';
                title = `⏰ Important: ${test.name}`;
                body = `Only ${hoursRemaining} hours left to complete your test!`;
              } else if (hoursRemaining < 24) {
                urgency = 'medium';
                title = `📝 Reminder: ${test.name}`;
                body = `Test ends today! ${hoursRemaining} hours remaining.`;
              } else if (daysRemaining === 1) {
                urgency = 'medium';
                title = `📚 Reminder: ${test.name}`;
                body = `Test ends tomorrow! Don't forget to complete it.`;
              } else {
                urgency = 'low';
                title = `📖 Reminder: ${test.name}`;
                body = `You have ${daysRemaining} days to complete your test.`;
              }

              // Add info about other pending tests
              if (pendingTests.length > 1) {
                body += ` (+ ${pendingTests.length - 1} more pending test${pendingTests.length > 2 ? 's' : ''})`;
              }

              const pushData = {
                type: 'test_reminder',
                test_id: test._id.toString(),
                test_name: test.name,
                pending_tests_count: pendingTests.length,
                end_datetime: endDate.toISOString(),
                hours_remaining: hoursRemaining,
                urgency: urgency,
                url: `/student/exam/${test._id}`
              };

              // Send OneSignal notification directly (OneSignal handles user lookup)
              const pushResult = await notificationService.sendNotification('push', { user_id: userId }, body, {
                title: title,
                data: pushData
              });

              if (pushResult.success && pushResult.messageId !== 'disabled-by-settings') {
                totalPushSent++;
                logger.info(`✅ OneSignal notification sent to user ${userId}`);
              } else if (!pushResult.success) {
                errors.push({ studentId, userId, error: pushResult.error });
              }

            } catch (pushError) {
              logger.error(`❌ Error sending OneSignal push to user ${userId}:`, pushError.message);
              errors.push({ studentId, userId, error: pushError.message });
            }
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 150));

        } catch (studentError) {
          logger.error(`❌ Error processing student ${studentId}:`, studentError.message);
          errors.push({ studentId, error: studentError.message });
        }
      }

      logger.info(`✅ All reminders complete: ${totalEmailsSent} emails, ${totalSmsSent} SMS, ${totalPushSent} push notifications sent`);

      return {
        success: true,
        type: 'all_reminders',
        active_tests: activeTests.length,
        total_students: studentToTests.size,
        students_with_pending: studentPendingTests.size,
        emailsSent: totalEmailsSent,
        smsSent: totalSmsSent,
        pushSent: totalPushSent,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      logger.error('❌ Error sending test reminders:', error);
      throw error;
    }
  }
}

module.exports = new TestNotificationService();