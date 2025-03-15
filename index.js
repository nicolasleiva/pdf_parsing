// Simple PDF to Text Converter API
// Optimized for Render deployment

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

// Configure PDF.js worker
const PDFJS_WORKER_PATH = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
if (typeof window === 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_PATH;
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
  },
});

// Utility function for extracting text from PDF
async function extractTextFromPDF(pdfBuffer) {
  try {
    // Load PDF document
    const loadingTask = pdfjs.getDocument({ data: pdfBuffer });
    const pdf = await loadingTask.promise;
    
    let fullText = '';
    
    // Process each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      
      // Extract text from the page with proper spacing
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += pageText + '\n\n';
    }
    
    // Basic cleaning to ensure readable text
    return fullText
      .replace(/\s+/g, ' ')         // Normalize spaces
      .replace(/\n\s*\n/g, '\n\n')  // Remove multiple empty lines
      .trim();
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

// API endpoints
app.get('/', (req, res) => {
  res.json({
    message: 'PDF to Text Converter API',
    version: '1.0.0',
    endpoint: '/convert - POST to convert PDF to text'
  });
});

app.post('/convert', upload.single('pdfFile'), async (req, res) => {
  try {
    // Validate request
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No PDF file uploaded' 
      });
    }
    
    // Check if file is PDF
    if (!req.file.mimetype.includes('pdf')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Uploaded file is not a PDF' 
      });
    }
    
    // Extract text from PDF
    const extractedText = await extractTextFromPDF(req.file.buffer);
    
    // Generate filename for download
    const originalName = req.file.originalname;
    const fileBaseName = path.basename(originalName, path.extname(originalName));
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFilename = `${fileBaseName}-${timestamp}.txt`;
    
    // Response options
    const format = req.query.format || 'json';
    
    if (format === 'download') {
      // Send as downloadable file
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
      return res.send(extractedText);
    } else {
      // Send as JSON response
      res.json({
        success: true,
        filename: outputFilename,
        characters: extractedText.length,
        text: extractedText
      });
    }
  } catch (error) {
    console.error('Error processing PDF:', error);
    res.status(500).json({ 
      success: false, 
      error: 'An error occurred while processing the PDF'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`PDF to Text Converter API running on port ${PORT}`);
});

module.exports = app;