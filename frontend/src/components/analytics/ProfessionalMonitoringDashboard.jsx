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
  Zap
} from 'lucide-react';

const ProfessionalMonitoringDashboard = () => {
  const [healthData, setHealthData] = useState(null);
  const [performanceData, setPerformanceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchHealthData = async () => {
    try {
      const response = await fetch('http://localhost:8000/professional-analytics/health');
      const data = await response.json();
      setHealthData(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError('Failed to fetch health data');
      console.error('Health data error:', err);
    }
  };

  const fetchPerformanceData = async () => {
    try {
      const response = await fetch('http://localhost:8000/professional-analytics/performance');
      const data = await response.json();
      setPerformanceData(data);
    } catch (err) {
      console.error('Performance data error:', err);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([fetchHealthData(), fetchPerformanceData()]);
      setLoading(false);
    };

    fetchData();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case 'error': return <AlertTriangle className="w-5 h-5 text-red-600" />;
      default: return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
          <span className="text-red-800">{error}</span>
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
            <h1 className="text-2xl font-bold text-gray-900">Professional Monitoring Dashboard</h1>
            <p className="text-gray-600 mt-1">Real-time system health and performance metrics</p>
          </div>
          <div className="flex items-center space-x-4">
            {getStatusIcon(healthData?.status)}
            <span className={`font-medium ${getStatusColor(healthData?.status)}`}>
              {healthData?.status?.toUpperCase() || 'UNKNOWN'}
            </span>
            {lastUpdated && (
              <span className="text-sm text-gray-500">
                Last updated: {lastUpdated}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quick Access Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <a 
          href="http://localhost:8000/dashboard" 
          target="_blank" 
          rel="noopener noreferrer"
          className="bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg p-4 transition-colors"
        >
          <div className="flex items-center">
            <BarChart3 className="w-6 h-6 text-blue-600 mr-3" />
            <div>
              <h3 className="font-medium text-blue-900">Monitoring Dashboard</h3>
              <p className="text-sm text-blue-700">Advanced analytics & charts</p>
            </div>
          </div>
        </a>
        
        <a 
          href="http://localhost:8000/metrics" 
          target="_blank" 
          rel="noopener noreferrer"
          className="bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg p-4 transition-colors"
        >
          <div className="flex items-center">
            <TrendingUp className="w-6 h-6 text-green-600 mr-3" />
            <div>
              <h3 className="font-medium text-green-900">Prometheus Metrics</h3>
              <p className="text-sm text-green-700">Raw metrics data</p>
            </div>
          </div>
        </a>
        
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center">
            <Zap className="w-6 h-6 text-purple-600 mr-3" />
            <div>
              <h3 className="font-medium text-purple-900">Real-time Updates</h3>
              <p className="text-sm text-purple-700">Auto-refresh every 30s</p>
            </div>
          </div>
        </div>
      </div>

      {/* System Health Overview */}
      {healthData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Memory Usage */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Memory Usage</h3>
              <HardDrive className="w-5 h-5 text-gray-600" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Used: {formatBytes(healthData.system?.memory?.used || 0)}</span>
                <span>{healthData.system?.memory?.percentage?.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${healthData.system?.memory?.percentage || 0}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Available: {formatBytes(healthData.system?.memory?.available || 0)}</span>
                <span>Total: {formatBytes(healthData.system?.memory?.total || 0)}</span>
              </div>
            </div>
          </div>

          {/* CPU Usage */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">CPU Usage</h3>
              <Cpu className="w-5 h-5 text-gray-600" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Current Usage</span>
                <span>{healthData.system?.cpu_percent?.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${healthData.system?.cpu_percent || 0}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500">
                Process CPU: {healthData.process?.cpu_percent?.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Disk Usage */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Disk Usage</h3>
              <HardDrive className="w-5 h-5 text-gray-600" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Used: {formatBytes(healthData.system?.disk?.used || 0)}</span>
                <span>{healthData.system?.disk?.percentage?.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-yellow-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${healthData.system?.disk?.percentage || 0}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Free: {formatBytes(healthData.system?.disk?.free || 0)}</span>
                <span>Total: {formatBytes(healthData.system?.disk?.total || 0)}</span>
              </div>
            </div>
          </div>

          {/* Network Activity */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Network Activity</h3>
              <Wifi className="w-5 h-5 text-gray-600" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Bytes Sent</span>
                <span>{formatBytes(healthData.network?.bytes_sent || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Bytes Received</span>
                <span>{formatBytes(healthData.network?.bytes_recv || 0)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Packets Sent: {healthData.network?.packets_sent || 0}</span>
                <span>Packets Recv: {healthData.network?.packets_recv || 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Process Information */}
      {healthData?.process && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Process Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {formatBytes(healthData.process.memory_rss)}
              </div>
              <div className="text-sm text-gray-600">Memory (RSS)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {formatBytes(healthData.process.memory_vms)}
              </div>
              <div className="text-sm text-gray-600">Memory (VMS)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {healthData.process.num_threads}
              </div>
              <div className="text-sm text-gray-600">Threads</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {healthData.process.cpu_percent?.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">CPU Usage</div>
            </div>
          </div>
        </div>
      )}

      {/* Performance Analytics */}
      {performanceData && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Analytics</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="font-medium">Dashboard Access</span>
              <a 
                href={performanceData.dashboard_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                {performanceData.dashboard_url}
              </a>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="font-medium">Prometheus Metrics</span>
              <a 
                href={performanceData.prometheus_metrics} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                {performanceData.prometheus_metrics}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="bg-gray-50 rounded-lg p-4 text-center text-sm text-gray-600">
        <p>Professional monitoring powered by Flask-MonitoringDashboard & Prometheus</p>
        <p className="mt-1">Auto-refresh every 30 seconds • Last updated: {lastUpdated}</p>
      </div>
    </div>
  );
};

export default ProfessionalMonitoringDashboard;
