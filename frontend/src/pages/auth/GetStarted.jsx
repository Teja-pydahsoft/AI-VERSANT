import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Menu, X, ChevronDown, LogIn, CheckCircle, ArrowRight, Headphones, Mic, BookOpen, Edit3, Library, SpellCheck2, BrainCircuit, Code2 } from 'lucide-react'

const GetStarted = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState(null)

  const features = [
    {
      icon: Headphones,
      title: 'Listening Comprehension',
      description: 'Master real-world audio scenarios with interactive listening tests',
      color: 'from-blue-500 to-blue-600'
    },
    {
      icon: Mic,
      title: 'Speaking & Pronunciation',
      description: 'Perfect your accent and fluency with AI-powered speech analysis',
      color: 'from-green-500 to-green-600'
    },
    {
      icon: BookOpen,
      title: 'Reading Comprehension',
      description: 'Enhance reading skills with diverse texts and critical analysis',
      color: 'from-purple-500 to-purple-600'
    },
    {
      icon: Edit3,
      title: 'Writing Excellence',
      description: 'Develop advanced writing skills with structured feedback',
      color: 'from-orange-500 to-orange-600'
    },
    {
      icon: Library,
      title: 'Grammar Mastery',
      description: 'Master English grammar rules with interactive exercises',
      color: 'from-red-500 to-red-600'
    },
    {
      icon: SpellCheck2,
      title: 'Vocabulary Building',
      description: 'Expand your lexicon with contextual learning and word games',
      color: 'from-indigo-500 to-indigo-600'
    },
    {
      icon: BrainCircuit,
      title: 'CRT Reasoning',
      description: 'Develop critical thinking and logical reasoning skills',
      color: 'from-teal-500 to-teal-600'
    },
    {
      icon: Code2,
      title: 'Programming Logic',
      description: 'Learn coding fundamentals and problem-solving techniques',
      color: 'from-pink-500 to-pink-600'
    }
  ]

  const benefits = [
    'Real-time performance tracking and analytics',
    'Personalized learning paths based on your progress',
    'Interactive practice modules with instant feedback',
    'Comprehensive test history and detailed reports',
    'Mobile-responsive design for learning anywhere',
    'Expert-curated content by language specialists'
  ]

  const navigationItems = [
    { name: 'Home', href: '#home', icon: null },
    { 
      name: 'Features', 
      href: '#features', 
      icon: ChevronDown,
      dropdown: [
        { name: 'Language Skills', href: '#language-skills' },
        { name: 'Technical Skills', href: '#technical-skills' },
        { name: 'Practice Modules', href: '#practice-modules' },
        { name: 'Online Exams', href: '#online-exams' }
      ]
    },
    { name: 'About', href: '#about', icon: null }
  ]

  const toggleDropdown = (index) => {
    setActiveDropdown(activeDropdown === index ? null : index)
  }

  return (
    // Added scroll-smooth for better anchor link navigation
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-x-hidden scroll-smooth">
      {/* Enhanced Background Animations */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-blue-200 rounded-full mix-blend-multiply filter blur-2xl opacity-60 animate-blob"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-purple-200 rounded-full mix-blend-multiply filter blur-2xl opacity-60 animate-blob animation-delay-2000"></div>
        <div className="absolute top-[30%] right-[10%] w-[30vw] h-[30vw] bg-pink-200 rounded-full mix-blend-multiply filter blur-2xl opacity-50 animate-blob animation-delay-4000"></div>
        <div className="absolute bottom-[20%] left-[20%] w-[25vw] h-[25vw] bg-yellow-100 rounded-full mix-blend-multiply filter blur-2xl opacity-40 animate-blob animation-delay-1000"></div>
      </div>

      {/* Header Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-b border-gray-200/80 shadow-sm">
        <nav className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="flex items-center flex-shrink-0"
            >
              <div className="flex items-center space-x-2 md:space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center shadow-md">
                  <span className="text-white font-bold text-lg">SE</span>
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Pydah Apex
                  </h1>
                  <p className="text-xs md:text-sm text-gray-500 font-medium">Education & Beyond</p>
                </div>
              </div>
            </motion.div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              {navigationItems.map((item, index) => (
                <div key={item.name} className="relative group">
                  {item.dropdown ? (
                    <div>
                      <button
                        onClick={() => toggleDropdown(index)}
                        className="flex items-center space-x-2 text-gray-600 hover:text-blue-600 transition-all duration-300 font-semibold text-base py-2 px-3 rounded-lg hover:bg-blue-50"
                      >
                        <span>{item.name}</span>
                        <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${activeDropdown === index ? 'rotate-180' : ''}`} />
                      </button>
                      {activeDropdown === index && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute top-full left-0 mt-3 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50"
                        >
                          {item.dropdown.map((dropdownItem) => (
                            <a
                              key={dropdownItem.name}
                              href={dropdownItem.href}
                              className="block px-6 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-all duration-200 font-medium"
                            >
                              {dropdownItem.name}
                            </a>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  ) : (
                    <a
                      href={item.href}
                      className="flex items-center space-x-2 text-gray-600 hover:text-blue-600 transition-colors duration-300 font-semibold text-base py-2 px-3 rounded-lg hover:bg-blue-50"
                    >
                      {item.icon && <item.icon className="w-4 h-4" />}
                      <span>{item.name}</span>
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Login Button */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="hidden md:block"
            >
              <Link
                to="/login"
                className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-300 shadow-md hover:shadow-lg font-semibold text-base group"
              >
                <LogIn className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                <span>Login</span>
              </Link>
            </motion.div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="text-gray-700 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50"
              >
                {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-gray-200 py-3"
            >
              <div className="space-y-2">
                {navigationItems.map((item) => (
                  <a
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center space-x-3 text-gray-700 hover:text-blue-600 transition-colors text-sm font-semibold py-2 px-3 rounded-lg hover:bg-blue-50"
                  >
                    {item.icon && <item.icon className="w-4 h-4" />}
                    <span>{item.name}</span>
                  </a>
                ))}
                <Link
                  to="/login"
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-300 font-bold text-sm"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login</span>
                </Link>
              </div>
            </motion.div>
          )}
        </nav>
      </header>

      {/* Main Content with proper spacing for fixed header */}
      <div className="pt-20">
        {/* Hero Section */}
        <section id="home" className="w-full min-h-[calc(100vh-5rem)] flex items-center justify-center py-16 px-4 sm:px-6 lg:px-8">
          <div className="w-full max-w-6xl xl:max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-center"
            >
              {/* Main Heading */}
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-gray-900 mb-6"
              >
                Welcome to{' '}
                <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
                  Pydah Apex
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="text-lg md:text-xl text-gray-600 mb-6 max-w-4xl mx-auto leading-relaxed"
              >
                The ultimate comprehensive learning platform designed to transform your{' '}
                <span className="font-bold text-blue-600">English language skills</span> and{' '}
                <span className="font-bold text-purple-600">cognitive abilities</span>
              </motion.p>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.6 }}
                className="text-base text-gray-500 mb-12 max-w-3xl mx-auto"
              >
                From foundational grammar to advanced programming logic, Pydah Apex offers an immersive learning experience that adapts to your pace and goals.
              </motion.p>

              {/* Urgency Message */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.8 }}
                className="bg-white/60 backdrop-blur-sm border border-blue-200 p-6 rounded-2xl mb-12 max-w-4xl mx-auto shadow-lg"
              >
                <h3 className="text-2xl md:text-3xl font-bold mb-3 text-gray-800">🚀 Ready to Transform Your Skills?</h3>
                <p className="text-base md:text-lg text-gray-700">
                  Join thousands of students mastering English and critical thinking. 
                  <span className="font-semibold text-blue-600"> Login now to unlock your personalized learning journey!</span>
                </p>
              </motion.div>

              {/* CTA Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 1.0 }}
                className="flex flex-col sm:flex-row gap-4 justify-center"
              >
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold rounded-xl text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-all duration-300 shadow-lg hover:shadow-xl"
                  >
                    Start Learning Now
                    <ArrowRight className="ml-3 w-5 h-5" />
                  </Link>
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="w-full py-16 md:py-24 bg-white/50 px-4 sm:px-6 lg:px-8">
          <div className="w-full max-w-6xl xl:max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-center mb-12 md:mb-16"
            >
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">
                Comprehensive Learning Features
              </h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                Discover our wide range of learning modules designed to enhance every aspect of your skills
              </p>
            </motion.div>

            {/* Features Grid */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 mb-16"
            >
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 + index * 0.1 }}
                  whileHover={{ 
                    scale: 1.05,
                    boxShadow: '0 20px 40px -10px rgba(79, 70, 229, 0.2)',
                    transition: { duration: 0.3 }
                  }}
                  className="group relative"
                >
                  <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100 overflow-hidden h-full flex flex-col items-center">
                    <div className="mb-6 flex items-center justify-center">
                      <feature.icon className="w-12 h-12 text-blue-600 group-hover:text-purple-600 transition-colors duration-300" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors text-center">
                      {feature.title}
                    </h3>
                    <p className="text-base text-gray-600 leading-relaxed text-center">
                      {feature.description}
                    </p>
                    {/* Card lighting effect */}
                    <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="absolute -top-10 -left-10 w-40 h-40 bg-blue-200 rounded-full blur-2xl opacity-40 animate-card-light"></div>
                      <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-purple-200 rounded-full blur-2xl opacity-30 animate-card-light animation-delay-2000"></div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Benefits Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="bg-white rounded-2xl p-8 md:p-12 shadow-lg w-full"
            >
              <h3 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-8 text-center">
                Why Choose Pydah Apex?
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {benefits.map((benefit, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6, delay: 0.8 + index * 0.1 }}
                    className="flex items-center space-x-4 p-4 rounded-xl hover:bg-blue-50 transition-all duration-300"
                  >
                    <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                    <span className="text-base font-medium text-gray-700">{benefit}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* About Section */}
        <section id="about" className="w-full py-16 md:py-24 px-4 sm:px-6 lg:px-8">
          <div className="w-full max-w-6xl xl:max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="bg-white rounded-2xl p-8 md:p-12 shadow-lg"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                >
                  <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 mb-6">
                    About Pydah Apex
                  </h2>
                  <p className="text-lg text-gray-600 mb-6 leading-relaxed">
                    Pydah Apex is a comprehensive learning platform designed to transform how students approach English language learning and cognitive skill development. Our mission is to provide an immersive, adaptive learning experience that caters to individual needs and learning styles.
                  </p>
                  <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                    With cutting-edge technology and expert-curated content, we help students master essential skills from foundational grammar to advanced programming logic, ensuring they're well-prepared for academic and professional success.
                  </p>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-blue-600 mb-2">5+</div>
                      <div className="text-gray-600 text-base font-semibold">Years Experience</div>
                    </div>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-purple-600 mb-2">100+</div>
                      <div className="text-gray-600 text-base font-semibold">Expert Instructors</div>
                    </div>
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                  className="relative"
                >
                  <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl p-8 md:p-12 text-white">
                    <h3 className="text-3xl font-bold mb-6">Our Mission</h3>
                    <p className="text-lg mb-8 leading-relaxed">
                      To empower learners worldwide with comprehensive, adaptive learning experiences that transform their English language skills and cognitive abilities, preparing them for success in an increasingly globalized world.
                    </p>
                    <div className="space-y-4">
                      <div className="flex items-center space-x-4">
                        <CheckCircle className="w-6 h-6 text-green-400" />
                        <span className="text-lg font-semibold">Personalized Learning Paths</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <CheckCircle className="w-6 h-6 text-green-400" />
                        <span className="text-lg font-semibold">Expert-Curated Content</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <CheckCircle className="w-6 h-6 text-green-400" />
                        <span className="text-lg font-semibold">Real-time Progress Tracking</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="w-full bg-gray-900 text-white py-12 md:py-16 mt-16">
          <div className="w-full max-w-6xl xl:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
              >
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center shadow-md">
                    <span className="text-white font-bold text-lg">SE</span>
                  </div>
                  <div className="hidden sm:block">
                    <h1 className="text-xl font-bold text-white">Pydah Apex</h1>
                    <p className="text-gray-400 text-sm font-medium">Education & Beyond</p>
                  </div>
                </div>
                <p className="text-gray-400 mb-4 text-base leading-relaxed">
                  Empowering minds through comprehensive learning experiences that transform English language skills and cognitive abilities.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
                <h4 className="text-lg font-semibold mb-4">Quick Links</h4>
                <ul className="space-y-3">
                  <li><a href="#home" className="text-gray-400 hover:text-white transition-colors text-base font-medium">Home</a></li>
                  <li><a href="#features" className="text-gray-400 hover:text-white transition-colors text-base font-medium">Features</a></li>
                  <li><a href="#about" className="text-gray-400 hover:text-white transition-colors text-base font-medium">About</a></li>
                </ul>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
              >
                <h4 className="text-lg font-semibold mb-4">Learning Modules</h4>
                <ul className="space-y-3">
                  <li><a href="#" className="text-gray-400 hover:text-white transition-colors text-base font-medium">Language Skills</a></li>
                  <li><a href="#" className="text-gray-400 hover:text-white transition-colors text-base font-medium">Technical Skills</a></li>
                  <li><a href="#" className="text-gray-400 hover:text-white transition-colors text-base font-medium">Practice Modules</a></li>
                  <li><a href="#" className="text-gray-400 hover:text-white transition-colors text-base font-medium">Online Exams</a></li>
                </ul>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="border-t border-gray-800 mt-8 pt-6 text-center"
            >
              <p className="text-gray-400 text-base">
                © 2025 Pydah Apex. All rights reserved. | Empowering minds through comprehensive learning.
              </p>
            </motion.div>
          </div>
        </footer>
      </div>

      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-1000 {
          animation-delay: 1s;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes card-light {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        .animate-card-light {
          animation: card-light 3s infinite alternate;
        }
      `}</style>
    </div>
  )
}

export default GetStarted 