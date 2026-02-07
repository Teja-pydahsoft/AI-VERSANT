import React, { useState } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { useNotification } from '../../contexts/NotificationContext'
import LoadingSpinner from '../../components/common/LoadingSpinner'
import { Eye, EyeOff, Lock, User } from 'lucide-react'

const Login = () => {
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()
  const { success, error: showError } = useNotification()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm()

  const onSubmit = async (data) => {
    setIsLoading(true)
    try {
      const user = await login(data.username, data.password)
      console.log('Login returned user:', user)
      if (user) {
        success('Login successful!')
        // Check for redirect query param
        const redirectParam = searchParams.get('redirect')
        if (redirectParam) {
          navigate(redirectParam, { replace: true })
          return
        }
        // Redirect based on user role
        const roleRoutes = {
          superadmin: '/superadmin',
          sub_superadmin: '/superadmin',  // Sub-superadmins use superadmin dashboard
          campus_admin: '/campus-admin',
          course_admin: '/course-admin',
          student: '/student',
        }
        console.log('User role:', user.role)
        console.log('Available routes:', roleRoutes)
        const redirectPath = location.state?.from?.pathname || roleRoutes[user.role] || '/'
        console.log('Redirecting to:', redirectPath)
        navigate(redirectPath, { replace: true })
      }
    } catch (err) {
      showError(err.response?.data?.message || err.message || 'Login failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F0F4FF] flex items-center justify-center p-4 relative overflow-y-auto">
      {/* Dynamic SVG background shapes */}
      <motion.div
        className="absolute top-0 left-0 w-64 h-64 bg-gradient-to-br from-blue-200 to-indigo-300 rounded-full opacity-50"
        animate={{ x: [0, 100, 0], y: [0, 50, 0], scale: [1, 1.1, 1], rotate: [0, 10, 0] }}
        transition={{ duration: 15, repeat: Infinity, repeatType: 'mirror' }}
      />
      <motion.div
        className="absolute bottom-0 right-0 w-80 h-80 bg-gradient-to-tl from-purple-200 to-indigo-300 rounded-full opacity-40"
        animate={{ x: [0, -80, 0], y: [0, -60, 0], scale: [1, 1.05, 1], rotate: [0, -15, 0] }}
        transition={{ duration: 20, repeat: Infinity, repeatType: 'mirror' }}
      />

      {/* Loading Spinner Overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white bg-opacity-70">
          <div className="relative flex flex-col items-center">
            <div className="relative flex items-center justify-center" style={{ width: '10rem', height: '10rem' }}>
              <LoadingSpinner size="lg" message="Signing in..." />
            </div>
          </div>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <motion.div
          className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden"
          whileHover={{ scale: 1.02, boxShadow: '0px 20px 40px rgba(0,0,0,0.15)'}}
          transition={{ duration: 0.3 }}
        >
          <div className="p-8 sm:p-12">
            <div className="text-center">
              <motion.img
                src="https://static.wixstatic.com/media/bfee2e_7d499a9b2c40442e85bb0fa99e7d5d37~mv2.png/v1/fill/w_203,h_111,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/logo1.png"
                alt="VERSANT Logo"
                className="h-16 w-auto mx-auto mb-4 drop-shadow-lg"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              />
              <h2 className="text-3xl font-bold text-gray-800">
                Sign in to your account
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Welcome back to VERSANT
              </p>
            </div>

            <div className="flex justify-center my-8">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center shadow-lg">
                  <User className="text-white h-8 w-8"/>
              </div>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
              <motion.div 
                className="relative"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
              >
                <label htmlFor="username" className="sr-only">Username</label>
                 <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  {...register('username', { required: 'Username is required' })}
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  className={`block w-full pl-12 pr-4 py-3 border rounded-lg text-gray-900 placeholder-gray-500 focus:ring-2 sm:text-sm transition-all duration-300 ${
                    errors.username 
                    ? 'border-red-500 focus:ring-red-500' 
                    : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                  } bg-gray-50/80 focus:bg-white`}
                  placeholder="Username"
                />
                {errors.username && (
                  <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.username.message}</p>
                )}
              </motion.div>
              
              <motion.div 
                className="relative"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                <label htmlFor="password" className="sr-only">Password</label>
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  {...register('password', { required: 'Password is required' })}
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`block w-full pl-12 pr-12 py-3 border rounded-lg text-gray-900 placeholder-gray-500 focus:ring-2 sm:text-sm transition-all duration-300 ${
                    errors.password 
                    ? 'border-red-500 focus:ring-red-500' 
                    : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                  } bg-gray-50/80 focus:bg-white`}
                  placeholder="Password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute inset-y-0 right-4 flex items-center text-gray-400 hover:text-indigo-600 focus:outline-none transition-colors"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
                {errors.password && (
                  <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.password.message}</p>
                )}
              </motion.div>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              >
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-bold rounded-lg text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-300 shadow-lg hover:shadow-indigo-500/50 transform hover:-translate-y-0.5"
                >
                  Sign in
                </button>
              </motion.div>
              {/* Remove any <Link> or text related to forgot/reset password from the login form */}
            </form>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

export default Login 