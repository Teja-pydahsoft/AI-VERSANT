const express = require('express');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

const router = express.Router();

// Validation middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

/**
 * SCENARIO 1: Test Created Notification
 * Sends notification to enrolled students when a test is created
 */
router.post('/test-created', [
  body('test_id').notEmpty().withMessage('Test ID is required')
], validateRequest, async (req, res) => {
  try {
    const { test_id } = req.body;
    const db = mongoose.connection.db;

    logger.info(`📝 Processing test-created notification for test: ${test_id}`);

    // 1. Get test details
    const test = await db.collection('tests').findOne({ 
      _id: new mongoose.Types.ObjectId(test_id) 
    });

    if (!test) {
      return res.status(404).json({
        success: false,
        message: 'Test not found'
      });
    }

    logger.info(`✅ Test found: ${test.name}`);
    logger.info(`📋 Test data - assigned_student_ids: ${test.assigned_student_ids?.length || 0}, batch_ids: ${test.batch_ids?.length || 0}, course_ids: ${test.course_ids?.length || 0}`);

    // 2. Collect all student IDs from multiple sources
    let allStudentIds = [];
    
    // Source 1: assigned_student_ids (direct assignment)
    if (test.assigned_student_ids && test.assigned_student_ids.length > 0) {
      allStudentIds.push(...test.assigned_student_ids);
      logger.info(`📌 Found ${test.assigned_student_ids.length} directly assigned students`);
    }
    
    // Source 2: Query students collection directly with batch_ids AND course_ids
    if (test.batch_ids && test.batch_ids.length > 0 && test.course_ids && test.course_ids.length > 0) {
      logger.info(`🔍 Querying students with ${test.batch_ids.length} batches and ${test.course_ids.length} courses...`);
      
      // Query students that match BOTH batch_id AND course_id
      const studentsFromBatchCourse = await db.collection('students').find({
        batch_id: { $in: test.batch_ids.map(id => new mongoose.Types.ObjectId(id)) },
        course_id: { $in: test.course_ids.map(id => new mongoose.Types.ObjectId(id)) }
      }).toArray();
      
      logger.info(`✅ Found ${studentsFromBatchCourse.length} students matching batch+course criteria`);
      
      if (studentsFromBatchCourse.length > 0) {
        const studentIdsFromQuery = studentsFromBatchCourse.map(s => s._id);
        allStudentIds.push(...studentIdsFromQuery);
        logger.info(`📚 Added ${studentIdsFromQuery.length} students from batch+course query`);
      }
    } else if (test.batch_ids && test.batch_ids.length > 0) {
      // Fallback: If only batch_ids (no course_ids), query students by batch_id only
      logger.info(`🔍 Querying students with ${test.batch_ids.length} batches (no course filter)...`);
      
      const studentsFromBatch = await db.collection('students').find({
        batch_id: { $in: test.batch_ids.map(id => new mongoose.Types.ObjectId(id)) }
      }).toArray();
      
      logger.info(`✅ Found ${studentsFromBatch.length} students in batches`);
      
      if (studentsFromBatch.length > 0) {
        const studentIdsFromQuery = studentsFromBatch.map(s => s._id);
        allStudentIds.push(...studentIdsFromQuery);
        logger.info(`📚 Added ${studentIdsFromQuery.length} students from batch query`);
      }
    } else if (test.course_ids && test.course_ids.length > 0) {
      // If only course_ids (no batch_ids), query students by course_id only
      logger.info(`🔍 Querying students with ${test.course_ids.length} courses (no batch filter)...`);
      
      const studentsFromCourse = await db.collection('students').find({
        course_id: { $in: test.course_ids.map(id => new mongoose.Types.ObjectId(id)) }
      }).toArray();
      
      logger.info(`✅ Found ${studentsFromCourse.length} students in courses`);
      
      if (studentsFromCourse.length > 0) {
        const studentIdsFromQuery = studentsFromCourse.map(s => s._id);
        allStudentIds.push(...studentIdsFromQuery);
        logger.info(`📚 Added ${studentIdsFromQuery.length} students from course query`);
      }
    }

    // Remove duplicates and convert to ObjectId
    allStudentIds = [...new Set(allStudentIds.map(id => id.toString()))];
    logger.info(`📊 Total unique student IDs: ${allStudentIds.length}`);

    if (allStudentIds.length === 0) {
      logger.warn(`⚠️ No students found for test ${test_id}`);
      return res.json({
        success: true,
        message: 'No students to notify',
        sent: 0
      });
    }

    // 3. Get students from students collection to find user_ids
    const students = await db.collection('students').find({
      _id: { $in: allStudentIds.map(id => new mongoose.Types.ObjectId(id)) }
    }).toArray();

    logger.info(`👥 Found ${students.length} student records in students collection`);

    // 4. Get user IDs from students
    const userIds = students.map(s => s.user_id?.toString()).filter(Boolean);
    logger.info(`🆔 Extracted ${userIds.length} user IDs from students`);
    
    // Also check users collection directly with student IDs
    const users = await db.collection('users').find({
      student_id: { $in: allStudentIds.map(id => id.toString()) }
    }).toArray();
    
    if (users.length > 0) {
      const additionalUserIds = users.map(u => u._id.toString());
      userIds.push(...additionalUserIds);
      logger.info(`🆔 Found ${users.length} additional users by student_id reference`);
    }
    
    // Remove duplicate user IDs
    const uniqueUserIds = [...new Set(userIds)];
    logger.info(`✅ Total unique user IDs: ${uniqueUserIds.length}`);

    if (uniqueUserIds.length === 0) {
      logger.warn(`⚠️ No user IDs found for students`);
      return res.json({
        success: true,
        message: 'No user IDs found for students',
        sent: 0
      });
    }
    const settings = await db.collection('notification_settings').findOne({});
    logger.info('⚙️ Notification Settings:', settings);
    console.log("happily got ", settings);
    if (!settings.pushEnabled && !settings.mailEnabled && !settings.smsEnabled) {
      logger.warn(`⚠️ No notification types are enabled`);
      return res.json({
        success: true,
        message: 'No notification types are enabled',
        sent: 0
      });
    }
    if (settings.pushEnabled) {
    // 5. Get push subscriptions for these users
    const subscriptions = await db.collection('push_subscriptions').find({
      user_id: { $in: uniqueUserIds },
      is_active: true
    }).toArray();

    logger.info(`🔔 Found ${subscriptions.length} active push subscriptions`);
  

    // 6. Filter only OneSignal subscriptions
    const oneSignalSubscriptions = subscriptions.filter(s => s.provider === 'onesignal');

    // 7. Send notifications
    const pushNotificationService = require('../services/pushNotificationService');
    const results = {
      onesignal: { sent: 0, failed: 0 }
    };

    // Notification content
    const title = `New Test: ${test.name}`;
    const body = `A new test has been assigned to you. Start preparing now!`;
    const data = {
      type: 'test_created',
      test_id: test_id,
      test_name: test.name,
      url: `/student/exam/${test_id}`
    };

    // Send OneSignal notifications
    if (oneSignalSubscriptions.length > 0) {
      const playerIds = oneSignalSubscriptions.map(s => s.player_id).filter(Boolean);
      if (playerIds.length > 0) {
        try {
          await pushNotificationService.oneSignalService.send(playerIds, title, body, { data });
          results.onesignal.sent = playerIds.length;
          logger.info(`✅ OneSignal sent to ${playerIds.length} users`);
        } catch (error) {
          results.onesignal.failed = playerIds.length;
          logger.error(`❌ OneSignal error: ${error.message}`);
        }
      }
    }

    res.json({
      success: true,
      message: 'Test created notifications sent',
      data: {
        test_id,
        test_name: test.name,
        total_students: allStudentIds.length,
        total_subscriptions: subscriptions.length,
        results
      }
    });
    }
  else{
    logger.info('⚠️ Push notifications are disabled in settings. Skipping push subscription retrieval.');
  }

  } catch (error) {
    logger.error('❌ Error in test-created notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test-created notifications',
      error: error.message
    });
  }
});

