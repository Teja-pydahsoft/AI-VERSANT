import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  FileText, 
  Search, 
  Edit, 
  Trash2, 
  Eye, 
  Download,
  Filter,
  RefreshCw,
  Plus,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import api, { getQuestions, updateQuestion, deleteQuestion, bulkDeleteQuestions } from '../../../services/api';

const DataManagement = ({ moduleName, levelId }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [selectedItems, setSelectedItems] = useState([]);
  const [viewModal, setViewModal] = useState({ open: false, item: null });
  const [editModal, setEditModal] = useState({ open: false, item: null });

  useEffect(() => {
    fetchData();
  }, [moduleName, levelId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await getQuestions(moduleName, levelId);
      
      if (response.data.success) {
        setData(response.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  /** Match backend _normalized_question_bank_text so duplicate rows pair correctly. */
  const normalizeBankTextKey = (item) => {
    let t = (item.question || item.sentence || item.paragraph || '').trim();
    if (!t) return '';
    t = t.replace(/^\uFEFF/, '');
    t = t
      .replace(/\u2019/g, "'")
      .replace(/\u2018/g, "'")
      .replace(/\u201c/g, '"')
      .replace(/\u201d/g, '"');
    t = t.replace(/\s+/g, ' ').trim().toLowerCase();
    return t;
  };

  const duplicateTextCounts = useMemo(() => {
    const counts = new Map();
    for (const item of data) {
      const k = normalizeBankTextKey(item);
      if (!k) continue;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return counts;
  }, [data]);

  const hasDuplicateSameText = (item) => {
    const k = normalizeBankTextKey(item);
    if (!k) return false;
    return (duplicateTextCounts.get(k) || 0) > 1;
  };

  const usedCount = (item) => Number(item?.used_count) || 0;

  const handleDelete = async (item) => {
    const id = item._id;
    const used = usedCount(item);
    const dup = hasDuplicateSameText(item);

    if (used > 0 && dup) {
      if (
        !window.confirm(
          'This row is used in tests, but another bank row has the same text (duplicate). Delete this copy and move test references to the kept row? This cannot be undone.'
        )
      ) {
        return;
      }
      try {
        const response = await deleteQuestion(id, { mergeDuplicate: true });
        if (response.data.success) {
          toast.success(response.data.message || 'Duplicate removed; tests updated.');
          fetchData();
        }
      } catch (error) {
        console.error('Error removing duplicate:', error);
        const msg =
          error.response?.data?.message ||
          error.message ||
          'Failed to remove duplicate';
        toast.error(msg);
      }
      return;
    }

    if (used > 0) {
      toast.error(
        'This question is used in tests. Remove it from those tests first, or ensure another row has the same text to delete as a duplicate.'
      );
      return;
    }

    if (!window.confirm('Are you sure you want to delete this item?')) return;

    try {
      const response = await deleteQuestion(id);
      if (response.data.success) {
        toast.success('Item deleted successfully');
        fetchData();
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      const msg =
        error.response?.data?.message ||
        error.message ||
        'Failed to delete item';
      toast.error(msg);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.length === 0) {
      toast.error('Please select items to delete');
      return;
    }
    
    if (!window.confirm(`Are you sure you want to delete ${selectedItems.length} items?`)) return;
    
    try {
      const response = await bulkDeleteQuestions(selectedItems);
      
      if (response.data.success) {
        toast.success(`${selectedItems.length} items deleted successfully`);
        setSelectedItems([]);
        fetchData();
      }
    } catch (error) {
      console.error('Error bulk deleting items:', error);
      const msg =
        error.response?.data?.message ||
        error.message ||
        'Failed to delete items';
      toast.error(msg);
    }
  };

  const handleEdit = async (updatedItem) => {
    try {
      const response = await updateQuestion(updatedItem._id, updatedItem);
      if (response.data.success) {
        toast.success('Item updated successfully');
        setEditModal({ open: false, item: null });
        fetchData();
      }
    } catch (error) {
      console.error('Error updating item:', error);
      const msg =
        error.response?.data?.message ||
        error.message ||
        'Failed to update item';
      toast.error(msg);
    }
  };

  const getModuleDisplayName = () => {
    const moduleNames = {
      'GRAMMAR': 'Grammar',
      'VOCABULARY': 'Vocabulary', 
      'READING': 'Reading',
      'LISTENING': 'Listening',
      'SPEAKING': 'Speaking',
      'WRITING': 'Writing'
    };
    return moduleNames[moduleName] || moduleName;
  };

  // Check if this is an MCQ module (Grammar, Vocabulary, Reading)
  const isMCQModule = ['GRAMMAR', 'VOCABULARY', 'READING'].includes(moduleName);
  
  // Check if this is an audio module (Listening, Speaking)
  const isAudioModule = ['LISTENING', 'SPEAKING'].includes(moduleName);

  const filteredData = data.filter(item => {
    const matchesSearch = item.question?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.sentence?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.paragraph?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Only apply status filter for audio modules
    const matchesFilter = !isAudioModule || filterType === 'all' || item.status === filterType;
    
    return matchesSearch && matchesFilter;
  });

  const deletableFilteredIds = filteredData
    .filter((item) => usedCount(item) === 0)
    .map((item) => item._id);
  const allDeletableSelected =
    deletableFilteredIds.length > 0 &&
    deletableFilteredIds.every((id) => selectedItems.includes(id));

  const renderItemContent = (item) => {
    if (item.question) {
      // Get options from individual fields for MCQ questions
      const options = [];
      if (item.optionA) options.push(`A: ${item.optionA}`);
      if (item.optionB) options.push(`B: ${item.optionB}`);
      if (item.optionC) options.push(`C: ${item.optionC}`);
      if (item.optionD) options.push(`D: ${item.optionD}`);
      
      return (
        <div className="space-y-2">
          <div><strong>Question:</strong> {item.question}</div>
          {options.length > 0 && (
            <div><strong>Options:</strong> {options.join(', ')}</div>
          )}
          {(item.answer || item.correct_answer) && (
            <div><strong>Correct Answer:</strong> {item.answer || item.correct_answer}</div>
          )}
        </div>
      );
    } else if (item.sentence) {
      return (
        <div className="space-y-2">
          <div><strong>Sentence:</strong> {item.sentence}</div>
          {item.instructions && (
            <div><strong>Instructions:</strong> {item.instructions}</div>
          )}
        </div>
      );
    } else if (item.paragraph) {
      return (
        <div className="space-y-2">
          <div><strong>Topic:</strong> {item.topic}</div>
          <div><strong>Paragraph:</strong> {item.paragraph.substring(0, 200)}...</div>
        </div>
      );
    }
    return <div>No content available</div>;
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {getModuleDisplayName()} - Data Management
        </h2>
        <p className="text-gray-600">
          Manage uploaded questions for {getModuleDisplayName()} module at {levelId} level
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search questions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
                         {isAudioModule && (
               <select
                 value={filterType}
                 onChange={(e) => setFilterType(e.target.value)}
                 className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
               >
                 <option value="all">All Items</option>
                 <option value="active">Active</option>
                 <option value="inactive">Inactive</option>
               </select>
             )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={fetchData}
              className="flex items-center space-x-2 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </button>
            
            {selectedItems.length > 0 && (
              <button
                onClick={handleBulkDelete}
                className="flex items-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete Selected ({selectedItems.length})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Loading data...</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No data found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                           <input
                         type="checkbox"
                         checked={allDeletableSelected}
                         onChange={(e) => {
                           if (e.target.checked) {
                             setSelectedItems(
                               filteredData
                                 .filter((item) => (item.used_count ?? 0) === 0)
                                 .map((item) => item._id)
                             );
                           } else {
                             setSelectedItems([]);
                           }
                         }}
                         className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                       />
                  </th>
                                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                     Content
                   </th>
                   {isAudioModule && (
                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                       Status
                     </th>
                   )}
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                     Created
                   </th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                     In tests
                   </th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                     Actions
                   </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.map((item) => (
                  <motion.tr
                    key={item._id || item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-gray-50"
                  >
                                         <td className="px-6 py-4 whitespace-nowrap">
                       <input
                         type="checkbox"
                         disabled={usedCount(item) > 0}
                         title={
                           usedCount(item) > 0
                             ? 'In use by tests; cannot bulk-delete'
                             : undefined
                         }
                         checked={selectedItems.includes(item._id)}
                         onChange={(e) => {
                           if (e.target.checked) {
                             setSelectedItems([...selectedItems, item._id]);
                           } else {
                             setSelectedItems(selectedItems.filter(id => id !== item._id));
                           }
                         }}
                         className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                       />
                     </td>
                                         <td className="px-6 py-4">
                       <div className="max-w-md truncate">
                         {item.question || item.sentence || item.paragraph?.substring(0, 100) || 'No content'}
                       </div>
                     </td>
                     {isAudioModule && (
                       <td className="px-6 py-4 whitespace-nowrap">
                         <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                           item.status === 'active' 
                             ? 'bg-green-100 text-green-800' 
                             : 'bg-gray-100 text-gray-800'
                         }`}>
                           {item.status || 'active'}
                         </span>
                       </td>
                     )}
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                       {new Date(item.created_at || item.uploaded_at).toLocaleDateString()}
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                       {usedCount(item) > 0 ? (
                         <span title="Used in tests. If another row has the same text, Delete will remove this duplicate and reassign tests.">
                           {usedCount(item)}
                         </span>
                       ) : (
                         <span className="text-gray-400">0</span>
                       )}
                     </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setViewModal({ open: true, item })}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditModal({ open: true, item })}
                          className="text-green-600 hover:text-green-900"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          disabled={usedCount(item) > 0 && !hasDuplicateSameText(item)}
                          title={
                            usedCount(item) > 0
                              ? hasDuplicateSameText(item)
                                ? 'Delete duplicate: tests will point to the other row with the same text'
                                : 'Cannot delete: used in tests (no duplicate row with same text)'
                              : 'Delete'
                          }
                          className={
                            usedCount(item) > 0 && !hasDuplicateSameText(item)
                              ? 'text-gray-300 cursor-not-allowed'
                              : 'text-red-600 hover:text-red-900'
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View Modal */}
      {viewModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">View Item Details</h3>
              <button
                onClick={() => setViewModal({ open: false, item: null })}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              {renderItemContent(viewModal.item)}
                             <div className="text-sm text-gray-500">
                 <div><strong>ID:</strong> {viewModal.item._id}</div>
                 <div><strong>Used in tests:</strong> {viewModal.item.used_count ?? 0}</div>
                 {isAudioModule && (
                   <div><strong>Status:</strong> {viewModal.item.status || 'active'}</div>
                 )}
                 <div><strong>Created:</strong> {new Date(viewModal.item.created_at || viewModal.item.uploaded_at).toLocaleString()}</div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Edit Item</h3>
              <button
                onClick={() => setEditModal({ open: false, item: null })}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
                         <EditForm 
               item={editModal.item} 
               moduleName={moduleName}
               onSave={handleEdit}
               onCancel={() => setEditModal({ open: false, item: null })}
             />
          </div>
        </div>
      )}
    </div>
  );
};

// Edit Form Component
const EditForm = ({ item, moduleName, onSave, onCancel }) => {
  // Helper function to get options from individual option fields
  const getOptionsFromFields = (item) => {
    const options = [];
    if (item.optionA) options.push(item.optionA);
    if (item.optionB) options.push(item.optionB);
    if (item.optionC) options.push(item.optionC);
    if (item.optionD) options.push(item.optionD);
    return options;
  };

  // Helper function to get correct answer from answer field
  const getCorrectAnswer = (item) => {
    return item.answer || item.correct_answer || '';
  };

  // Debug: Log the item data to see the structure
  console.log('EditForm - Item data:', item);
  console.log('EditForm - Item options fields:', {
    optionA: item.optionA,
    optionB: item.optionB,
    optionC: item.optionC,
    optionD: item.optionD
  });

  const [formData, setFormData] = useState({
    question: item.question || '',
    sentence: item.sentence || '',
    paragraph: item.paragraph || '',
    topic: item.topic || '',
    options: getOptionsFromFields(item),
    correct_answer: getCorrectAnswer(item),
    instructions: item.instructions || '',
    status: item.status || 'active'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // For MCQ modules, convert options array back to individual fields
    let updatedData = { ...item, ...formData, _id: item._id };
    
    if (isMCQModule && formData.options.length >= 4) {
      updatedData = {
        ...updatedData,
        optionA: formData.options[0] || '',
        optionB: formData.options[1] || '',
        optionC: formData.options[2] || '',
        optionD: formData.options[3] || '',
        answer: formData.correct_answer || '',
        // Remove the options array since we're using individual fields
        options: undefined
      };
    }
    
    onSave(updatedData);
  };

  // Check if this is an MCQ module (Grammar, Vocabulary, Reading)
  const isMCQModule = ['GRAMMAR', 'VOCABULARY', 'READING'].includes(moduleName);
  
  // Check if this is an audio module (Listening, Speaking)
  const isAudioModule = ['LISTENING', 'SPEAKING'].includes(moduleName);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {item.question && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Question</label>
          <textarea
            value={formData.question}
            onChange={(e) => setFormData({ ...formData, question: e.target.value })}
            className="w-full p-2 border border-gray-300 rounded-lg"
            rows={3}
          />
        </div>
      )}

      {item.sentence && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Sentence</label>
          <textarea
            value={formData.sentence}
            onChange={(e) => setFormData({ ...formData, sentence: e.target.value })}
            className="w-full p-2 border border-gray-300 rounded-lg"
            rows={3}
          />
        </div>
      )}

      {item.paragraph && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Topic</label>
            <input
              type="text"
              value={formData.topic}
              onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Paragraph</label>
            <textarea
              value={formData.paragraph}
              onChange={(e) => setFormData({ ...formData, paragraph: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded-lg"
              rows={5}
            />
          </div>
        </>
      )}

             {/* Show options for MCQ modules */}
       {isMCQModule && (
         <div>
           <label className="block text-sm font-medium text-gray-700 mb-2">Options (comma-separated)</label>
           <input
             type="text"
             value={formData.options.join(', ')}
             onChange={(e) => setFormData({ ...formData, options: e.target.value.split(',').map(s => s.trim()).filter(s => s) })}
             className="w-full p-2 border border-gray-300 rounded-lg"
             placeholder="Option A, Option B, Option C, Option D"
           />
           <p className="text-xs text-gray-500 mt-1">
             Current options: {formData.options.length > 0 ? formData.options.join(', ') : 'No options set'}
           </p>
         </div>
       )}

      {/* Show correct answer for MCQ modules */}
      {isMCQModule && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Correct Answer</label>
          <input
            type="text"
            value={formData.correct_answer}
            onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
            className="w-full p-2 border border-gray-300 rounded-lg"
            placeholder="Enter the correct answer"
          />
        </div>
      )}

      {/* Show status only for audio modules */}
      {isAudioModule && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            className="w-full p-2 border border-gray-300 rounded-lg"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      )}

      <div className="flex justify-end space-x-2 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Save Changes
        </button>
      </div>
    </form>
  );
};

export default DataManagement; 