import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Server, 
  Cpu, 
  HardDrive, 
  Wifi, 
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  TrendingUp,
  Users,
  Zap,
  Eye,
  AlertCircle,
  Timer,
  Network,
  Database,
  Gauge,
  RefreshCw
} from 'lucide-react';
import TrendsGraph from './TrendsGraph';

const RealTrendsDashboard = () => {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTimePeriod, setSelectedTimePeriod] = useState('1hour');
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      console.log('🔄 Loading real analytics data...');
      
      // Fetch both overview and time patterns data
      const [overviewResponse, timePatternsResponse] = await Promise.all([
        fetch(`http://localhost:8000/real-analytics/analytics/overview?period=${selectedTimePeriod}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }),
        fetch(`http://localhost:8000/real-analytics/analytics/time-patterns?period=${selectedTimePeriod}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      ]);

      console.log('📊 Overview response status:', overviewResponse.status);
      console.log('📈 Time patterns response status:', timePatternsResponse.status);

      if (!overviewResponse.ok) {
        throw new Error(`Overview API error: ${overviewResponse.status}`);
      }
      if (!timePatternsResponse.ok) {
        throw new Error(`Time patterns API error: ${timePatternsResponse.status}`);
      }

      const overviewData = await overviewResponse.json();
      const timePatternsData = await timePatternsResponse.json();

      console.log('📊 Overview data:', overviewData);
      console.log('📈 Time patterns data:', timePatternsData);

      if (overviewData.success && timePatternsData.success) {
        setAnalyticsData({
          ...overviewData.data,
          time_patterns: timePatternsData.data
        });
        setLastUpdated(new Date().toLocaleTimeString());
        setError(null);
      } else {
        throw new Error('Failed to fetch analytics data');
      }
    } catch (err) {
      console.error('❌ Analytics error:', err);
      setError('Failed to load real analytics data: ' + err.message);
      
      // Fallback to empty data structure
      setAnalyticsData({
        total_requests: 0,
        total_errors: 0,
        error_rate: 0,
        total_bytes_sent: 0,
        hourly_hits: [],
        top_endpoints: [],
        slowest_endpoints: [],
        response_codes: {},
        recent_errors: [],
        system_stats: {
          cpu_percent: 0,
          memory_percent: 0,
          memory_used: 0,
          memory_total: 0
        },
        time_patterns: {
          hourly_hits: [],
          busiest_hours: [],
          hit_trends: {
            trend: 'stable',
            percentage: 0,
            recent_avg: 0,
            older_avg: 0
          },
          minute_by_minute: []
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    await loadAnalytics();
  };

  useEffect(() => {
    loadAnalytics();
    // Refresh every 30 seconds for real-time data
    const interval = setInterval(loadAnalytics, 30000);
    return () => clearInterval(interval);
  }, [selectedTimePeriod]);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat().format(num);
  };

  const formatUptime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading real analytics data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Real Server Analytics</h1>
            <p className="text-gray-600 mt-1">
              Live server hit patterns and performance metrics
              {analyticsData?.uptime_seconds && (
                <span className="ml-2 text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                  Uptime: {formatUptime(analyticsData.uptime_seconds)}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={refreshData}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </button>
            {lastUpdated && (
              <span className="text-sm text-gray-500">
                Last updated: {lastUpdated}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
            <span className="text-red-800">{error}</span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center space-x-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time Period</label>
            <select 
              value={selectedTimePeriod} 
              onChange={(e) => setSelectedTimePeriod(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1 text-sm"
            >
              <option value="1hour">Last 1 Hour</option>
              <option value="5hours">Last 5 Hours</option>
              <option value="1day">Last 1 Day</option>
            </select>
          </div>
          <div className="text-sm text-gray-500">
            {analyticsData?.time_period && `Showing: ${analyticsData.time_period}`}
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      {analyticsData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center">
              <Activity className="w-8 h-8 text-blue-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Total Requests</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatNumber(analyticsData.total_requests)}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center">
              <AlertCircle className="w-8 h-8 text-red-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Total Errors</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatNumber(analyticsData.total_errors)}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center">
              <Timer className="w-8 h-8 text-green-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Error Rate</p>
                <p className="text-2xl font-bold text-green-600">
                  {analyticsData.error_rate.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center">
              <Network className="w-8 h-8 text-purple-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Data Sent</p>
                <p className="text-2xl font-bold text-purple-600">
                  {formatBytes(analyticsData.total_bytes_sent)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trends Graph */}
      {analyticsData?.time_patterns && (
        <TrendsGraph 
          timePatterns={analyticsData.time_patterns} 
          timePeriod={selectedTimePeriod}
        />
      )}

      {/* Top Endpoints */}
      {analyticsData?.top_endpoints && analyticsData.top_endpoints.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Endpoints</h3>
          <div className="space-y-2">
            {analyticsData.top_endpoints.slice(0, 5).map((endpoint, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">
                    {index + 1}
                  </div>
                  <span className="font-medium text-gray-900">{endpoint.endpoint}</span>
                </div>
                <span className="text-blue-600 font-semibold">{endpoint.count} requests</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System Health */}
      {analyticsData?.system_stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">CPU Usage</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Current</span>
                <span className="font-medium">{analyticsData.system_stats.cpu_percent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${analyticsData.system_stats.cpu_percent}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Memory Usage</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Current</span>
                <span className="font-medium">{analyticsData.system_stats.memory_percent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${analyticsData.system_stats.memory_percent}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500">
                {formatBytes(analyticsData.system_stats.memory_used)} / {formatBytes(analyticsData.system_stats.memory_total)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="bg-gray-50 rounded-lg p-4 text-center text-sm text-gray-600">
        <p>✅ Real analytics data from your actual server</p>
        <p className="mt-1">Auto-refresh every 30 seconds • Last updated: {lastUpdated}</p>
      </div>
    </div>
  );
};

export default RealTrendsDashboard;
