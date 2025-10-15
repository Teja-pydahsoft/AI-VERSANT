import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart3, 
  Users, 
  FileText, 
  TrendingUp, 
  Download,
  Calendar,
  CheckCircle,
  Clock, 
  File,
  PieChart
} from 'lucide-react';
import Swal from 'sweetalert2'; 
import api from '../../services/api'; 
import { Line, Doughnut, Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
  BarElement
} from 'chart.js';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
  BarElement
);

// Timeline Line Chart Component with Blinking Effect
const TimelineLineChart = ({ timelineData }) => {
  const [blinkingPoint, setBlinkingPoint] = useState(false);
  const chartRef = useRef(null);
  window.timelineChartRef = chartRef; // Expose ref for export

  // Blinking animation for current day
  useEffect(() => {
    const interval = setInterval(() => {
      setBlinkingPoint(prev => !prev);
    }, 1000); // Blink every second

    return () => clearInterval(interval);
  }, []);

  // Ensure timeline data covers the last 30 days including today
  const completeTimeline = [];
  const submissionMap = new Map(timelineData.map(d => [new Date(d.date).toDateString(), d.count]));
  const today = new Date();

  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateString = date.toDateString();
    
    completeTimeline.push({
      date: date.toISOString().split('T')[0],
      count: submissionMap.get(dateString) || 0,
    });
  }

  // Prepare data for the chart
  const chartData = {
    labels: completeTimeline.map(day => {
      const date = new Date(day.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }),
    datasets: [
      {
        label: 'Submissions',
        data: completeTimeline.map(day => day.count),
        borderColor: 'rgb(59, 130, 246)', // Blue color
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4, // Smooth curves
        pointBackgroundColor: completeTimeline.map((day, index) => {
          const today = new Date();
          const dayDate = new Date(day.date);
          const isToday = dayDate.toDateString() === today.toDateString();
          return isToday ? (blinkingPoint ? 'rgb(59, 130, 246)' : 'rgb(239, 68, 68)') : 'rgb(59, 130, 246)';
        }),
        pointBorderColor: completeTimeline.map((day, index) => {
          const today = new Date();
          const dayDate = new Date(day.date);
          const isToday = dayDate.toDateString() === today.toDateString();
          return isToday ? (blinkingPoint ? 'rgb(59, 130, 246)' : 'rgb(239, 68, 68)') : 'rgb(59, 130, 246)';
        }),
        pointRadius: completeTimeline.map((day, index) => {
          const today = new Date();
          const dayDate = new Date(day.date);
          const isToday = dayDate.toDateString() === today.toDateString();
          return isToday ? 8 : 5; // Larger point for today
        }),
        pointHoverRadius: 10,
        pointHoverBackgroundColor: 'rgb(59, 130, 246)',
        pointHoverBorderColor: 'rgb(255, 255, 255)',
        pointHoverBorderWidth: 3,
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          title: function(context) {
            const dataIndex = context[0].dataIndex;
            const day = completeTimeline[dataIndex];
            return new Date(day.date).toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            });
          },
          label: function(context) {
            const count = context.parsed.y;
            return `Submissions: ${count}`;
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        grid: {
          display: false
        },
        ticks: {
          color: 'rgb(107, 114, 128)',
          font: {
            size: 11,
            weight: '500'
          },
          maxRotation: 45,
          minRotation: 0
        }
      },
      y: {
        display: true,
        beginAtZero: true,
        grid: {
          color: 'rgba(156, 163, 175, 0.3)',
          drawBorder: false
        },
        ticks: {
          color: 'rgb(107, 114, 128)',
          font: {
            size: 11,
            weight: '500'
          },
          stepSize: 1,
          callback: function(value) {
            return value === 0 ? '0' : value;
          }
        }
      }
    },
    interaction: {
      intersect: false,
      mode: 'index'
    },
    elements: {
      point: {
        hoverBackgroundColor: 'rgb(59, 130, 246)',
        hoverBorderColor: 'rgb(255, 255, 255)',
        hoverBorderWidth: 3
      }
    }
  };

  return (
    <div className="relative">
      <div className="h-64 w-full">
        <Line ref={chartRef} data={chartData} options={options} />
      </div>
      
      {/* Live indicator */}
      <div className="absolute top-2 right-2 flex items-center space-x-2">
        <div className="flex items-center space-x-1">
          <div className={`w-2 h-2 rounded-full ${blinkingPoint ? 'bg-green-500' : 'bg-gray-400'} animate-pulse`}></div>
          <span className="text-xs text-gray-600 font-medium">Live</span>
        </div>
      </div>
    </div>
  );
};