/**
 * SCENARIO 2: Test Reminder Notification
 * Sends reminders to students who haven't attempted tests that are still active
 */
router.post('/test-reminder', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const now = new Date();

    logger.info(`⏰ Processing test reminders (STUDENT-CENTRIC approach)...`);
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
      return res.json({
        success: true,
        message: 'No active tests found',
        data: { active_tests: 0, push_sent: 0, emails_sent: 0, sms_sent: 0, total_skipped: 0, results: { onesignal: { sent: 0, failed: 0 }, email: { sent: 0, failed: 0 }, sms: { sent: 0, failed: 0 } } }
      });
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
          batch_id: { $in: test.batch_ids.map(id => new mongoose.Types.ObjectId(id)) },
          course_id: { $in: test.course_ids.map(id => new mongoose.Types.ObjectId(id)) }
        }).toArray();
        
        if (studentsFromBatchCourse.length > 0) {
          allStudentIds.push(...studentsFromBatchCourse.map(s => s._id));
        }
      } else if (test.batch_ids && test.batch_ids.length > 0) {
        const studentsFromBatch = await db.collection('students').find({
          batch_id: { $in: test.batch_ids.map(id => new mongoose.Types.ObjectId(id)) }
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
    const allTestIds = activeTests.map(t => t._id.toString());
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
      return res.json({
        success: true,
        message: 'No pending tests found',
        data: { active_tests: activeTests.length, push_sent: 0, emails_sent: 0, sms_sent: 0, total_skipped: studentToTests.size, results: { onesignal: { sent: 0, failed: 0 }, email: { sent: 0, failed: 0 }, sms: { sent: 0, failed: 0 } } }
      });
    }

    // 5. Get user IDs for students with pending tests
    logger.info(`🔍 Looking up user IDs for students with pending tests...`);
    const studentIdsWithPending = Array.from(studentPendingTests.keys());
    
    const students = await db.collection('students').find({
      _id: { $in: studentIdsWithPending.map(id => new mongoose.Types.ObjectId(id)) }
    }).toArray();

    const studentToUser = new Map(); // student_id -> user_id
    students.forEach(s => {
      if (s.user_id) {
        studentToUser.set(s._id.toString(), s.user_id.toString());
      }
    });

    // Also check users collection
    const users = await db.collection('users').find({
      student_id: { $in: studentIdsWithPending }
    }).toArray();

    users.forEach(u => {
      const sid = u.student_id?.toString();
      if (sid && !studentToUser.has(sid)) {
        studentToUser.set(sid, u._id.toString());
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
      return res.json({
        success: true,
        message: 'No pending tests found after verification',
        data: { active_tests: activeTests.length, push_sent: 0, emails_sent: 0, sms_sent: 0, total_skipped: studentToTests.size, results: { onesignal: { sent: 0, failed: 0 }, email: { sent: 0, failed: 0 }, sms: { sent: 0, failed: 0 } } }
      });
    }

    // 7. Get push subscriptions for users with pending tests
    const userIdsToNotify = Array.from(studentPendingTests.keys())
      .map(sid => studentToUser.get(sid))
      .filter(Boolean);

    logger.info(`🔔 Looking up push subscriptions for ${userIdsToNotify.length} users...`);

    const subscriptions = await db.collection('push_subscriptions').find({
      user_id: { $in: userIdsToNotify },
      is_active: true
    }).toArray();

    logger.info(`🔔 Found ${subscriptions.length} active push subscriptions`);

    if (subscriptions.length === 0) {
      logger.warn(`⚠️ No active push subscriptions found, but continuing with SMS/Email notifications`);
      // Continue to send SMS/Email even if no push subscriptions
    }

    // 8. Send notifications to each user for their pending tests
    logger.info(`📤 Sending notifications to users...`);
    
    let totalSent = 0;
    const results = {
      onesignal: { sent: 0, failed: 0 }
    };

    const pushNotificationService = require('../services/pushNotificationService');

    for (const subscription of subscriptions) {
      const userId = subscription.user_id.toString();
      
      // Find student_id for this user_id
      let studentId = null;
      for (const [sid, uid] of studentToUser.entries()) {
        if (uid === userId) {
          studentId = sid;
          break;
        }
      }

      if (!studentId || !studentPendingTests.has(studentId)) {
        continue;
      }

      const pendingTests = studentPendingTests.get(studentId);
      
      // Send notification for the FIRST pending test (most urgent)
      const test = pendingTests[0];
      
      // Calculate urgency
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

      const data = {
        type: 'test_reminder',
        test_id: test._id.toString(),
        test_name: test.name,
        pending_tests_count: pendingTests.length,
        end_datetime: endDate.toISOString(),
        hours_remaining: hoursRemaining,
        urgency: urgency,
        url: `/student/exam/${test._id}`
      };

      logger.info(`📤 Sending to user ${userId}: "${title}" (${pendingTests.length} pending tests)`);

      // Send OneSignal notification
      try {
        if (subscription.provider === 'onesignal' && subscription.player_id) {
          await pushNotificationService.oneSignalService.send([subscription.player_id], title, body, { data });
          results.onesignal.sent++;
          totalSent++;
        }
      } catch (error) {
        results.onesignal.failed++;
        logger.error(`❌ Error sending to user ${userId}: ${error.message}`);
      }
    }

    logger.info(`✅ Push reminders complete: ${totalSent} sent`);

    // Now send SMS and Email reminders
    logger.info(`📧 Starting SMS and Email reminders...`);

    const notificationService = require('../services/notificationService');
    let totalEmailsSent = 0;
    let totalSmsSent = 0;
    const emailSmsErrors = [];

    for (const [studentId, pendingTests] of studentPendingTests.entries()) {
      try {
        // Fetch student details
        const student = await db.collection('students').findOne({
          _id: new mongoose.Types.ObjectId(studentId)
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

        logger.info(`📧📱 Sending SMS/Email reminder to: ${studentName} for test "${test.name}" (${pendingTests.length} pending tests)`);

        // Send email reminder (check if mail is enabled)
        if (studentEmail) {
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
            emailSmsErrors.push({ studentId, email: studentEmail, error: emailResult.error });
          }
        }

        // Send SMS reminder (check if SMS is enabled)
        if (studentPhone) {
          const smsContent = `you haven't attempted your scheduled test ${test.name} yet. Please complete it as soon as possible. \nexam link: https://crt.pydahsoft.in/student/exam/ ${test.test_id || test._id} - Pydah College`;
          const smsMetadata = { template: 'testReminder' };
          const smsResult = await notificationService.sendNotification('sms', studentPhone, smsContent, smsMetadata);
          if (smsResult.success && smsResult.messageId !== 'disabled-by-settings') {
            totalSmsSent++;
          } else if (!smsResult.success) {
            emailSmsErrors.push({ studentId, phone: studentPhone, error: smsResult.error });
          }
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 150));

      } catch (studentError) {
        logger.error(`❌ Error processing student ${studentId}:`, studentError.message);
        emailSmsErrors.push({ studentId, error: studentError.message });
      }
    }

    logger.info(`✅ All reminders complete: ${totalSent} push, ${totalEmailsSent} emails, ${totalSmsSent} SMS sent`);

    res.json({
      success: true,
      message: 'Test reminders sent (Push, SMS & Email)',
      data: {
        active_tests: activeTests.length,
        total_students: studentToTests.size,
        students_with_pending: studentPendingTests.size,
        push_sent: totalSent,
        emails_sent: totalEmailsSent,
        sms_sent: totalSmsSent,
        results: {
          ...results,
          email: { sent: totalEmailsSent, failed: emailSmsErrors.filter(e => e.email).length },
          sms: { sent: totalSmsSent, failed: emailSmsErrors.filter(e => e.phone).length }
        },
        errors: emailSmsErrors.length > 0 ? emailSmsErrors : undefined
      }
    });

  } catch (error) {
    logger.error('❌ Error in test-reminder:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test reminders',
      error: error.message
    });
  }
});

