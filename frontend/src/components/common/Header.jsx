import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useDashboard } from '../../contexts/DashboardContext'
import { Bell, Menu, Search, User } from 'lucide-react'

const Header = () => {
  const { user, logout } = useAuth()
  const { toggleSidebar } = useDashboard()
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const handleLogout = async () => {
    console.log('Header logout initiated')
    try {
      await logout()
      console.log('Header logout successful')
    } catch (error) {
      console.error('Header logout error:', error)
    } finally {
      setUserMenuOpen(false)
    }
  }

  return (
    <header className="z-40 bg-white shadow-md flex items-center h-16 sm:h-20 px-2 sm:px-4 border-b-2 border-emerald-400 flex-shrink-0">
      {/* Left: Hamburger menu */}
      <div className="flex items-center flex-shrink-0 mr-2">
        <button
          className="md:hidden p-3 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500"
          onClick={toggleSidebar}
          style={{ minWidth: 44, minHeight: 44 }}
        >
          <Menu className="h-7 w-7" />
        </button>
      </div>
      {/* Center: Logo and system name */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        <div className="h-7 w-12 sm:h-10 sm:w-20 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mr-1 sm:mr-2 shadow-md">
          <img src="https://static.wixstatic.com/media/bfee2e_7d499a9b2c40442e85bb0fa99e7d5d37~mv2.png/v1/fill/w_203,h_111,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/logo1.png" alt="Logo" className="h-5 w-auto sm:h-7 object-contain rounded-xl" />
        </div>
        <span className="text-base sm:text-2xl font-bold text-black ml-1 sm:ml-2 truncate" style={{maxWidth: 'calc(100vw - 120px)'}}>Study Edge</span>
      </div>
      {/* Right: Profile icon and menu */}
      {(user?.role === 'superadmin' || user?.role === 'campus_admin' || user?.role === 'course_admin' || user?.role === 'student') && (
        <div className="flex items-center space-x-6 flex-shrink-0">
          {/* Notifications - Only for superadmin */}
          {user?.role === 'superadmin' && (
            <button className="p-3 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500">
              <Bell className="h-7 w-7" />
            </button>
          )}
          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center space-x-4 p-3 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500"
            >
              <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
                <User className="h-6 w-6 text-white" />
              </div>
              <span className="hidden md:block text-lg font-medium text-black">
                {user?.name}
              </span>
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50">
                <div className="px-4 py-2 text-base text-black border-b border-gray-100">
                  <p className="font-medium">{user?.name}</p>
                  <p className="text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
                </div>
                <Link
                  to={
                    user?.role === 'student' ? '/student/profile' : 
                    user?.role === 'superadmin' ? '/superadmin/profile' : 
                    user?.role === 'campus_admin' ? '/campus-admin/profile' : 
                    user?.role === 'course_admin' ? '/course-admin/profile' : 
                    '/profile'
                  }
                  className="block px-4 py-2 text-base text-black hover:bg-gray-100"
                  onClick={() => setUserMenuOpen(false)}
                >
                  Your Profile
                </Link>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-base text-black hover:bg-gray-100"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

export default Header 