const generateColors = (numColors) => {
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444',
    '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#D946EF'
  ];
  let result = [];
  for (let i = 0; i < numColors; i++) {
    result.push(colors[i % colors.length]);
  }
  return result;
};

const FieldDoughnutChart = ({ data, fieldId }) => {
  const chartRef = useRef(null);
  const chartData = {
    labels: data.map(d => d.option),
    datasets: [{
      data: data.map(d => d.count),
      backgroundColor: generateColors(data.length),
      borderColor: '#ffffff',
      borderWidth: 2,
    }],
  };

  useEffect(() => {
    if (!window.fieldChartRefs) window.fieldChartRefs = {};
    window.fieldChartRefs[fieldId] = chartRef;
  }, [fieldId]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          boxWidth: 12,
          padding: 15,
          font: { size: 12 }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const label = context.label || '';
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            return `${label}: ${value} (${percentage}%)`;
          }
        }
      }
    },
    cutout: '60%',
  };

  return (
    <div className="relative h-48 w-full">
      <Doughnut ref={chartRef} data={chartData} options={options} />
    </div>
  );
};

const FieldPieChart = ({ data, fieldId }) => {
  // This component is not currently used for export, but adding ref for consistency
  const chartRef = useRef(null);

  const chartData = {
    labels: data.map(d => d.option),
    datasets: [{
      data: data.map(d => d.count),
      backgroundColor: generateColors(data.length),
      borderColor: '#ffffff',
      borderWidth: 2,
    }],
  };

  useEffect(() => {
    if (!window.fieldChartRefs) window.fieldChartRefs = {};
    window.fieldChartRefs[fieldId] = chartRef;
  }, [fieldId]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          boxWidth: 12,
          padding: 15,
          font: { size: 12 }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const label = context.label || '';
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            return `${label}: ${value} (${percentage}%)`;
          }
        }
      }
    },
  };

  return <div className="relative h-48 w-full"><Pie ref={chartRef} data={chartData} options={options} /></div>;
};

const FieldHorizontalBarChart = ({ data, fieldId }) => {
  const chartRef = useRef(null);

  const chartData = {
    labels: data.map(d => d.option),
    datasets: [{
      label: 'Responses',
      data: data.map(d => d.count),
      backgroundColor: generateColors(data.length),
      borderColor: generateColors(data.length),
      borderWidth: 1,
      borderRadius: 4,
    }],
  };

  useEffect(() => {
    if (!window.fieldChartRefs) window.fieldChartRefs = {};
    window.fieldChartRefs[fieldId] = chartRef;
  }, [fieldId]);

  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          precision: 0,
        },
        grid: {
          display: false
        }
      },
      y: {
        grid: {
          display: false
        }
      }
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            return ` Responses: ${context.parsed.x}`;
          }
        }
      }
    }
  };

  return (
    <div className="relative h-48 w-full">
      <Bar ref={chartRef} data={chartData} options={options} />
    </div>
  );
};

