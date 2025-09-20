import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Clock, 
  BarChart3,
  Zap,
  AlertTriangle
} from 'lucide-react';

const TrendsGraph = ({ timePatterns, timePeriod }) => {
  if (!timePatterns) return null;

  const { hourly_hits, hit_trends, busiest_hours } = timePatterns;

  const formatNumber = (num) => {
    return new Intl.NumberFormat().format(num);
  };

  const getMaxRequests = () => {
    if (!hourly_hits || hourly_hits.length === 0) return 100;
    return Math.max(...hourly_hits.map(h => h.requests));
  };

  const maxRequests = getMaxRequests();

  return (
    <div className="space-y-6">
      {/* Header with Trend Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Traffic Trends & Patterns</h2>
            <p className="text-gray-600">Real-time hit patterns and traffic analysis</p>
          </div>
          {hit_trends && (
            <div className={`flex items-center px-4 py-2 rounded-lg ${
              hit_trends.trend === 'increasing' 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {hit_trends.trend === 'increasing' ? (
                <TrendingUp className="w-5 h-5 mr-2" />
              ) : (
                <TrendingDown className="w-5 h-5 mr-2" />
              )}
              <span className="font-semibold">
                {hit_trends.trend} {hit_trends.percentage}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Hourly Hits Bar Chart */}
      {hourly_hits && hourly_hits.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
              Hourly Hit Patterns
            </h3>
            <div className="text-sm text-gray-500">
              {timePeriod === '1hour' ? 'Last Hour' : 
               timePeriod === '5hours' ? 'Last 5 Hours' : 'Last 24 Hours'}
            </div>
          </div>
          
          <div className="space-y-4">
            {hourly_hits.map((hour, index) => {
              const height = (hour.requests / maxRequests) * 100;
              const errorHeight = hour.requests > 0 ? (hour.errors / hour.requests) * height : 0;
              
              return (
                <div key={index} className="flex items-end space-x-2">
                  <div className="w-16 text-sm text-gray-600 text-right">
                    {hour.time}
                  </div>
                  <div className="flex-1 flex items-end space-x-1">
                    {/* Success requests bar */}
                    <div 
                      className="bg-blue-500 rounded-t"
                      style={{ 
                        height: `${Math.max(height - errorHeight, 2)}px`,
                        minHeight: '4px',
                        width: '100%'
                      }}
                      title={`${hour.requests - hour.errors} successful requests`}
                    />
                    {/* Error bar overlay */}
                    {errorHeight > 0 && (
                      <div 
                        className="bg-red-500 rounded-t"
                        style={{ 
                          height: `${Math.max(errorHeight, 2)}px`,
                          minHeight: '2px',
                          width: '100%'
                        }}
                        title={`${hour.errors} errors`}
                      />
                    )}
                  </div>
                  <div className="w-20 text-sm text-gray-900 text-right">
                    <div className="font-semibold">{formatNumber(hour.requests)}</div>
                    <div className="text-xs text-gray-500">{hour.success_rate}% success</div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Legend */}
          <div className="flex items-center justify-center space-x-6 mt-6 pt-4 border-t border-gray-200">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-blue-500 rounded mr-2"></div>
              <span className="text-sm text-gray-600">Successful Requests</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 bg-red-500 rounded mr-2"></div>
              <span className="text-sm text-gray-600">Errors</span>
            </div>
          </div>
        </div>
      )}

      {/* Busiest Hours */}
      {busiest_hours && busiest_hours.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Zap className="w-5 h-5 mr-2 text-yellow-600" />
              Peak Traffic Hours
            </h3>
            <div className="space-y-3">
              {busiest_hours.slice(0, 5).map((hour, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-yellow-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{hour.time}</div>
                      <div className="text-sm text-gray-600">{hour.success_rate}% success rate</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-yellow-600">{formatNumber(hour.requests)}</div>
                    <div className="text-xs text-gray-500">hits</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hit Trends Analysis */}
          {hit_trends && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Activity className="w-5 h-5 mr-2 text-green-600" />
                Traffic Analysis
              </h3>
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">Current Trend</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      hit_trends.trend === 'increasing' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {hit_trends.trend === 'increasing' ? '↗️ Increasing' : '↘️ Decreasing'}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {hit_trends.percentage}% change
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Recent Average</div>
                    <div className="text-lg font-bold text-blue-600">
                      {hit_trends.recent_avg} hits/hr
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Previous Average</div>
                    <div className="text-lg font-bold text-gray-600">
                      {hit_trends.older_avg} hits/hr
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary Stats */}
      {hourly_hits && hourly_hits.length > 0 && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6 border border-purple-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Clock className="w-5 h-5 mr-2 text-purple-600" />
            Time Period Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {formatNumber(hourly_hits.reduce((sum, h) => sum + h.requests, 0))}
              </div>
              <div className="text-sm text-gray-600">Total Hits</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {formatNumber(hourly_hits.reduce((sum, h) => sum + h.errors, 0))}
              </div>
              <div className="text-sm text-gray-600">Total Errors</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {Math.round(hourly_hits.reduce((sum, h) => sum + h.success_rate, 0) / hourly_hits.length)}%
              </div>
              <div className="text-sm text-gray-600">Avg Success Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {Math.round(hourly_hits.reduce((sum, h) => sum + h.requests, 0) / hourly_hits.length)}
              </div>
              <div className="text-sm text-gray-600">Avg Hits/Hour</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrendsGraph;
