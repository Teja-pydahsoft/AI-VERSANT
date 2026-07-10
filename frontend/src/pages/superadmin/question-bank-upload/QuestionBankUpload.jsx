import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  FileText, 
  Upload, 
  Download, 
  AlertCircle, 
  CheckCircle, 
  Headphones,
  Mic,
  Edit3,
  BookOpen,
  Brain,
  Settings,
  Code
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import api, { getModules, getLevels } from '../../../services/api';
import MCQUpload from './MCQUpload';
import SentenceUpload from './SentenceUpload';
import ParagraphUpload from './ParagraphUpload';
import TechnicalUpload from './TechnicalUpload';
import DataManagement from './DataManagement';

const QuestionBankUpload = () => {
  const [selectedModule, setSelectedModule] = useState(null);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [currentStep, setCurrentStep] = useState('modules');
  const [currentTab, setCurrentTab] = useState('upload');
  const [loading, setLoading] = useState(false);
  const [modules, setModules] = useState([]);
  const [levels, setLevels] = useState([]);

  useEffect(() => {
    fetchModules();
  }, []);

  useEffect(() => {
    if (selectedModule) {
      fetchLevels();
    }
  }, [selectedModule]);

  const fetchModules = async () => {
    try {
      const response = await getModules();
      if (response.data.success) {
        console.log('Fetched modules:', response.data.data);
        setModules(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching modules:', error);
      toast.error('Failed to fetch modules');
    }
  };

  const fetchLevels = async () => {
    try {
      const response = await getLevels(selectedModule);
      if (response.data.success) {
        setLevels(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching levels:', error);
      // Set default levels as fallback
      setLevels([
        { id: 'BEGINNER', name: 'Beginner' },
        { id: 'INTERMEDIATE', name: 'Intermediate' },
        { id: 'ADVANCED', name: 'Advanced' }
      ]);
    }
  };

  const handleModuleSelect = (module) => {
    setSelectedModule(module.id);
    setSelectedLevel(null);
    setCurrentStep('levels');
  };

  const handleLevelSelect = (level) => {
    setSelectedLevel(level.id);
    setCurrentStep('upload');
  };

  const handleBackToModules = () => {
    setSelectedModule(null);
    setSelectedLevel(null);
    setCurrentStep('modules');
  };

  const handleBackToLevels = () => {
    setSelectedLevel(null);
    setCurrentStep('levels');
  };

  const handleUploadSuccess = () => {
    toast.success('Upload completed successfully!');
    // Optionally reset to modules view
    // handleBackToModules();
  };

  const getModuleConfig = (moduleId) => {
    const moduleConfigs = {
      'GRAMMAR': {
        icon: BookOpen,
        name: 'Grammar',
        color: 'from-blue-500 to-blue-600',
        description: 'Upload grammar questions with categories like Noun, Pronoun, Tense, Preposition, etc.',
        uploadType: 'mcq'
      },
      'VOCABULARY': {
        icon: Brain,
        name: 'Vocabulary',
        color: 'from-green-500 to-green-600',
        description: 'Upload vocabulary questions with difficulty levels',
        uploadType: 'mcq'
      },
      'READING': {
        icon: BookOpen,
        name: 'Reading',
        color: 'from-purple-500 to-purple-600',
        description: 'Upload reading comprehension questions',
        uploadType: 'mcq'
      },
      'LISTENING': {
        icon: Headphones,
        name: 'Listening',
        color: 'from-yellow-500 to-yellow-600',
        description: 'Upload listening comprehension questions with audio',
        uploadType: 'sentence',
        moduleType: 'LISTENING'
      },
      'SPEAKING': {
        icon: Mic,
        name: 'Speaking',
        color: 'from-red-500 to-red-600',
        description: 'Upload speaking practice questions with prompts',
        uploadType: 'sentence',
        moduleType: 'SPEAKING'
      },
      'WRITING': {
        icon: Edit3,
        name: 'Writing',
        color: 'from-indigo-500 to-indigo-600',
        description: 'Upload writing practice questions and prompts',
        uploadType: 'paragraph'
      }
    };

    return moduleConfigs[moduleId] || {
      icon: Settings,
      name: moduleId,
      color: 'from-gray-500 to-gray-600',
      description: 'Upload questions for this module',
      uploadType: 'mcq'
    };
  };

  const renderModuleCards = () => {
    // Filter and deduplicate modules
    const filteredModules = modules
      .filter(module => {
        // Filter out CRT modules and ensure only Versant modules
        const isCRTModule = module.id.startsWith('CRT_');
        const isVersantModule = ['GRAMMAR', 'VOCABULARY', 'READING', 'LISTENING', 'SPEAKING', 'WRITING'].includes(module.id);
        return !isCRTModule && isVersantModule;
      })
      .filter((module, index, self) => 
        // Remove duplicates based on module ID
        index === self.findIndex(m => m.id === module.id)
      );

    console.log('Filtered modules:', filteredModules);

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredModules.map((module) => {
          const config = getModuleConfig(module.id);
          const IconComponent = config.icon;
          
          return (
            <motion.div
              key={module.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`relative cursor-pointer rounded-lg border-2 p-6 transition-all duration-200 ${
                selectedModule === module.id
                  ? 'border-blue-500 bg-blue-50 shadow-lg'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
              onClick={() => handleModuleSelect(module)}
            >
              <div className="flex items-start space-x-4">
                <div className={`p-3 rounded-full bg-gradient-to-r ${config.color} text-white`}>
                  <IconComponent className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {config.name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    {config.description}
                  </p>
                  
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-gray-700">
                        {config.uploadType === 'mcq' && 'Multiple choice questions'}
                        {config.uploadType === 'sentence' && 'Sentence-based questions'}
                        {config.uploadType === 'paragraph' && 'Paragraph writing prompts'}
                        {config.uploadType === 'technical' && 'Technical questions (Compiler & MCQ)'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-gray-700">
                        {module.question_count || 0} questions uploaded
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {selectedModule === module.id && (
                <div className="absolute top-4 right-4">
                  <CheckCircle className="h-6 w-6 text-blue-500" />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    );
  };

  const renderLevelsSection = () => (
    <div className="space-y-6">
      <div className="flex items-center space-x-4 mb-6">
        <button
          onClick={handleBackToModules}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-800"
        >
          <span>←</span>
          <span>Back to Modules</span>
        </button>
        <div className="text-sm text-gray-500">
          Selected: {getModuleConfig(selectedModule).name}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {levels.map((level) => (
          <motion.div
            key={level.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`relative cursor-pointer rounded-lg border-2 p-6 transition-all duration-200 ${
              selectedLevel === level.id
                ? 'border-blue-500 bg-blue-50 shadow-lg'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
            onClick={() => handleLevelSelect(level)}
          >
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {level.name}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {level.description || `${level.name} level questions`}
              </p>
              
              <div className="space-y-2">
                <div className="flex items-center justify-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-gray-700">
                    {level.question_count || 0} questions
                  </span>
                </div>
              </div>
            </div>
            
            {selectedLevel === level.id && (
              <div className="absolute top-4 right-4">
                <CheckCircle className="h-6 w-6 text-blue-500" />
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );

  const renderUploadSection = () => {
    const moduleConfig = getModuleConfig(selectedModule);
    const level = levels.find(l => l.id === selectedLevel);
    
    if (!level) return null;

    const uploadProps = {
      moduleName: selectedModule,
      levelId: selectedLevel,
      onUploadSuccess: handleUploadSuccess
    };

    switch (moduleConfig.uploadType) {
      case 'mcq':
        return <MCQUpload {...uploadProps} />;
      
      case 'sentence':
        return (
          <SentenceUpload 
            {...uploadProps} 
            moduleType={moduleConfig.moduleType} 
          />
        );
      
      case 'paragraph':
        return <ParagraphUpload {...uploadProps} />;
      
      default:
        return <MCQUpload {...uploadProps} />;
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Versant Upload</h1>
        <p className="text-gray-600">
          Upload questions to the question bank for different versant modules and levels. Each module supports specific question types and formats.
        </p>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center space-x-4 mb-6 text-sm text-gray-600">
        <span className={currentStep === 'modules' ? 'text-blue-600 font-medium' : ''}>
          Select Module
        </span>
        {currentStep !== 'modules' && (
          <>
            <span>→</span>
            <span className={currentStep === 'levels' ? 'text-blue-600 font-medium' : ''}>
              Select Level
            </span>
          </>
        )}
        {currentStep === 'upload' && (
          <>
            <span>→</span>
            <span className="text-blue-600 font-medium">
              Upload Questions
            </span>
          </>
        )}
      </div>

      {/* Content */}
      {currentStep === 'modules' && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">VERSANT SYSTEM - Select a Module</h2>
          {renderModuleCards()}
        </div>
      )}

      {currentStep === 'levels' && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Select a Level</h2>
          {renderLevelsSection()}
        </div>
      )}

             {currentStep === 'upload' && (
         <div>
           <div className="flex items-center space-x-4 mb-6">
             <button
               onClick={handleBackToLevels}
               className="flex items-center space-x-2 text-gray-600 hover:text-gray-800"
             >
               <span>←</span>
               <span>Back to Levels</span>
             </button>
             <div className="text-sm text-gray-500">
               {getModuleConfig(selectedModule).name} - {levels.find(l => l.id === selectedLevel)?.name}
             </div>
           </div>
           
           {/* Tabs */}
           <div className="border-b border-gray-200 mb-6">
             <nav className="-mb-px flex space-x-8">
               <button
                 onClick={() => setCurrentTab('upload')}
                 className={`py-2 px-1 border-b-2 font-medium text-sm ${
                   currentTab === 'upload'
                     ? 'border-blue-500 text-blue-600'
                     : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                 }`}
               >
                 Upload Questions
               </button>
               <button
                 onClick={() => setCurrentTab('manage')}
                 className={`py-2 px-1 border-b-2 font-medium text-sm ${
                   currentTab === 'manage'
                     ? 'border-blue-500 text-blue-600'
                     : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                 }`}
               >
                 Manage Data
               </button>
             </nav>
           </div>
           
           {/* Tab Content */}
           {currentTab === 'upload' && renderUploadSection()}
           {currentTab === 'manage' && (
             <DataManagement 
               moduleName={selectedModule} 
               levelId={selectedLevel} 
             />
           )}
         </div>
       )}
    </div>
  );
};

export default QuestionBankUpload; 