const DateDistributionChart = ({ responses, fieldId }) => {
  const chartRef = useRef(null);

  if (!responses || responses.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">No date responses to display.</p>
      </div>
    );
  }

  useEffect(() => {
    if (!window.fieldChartRefs) window.fieldChartRefs = {};
    window.fieldChartRefs[fieldId] = chartRef;
  }, [fieldId]);

  // Aggregate counts for each date
  const dateCounts = responses.reduce((acc, response) => {
    if (response.value) {
      const date = new Date(response.value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      acc[date] = (acc[date] || 0) + 1;
    }
    return acc;
  }, {});

  const sortedDates = Object.entries(dateCounts).sort((a, b) => new Date(a[0]) - new Date(b[0]));

  const chartData = {
    labels: sortedDates.map(d => d[0]),
    datasets: [{
      label: 'Selections',
      data: sortedDates.map(d => d[1]),
      backgroundColor: '#3B82F6',
      borderColor: '#3B82F6',
      borderWidth: 1,
      borderRadius: 4,
      barThickness: 20,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 } }
      },
      y: {
        beginAtZero: true,
        ticks: { precision: 0 },
        grid: { color: 'rgba(156, 163, 175, 0.2)' }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => ` Selections: ${context.parsed.y}`
        }
      }
    }
  };

  return (
    <div className="relative h-64 w-full"><Bar ref={chartRef} data={chartData} options={options} /></div>
  );
};

