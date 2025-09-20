import React from 'react';
import ServerAnalyticsDashboard from '../../components/analytics/ServerAnalyticsDashboard';

const ServerAnalytics = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ServerAnalyticsDashboard />
      </div>
    </div>
  );
};

export default ServerAnalytics;
