const logger = require('../utils/logger');
const brevoService = require('./brevoService');
const bulkSmsService = require('./bulkSmsService');
const { getDatabase } = require('../config/database');
const { ObjectId } = require('mongodb');

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

      // Process each student
      let emailsSent = 0;
      let smsSent = 0;
      const errors = [];

      for (const student of students) {
        try {
          const studentName = student.name || 'Student';
          const studentEmail = student.email;
          const studentPhone = student.mobile_number;

          logger.info(`📧 Sending notifications to: ${studentName} (${studentEmail})`);

          // Send email notification
          if (studentEmail) {
            try {
              await brevoService.sendTestNotification({
                email: studentEmail,
                name: studentName,
                testName: test.name,
                testType: test.test_type || 'Test',
                loginUrl: 'https://crt.pydahsoft.in/login'
              });
              emailsSent++;
              logger.info(`✅ Email sent to ${studentEmail}`);
            } catch (emailError) {
              logger.error(`❌ Failed to send email to ${studentEmail}:`, emailError.message);
              errors.push({ studentId: student._id.toString(), email: studentEmail, error: emailError.message });
            }
          }

          // Send SMS notification
          if (studentPhone) {
            try {
              // Format start time
              const startTime = test.startDateTime || new Date().toISOString();
              const formattedTime = new Date(startTime).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                dateStyle: 'medium',
                timeStyle: 'short'
              });

              await bulkSmsService.sendTestScheduled({
                phone: studentPhone,
                testName: test.name,
                startTime: formattedTime,
                testId: test.test_id
              });
              smsSent++;
              logger.info(`✅ SMS sent to ${studentPhone}`);
            } catch (smsError) {
              logger.error(`❌ Failed to send SMS to ${studentPhone}:`, smsError.message);
              errors.push({ studentId: student._id.toString(), phone: studentPhone, error: smsError.message });
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
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      logger.error('❌ Error sending test created notifications:', error);
      throw error;
    }
  }

  /**
   * Send test reminder notifications
   * Called by cron job - no input parameters
   * Queries database for tests that need reminders
   * STUDENT-CENTRIC APPROACH: Same logic as push notifications
   */
  async sendTestReminders() {
    try {
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

      // 7. Send email and SMS reminders to each student
      logger.info(`📤 Sending email & SMS reminders to students...`);
      
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
          
          logger.info(`📧 Sending reminder to: ${studentName} for test "${test.name}" (${pendingTests.length} pending tests)`);

          // Send email reminder
          if (studentEmail) {
            try {
              await brevoService.sendTestReminder({
                email: studentEmail,
                name: studentName,
                testName: test.name,
                testId: test.test_id,
                loginUrl: 'https://crt.pydahsoft.in/student/exam'
              });
              totalEmailsSent++;
              logger.info(`✅ Reminder email sent to ${studentEmail}`);
            } catch (emailError) {
              logger.error(`❌ Failed to send reminder email to ${studentEmail}:`, emailError.message);
              errors.push({ studentId, email: studentEmail, error: emailError.message });
            }
          }

          // Send SMS reminder
          if (studentPhone) {
            try {
              await bulkSmsService.sendTestReminder({
                phone: studentPhone,
                testName: test.name,
                testId: test.test_id
              });
              totalSmsSent++;
              logger.info(`✅ Reminder SMS sent to ${studentPhone}`);
            } catch (smsError) {
              logger.error(`❌ Failed to send reminder SMS to ${studentPhone}:`, smsError.message);
              errors.push({ studentId, phone: studentPhone, error: smsError.message });
            }
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 150));

        } catch (studentError) {
          logger.error(`❌ Error processing student ${studentId}:`, studentError.message);
          errors.push({ studentId, error: studentError.message });
        }
      }

      logger.info(`✅ Test reminders complete: ${totalEmailsSent} emails, ${totalSmsSent} SMS sent`);

      return {
        success: true,
        active_tests: activeTests.length,
        total_students: studentToTests.size,
        students_with_pending: studentPendingTests.size,
        emailsSent: totalEmailsSent,
        smsSent: totalSmsSent,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      logger.error('❌ Error sending test reminders:', error);
      throw error;
    }
  }
}

module.exports = new TestNotificationService();
