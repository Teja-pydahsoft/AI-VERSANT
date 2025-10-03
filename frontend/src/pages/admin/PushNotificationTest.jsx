import React from 'react'
import { motion } from 'framer-motion'
import Header from '../../components/common/Header'
import OneSignalNotificationTester from '../../components/common/OneSignalNotificationTester'

const PushNotificationTest = () => {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header />
      <div className="flex-1 overflow-x-hidden overflow-y-auto">
        <main className="py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-8"
            >
              <h1 className="text-3xl font-bold text-gray-900">
                OneSignal Push Notification Testing
              </h1>
              <p className="mt-2 text-gray-600">
                Test and manage OneSignal push notification functionality for the VERSANT system.
              </p>
            </motion.div>

            <OneSignalNotificationTester />
          </div>
        </main>
      </div>
    </div>
  )
}

export default PushNotificationTest
