import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { User, Mail, Shield, Calendar, Building, BookOpen, Users, Edit, KeyRound, Bell } from 'lucide-react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import NotificationPreferences from '../../components/common/NotificationPreferences'

const DetailItem = ({ icon, label, value, color = 'blue' }) => {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    orange: 'bg-orange-100 text-orange-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    teal: 'bg-teal-100 text-teal-600',
    pink: 'bg-pink-100 text-pink-600',
  };
  return (
    <div className="flex items-start space-x-4 py-4">
      <div className={`flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-xl ${colors[color]}`}>{icon}</div>
      <div className="flex-grow"><p className="text-sm font-medium text-gray-500">{label}</p><p className="text-lg font-semibold text-gray-800 break-words">{value || 'Not specified'}</p></div>
    </div>
  );
};

const SuperAdminProfile = () => {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showNotificationPreferences, setShowNotificationPreferences] = useState(false)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const res = await api.get('/auth/me')
        if (res.data.success) {
          setProfile(res.data.data)
        } else {
          toast.error(res.data.message || 'Failed to fetch profile.')
        }
      } catch (err) {
        console.error('Profile fetch error:', err)
        toast.error(err.response?.data?.message || 'An error occurred while fetching your profile.')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Could not load profile.</p>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-gray-900">Your Profile</h1>
          <p className="text-gray-600 mt-2">Manage your account information and settings</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Profile Card */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="lg:col-span-1"
          >
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
              <div className="relative w-32 h-32 mx-auto mb-6">
                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center ring-4 ring-white shadow-md">
                  <User className="h-16 w-16 text-white" />
                </div>
                <div className="absolute bottom-0 right-0 bg-white p-1.5 rounded-full shadow-md">
                  <div className={`w-4 h-4 rounded-full ${profile.is_active ? 'bg-green-500' : 'bg-red-500'}`}></div>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">{profile.name}</h2>
              <p className="text-gray-600">{profile.email}</p>
              <div className="mt-4 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                <Shield className="h-4 w-4 mr-1.5" />
                <span className="capitalize">{profile.role?.replace('_', ' ')}</span>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Details and Actions */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="lg:col-span-2 space-y-8"
          >
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">Account Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 divide-y md:divide-y-0">
                <DetailItem icon={<User className="h-6 w-6" />} label="Username" value={profile.username} color="blue" />
                <DetailItem icon={<Mail className="h-6 w-6" />} label="Email" value={profile.email} color="green" />
                <DetailItem icon={<Shield className="h-6 w-6" />} label="Role" value={profile.role?.replace('_', ' ')} color="purple" />
                <DetailItem icon={<Calendar className="h-6 w-6" />} label="Account Status" value={profile.is_active ? 'Active' : 'Inactive'} color="orange" />
                {profile.campus_name && (
                  <DetailItem icon={<Building className="h-6 w-6" />} label="Campus" value={profile.campus_name} color="indigo" />
                )}
                {profile.course_id && (
                  <DetailItem icon={<BookOpen className="h-6 w-6" />} label="Course ID" value={profile.course_id} color="teal" />
                )}
                {profile.batch_id && (
                  <DetailItem icon={<Users className="h-6 w-6" />} label="Batch ID" value={profile.batch_id} color="pink" />
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Account Actions</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                  <Edit className="h-5 w-5 mr-2" />
                  Edit Profile (Soon)
                </button>
                <button className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                  <KeyRound className="h-5 w-5 mr-2" />
                  Change Password
                </button>
                <button 
                  onClick={() => setShowNotificationPreferences(true)}
                  className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Bell className="h-5 w-5 mr-2" />
                  Notification Settings
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
      
      {/* Notification Preferences Modal */}
      <NotificationPreferences 
        isOpen={showNotificationPreferences}
        onClose={() => setShowNotificationPreferences(false)}
      />
    </main>
  )
}

export default SuperAdminProfile 