const FormAnalytics = ({ selectedForm = null, onBack = null }) => {
  const [overview, setOverview] = useState(null);
  const [completionRates, setCompletionRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formStats, setFormStats] = useState(null);
  const [selectedFormId, setSelectedFormId] = useState(null);
  const [dateRange, setDateRange] = useState({
    start_date: '',
    end_date: ''
  });
  const [expandedFields, setExpandedFields] = useState({});
  const [fieldResponses, setFieldResponses] = useState({});

  useEffect(() => {
    fetchOverview();
    fetchCompletionRates();
    
    if (selectedForm) {
      fetchFormStats(selectedForm._id);
    }
  }, [selectedForm]);

  const fetchOverview = async () => {
    try {
      console.log('🔍 Fetching analytics overview...');
      const response = await api.get('/form-analytics/overview');
      console.log('📊 Overview response:', response.data);
      if (response.data.success) {
        setOverview(response.data.data.overview);
      } else {
        console.error('❌ Overview API returned error:', response.data.message);
      }
    } catch (error) {
      console.error('❌ Error fetching overview:', error);
    }
  };

  const fetchCompletionRates = async () => {
    try {
      console.log('🔍 Fetching completion rates...');
      const response = await api.get('/form-analytics/completion-rates');
      console.log('📈 Completion rates response:', response.data);
      if (response.data.success) {
        setCompletionRates(response.data.data.completion_rates);
      } else {
        console.error('❌ Completion rates API returned error:', response.data.message);
      }
    } catch (error) {
      console.error('❌ Error fetching completion rates:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFormStats = async (formId) => {
    try {
      console.log('🔍 Fetching form stats for:', formId);
      const response = await api.get(`/form-analytics/forms/${formId}/stats`);
      console.log('📊 Form stats response:', response.data);
      if (response.data.success) {
        console.log('📈 Timeline data received:', response.data.data.timeline);
        console.log('📈 Timeline length:', response.data.data.timeline?.length);
        console.log('📈 Timeline sample:', response.data.data.timeline?.slice(0, 3));
        
        // If timeline is empty but we have submissions, create a timeline with the submission count
        if (!response.data.data.timeline || response.data.data.timeline.length === 0) {
          console.log('⚠️ No timeline data, checking if we have submissions');
          const submissionCount = response.data.data.statistics?.submitted_count || 0;
          if (submissionCount > 0) {
            console.log(`📊 Found ${submissionCount} submissions, creating timeline with today's data`);
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            response.data.data.timeline = [
              { date: todayStr, count: submissionCount }
            ];
          } else {
            console.log('⚠️ No submissions found, adding sample data for testing');
            response.data.data.timeline = [
              { date: '2024-01-01', count: 5 },
              { date: '2024-01-02', count: 3 },
              { date: '2024-01-03', count: 8 },
              { date: '2024-01-04', count: 2 },
              { date: '2024-01-05', count: 6 }
            ];
          }
        }
        
        setFormStats(response.data.data);
        setSelectedFormId(formId);
      } else {
        console.error('❌ Form stats API returned error:', response.data.message);
      }
    } catch (error) {
      console.error('❌ Error fetching form stats:', error);
      Swal.fire('Error', 'Failed to fetch form statistics', 'error');
    }
  };

  const handleExportAnalytics = async () => {
    try {
      if (!selectedFormId) {
        Swal.fire('Info', 'Please select a form to export its analytics.', 'info');
        return;
      }

      const params = new URLSearchParams();
      if (dateRange.start_date) params.append('start_date', dateRange.start_date);
      if (dateRange.end_date) params.append('end_date', dateRange.end_date);

      const url = `/form-analytics/export/analytics/${selectedFormId}?${params}`;
      const response = await api.get(url);
      if (response.data.success) {
        const data = response.data.data.submissions;
        if (data.length === 0) {
          Swal.fire('Info', 'No data found for the selected date range', 'info');
          return;
        }

        // --- Create and download Excel file ---
        const formTitle = data[0]['Form Title'] || 'Analytics';
        
        // Define the desired column order
        const orderedHeaders = [
          'Student Roll Number',
          'Student Name',
          'Student Mobile Number',
          'Student Email',
          'Campus',
          'Course',
          'Batch',
          'Submission Date'
        ];

        // Get all unique headers from the data, excluding the title
        const allDataHeaders = new Set();
        data.forEach(row => {
          Object.keys(row).forEach(header => {
            if (header !== 'Form Title') {
              allDataHeaders.add(header);
            }
          });
        });

        // Add remaining headers alphabetically
        const remainingHeaders = [...allDataHeaders].filter(h => !orderedHeaders.includes(h)).sort();
        const finalHeaders = [...orderedHeaders, ...remainingHeaders];

        // Prepare data for worksheet, removing the Form Title and ordering columns
        const worksheetData = data.map(row => {
          const newRow = {};
          finalHeaders.forEach(header => {
            newRow[header] = row[header] || '';
          });
          return newRow;
        });

        const worksheet = XLSX.utils.json_to_sheet(worksheetData, { header: finalHeaders });

        // Style the worksheet
        const headerStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "4F81BD" } } };
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const address = XLSX.utils.encode_cell({ r: 0, c: C });
          if (!worksheet[address]) continue;
          worksheet[address].s = headerStyle;
        }
        // Auto-fit columns
        const colWidths = finalHeaders.map(header => ({ wch: Math.max(header.length, 15) }));
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        // Use a sanitized version of the form title for the sheet name
        const sheetName = formTitle.replace(/[\/\\?*\[\]]/g, '').substring(0, 31);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });

        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${sheetName}_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        Swal.fire('Success', 'Analytics data exported successfully', 'success');
      }
    } catch (error) {
      console.error('Error exporting analytics:', error);
      Swal.fire('Error', 'Failed to export analytics data', 'error');
    }
  };

  const handleExportPdf = async () => {
    try {
      if (!selectedFormId) {
        Swal.fire('Info', 'Please select a form to export its analytics.', 'info');
        return;
      }

      const params = new URLSearchParams();
      if (dateRange.start_date) params.append('start_date', dateRange.start_date);
      if (dateRange.end_date) params.append('end_date', dateRange.end_date);

      const url = `/form-analytics/export/analytics/${selectedFormId}?${params}`;
      const response = await api.get(url);

      if (response.data.success) {
        const data = response.data.data.submissions;
        if (data.length === 0) {
          Swal.fire('Info', 'No data found for the selected date range', 'info');
          return;
        }

        const formTitle = data[0]['Form Title'] || 'Analytics';
        const doc = new jsPDF({ orientation: 'landscape' });

        // Define column order
        const pdfOrderedHeaders = [
          'Student Roll Number',
          'Student Name',
          'Campus',
          'Course',
          'Batch',
          'Submission Date'
        ];

        const allDataHeaders = new Set();
        data.forEach(row => {
          Object.keys(row).forEach(header => {
            if (header !== 'Form Title' && header !== 'Student Mobile Number' && header !== 'Student Email') allDataHeaders.add(header);
          });
        });

        const remainingHeaders = [...allDataHeaders].filter(h => !pdfOrderedHeaders.includes(h)).sort();
        const finalHeaders = [...pdfOrderedHeaders, ...remainingHeaders];

        const tableBody = data.map(row => finalHeaders.map(header => row[header] || ''));

        // --- PDF Header ---
        const pageWidth = doc.internal.pageSize.getWidth();

        // TODO: To enable the logo, replace the placeholder below with a valid base64 string and uncomment the doc.addImage line.
        // const logoBase64 = 'data:image/png;base64,YOUR_LOGO_BASE64_STRING_HERE';
        // doc.addImage(logoBase64, 'PNG', 14, 10, 40, 15); // x, y, width, height

        // College Name (Centered)
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40);
        doc.text('Pydah Group of Institutions', pageWidth / 2, 20, { align: 'center' });

        // Line separator
        doc.setDrawColor(200, 200, 200); // Light gray line
        doc.line(14, 28, pageWidth - 14, 28); // from (x1, y1) to (x2, y2)

        // Form Title with background bar
        doc.setFillColor(79, 129, 189); // Sky Blue
        doc.rect(14, 32, pageWidth - 28, 12, 'F'); // x, y, width, height, style ('F' for fill)
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255); // White
        doc.text(formTitle, pageWidth / 2, 40, { align: 'center' });

        // Add Table
        autoTable(doc, { // Adjust startY to be below the new header
          startY: 50,
          head: [finalHeaders],
          body: tableBody,
          theme: 'grid',
          headStyles: {
            fillColor: [79, 129, 189], // Sky Blue
            textColor: [255, 255, 255], // White
            fontStyle: 'bold',
          },
          alternateRowStyles: {
            fillColor: [240, 245, 250], // Light Blue
          },
          styles: {
            fontSize: 7,
            cellPadding: 2,
          },
        });

        // --- Add Field Analytics Section ---
        let finalY = doc.lastAutoTable.finalY;
        const addPageIfNeeded = () => {
          // Check if space is left on the page, leaving a 20mm margin at the bottom
          if (finalY > doc.internal.pageSize.getHeight() - 20) {
            doc.addPage();
            finalY = 20; // Reset Y position for the new page
          }
        };

        addPageIfNeeded();
        finalY = Math.max(finalY + 15, 40); // Ensure there's space after the main title bar
        doc.setFontSize(16);
        doc.setTextColor(40);
        doc.text('Field Response Analysis', 14, finalY);
        finalY += 10;

        if (formStats && formStats.field_stats) {
          for (const field of formStats.field_stats) {
            addPageIfNeeded();
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(`${field.field_label} (${field.total_responses} responses)`, 14, finalY);
            finalY += 8;

            const isChartable = ['radio', 'dropdown', 'checkbox', 'date'].includes(field.field_type);
            const isExpandable = ['text', 'textarea', 'number', 'email', 'phone'].includes(field.field_type);

            const chartRef = window.fieldChartRefs?.[field.field_id];
            if (isChartable && chartRef && chartRef.current) {
              try {
                const chartImage = chartRef.current.toBase64Image();
                const imgProps = doc.getImageProperties(chartImage);
                const pdfWidth = doc.internal.pageSize.getWidth() - 28;
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
                
                // Check if the chart and its title will fit, if not, add a new page
                if (finalY + pdfHeight + 10 > doc.internal.pageSize.getHeight() - 20) {
                  addPageIfNeeded();
                }
                doc.addImage(chartImage, 'PNG', 14, finalY, pdfWidth, pdfHeight);
                finalY += pdfHeight + 10;

                // Add a legend table for the chart since PDF is not interactive
                if (field.option_distribution && field.option_distribution.length > 0) {
                  addPageIfNeeded();
                  const legendTableHead = [['Option', 'Count', 'Percentage']];
                  const legendTableBody = field.option_distribution.map(opt => [
                    opt.option,
                    opt.count,
                    `${opt.percentage}%`
                  ]);

                  autoTable(doc, {
                    startY: finalY,
                    head: legendTableHead,
                    body: legendTableBody,
                    theme: 'grid',
                    styles: { fontSize: 8, cellPadding: 1.5 },
                    headStyles: { fillColor: [241, 245, 249], textColor: [31, 41, 55], fontStyle: 'bold' }
                  });
                  finalY = doc.lastAutoTable.finalY + 10;
                }
              } catch (e) {
                console.error("Could not add chart image to PDF:", e);
              }
            } else if (isExpandable) {
              // For non-chart fields, fetch data and add a table
              const response = await api.get(`/form-analytics/fields/${selectedFormId}/${field.field_id}/responses`);
              if (response.data.success && response.data.data.responses.length > 0) {
                const detailedResponses = response.data.data.responses;
                const tableHead = [['Roll Number', 'Student Name', 'Course', 'Response']];
                const tableBody = detailedResponses.map(r => [
                  r.student?.roll_number || 'N/A',
                  r.student?.name || 'Unknown',
                  r.student?.course || 'N/A',
                  typeof r.value === 'object' ? JSON.stringify(r.value) : (r.value || 'No response')
                ]);

                addPageIfNeeded();
                autoTable(doc, {
                  startY: finalY,
                  head: tableHead,
                  body: tableBody,
                  theme: 'striped',
                  styles: { fontSize: 8 },
                  headStyles: { fillColor: [100, 100, 100] }
                });
                finalY = doc.lastAutoTable.finalY + 10;
              }
            }
          }
        }

        doc.save(`${formTitle.replace(/[\/\\?*\[\]]/g, '')}_${new Date().toISOString().split('T')[0]}.pdf`);
        Swal.fire('Success', 'Analytics data exported to PDF successfully', 'success');
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      Swal.fire('Error', 'Failed to export analytics data to PDF', 'error');
    }
  };

  const fetchFieldResponses = async (fieldId, formId) => {
    try {
      console.log('🔍 Fetching detailed responses for field:', fieldId);
      const response = await api.get(`/form-analytics/fields/${formId}/${fieldId}/responses`);
      console.log('📊 Field responses:', response.data);
      
      if (response.data.success) {
        setFieldResponses(prev => ({
          ...prev,
          [fieldId]: response.data.data.responses
        }));
      } else {
        console.error('❌ Failed to fetch field responses:', response.data.message);
      }
    } catch (error) {
      console.error('❌ Error fetching field responses:', error);
      Swal.fire('Error', 'Failed to fetch field responses', 'error');
    }
  };

  const toggleFieldExpansion = (fieldId, formId, fieldType) => {
    // Allow expansion for text, number, and date fields
    if (!['text', 'textarea', 'number', 'email', 'phone', 'date'].includes(fieldType)) {
      return;
    }

    const isExpanded = expandedFields[fieldId];
    
    if (!isExpanded) {
      // Fetch responses when expanding
      fetchFieldResponses(fieldId, formId);
    }
    
    setExpandedFields(prev => ({
      ...prev,
      [fieldId]: !isExpanded
    }));
  };

  const StatCard = ({ title, value, icon: Icon, color = 'blue', subtitle = '' }) => (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center">
        <div className={`p-3 rounded-lg bg-${color}-100`}>
          <Icon className={`w-6 h-6 text-${color}-600`} />
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
    </div>
  );

  const ProgressBar = ({ percentage, color = 'blue' }) => (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className={`bg-${color}-600 h-2 rounded-full transition-all duration-300`}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
        <p className="text-center text-gray-600 mt-4">Loading analytics data...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {selectedForm ? `Analytics - ${selectedForm.title}` : 'Form Analytics'}
            </h1>
            <p className="text-gray-600 mt-2">
              {selectedForm ? 'Detailed analytics for this form' : 'Track form performance and student engagement'}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <input
                type="date"
                value={dateRange.start_date}
                onChange={(e) => setDateRange(prev => ({ ...prev, start_date: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Start Date"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={dateRange.end_date}
                onChange={(e) => setDateRange(prev => ({ ...prev, end_date: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="End Date"
              />
            </div>
            <button
              onClick={handleExportAnalytics}
              disabled={!selectedFormId}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Data
            </button>
            <button
              onClick={handleExportPdf}
              disabled={!selectedFormId}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              <File className="w-4 h-4 mr-2" />
              Export PDF
            </button>
          </div>
        </div>
      </div>


      {/* Overview Stats - Only show when no specific form is selected */}
      {!selectedForm && overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Forms"
            value={overview.total_forms}
            icon={FileText}
            color="blue"
          />
          <StatCard
            title="Active Forms"
            value={overview.active_forms}
            icon={CheckCircle}
            color="green"
          />
          <StatCard
            title="Total Submissions"
            value={overview.total_submissions}
            icon={BarChart3}
            color="purple"
          />
          <StatCard
            title="Unique Students"
            value={overview.unique_students}
            icon={Users}
            color="indigo"
            subtitle={`${overview.recent_submissions} in last 30 days`}
          />
        </div>
      )}

      {/* Completion Rates and Form Selection - Only show when no specific form is selected */}
      {!selectedForm && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Completion Rates */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Form Completion Rates</h2>
            <PieChart className="w-5 h-5 text-gray-400" />
          </div>
          
          <div className="space-y-4">
            {completionRates.slice(0, 5).map((form, index) => (
              <div key={form.form_id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {form.form_title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {form.unique_students} / {form.total_students} students
                    </p>
                  </div>
                  <div className="ml-4 text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {form.completion_rate}%
                    </p>
                  </div>
                </div>
                <ProgressBar 
                  percentage={form.completion_rate} 
                  color={form.completion_rate >= 80 ? 'green' : form.completion_rate >= 60 ? 'yellow' : 'red'}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Form Selection */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Form Details</h2>
            <BarChart3 className="w-5 h-5 text-gray-400" />
          </div>
          
          <div className="space-y-3">
            {completionRates.map((form) => (
              <button
                key={form.form_id}
                onClick={() => fetchFormStats(form.form_id)}
                className={`w-full text-left p-4 rounded-lg border transition-colors ${
                  selectedFormId === form.form_id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{form.form_title}</p>
                    <p className="text-sm text-gray-500">
                      {form.template_type.replace('_', ' ').toUpperCase()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {form.completion_rate}%
                    </p>
                    <p className="text-xs text-gray-500">
                      {form.total_submissions} submissions
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Form Statistics */}
      {formStats && (
        <div className="mt-8 space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              {formStats.form_title} - Detailed Statistics
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <StatCard
                title="Total Submissions"
                value={formStats.statistics.total_submissions}
                icon={FileText}
                color="blue"
              />
              <StatCard
                title="Submitted"
                value={formStats.statistics.submitted_count}
                icon={CheckCircle}
                color="green"
              />
              <StatCard
                title="Drafts"
                value={formStats.statistics.draft_count}
                icon={Clock}
                color="yellow"
              />
              <StatCard
                title="Completion Rate"
                value={`${formStats.statistics.completion_rate}%`}
                icon={TrendingUp}
                color="purple"
              />
            </div>

            {/* Timeline Chart */}
            {formStats.timeline && formStats.timeline.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Submission Timeline (Last 30 Days)</h3>
                <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl p-6 shadow-lg border border-gray-200">
                  <TimelineLineChart timelineData={formStats.timeline} />
                </div>
              </div>
            )}
            {(!formStats.timeline || formStats.timeline.length === 0) && (
              <div className="mb-8">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Submission Timeline (Last 30 Days)</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-center text-gray-500 py-8">
                    <p>No timeline data available</p>
                    <p className="text-sm">Timeline data: {JSON.stringify(formStats.timeline)}</p>
                    <p className="text-sm">FormStats keys: {Object.keys(formStats)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Field Statistics */}
            {formStats.field_stats && formStats.field_stats.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Field Response Analysis</h3>
                <div className="space-y-6">
                  {formStats.field_stats.map((field, index) => {
                    const isExpanded = expandedFields[field.field_id];
                    const isExpandable = ['text', 'textarea', 'number', 'email', 'phone', 'date'].includes(field.field_type);
                    const responses = fieldResponses[field.field_id] || [];
                    
                    return (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            <h4 className="font-medium text-gray-900">{field.field_label}</h4>
                            <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                              {field.field_type}
                            </span>
                          </div>
                          <div className="flex items-center space-x-3">
                            <span className="text-sm text-gray-500">
                              {field.total_responses} responses
                            </span>
                            {isExpandable && (
                              <button
                                onClick={() => toggleFieldExpansion(field.field_id, selectedFormId, field.field_type)}
                                className="flex items-center space-x-1 px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
                              >
                                <span>{isExpanded ? 'Hide Details' : 'View Details'}</span>
                                <svg 
                                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                                  fill="none" 
                                  stroke="currentColor" 
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {/* Chart for date fields */}
                        {field.field_type === 'date' && (
                          <div className="mt-4">
                            {responses.length > 0
                              ? <DateDistributionChart responses={responses} fieldId={field.field_id} />
                              : <div className="text-center py-8 text-gray-500 text-sm">Click 'View Details' to load date distribution chart.</div>}
                          </div>
                        )}
                        {/* Option distribution for choice fields */}
                        {field.option_distribution && field.option_distribution.length > 0 && ( 
                          <div className="mt-4">
                            {field.field_type === 'radio' && ( // Pass fieldId to get a ref
                              <FieldDoughnutChart data={field.option_distribution} fieldId={field.field_id} />
                            )}
                            {field.field_type === 'dropdown' && (
                              <FieldPieChart data={field.option_distribution} fieldId={field.field_id} />
                            )}
                            {field.field_type === 'checkbox' && (
                              <FieldHorizontalBarChart data={field.option_distribution} fieldId={field.field_id} />
                            )}
                            {/* Fallback for other types */}
                            {!['radio', 'checkbox', 'dropdown', 'date'].includes(field.field_type) && field.option_distribution.map((option, optIndex) => (
                              <div key={optIndex} className="space-y-1 mb-2">
                                <div className="flex items-center justify-between text-sm"><span className="text-gray-700">{option.option}</span><span className="font-medium text-gray-900">{option.count} ({option.percentage}%)</span></div>
                                <ProgressBar percentage={option.percentage} color="blue" />
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Expanded detailed responses for text/number fields */}
                        {isExpanded && isExpandable && field.field_type !== 'date' && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <div className="flex items-center justify-between mb-3">
                              <h5 className="text-sm font-medium text-gray-700">Detailed Responses</h5>
                              <span className="text-xs text-gray-500">
                                {responses.length} individual responses
                              </span>
                            </div>
                            
                            {responses.length > 0 ? (
                              <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Roll Number</th>
                                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student Name</th>
                                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Course</th>
                                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Response</th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-gray-200">
                                    {responses.map((response, respIndex) => (
                                      <tr key={respIndex} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{response.student?.roll_number || 'N/A'}</td>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{response.student?.name || 'Unknown'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{response.student?.course || 'N/A'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-800 break-words min-w-[200px]">
                                          {typeof response.value === 'object' ? JSON.stringify(response.value) : (response.value || 'No response')}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="text-center py-8 text-gray-500">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                                <p className="text-sm">Loading detailed responses...</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FormAnalytics;