/**
 * SCENARIO 3: Broadcast Notification
 * Sends notification to ALL active push subscriptions
 */
router.post('/broadcast', [
  body('title').notEmpty().withMessage('Title is required'),
  body('message').notEmpty().withMessage('Message is required')
], validateRequest, async (req, res) => {
  try {
    const { title, message, data = {} } = req.body;
    const db = mongoose.connection.db;

    logger.info(`📢 Processing broadcast notification: ${title}`);

    // 1. Get ALL active push subscriptions
    const subscriptions = await db.collection('push_subscriptions').find({
      is_active: true
    }).toArray();

    logger.info(`🔔 Found ${subscriptions.length} active subscriptions`);

    if (subscriptions.length === 0) {
      return res.json({
        success: true,
        message: 'No active subscriptions found',
        sent: 0
      });
    }

    // 2. Filter only OneSignal subscriptions
    const oneSignalSubs = subscriptions.filter(s => s.provider === 'onesignal');

    const results = {
      onesignal: { sent: 0, failed: 0 }
    };

    const pushNotificationService = require('../services/pushNotificationService');

    const notificationData = {
      type: 'broadcast',
      timestamp: new Date().toISOString(),
      ...data
    };

    // 3. Send OneSignal notifications
    if (oneSignalSubs.length > 0) {
      const playerIds = oneSignalSubs.map(s => s.player_id).filter(Boolean);
      if (playerIds.length > 0) {
        try {
          logger.info(`📱 Sending to ${playerIds.length} OneSignal subscribers...`);
          await pushNotificationService.oneSignalService.send(playerIds, title, message, { data: notificationData });
          results.onesignal.sent = playerIds.length;
          logger.info(`✅ OneSignal broadcast sent to ${playerIds.length} users`);
        } catch (error) {
          results.onesignal.failed = playerIds.length;
          logger.error(`❌ OneSignal broadcast error: ${error.message}`);
        }
      }
    }

    const totalSent = results.onesignal.sent;
    const totalFailed = results.onesignal.failed;

    res.json({
      success: totalSent > 0,
      message: `Broadcast sent to ${totalSent} users`,
      data: {
        total_subscriptions: subscriptions.length,
        total_sent: totalSent,
        total_failed: totalFailed,
        results
      }
    });

  } catch (error) {
    logger.error('❌ Error in broadcast notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send broadcast notification',
      error: error.message
    });
  }
});

module.exports = router;
