import React from 'react'

const LoadingSpinner = ({ size = 'md', className = '', message = 'Loading...' }) => {
  const sizeMap = {
    sm: { bg: 'w-20 h-20', spinner: 'w-32 h-32', svg: 128, r: 54, stroke: 8, r2: 44, stroke2: 3 },
    md: { bg: 'w-28 h-28', spinner: 'w-44 h-44', svg: 176, r: 74, stroke: 10, r2: 62, stroke2: 4 },
    lg: { bg: 'w-40 h-40', spinner: 'w-60 h-60', svg: 240, r: 102, stroke: 14, r2: 86, stroke2: 6 },
    xl: { bg: 'w-56 h-56', spinner: 'w-80 h-80', svg: 320, r: 142, stroke: 18, r2: 120, stroke2: 8 },
  }
  const { bg, spinner, svg, r, stroke, r2, stroke2 } = sizeMap[size] || sizeMap['md']
  return (
    <div className={`flex justify-center items-center min-h-[60vh] ${className}`}>
      <div className="relative flex flex-col items-center">
        <div className={`relative flex items-center justify-center ${spinner}`} style={{ width: `${svg}px`, height: `${svg}px` }}>
          <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin-modern" width={svg} height={svg} viewBox={`0 0 ${svg} ${svg}`} fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="modern-spinner-gradient" x1="0" y1="0" x2={svg} y2={svg} gradientUnits="userSpaceOnUse">
                <stop stopColor="#6366f1" />
                <stop offset="1" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
            <circle
              cx={svg/2}
              cy={svg/2}
              r={r}
              stroke="url(#modern-spinner-gradient)"
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={Math.PI * 2 * r * 0.7}
              strokeDashoffset={Math.PI * 2 * r * 0.15}
              strokeLinecap="round"
            />
          </svg>
          <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin-reverse" width={svg} height={svg} viewBox={`0 0 ${svg} ${svg}`} fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle
              cx={svg/2}
              cy={svg/2}
              r={r2}
              stroke="#a7f3d0"
              strokeWidth={stroke2}
              fill="none"
              opacity="0.7"
              strokeDasharray={Math.PI * 2 * r2 * 0.5}
              strokeDashoffset={Math.PI * 2 * r2 * 0.25}
              strokeLinecap="round"
            />
          </svg>
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full flex items-center justify-center ${bg} animate-pulse-shadow`} style={{ width: `${svg - stroke * 2}px`, height: `${svg - stroke * 2}px` }}></div>
        </div>
        <div className="mt-6 text-lg text-blue-700 font-semibold animate-pulse">{message}</div>
      </div>
      <style>{`
        @keyframes spin-modern {
          0% { transform: translate(-50%, -50%) rotate(0deg); }
          100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes spin-reverse {
          0% { transform: translate(-50%, -50%) rotate(0deg); }
          100% { transform: translate(-50%, -50%) rotate(-360deg); }
        }
        .animate-spin-modern {
          animation: spin-modern 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .animate-spin-reverse {
          animation: spin-reverse 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        @keyframes pulse-shadow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0.25), 0 2px 8px 0 rgba(0,0,0,0.10); }
          50% { box-shadow: 0 0 0 12px rgba(52,211,153,0.10), 0 2px 16px 0 rgba(0,0,0,0.12); }
        }
        .animate-pulse-shadow {
          animation: pulse-shadow 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  )
}

export default LoadingSpinner 