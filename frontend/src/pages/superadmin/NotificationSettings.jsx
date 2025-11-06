import React, { useState, useEffect } from 'react';
import {
  Bell,
  Mail,
  MessageSquare,
  Smartphone,
  ToggleLeft,
  ToggleRight,
  Save,
  CheckCircle,
  AlertCircle,
  Loader
} from 'lucide-react';
import { motion } from 'framer-motion';
import Swal from 'sweetalert2';
import api, { getNotificationSettings, updateNotificationSettings } from '../../services/api';

const NotificationSettings = () => {
  const [settings, setSettings] = useState({
    pushEnabled: true,
    smsEnabled: true,
    mailEnabled: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Notification types configuration
  const notificationTypes = [
    {
      key: 'mailEnabled',
      name: 'Email Notifications',
      description: 'Send notifications via email to users',
      icon: Mail,
      color: 'blue'
    },
    {
      key: 'smsEnabled',
      name: 'SMS Notifications',
      description: 'Send notifications via SMS to users',
      icon: MessageSquare,
      color: 'green'
    },
    {
      key: 'pushEnabled',
      name: 'Push Notifications',
      description: 'Send push notifications to mobile devices',
      icon: Smartphone,
      color: 'purple'
    }
  ];

  // Fetch notification settings
  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔧 Fetching notification settings...');

      // Check if token exists
      const token = localStorage.getItem('access_token');
      console.log('🔧 Access token exists:', !!token);

      // Call backend API which communicates with notification-service
      const response = await getNotificationSettings();
      console.log('🔧 Notification settings response:', response);

      if (response.data.success) {
        setSettings(response.data.data);
        console.log('🔧 Settings loaded successfully:', response.data.data);
      } else {
        setError(response.data.message || 'Failed to fetch settings');
        console.error('🔧 Failed to fetch settings:', response.data.message);
      }
    } catch (err) {
      console.error('🔧 Error fetching notification settings:', err);
      console.error('🔧 Error response:', err.response);
      setError(err.response?.data?.message || 'Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  };

  // Update notification setting
  const updateSetting = async (settingKey, enabled) => {
    try {
      setSaving(true);

      const updatedSettings = {
        ...settings,
        [settingKey]: enabled
      };

      console.log('🔧 Updating notification settings:', updatedSettings);

      const response = await updateNotificationSettings(updatedSettings);
      console.log('🔧 Update response:', response);

      if (response.data.success) {
        setSettings(updatedSettings);

        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: 'Notification settings updated successfully',
          timer: 2000,
          showConfirmButton: false
        });
      } else {
        throw new Error(response.data.message || 'Failed to update settings');
      }
    } catch (err) {
      console.error('🔧 Error updating notification setting:', err);
      console.error('🔧 Error response:', err.response);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.response?.data?.message || 'Failed to update notification setting'
      });
    } finally {
      setSaving(false);
    }
  };

  // Toggle all settings
  const toggleAll = async (enabled) => {
    const result = await Swal.fire({
      title: enabled ? 'Enable All Notifications' : 'Disable All Notifications',
      text: `Are you sure you want to ${enabled ? 'enable' : 'disable'} all notification types?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: enabled ? '#10b981' : '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: enabled ? 'Enable All' : 'Disable All',
      cancelButtonText: 'Cancel'
    });

    if (result.isConfirmed) {
      try {
        setSaving(true);

        const updatedSettings = {
          pushEnabled: enabled,
          smsEnabled: enabled,
          mailEnabled: enabled
        };

        const response = await updateNotificationSettings(updatedSettings);

        if (response.data.success) {
          setSettings(updatedSettings);

          Swal.fire({
            icon: 'success',
            title: 'Success!',
            text: `All notification types ${enabled ? 'enabled' : 'disabled'} successfully`,
            timer: 2000,
            showConfirmButton: false
          });
        } else {
          throw new Error(response.data.message || 'Failed to update settings');
        }
      } catch (err) {
        console.error('Error updating all settings:', err);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: err.response?.data?.message || 'Failed to update settings'
        });
      } finally {
        setSaving(false);
      }
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading notification settings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchSettings}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const allEnabled = settings.pushEnabled && settings.smsEnabled && settings.mailEnabled;
  const anyEnabled = settings.pushEnabled || settings.smsEnabled || settings.mailEnabled;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-2">
            <Bell className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Notification Settings</h1>
          </div>
          <p className="text-gray-600">
            Control which notification channels are enabled for the entire system
          </p>
        </div>

        {/* Status Overview */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Current Status</h2>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => toggleAll(true)}
                disabled={saving || allEnabled}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Enable All
              </button>
              <button
                onClick={() => toggleAll(false)}
                disabled={saving || !anyEnabled}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Disable All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {notificationTypes.map((type) => {
              const Icon = type.icon;
              const isEnabled = settings[type.key];

              return (
                <div key={type.key} className={`p-4 rounded-lg border-2 ${isEnabled ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center space-x-3">
                    <Icon className={`h-6 w-6 ${isEnabled ? `text-${type.color}-600` : 'text-gray-400'}`} />
                    <div>
                      <p className={`font-medium ${isEnabled ? 'text-gray-900' : 'text-gray-500'}`}>
                        {type.name}
                      </p>
                      <p className={`text-sm ${isEnabled ? 'text-green-600' : 'text-gray-500'}`}>
                        {isEnabled ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Individual Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Notification Channels</h2>

          <div className="space-y-6">
            {notificationTypes.map((type) => {
              const Icon = type.icon;
              const isEnabled = settings[type.key];

              return (
                <motion.div
                  key={type.key}
                  className={`p-6 rounded-lg border transition-all duration-200 ${
                    isEnabled ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                  }`}
                  whileHover={{ scale: 1.01 }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                      <div className={`p-3 rounded-lg ${isEnabled ? `bg-${type.color}-100` : 'bg-gray-100'}`}>
                        <Icon className={`h-6 w-6 ${isEnabled ? `text-${type.color}-600` : 'text-gray-400'}`} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          {type.name}
                        </h3>
                        <p className="text-gray-600 mb-4">
                          {type.description}
                        </p>
                        <div className="flex items-center space-x-2">
                          <span className={`px-3 py-1 text-sm rounded-full ${
                            isEnabled
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {isEnabled ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="ml-6">
                      <button
                        onClick={() => updateSetting(type.key, !isEnabled)}
                        disabled={saving}
                        className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                          isEnabled ? 'bg-green-600' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                            isEnabled ? 'translate-x-7' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Save Status */}
          {saving && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-3">
                <Loader className="h-5 w-5 text-blue-600 animate-spin" />
                <p className="text-blue-800">Saving changes...</p>
              </div>
            </div>
          )}
        </div>

        {/* Information Panel */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start space-x-3">
            <CheckCircle className="w-6 h-6 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-900 mb-2">How it works</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• When a notification is triggered, the system checks if the corresponding channel is enabled</li>
                <li>• If enabled, the notification is sent normally</li>
                <li>• If disabled, the system logs the event and returns a success response without sending</li>
                <li>• This allows the application to continue functioning while notifications are disabled</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationSettings;