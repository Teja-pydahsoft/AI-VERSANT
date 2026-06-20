import React, { useState, useEffect } from 'react';
import { FileText, CheckCircle, AlertCircle, Clock, ArrowRight, X } from 'lucide-react';
import { useFormPortal } from '../../contexts/FormPortalContext';
import FormSubmission from '../../pages/student/FormSubmission';

const FormPortalPopup = () => {
  const {
    availableForms,
    getIncompleteRequiredForms,
    getIncompleteForms, // NEW: Get all incomplete forms
    hasIncompleteRequiredForms,
    hasIncompleteForms, // NEW: Check if any forms are incomplete
    getFormCompletionPercentage,
    loading,
    refreshForms
  } = useFormPortal();

  const [formQueue, setFormQueue] = useState([]);
  const [currentFormIndex, setCurrentFormIndex] = useState(0);
  const [selectedForm, setSelectedForm] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Initialize form queue when forms are loaded
  useEffect(() => {
    if (!loading && availableForms.length > 0) {
      const incompleteForms = getIncompleteForms(); // Use ALL incomplete forms
      setFormQueue(incompleteForms);
      setCurrentFormIndex(0);
      
      // Show first form if there are incomplete forms
      if (incompleteForms.length > 0) {
        setSelectedForm(incompleteForms[0]);
        setShowFormModal(true);
      } else {
        // No incomplete forms, close modal
        setShowFormModal(false);
        setSelectedForm(null);
      }
    }
  }, [loading, availableForms, getIncompleteForms]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
          <p className="text-center text-gray-600 mt-4">Loading forms...</p>
        </div>
      </div>
    );
  }

  // Don't show popup if no incomplete forms (required or optional) or user dismissed
  if (dismissed || !hasIncompleteForms() || formQueue.length === 0) {
    return null;
  }

  const handleFormClick = (form) => {
    setSelectedForm(form);
    setShowFormModal(true);
  };

  const handleFormComplete = async () => {
    setIsProcessing(true);
    
    // Get updated incomplete forms immediately (using updated context state)
    const updatedIncompleteForms = getIncompleteForms(); // Use ALL incomplete forms
    
    // Update form queue with fresh data
    setFormQueue(updatedIncompleteForms);
    
    // Move to next form in queue
    const nextIndex = currentFormIndex + 1;
    
    if (nextIndex < updatedIncompleteForms.length) {
      // Show next form
      setCurrentFormIndex(nextIndex);
      setSelectedForm(updatedIncompleteForms[nextIndex]);
      setShowFormModal(true);
    } else {
      // All forms completed
      setShowFormModal(false);
      setSelectedForm(null);
      setFormQueue([]);
      setCurrentFormIndex(0);
    }
    
    // Refresh forms in background for next time
    refreshForms();
    
    setIsProcessing(false);
  };

  const getCurrentForm = () => {
    return formQueue[currentFormIndex] || null;
  };

  const getProgressInfo = () => {
    return {
      current: currentFormIndex + 1,
      total: formQueue.length,
      percentage: Math.round(((currentFormIndex + 1) / formQueue.length) * 100)
    };
  };

  const currentForm = getCurrentForm();
  const progress = getProgressInfo();

  if (!currentForm) {
    return null;
  }

  const handleDismiss = () => {
    setShowFormModal(false);
    setSelectedForm(null);
    setDismissed(true);
  };

  return (
    <>
      {/* Backdrop with Soft Blur */}
      <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm z-40" />
      
      {/* Form Submission Modal with Soft Design */}
      {showFormModal && currentForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2">
          <div className="bg-white rounded-2xl max-w-7xl w-full max-h-[98vh] overflow-y-auto shadow-2xl border border-gray-100">
            {/* Header with Soft Progress Design */}
            <div className="sticky top-0 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-100 px-6 py-4 z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mr-3 shadow-lg">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">
                      Form {progress.current} of {progress.total}
                    </h2>
                    <p className="text-gray-600 text-sm">
                      Please complete this form to continue
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-base font-bold text-blue-600">
                      {progress.current} / {progress.total}
                    </div>
                    <div className="text-xs text-gray-500">
                      {progress.percentage}% Complete
                    </div>
                  </div>
                  {/* Close button */}
                  <button
                    onClick={handleDismiss}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-600 text-gray-500 transition-colors duration-150"
                    title="Close"
                    aria-label="Close form popup"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              {/* Enhanced Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2 shadow-inner">
                <div
                  className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-500 ease-out shadow-sm"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
            </div>

            {/* Form Content with Soft Padding */}
            <div className="p-4">
              <FormSubmission
                formId={currentForm._id}
                onComplete={handleFormComplete}
                isProcessing={isProcessing}
                showProgress={false} // We handle progress in header
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FormPortalPopup;
