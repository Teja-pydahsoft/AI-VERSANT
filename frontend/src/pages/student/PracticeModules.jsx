import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';

import LoadingSpinner from '../../components/common/LoadingSpinner';
import api, { getStudentTests, getStudentTestDetails, getUnlockedModules, getGrammarProgress, submitPracticeTest } from '../../services/api';
import { BookOpen, BrainCircuit, ChevronLeft, Lock, Unlock, CheckCircle, XCircle, Ear } from 'lucide-react';
import { io } from 'socket.io-client';
import { useContext } from 'react';
import { AuthContext } from '../../contexts/AuthContext';
import { getPlayableAudioUrl } from '../../utils/audioPlayback';



const moduleIcons = {
  GRAMMAR: BrainCircuit,
  VOCABULARY: BookOpen,
  LISTENING: Ear,
  DEFAULT: BookOpen
};

const PracticeModules = () => {
  const [view, setView] = useState('main'); // 'main', 'grammar_categories', 'module_list', 'taking_module', 'result'
  const [modules, setModules] = useState([]);
  const [grammarProgress, setGrammarProgress] = useState([]);
  const [currentCategory, setCurrentCategory] = useState(null);
  const [moduleList, setModuleList] = useState([]);
  const [currentModule, setCurrentModule] = useState(null);
  const [moduleResult, setModuleResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const { error: showError, success } = useNotification();
  const { user } = useContext(AuthContext); // Assumes user object contains student_id or _id
  const [showUnlockPopup, setShowUnlockPopup] = useState(false);
  const [unlockPopupMessage, setUnlockPopupMessage] = useState('');
  const [scrollToLevelId, setScrollToLevelId] = useState(null);
  const [showNextLevelPopup, setShowNextLevelPopup] = useState(false);
  const [nextLevelInfo, setNextLevelInfo] = useState(null);

  const resetToMain = () => {
    setView('main');
    setCurrentCategory(null);
    setModuleList([]);
    setCurrentModule(null);
    setModuleResult(null);
  };
  
  const handleSelectModule = async (module) => {
    console.log('handleSelectModule called with:', module);
    if (module.locked) {
      setIsPopupVisible(true);
      return;
    }
    if (module.id === 'GRAMMAR') {
      console.log('GRAMMAR module selected, going to grammar_categories');
      setView('grammar_categories');
    } else if (module.id === 'LISTENING') {
      // For LISTENING module, fetch levels and go to module_levels view
      console.log('LISTENING module selected, fetching levels...');
      setLoading(true);
      try {
        const res = await getUnlockedModules();
        const found = res.data.data.find(m => m.module_id === module.id);
        const levels = found ? found.levels : [];
        const scores = {};
        levels.forEach(lvl => { scores[lvl.level_id] = { score: lvl.score || 0, unlocked: lvl.unlocked }; });
        setCurrentCategory({ id: module.id, name: module.name, levels, scores });
        setView('module_levels');
      } catch {
        setCurrentCategory({ id: module.id, name: module.name, levels: [], scores: {} });
        setView('module_levels');
      } finally {
        setLoading(false);
      }
    } else {
      // For other non-GRAMMAR modules (SPEAKING, READING, WRITING, VOCABULARY)
      // Set the category and go directly to module_list to fetch practice tests
      console.log(`${module.id} module selected, going to module_list`);
      setCurrentCategory({ id: module.id, name: module.name });
      setView('module_list');
    }
    setScrollToLevelId(null);
  };

  const handleSelectCategory = (category) => {
    if (category.unlocked) {
      setCurrentCategory({ ...category, id: 'GRAMMAR', subId: category.id, name: category.name });
      setView('module_list');
    } else {
      setUnlockPopupMessage('Complete the previous part with a score of 60% or more to unlock this. You are just one step away from progressing! Give it your best shot!');
      setShowUnlockPopup(true);
    }
  };

      const handleSelectPracticeModule = (module, idx = null) => {
    if (currentCategory && currentCategory.id === 'LISTENING') {
          // Check if we're already in module_list view (showing test list)
          if (view === 'module_list') {
            // We're selecting a test from the test list, go to the test
            setCurrentModule(module);
            setView('taking_module');
          } else {
            // We're selecting a level, fetch tests for that level
            const fetchListeningTests = async () => {
              try {
                setLoading(true);
                const params = { 
                  module: 'LISTENING',
                  level: module.level_id || 'beginner'
                };
                
                const res = await getStudentTests(params);
                
                if (res.data.data && res.data.data.length > 0) {
                  // Show test list for this level
                  setModuleList(res.data.data);
                  setView('module_list');
                } else {
                  showError('No tests available for this level. Please try another level.');
                }
              } catch (err) {
                showError('Failed to load tests for this level.');
              } finally {
                setLoading(false);
              }
            };
            
            fetchListeningTests();
          }
        } else {
      // For other modules, proceed as usual
      setCurrentModule(module);
      setView('taking_module');
    }
  };

  const handleModuleSubmit = async (result) => {
    setModuleResult(result);
    
    // After submitting, refresh the module list to get updated scores
    if (currentCategory?.id && view === 'module_list') {
      try {
        let params = { module: currentCategory.id };
        // For Grammar, we use the subcategory ID
        if (currentCategory.id === 'GRAMMAR' && currentCategory.subId) {
           params.subcategory = currentCategory.subId;
        }
        
        const res = await getStudentTests(params);
        setModuleList(res.data.data);
        console.log('Refreshed module list with updated scores:', res.data.data);
      } catch (error) {
        console.error('Error refreshing module scores:', error);
      }
    }
    
    // After submitting, refresh the scores for level-based modules
    if (currentCategory?.id && (view === 'module_levels' || currentCategory.id === 'LISTENING')) {
      try {
        const res = await getUnlockedModules();
        const found = res.data.data.find(m => m.module_id === currentCategory.id);
        const levels = found ? found.levels : [];
        const scores = {};
        levels.forEach(lvl => { scores[lvl.level_id] = { score: lvl.score || 0, unlocked: lvl.unlocked }; });
        setCurrentCategory(prev => ({ ...prev, levels, scores }));
      } catch (error) {
        console.error('Error refreshing level scores:', error);
      }
    }
    
    // After submitting, fetch the latest grammar progress if it was a grammar module
    if (currentCategory?.id === 'GRAMMAR') {
       fetchGrammarProgress();
    }
    
    // Always refresh the module list after any test submission to show updated scores
    if (currentCategory?.id) {
      try {
        let params = { module: currentCategory.id };
        if (currentCategory.id === 'GRAMMAR' && currentCategory.subId) {
           params.subcategory = currentCategory.subId;
        }
        
        const res = await getStudentTests(params);
        setModuleList(res.data.data);
        console.log('Refreshed module list after test submission:', res.data.data);
      } catch (error) {
        console.error('Error refreshing module scores after submission:', error);
      }
    }
    
    setView('result');
    // If next level is unlocked, show popup
    if (result.nextLevelUnlocked) {
      setNextLevelInfo(result.nextLevelInfo); // {levelName, idx, ...}
      setShowNextLevelPopup(true);
    }
  };

  const fetchGrammarProgress = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getGrammarProgress();
      setGrammarProgress(res.data.data);
    } catch (err) {
      showError('Failed to load your grammar progress. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const fetchModules = useCallback(async () => {
    try {
      setLoading(true);
      console.log('🔍 Fetching practice modules...');
      // Use the new endpoint for per-student module access
      const res = await getUnlockedModules();
      console.log('📊 API Response:', res.data);
      console.log('📋 Modules data:', res.data.data);
      console.log('📊 Number of modules:', res.data.data?.length || 0);
      
      // Map backend unlocked -> frontend locked
      const modulesWithIcons = res.data.data.map(m => ({
        id: m.module_id,
        name: m.module_name,
        locked: !m.unlocked, // invert for UI
        icon: moduleIcons[m.module_id] || moduleIcons.DEFAULT
      }));
      console.log('🎨 Mapped modules:', modulesWithIcons);
      setModules(modulesWithIcons);
    } catch (err) {
      console.error('❌ Error fetching modules:', err);
      showError('Failed to load practice modules. Please try refreshing the page.');
      setModules([]);
    } finally {
      setLoading(false);
    }
  }, [showError]);


  useEffect(() => {
    if (view === 'main') {
      fetchModules();
    } else if (view === 'grammar_categories') {
      fetchGrammarProgress();
    } else if (view === 'module_list' && currentCategory) {
      const fetchModules = async () => {
        try {
          setLoading(true);
          let params = { module: currentCategory.id };
          // For Grammar, we use the subcategory ID
          if (currentCategory.id === 'GRAMMAR' && currentCategory.subId) {
             params.subcategory = currentCategory.subId;
          }
          
          const res = await getStudentTests(params);
          setModuleList(res.data.data);
        } catch (err) {
          showError('Failed to load modules for this category.');
        } finally {
          setLoading(false);
        }
      };
      fetchModules();
    } else if (view === 'module_levels' && currentCategory && currentCategory.id === 'LISTENING') {
      // For listening module levels, we need to handle level selection differently
      // This will be handled when a level is selected
    }
  }, [view, currentCategory, fetchGrammarProgress, showError, fetchModules]);

  useEffect(() => {
    if (!user || !user._id) return;
    const socket = io(import.meta.env.VITE_SOCKET_IO_URL || 'https://52.66.128.80', {
      transports: ['websocket'],
      auth: { token: localStorage.getItem('token') },
    });
    // Join a room for this student
    socket.emit('join', { student_id: user._id });
    // Listen for module access changes
    socket.on('module_access_changed', (data) => {
      if (data.student_id === user._id) {
        // Re-fetch modules when access changes
        fetchModules();
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [user, fetchModules]);

  useEffect(() => {
    if (scrollToLevelId) {
      const el = document.getElementById(`level-${scrollToLevelId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [scrollToLevelId]);

  const renderContent = () => {
    switch (view) {
      case 'grammar_categories':
        return <GrammarCategoryView categories={grammarProgress} onSelectCategory={handleSelectCategory} onBack={resetToMain} />;
      case 'module_list':
        return <ModuleListView category={currentCategory} modules={moduleList} onSelectModule={handleSelectPracticeModule} onBack={() => {
          if (currentCategory.id === 'GRAMMAR') {
            setView('grammar_categories');
          } else if (currentCategory.id === 'LISTENING') {
            setView('module_levels');
          } else {
            setView('main');
          }
        }} />;
      case 'taking_module':
        return <ModuleTakingView module={currentModule} onSubmit={handleModuleSubmit} onBack={() => setView('module_list')}/>;
      case 'result':
        return <ResultView result={moduleResult} onBack={() => { setView('module_list'); setModuleResult(null); }} />;
      case 'module_levels':
        return <ModuleLevelsView moduleId={currentCategory.id} levels={currentCategory.levels} scores={currentCategory.scores} onSelectLevel={handleSelectPracticeModule} onBack={resetToMain} />;
      default: // 'main'
        return <MainView modules={modules} onSelectModule={handleSelectModule} />;
    }
  };

  return (
    <div className="w-full">
      {renderContent()}
      
      <PopupModal 
        isVisible={isPopupVisible} 
        onClose={() => setIsPopupVisible(false)} 
      />
        {/* Motivational Unlock Popup */}
        {showUnlockPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center border-4 border-yellow-400"
            >
              <div className="mx-auto bg-yellow-100 h-24 w-24 flex items-center justify-center rounded-full mb-4">
                <CheckCircle className="h-16 w-16 text-yellow-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mt-2 mb-2">Keep Going!</h2>
              <p className="text-lg text-gray-700 mb-4">{unlockPopupMessage}</p>
              <button 
                onClick={() => setShowUnlockPopup(false)}
                className="mt-4 w-full bg-yellow-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-yellow-600 transition-colors text-lg shadow"
              >
                Got it! I'll try again
              </button>
            </motion.div>
          </div>
        )}
        {showNextLevelPopup && nextLevelInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center border-4 border-green-400"
          >
            <div className="mx-auto bg-green-100 h-24 w-24 flex items-center justify-center rounded-full mb-4">
              <Unlock className="h-16 w-16 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mt-2 mb-2">Congratulations!</h2>
            <p className="text-lg text-gray-700 mb-4">You've unlocked the next level: <span className="font-semibold">{nextLevelInfo.levelName}</span>! Keep up the great work and continue your progress.</p>
            <button 
              onClick={() => { setShowNextLevelPopup(false); handleSelectPracticeModule(nextLevelInfo.level, nextLevelInfo.idx); }}
              className="mt-4 w-full bg-green-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-600 transition-colors text-lg shadow"
            >
              Go to Next Level
            </button>
            <button 
              onClick={() => setShowNextLevelPopup(false)}
              className="mt-2 w-full bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors text-base"
            >
              Maybe Later
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const MainView = ({ modules, onSelectModule }) => {
  const [expandedModule, setExpandedModule] = React.useState(null);
  const [levels, setLevels] = React.useState([]);
  const [levelLoading, setLevelLoading] = React.useState(false);
  const [levelStatus, setLevelStatus] = React.useState({});

  const handleExpand = async (module) => {
    if (expandedModule === module.id) {
      setExpandedModule(null);
      setLevels([]);
      return;
    }
    setExpandedModule(module.id);
    setLevelLoading(true);
    try {
      // Fetch latest module status (including levels)
      const res = await getUnlockedModules();
      const found = res.data.data.find(m => m.module_id === module.id);
      setLevels(found ? found.levels : []);
      setLevelStatus(Object.fromEntries((found ? found.levels : []).map(l => [l.level_id, l.unlocked])));
    } catch {
      setLevels([]);
      setLevelStatus({});
    } finally {
      setLevelLoading(false);
    }
  };

  const handleLevelToggle = async (moduleId, levelId, unlocked) => {
    setLevelLoading(true);
    try {
      if (unlocked) {
        await api.post(`/batch-management/student/level/lock`, { module: moduleId, level: levelId });
      } else {
        await api.post(`/batch-management/student/level/unlock`, { module: moduleId, level: levelId });
      }
      // Refresh levels
      const res = await getUnlockedModules();
      const found = res.data.data.find(m => m.module_id === moduleId);
      setLevels(found ? found.levels : []);
      setLevelStatus(Object.fromEntries((found ? found.levels : []).map(l => [l.level_id, l.unlocked])));
    } catch {}
    setLevelLoading(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-8">Practice Modules</h1>
      <p className="text-gray-600 mb-8 text-lg">Practice language skills to improve your English proficiency.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {console.log('🎨 Rendering modules:', modules.length, modules)}
        {modules.map(module => (
          <motion.div
            key={module.id}
            whileHover={!module.locked ? { scale: 1.05 } : {}}
            className={clsx(
              "bg-white p-8 rounded-2xl shadow-lg flex flex-col items-center text-center relative transition-all duration-300 hover:shadow-xl",
              {
                "cursor-pointer": !module.locked,
                "opacity-60 bg-gray-100 cursor-not-allowed": module.locked,
              }
            )}
            onClick={() => onSelectModule(module)}
          >
            {module.locked && (
              <div className="absolute top-4 right-4 bg-gray-300 p-2 rounded-full">
                <Lock className="h-5 w-5 text-gray-600" />
              </div>
            )}
            <module.icon className={clsx("h-20 w-20 mb-6", {
              "text-indigo-500": !module.locked,
              "text-gray-400": module.locked
            })} />
            <h2 className="text-2xl font-semibold text-gray-800 mb-3">{module.name}</h2>
            <p className="text-gray-500 text-base">Improve your {module.name.toLowerCase()} skills.</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

const PopupModal = ({ isVisible, onClose }) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center"
      >
        <div className="mx-auto bg-yellow-100 h-20 w-20 flex items-center justify-center rounded-full">
          <BrainCircuit className="h-12 w-12 text-yellow-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mt-6">Coming Soon!</h2>
        <p className="text-gray-600 mt-4">
          This module is under development. Please complete the Grammar and Vocabulary sections first to build your foundation.
        </p>
        <button 
          onClick={onClose}
          className="mt-8 w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Got it!
        </button>
      </motion.div>
    </div>
  );
};

const GrammarCategoryView = ({ categories, onSelectCategory, onBack }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <div className="flex items-center mb-8">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-200 mr-4"><ChevronLeft /></button>
        <h1 className="text-3xl font-bold text-gray-800">Grammar Learning Path</h1>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {categories.map((cat, index) => (
        <motion.div
          key={cat.id}
          whileHover={cat.unlocked ? { scale: 1.05 } : {}}
          className={clsx("bg-white p-6 rounded-xl shadow-lg relative", {
            "cursor-pointer": cat.unlocked,
            "opacity-60 bg-gray-100": !cat.unlocked,
          })}
          onClick={() => onSelectCategory(cat)}
        >
          <div className="flex justify-between items-start">
            <div>
                <p className="text-sm font-semibold text-indigo-600">Part {index + 1}</p>
                <h3 className="text-xl font-bold text-gray-800 mt-1">{cat.name}</h3>
            </div>
            {cat.unlocked ? <Unlock className="h-6 w-6 text-green-500" /> : <Lock className="h-6 w-6 text-gray-400" />}
          </div>
          <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${cat.score}%` }}></div>
              </div>
              <p className="text-right text-sm text-gray-600 mt-1">Highest Score: {cat.score.toFixed(0)}%</p>
          </div>
          {!cat.unlocked && <p className="text-xs text-center text-yellow-800 bg-yellow-100 p-2 rounded-md mt-4">Complete the previous part with 60% or more to unlock.</p>}
        </motion.div>
      ))}
    </div>
  </motion.div>
);

const ModuleListView = ({ category, modules, onSelectModule, onBack }) => {
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center mb-8">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-200 mr-2 sm:mr-4"><ChevronLeft /></button>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">{category.name} Modules</h1>
            </div>
            {modules.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {modules.map(module => (
                        <motion.div
                            key={module._id}
                            whileHover={{ scale: 1.05 }}
                            className="bg-white p-6 rounded-xl shadow-lg cursor-pointer flex flex-col justify-between"
                                                    onClick={() => onSelectModule(module)}
                        >
                        <div>
                            <h3 className="text-lg sm:text-xl font-bold text-gray-800">{module.name}</h3>
                            <p className="text-gray-500 mt-2 text-xs sm:text-sm">A practice module to test your skills.</p>
                        </div>
                        <div className="mt-4">
                            {/* Progress Bar with Highest Score */}
                            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                                <div 
                                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                                    style={{ 
                                        width: `${module.highest_score ? Math.min(module.highest_score, 100) : 0}%` 
                                    }}
                                ></div>
                            </div>
                            
                            {/* Progress Information */}
                            <div className="flex justify-between items-center text-xs sm:text-sm text-gray-600">
                                <div className="flex items-center space-x-2">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                    <span className="font-medium">
                                        {module.completed_count || 0} attempt{(module.completed_count || 0) !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="font-semibold text-blue-600">
                                        {module.highest_score ? module.highest_score.toFixed(1) : '0'}%
                                    </span>
                                    <span className="text-gray-500 ml-1">best</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        ) : (
            <div className="text-center py-16">
                <h2 className="text-xl font-semibold text-gray-700">No Modules Here Yet</h2>
                <p className="text-gray-500 mt-2">Check back later for new practice modules in this category.</p>
            </div>
        )}
        </motion.div>
    );
};

const ModuleLevelsView = ({ moduleId, levels, scores, onSelectLevel, onBack }) => {
  // Handle different module types
  const isListeningModule = moduleId === 'LISTENING';
  
  // For listening module, create default levels if none exist
  const defaultListeningLevels = [
    { level_id: 'beginner', level_name: 'Beginner' },
    { level_id: 'intermediate', level_name: 'Intermediate' },
    { level_id: 'advanced', level_name: 'Advanced' }
  ];
  
  const displayLevels = isListeningModule && (!levels || levels.length === 0) ? defaultListeningLevels : levels;
  
  return (
    <div>
      <button onClick={onBack} className="mb-6 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 font-semibold">← Back to Modules</button>
      
      {isListeningModule && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h2 className="text-lg font-semibold text-blue-800 mb-2">Listening Practice</h2>
          <p className="text-blue-700 text-sm">
            Practice your listening skills with audio questions. Each question includes an audio file and requires a 10-second voice recording response.
          </p>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayLevels.map((level, idx) => {
          // Use the unlocked status from backend instead of calculating manually
          const unlocked = level.unlocked || false;
          return (
            <motion.div
              key={level.level_id}
              whileHover={unlocked ? { scale: 1.05 } : {}}
              className={clsx("bg-white p-6 rounded-xl shadow-lg relative", {
                "cursor-pointer": unlocked,
                "opacity-60 bg-gray-100": !unlocked,
              })}
              onClick={() => {
                if (unlocked) {
                  onSelectLevel(level, idx);
                }
              }}
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-800 mt-1">{level.level_name}</h3>
                {unlocked ? <Unlock className="h-6 w-6 text-green-500" /> : <Lock className="h-6 w-6 text-gray-400" />}
              </div>
              <div className="mt-4">
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${scores[level.level_id]?.score || 0}%` }}></div>
                </div>
                <p className="text-right text-sm text-gray-600 mt-1">Highest Score: {scores[level.level_id]?.score?.toFixed(0) ?? 0}%</p>
              </div>
              {!unlocked && <p className="text-xs text-center text-yellow-800 bg-yellow-100 p-2 rounded-md mt-4">Complete the previous level with 60% or more to unlock.</p>}
              {/* Show test count for listening module */}
              {isListeningModule && unlocked && (
                <div className="mt-4 text-center">
                  <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded-md">
                    🎯 Click to view available tests for this level
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

const ModuleTakingView = ({ module, onSubmit, onBack }) => {
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState({});
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const { error: showError, success } = useNotification();
    const [cheatWarning, setCheatWarning] = useState(false);
    const [cheatCount, setCheatCount] = useState(0);
    const examRef = useRef(null);
    const [recordings, setRecordings] = useState({}); // For speaking answers
    const mediaRecorderRef = useRef(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingQuestionId, setRecordingQuestionId] = useState(null);
    const [audioURLs, setAudioURLs] = useState({});
    const [recordingTime, setRecordingTime] = useState(0);
    
    // Ref to track if questions have been set to prevent re-shuffling
    const questionsInitialized = useRef(false);

    useEffect(() => {
        const fetchModuleDetails = async () => {
            try {
                setLoading(true);
                console.log('Fetching module details for:', module);
                console.log('Module ID:', module._id);
                
                // Add timeout to prevent infinite loading
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Request timeout')), 30000)
                );
                
                const fetchPromise = getStudentTestDetails(module._id);
                const res = await Promise.race([fetchPromise, timeoutPromise]);
                
                console.log('Response received:', res);
                
                // Validate the response structure
                if (res.data && res.data.data && Array.isArray(res.data.data.questions)) {
                    console.log('Questions loaded successfully:', res.data.data.questions.length);
                    
                    // Only set questions if they haven't been initialized yet to prevent re-shuffling
                    if (!questionsInitialized.current) {
                        // Use shuffled questions if available (same as backend), otherwise use original questions
                        let finalQuestions = res.data.data.shuffled_questions || res.data.data.questions;
                        
                        // Clear any existing session storage to force fresh start
                        sessionStorage.removeItem(`test_${module._id}_question_order`);
                        
                        // Store the initial order using the correct ID field
                        const orderMap = finalQuestions.map(q => q.question_id || q._id);
                        sessionStorage.setItem(`test_${module._id}_question_order`, JSON.stringify(orderMap));
                        console.log('Stored initial question order in session storage:', orderMap);
                        
                        setQuestions(finalQuestions);
                        questionsInitialized.current = true;
                        console.log('Questions initialized with order:', finalQuestions.map(q => q.question_id || q._id));
                        console.log('Final questions structure:', finalQuestions);
                    } else {
                        console.log('Questions already initialized, maintaining current order');
                    }
                } else {
                    console.error('Invalid questions data structure:', res.data);
                    if (!questionsInitialized.current) {
                        setQuestions([]);
                    }
                    showError("Invalid question data format received from server.");
                }
            } catch (err) {
                console.error('Error fetching module details:', err);
                console.error('Error response:', err.response);
                
                let errorMessage = "Failed to load module questions.";
                if (err.message === 'Request timeout') {
                    errorMessage = "Request timed out. Please try again.";
                } else if (err.response?.data?.message) {
                    errorMessage = err.response.data.message;
                }
                
                setFetchError(errorMessage);
                showError(errorMessage);
                setQuestions([]);
            } finally {
                setLoading(false);
            }
        };

        if (module?._id) {
            fetchModuleDetails();
        }
    }, [module, showError]);

    useEffect(() => {
        // Anti-cheating: Prevent tab switching
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                setCheatWarning(true);
                setCheatCount(prev => prev + 1);
                // Optionally, auto-submit after N violations
                // if (cheatCount + 1 >= 2) handleSubmit();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Prevent copy/cut/paste and text selection
        const preventAction = (e) => e.preventDefault();
        const examNode = examRef.current;
        if (examNode) {
            examNode.addEventListener('copy', preventAction);
            examNode.addEventListener('cut', preventAction);
            examNode.addEventListener('paste', preventAction);
            examNode.addEventListener('contextmenu', preventAction);
            examNode.addEventListener('selectstart', preventAction);
        }

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (examNode) {
                examNode.removeEventListener('copy', preventAction);
                examNode.removeEventListener('cut', preventAction);
                examNode.removeEventListener('paste', preventAction);
                examNode.removeEventListener('contextmenu', preventAction);
                examNode.removeEventListener('selectstart', preventAction);
            }
        };
    }, [cheatCount]);

    const handleAnswerChange = (questionId, answer) => {
        setAnswers(prev => ({ ...prev, [questionId]: answer }));
    };

    const retryFetch = async () => {
        setFetchError(null);
        setLoading(true);
        try {
            const res = await getStudentTestDetails(module._id);
            if (res.data && res.data.data && Array.isArray(res.data.data.questions)) {
                setQuestions(res.data.data.questions);
            } else {
                setFetchError("Invalid question data format received from server.");
            }
        } catch (err) {
            let errorMessage = "Failed to load module questions.";
            if (err.message === 'Request timeout') {
                errorMessage = "Request timed out. Please try again.";
            } else if (err.response?.data?.message) {
                errorMessage = err.response.data.message;
            }
            setFetchError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    // Audio recording logic for Speaking and Listening modules
    const startRecording = async (questionId) => {
        setRecordingQuestionId(questionId);
        setIsRecording(true);
        if (navigator.mediaDevices && window.MediaRecorder) {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new window.MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            let chunks = [];
            
            // Set up 10-second timer for listening questions
            let recordingTimer;
            let timeInterval;
            if (currentQuestion && currentQuestion.question_type === 'listening') {
                setRecordingTime(10);
                timeInterval = setInterval(() => {
                    setRecordingTime(prev => {
                        if (prev <= 1) {
                            if (mediaRecorder.state === 'recording') {
                                stopRecording();
                                showError('Recording time limit reached (10 seconds). Your response has been saved.');
                            }
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
                
                recordingTimer = setTimeout(() => {
                    if (mediaRecorder.state === 'recording') {
                        stopRecording();
                        showError('Recording time limit reached (10 seconds). Your response has been saved.');
                    }
                }, 10000); // 10 seconds
            }
            
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };
            mediaRecorder.onstop = () => {
                // Clear the timers
                if (recordingTimer) {
                    clearTimeout(recordingTimer);
                }
                if (timeInterval) {
                    clearInterval(timeInterval);
                }
                
                // Use WebM format for better browser compatibility and transcription support
                const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
                
                // Store recording with unique identifier
                const recordingKey = `${questionId}_${Date.now()}`;
                setRecordings(prev => ({ ...prev, [questionId]: blob }));
                setAudioURLs(prev => ({ ...prev, [questionId]: URL.createObjectURL(blob) }));
                
                // Log recording details for debugging
                console.log(`Recording saved for question ${questionId}:`, {
                    size: blob.size,
                    type: blob.type,
                    recordingKey: recordingKey,
                    timestamp: new Date().toISOString()
                });
                
                setIsRecording(false);
                setRecordingQuestionId(null);
                setRecordingTime(0);
                
                // For speaking modules, transcribe the audio for validation
                if (currentQuestion && currentQuestion.module_id === 'SPEAKING') {
                    transcribeAudio(blob, questionId);
                }
                
                // For listening modules, show success message
                if (currentQuestion && currentQuestion.question_type === 'listening') {
                    success('Recording saved successfully! You can play it back to review.');
                }
            };
            mediaRecorder.start();
        } else {
            showError('Audio recording is not supported in this browser.');
        }
    };

    // Transcribe audio for speaking validation
    const transcribeAudio = async (audioBlob, questionId) => {
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.wav');
            
            const response = await api.post('/test-management/transcribe-audio', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            if (response.data.success) {
                const transcript = response.data.transcript;
                setAnswers(prev => ({ ...prev, [questionId]: transcript }));
                
                // Validate transcript against original sentence
                if (currentQuestion && currentQuestion.sentence) {
                    validateTranscript(currentQuestion.sentence, transcript, questionId);
                }
            }
        } catch (error) {
            console.error('Transcription failed:', error);
            showError('Failed to transcribe audio. Please try recording again.');
        }
    };

    // Validate transcript for speaking modules
    const validateTranscript = async (originalSentence, studentTranscript, questionId) => {
        try {
            const response = await api.post('/test-management/validate-transcript', {
                original_sentence: originalSentence,
                student_transcript: studentTranscript,
                validation_config: {
                    tolerance: 0.8,
                    checkMismatchedWords: true,
                    allowPartialMatches: true
                }
            });
            
            if (response.data.success) {
                const validation = response.data.data;
                // Store validation results for later use
                setAnswers(prev => ({ 
                    ...prev, 
                    [`${questionId}_validation`]: validation 
                }));
            }
        } catch (error) {
            console.error('Transcript validation failed:', error);
        }
    };
    const stopRecording = () => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
        }
        setRecordingTime(0);
    };

    // Check if all questions have been answered
    const canSubmit = () => {
        return questions.every((question, index) => {
            const questionId = question.question_id || question._id;
            
            if (question.question_type === 'mcq') {
                // For MCQ questions, check if answer exists
                return answers[questionId];
            } else if (question.question_type === 'listening' || question.question_type === 'speaking') {
                // For audio questions, check if recording exists
                return recordings[questionId];
            }
            
            return false;
        });
    };

    const handleSubmit = async () => {
        try {
            // Clear session storage for this test
            if (module?._id) {
                sessionStorage.removeItem(`test_${module._id}_question_order`);
                console.log('Cleared question order from session storage');
            }
            
            const formData = new FormData();
            formData.append('test_id', module._id);
            
            // Attach MCQ answers - use question index, not question ID
            questions.forEach((question, index) => {
                const questionId = question.question_id || question._id;
                if (answers[questionId]) {
                    formData.append(`answer_${index}`, answers[questionId]);
                }
            });
            
            // Attach audio answers - use question index, not question ID
            questions.forEach((question, index) => {
                const questionId = question.question_id || question._id;
                if (recordings[questionId]) {
                    // Use the correct file extension from the recording
                    const fileExtension = recordings[questionId].type.includes('webm') ? 'webm' : 'mp3';
                    const fileName = `answer_${index}_${questionId}.${fileExtension}`;
                    formData.append(`question_${index}`, recordings[questionId], fileName);
                    console.log(`Attaching audio for question ${index}: ${questionId} -> ${recordings[questionId].size} bytes -> ${fileName}`);
                } else {
                    console.log(`No recording found for question ${index}: ${questionId}`);
                }
            });
            
            const res = await submitPracticeTest(formData);
            if (res.data.success) {
                success("Practice test submitted successfully!");
                onSubmit(res.data.data); // Pass result data to parent
            } else {
                showError(res.data.message || 'Failed to submit your answers.');
            }
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to submit your answers. Please try again.');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <LoadingSpinner />
                    <p className="mt-4 text-gray-600">Loading module questions...</p>
                    <p className="text-sm text-gray-500">This may take a few moments for listening modules</p>
                </div>
            </div>
        );
    }

    if (fetchError) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <XCircle className="h-12 w-12 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-semibold text-red-700 mb-2">Failed to Load Module</h2>
                    <p className="text-gray-500 mb-4">{fetchError}</p>
                    <div className="flex gap-3 justify-center">
                        <button 
                            onClick={retryFetch}
                            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                            Retry
                        </button>
                        <button 
                            onClick={onBack}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!Array.isArray(questions)) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <XCircle className="h-12 w-12 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-semibold text-red-700 mb-2">Invalid Data Format</h2>
                    <p className="text-gray-500 mb-4">The module data is not in the expected format.</p>
                    <button 
                        onClick={onBack}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    if (questions.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <BookOpen className="h-12 w-12 text-gray-400" />
                    </div>
                    <h2 className="text-2xl font-semibold text-gray-700 mb-2">No Questions Available</h2>
                    <p className="text-gray-500 mb-4">This module doesn't have any questions yet or there was an error loading them.</p>
                    <button 
                        onClick={onBack}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    if (!questions[currentQuestionIndex]) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <XCircle className="h-12 w-12 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-semibold text-red-700 mb-2">Question Not Found</h2>
                    <p className="text-gray-500 mb-4">The requested question could not be found.</p>
                    <button 
                        onClick={onBack}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    const currentQuestion = questions[currentQuestionIndex];
    
    // Debug logging
    console.log('Current question index:', currentQuestionIndex);
    console.log('Total questions:', questions.length);
    console.log('Current question:', currentQuestion);
    
    // Check if question has required properties
    const questionId = currentQuestion.question_id || currentQuestion._id;
    if (!questionId || !currentQuestion.question_type) {
        return (
            <div className="text-center p-8">
                <div className="text-red-600 font-semibold mb-2">Invalid Question Data</div>
                <div className="text-gray-600 text-sm">
                    This question is missing required information. Please contact your instructor.
                </div>
                <div className="mt-4 text-xs text-gray-500">
                    Question ID: {questionId || 'Missing'}<br/>
                    Question Type: {currentQuestion.question_type || 'Missing'}<br/>
                    Question Text: {currentQuestion.question ? 'Present' : 'Missing'}
                </div>
            </div>
        );
    }
    
    // Create options object from individual option fields if not already present
    if (currentQuestion.question_type === 'mcq' && !currentQuestion.options) {
        currentQuestion.options = {
            'A': currentQuestion.optionA || '',
            'B': currentQuestion.optionB || '',
            'C': currentQuestion.optionC || '',
            'D': currentQuestion.optionD || ''
        };
    }
    
    // Debug: Log the current question structure (remove in production)
    // console.log('Current question:', currentQuestion);
    // console.log('Questions array:', questions);

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 truncate">{module.name}</h1>
        </div>
        {cheatWarning && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4 text-center">
            <strong>Tab switching or leaving the exam is not allowed!</strong> ({cheatCount} warning{cheatCount > 1 ? 's' : ''})
          </div>
        )}
        <div ref={examRef} className="bg-white rounded-2xl shadow-lg mx-auto p-4 sm:p-8 max-w-md w-full min-h-[350px] flex flex-col justify-center select-none">
            <div className="text-center mb-4">
                <div className="text-sm font-semibold text-gray-500 mb-2">
                    Question {currentQuestionIndex + 1} of {questions.length}
                </div>
                {/* Progress indicator */}
                <div className="flex justify-center space-x-1 mb-4">
                    {questions.map((_, index) => {
                        const questionId = questions[index]?.question_id || questions[index]?._id;
                        const isAnswered = questions[index]?.question_type === 'mcq' 
                            ? answers[questionId] 
                            : recordings[questionId];
                        const isCurrent = index === currentQuestionIndex;
                        
                        return (
                            <div
                                key={index}
                                className={`w-3 h-3 rounded-full transition-all duration-200 ${
                                    isCurrent ? 'bg-blue-500 scale-125' :
                                    isAnswered ? 'bg-green-500' : 'bg-gray-300'
                                }`}
                                title={`Question ${index + 1}${isAnswered ? ' - Answered' : ' - Not answered'}`}
                            />
                        );
                    })}
                </div>
            </div>

            <div className="text-center">
                {/* Listening Module: Audio Question */}
                {currentQuestion.question_type === 'listening' &&
                  (currentQuestion.audio_url || currentQuestion.audio_presigned_url) && (
                    <div className="mb-6">
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-4 shadow-sm">
                            <div className="flex items-center space-x-2 mb-2">
                                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                    <span className="text-blue-600 text-lg">🎧</span>
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold text-blue-800">Listening Question</h3>
                                    <p className="text-xs text-blue-600">Question {currentQuestionIndex + 1} of {questions.length}</p>
                                </div>
                            </div>
                            <p className="text-sm text-blue-700">
                                Listen to the audio carefully. You will need to record your response after listening.
                            </p>
                        </div>
                        
                        <audio 
                            key={`audio-${currentQuestion.audio_id || questionId}-${currentQuestionIndex}-${getPlayableAudioUrl(currentQuestion).slice(-32)}`}
                            controls 
                            className="mx-auto mb-4 w-full max-w-md"
                            src={getPlayableAudioUrl(currentQuestion)}
                            onError={(e) => {
                                const error = e.target.error;
                                let errorMessage = 'Failed to load audio file.';
                                
                                if (error) {
                                    switch (error.code) {
                                        case MediaError.MEDIA_ERR_NETWORK:
                                            errorMessage = 'Network error loading audio. Please check your connection.';
                                            break;
                                        case MediaError.MEDIA_ERR_DECODE:
                                            errorMessage = 'Audio format not supported. Please try a different browser.';
                                            break;
                                        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                                            errorMessage = 'Audio source not supported. Please contact support.';
                                            break;
                                        default:
                                            errorMessage = 'Audio loading failed. Please refresh and try again.';
                                    }
                                }
                                
                                showError(errorMessage);
                            }}
                            onLoadStart={() => {}}
                            onCanPlay={() => {}}
                            onLoad={() => {}}
                            preload="auto"
                        >
                            Your browser does not support the audio element.
                        </audio>
                        
                        {/* Debug info - remove in production */}
                        <div className="text-xs text-gray-500 text-center mb-2">
                            Audio ID: {currentQuestion.audio_id || 'N/A'} | 
                            Question ID: {questionId || 'N/A'}
                        </div>
                        
                        {/* Audio loading status */}
                        <div className="text-center mb-3">
                            {currentQuestion.audio_url || currentQuestion.audio_presigned_url ? (
                                <div className="inline-flex items-center space-x-2 bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                                    <span>🎵</span>
                                    <span>Audio Ready</span>
                                </div>
                            ) : (
                                <div className="inline-flex items-center space-x-2 bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium">
                                    <span>❌</span>
                                    <span>Audio Not Available</span>
                                </div>
                            )}
                        </div>
                        
                        <div className="bg-gray-50 rounded-lg p-3 mb-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-700">
                                <div className="flex items-center space-x-2">
                                    <span className="text-blue-600">🎯</span>
                                    <span><strong>Instructions:</strong> Listen to the audio and then record your response.</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <span className="text-orange-600">⏱️</span>
                                    <span><strong>Recording Time:</strong> 10 seconds maximum</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Audio Module: Play audio if available (for other audio types) */}
                {currentQuestion.question_type === 'audio' &&
                  (currentQuestion.audio_url || currentQuestion.audio_presigned_url) &&
                  currentQuestion.question_type !== 'listening' && (
                    <audio controls className="mx-auto mb-4" src={getPlayableAudioUrl(currentQuestion)}>
                        Your browser does not support the audio element.
                    </audio>
                )}
                
                {/* Text Fallback Mode for Missing Audio */}
                {currentQuestion.question_type === 'text_fallback' && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                        <div className="flex items-center space-x-2 mb-2">
                            <span className="text-blue-600">⚠️</span>
                            <span className="text-sm font-medium text-blue-800">Audio Mode Unavailable</span>
                        </div>
                        <p className="text-sm text-blue-700">
                            This question is currently in text mode because audio is not available. 
                            Please read the text carefully and answer accordingly.
                        </p>
                    </div>
                )}
                

                
                {/* For listening questions, don't show the sentence text */}
                {currentQuestion.question_type !== 'listening' && (
                    <p className="text-lg sm:text-xl text-gray-800 mb-8 break-words">
                        {currentQuestion.question || 'Question text not available'}
                    </p>
                )}
            </div>

            {currentQuestion.question_type === 'mcq' && currentQuestion.options && questionId && (
                <div className="space-y-4 max-w-lg mx-auto w-full">
                    {Object.entries(currentQuestion.options).map(([key, value]) => (
                        <label 
                            key={key} 
                            className={clsx(
                                "flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all w-full",
                                {
                                    'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-300': answers[questionId] === value,
                                    'border-gray-200 hover:border-indigo-400': answers[questionId] !== value,
                                }
                            )}
                        >
                            <input
                                type="radio"
                                name={questionId}
                                value={value}
                                checked={answers[questionId] === value}
                                onChange={() => handleAnswerChange(questionId, value)}
                                className="h-5 w-5 mr-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                            />
                            <span className="font-semibold text-gray-700">{key}.</span>
                            <span className="ml-3 text-gray-800">{value}</span>
                        </label>
                    ))}
                </div>
            )}

            {/* Listening Module: Voice Recording Interface */}
            {currentQuestion.question_type === 'listening' && questionId && (
                <div className="flex flex-col items-center mb-4">
                    <div className="w-full max-w-2xl">
                        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                            <div className="text-center mb-4">
                                <p className="text-sm text-gray-600">Speak clearly after listening to the audio</p>
                                
                                {/* Recording Status Indicator */}
                                {recordings[questionId] ? (
                                    <div className="mt-2 inline-flex items-center space-x-2 bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs">
                                        <span>✅</span>
                                        <span>Recording Saved!</span>
                                    </div>
                                ) : (
                                    <div className="mt-2 inline-flex items-center space-x-2 bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs">
                                        <span>🎤</span>
                                        <span>Ready to Record</span>
                                    </div>
                                )}
                            </div>
                            
                            {/* Show recorded audio if available */}
                            {audioURLs[questionId] ? (
                                <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
                                    <div className="flex items-center space-x-2 mb-2">
                                        <span className="text-green-600">✅</span>
                                        <span className="font-medium text-green-800 text-sm">Your Recording</span>
                                    </div>
                                    <audio controls src={audioURLs[questionId]} className="w-full" />
                                </div>
                            ) : null}
                            
                            {/* Recording Controls */}
                            <div className="flex flex-col items-center space-y-3">
                                {isRecording && recordingQuestionId === questionId ? (
                                    <div className="text-center">
                                        <div className="flex items-center justify-center space-x-2 mb-3">
                                            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                                            <span className="text-red-600 font-semibold text-base">Recording...</span>
                                        </div>
                                        <div className="mb-3">
                                            <div className="text-3xl font-bold text-red-600 mb-1">
                                                {recordingTime}s
                                            </div>
                                            <div className="text-xs text-gray-600">Time remaining</div>
                                        </div>
                                        <button 
                                            onClick={stopRecording} 
                                            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold transition-all duration-200 shadow-md"
                                        >
                                            ⏹️ Stop Recording
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => startRecording(questionId)} 
                                        className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition-all duration-200 shadow-md text-base"
                                    >
                                        🎤 Start Recording
                                    </button>
                                )}
                                
                                {/* Recording Instructions */}
                                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-blue-800">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-orange-600">⏱️</span>
                                            <span><strong>Max time:</strong> 10 seconds</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <span className="text-blue-600">🎯</span>
                                            <span><strong>Speak clearly</strong></span>
                                        </div>
                                        <div className="flex items-center space-x-2 md:col-span-2">
                                            <span className="text-purple-600">🔒</span>
                                            <span><strong>Note:</strong> Text hidden - listen and respond!</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Speaking Module: Record answer if no audio_url */}
            {currentQuestion.question_type === 'audio' && !currentQuestion.audio_url && questionId && (
                <div className="flex flex-col items-center mb-4 space-y-4">
                    {audioURLs[questionId] ? (
                        <audio controls src={audioURLs[questionId]} className="mb-2" />
                    ) : null}
                    
                    {/* Show transcript for speaking modules */}
                    {currentQuestion.module_id === 'SPEAKING' && answers[questionId] && (
                        <div className="w-full max-w-md">
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Your Transcript:</h4>
                            <div className="bg-gray-50 p-3 rounded-lg border">
                                <p className="text-sm text-gray-800">{answers[questionId]}</p>
                            </div>
                        </div>
                    )}
                    
                    {/* Show validation results for speaking modules */}
                    {currentQuestion.module_id === 'SPEAKING' && answers[`${questionId}_validation`] && (
                        <div className="w-full max-w-md">
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Validation Results:</h4>
                            <div className="bg-blue-50 p-3 rounded-lg border">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium">Similarity Score:</span>
                                    <span className={`text-sm font-bold ${
                                        answers[`${questionId}_validation`].is_valid ? 'text-green-600' : 'text-red-600'
                                    }`}>
                                        {Math.round(answers[`${questionId}_validation`].similarity_score * 100)}%
                                    </span>
                                </div>
                                
                                {answers[`${questionId}_validation`].mismatched_words && (
                                    <div className="mt-2">
                                        <p className="text-xs text-gray-600 mb-1">Mismatched Words:</p>
                                        {answers[`${questionId}_validation`]?.mismatched_words?.missing?.length > 0 && (
                                            <div className="mb-1">
                                                <span className="text-xs text-red-600">Missing: </span>
                                                <span className="text-xs text-gray-700">
                                                    {answers[`${questionId}_validation`].mismatched_words.missing.join(', ')}
                                                </span>
                                            </div>
                                        )}
                                        {answers[`${questionId}_validation`]?.mismatched_words?.extra?.length > 0 && (
                                            <div>
                                                <span className="text-xs text-orange-600">Extra: </span>
                                                <span className="text-xs text-gray-700">
                                                    {answers[`${questionId}_validation`].mismatched_words.extra.join(', ')}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {isRecording && recordingQuestionId === questionId ? (
                        <button onClick={stopRecording} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                            Stop Recording
                        </button>
                    ) : (
                        <button onClick={() => startRecording(questionId)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            Record Answer
                        </button>
                    )}
                </div>
            )}

            <div className="mt-6 flex justify-between items-center">
                <button
                    onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                    disabled={currentQuestionIndex === 0}
                    className="px-6 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Previous
                </button>
                {currentQuestionIndex === questions.length - 1 ? (
                    <div className="text-center">
                        <button
                            onClick={handleSubmit}
                            disabled={!canSubmit()}
                            className="px-6 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                        >
                            Submit
                        </button>
                        {!canSubmit() && (
                            <p className="text-xs text-gray-500 mt-2">
                                Please answer all questions before submitting
                            </p>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                        disabled={currentQuestionIndex === questions.length - 1}
                        className="px-6 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                    >
                        Next
                    </button>
                )}
            </div>
        </div>
      </motion.div>
    );
};


const ResultView = ({ result, onBack }) => {
    if (!result) {
        return (
            <div className="text-center">
                <h1 className="text-2xl font-bold">An error occurred while calculating your results.</h1>
                <button onClick={onBack} className="mt-8 px-8 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition">
                    Back to Modules
                </button>
            </div>
        )
    }
    
    const { correct_answers, total_questions, average_score, score_percentage, percentage, results } = result;
    // Use percentage first, then score_percentage, then calculate from average_score
    const scorePercentage = percentage || score_percentage || (average_score ? average_score * 100 : 0) || 0;
    
    // Helper for word diff display
    const renderWordDiff = (expected, got) => {
        if (!expected || !got) return <div className="text-gray-500">No text available for comparison</div>;
        
        const expectedWords = expected.split(' ');
        const gotWords = got.split(' ');
        return (
            <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2 items-center">
                    <span className="font-semibold">Expected:</span>
                    {expectedWords.map((word, idx) => (
                        <span key={idx} className={gotWords[idx] === word ? 'bg-green-100 text-green-700 px-2 py-1 rounded flex items-center' : 'bg-gray-200 text-gray-700 px-2 py-1 rounded flex items-center'}>
                            {gotWords[idx] === word ? <>&#10003;&nbsp;</> : null}{word}
                        </span>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <span className="font-semibold">Got:</span>
                    {gotWords.map((word, idx) => (
                        <span key={idx} className={expectedWords[idx] === word ? 'bg-green-100 text-green-700 px-2 py-1 rounded flex items-center' : 'bg-yellow-100 text-yellow-700 px-2 py-1 rounded flex items-center'}>
                            {expectedWords[idx] === word ? <>&#10003;&nbsp;</> : null}{word}
                        </span>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto">
            <div className="bg-white p-6 rounded-2xl shadow-lg text-center">
                <h1 className="text-2xl font-bold text-gray-800">Practice Test Submitted!</h1>
                <p className="text-gray-600 mt-2">Here are your results:</p>
                <div className="my-6">
                    <p className="text-4xl font-bold text-indigo-600">{correct_answers}<span className="text-2xl text-gray-500">/{total_questions}</span></p>
                    <p className="text-lg font-semibold text-gray-700">Questions Correct</p>
                </div>
                <div className="bg-gray-100 p-4 rounded-lg mb-6">
                    <h3 className="text-base font-semibold">Your Score</h3>
                    <p className="text-3xl font-bold text-green-600 mt-2">{scorePercentage.toFixed(0)}%</p>
                </div>
                
                {/* Scrollable Results Container */}
                <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {results && Array.isArray(results) && results.length > 0 ? (
                        results.map((q, idx) => (
                            <div key={idx} className="p-4 rounded-lg border bg-gray-50 text-left">
                                <div className="mb-2 font-semibold text-indigo-700 text-sm">Question {idx + 1}</div>
                                {q.question_type === 'audio' ? (
                                    <>
                                        {/* Listening: Play question audio if available */}
                                        {q.audio_url && (
                                            <audio controls className="mb-2">
                                                <source src={q.audio_url} type="audio/mpeg" />
                                                Your browser does not support the audio element.
                                            </audio>
                                        )}
                                        <div className="mb-2 text-sm"><span className="font-semibold">Prompt:</span> {q.original_text || q.question || 'No question text available'}</div>
                                        
                                        {/* Compact Performance Display */}
                                        <div className="mb-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-semibold text-gray-700 text-xs">Performance:</span>
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                    q.similarity_score >= 0.8 ? 'bg-green-100 text-green-800' :
                                                    q.similarity_score >= 0.6 ? 'bg-yellow-100 text-yellow-800' :
                                                    'bg-red-100 text-red-800'
                                                }`}>
                                                    {q.similarity_score ? (q.similarity_score * 100).toFixed(1) + '%' : 'N/A'} Accuracy
                                                </span>
                                            </div>
                                            
                                            {/* Compact Performance indicator */}
                                            <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                                                <div 
                                                    className={`h-1.5 rounded-full transition-all duration-500 ${
                                                        q.similarity_score >= 0.8 ? 'bg-green-500' :
                                                        q.similarity_score >= 0.6 ? 'bg-yellow-500' :
                                                        'bg-red-500'
                                                    }`}
                                                    style={{ width: `${(q.similarity_score || 0) * 100}%` }}
                                                ></div>
                                            </div>
                                            
                                            {/* Compact Performance message */}
                                            <div className={`text-xs font-medium ${
                                                q.similarity_score >= 0.8 ? 'text-green-700' :
                                                q.similarity_score >= 0.6 ? 'text-yellow-700' :
                                                'text-red-700'
                                            }`}>
                                                {q.similarity_score >= 0.8 ? '🎉 Excellent!' :
                                                 q.similarity_score >= 0.6 ? '👍 Good effort!' :
                                                 '💪 Keep practicing!'}
                                            </div>
                                        </div>
                                        
                                        {/* Compact Analysis */}
                                        <div className="bg-white rounded p-2 mb-3 text-xs">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <span className="font-medium text-gray-600">Expected:</span>
                                                    <div className="mt-1 p-1 bg-gray-50 rounded text-xs">
                                                        {q.original_text || q.question || 'No text'}
                                                    </div>
                                                </div>
                                                <div>
                                                    <span className="font-medium text-gray-600">Your Response:</span>
                                                    <div className="mt-1 p-1 bg-gray-50 rounded text-xs">
                                                        {q.student_text ? (
                                                            <span className="text-green-700 font-medium">
                                                                "{q.student_text}"
                                                            </span>
                                                        ) : (
                                                            <span className="text-red-500 italic">
                                                                No transcript available
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Student's submitted audio */}
                                        {q.student_audio_url && (
                                            <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                                                <div className="flex items-center space-x-2 mb-2">
                                                    <span className="text-blue-600 text-sm">🎤</span>
                                                    <span className="font-semibold text-blue-800 text-xs">Your Recording</span>
                                                </div>
                                                <audio controls className="w-full h-8">
                                                    <source src={q.student_audio_url} type="audio/mp3" />
                                                    Your browser does not support the audio element.
                                                </audio>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    // MCQ
                                    <>
                                        <div className="mb-2 font-semibold text-sm">{q.question || 'Question text not available'}</div>
                                        
                                        {/* Display all options */}
                                        {q.options && (
                                            <div className="mb-3">
                                                <div className="text-xs font-medium text-gray-600 mb-2">Options:</div>
                                                <div className="space-y-1">
                                                    {Object.entries(q.options).map(([key, value]) => {
                                                        const isStudentAnswer = q.student_answer === value;
                                                        const isCorrectAnswer = q.correct_answer_text === value;
                                                        return (
                                                            <div
                                                                key={key}
                                                                className={`text-xs p-2 rounded border ${
                                                                    isCorrectAnswer 
                                                                        ? 'bg-green-50 border-green-300 text-green-800 font-semibold' 
                                                                        : isStudentAnswer 
                                                                        ? 'bg-red-50 border-red-300 text-red-800 font-semibold'
                                                                        : 'bg-gray-50 border-gray-200 text-gray-700'
                                                                }`}
                                                            >
                                                                <span className="font-bold mr-2">{key}.</span>
                                                                <span>{value}</span>
                                                                {isCorrectAnswer && <span className="ml-2 text-green-600 font-bold">(Correct)</span>}
                                                                {isStudentAnswer && !isCorrectAnswer && <span className="ml-2 text-red-600 font-bold">(Your Answer)</span>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                        
                                        <div className="text-xs mb-2">Your Answer: <span className={q.is_correct ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>{q.student_answer || 'N/A'}</span></div>
                                        <div className="text-xs mb-2">Correct: <span className="font-semibold">{q.correct_answer_text || q.correct_answer || 'N/A'}</span></div>
                                        <div className="mb-2">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                                q.is_correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                            }`}>
                                                {q.is_correct ? '✓ Correct' : '✗ Incorrect'}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-4 text-gray-500 text-sm">
                            <p>Detailed question results are not available.</p>
                            <p className="text-xs mt-1">Your overall score has been recorded successfully.</p>
                        </div>
                    )}
                    </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-6">
                    <button 
                        onClick={() => window.location.href = '/student/practice'} 
                        className="px-6 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition text-sm"
                    >
                        Back to Modules
                    </button>
                    <button 
                        onClick={onBack} 
                        className="px-6 py-2 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600 transition text-sm"
                    >
                        Retry Practice Test
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

export default PracticeModules;