// Simple PDF to Text Converter API - Mejorado para Render
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

// Configurar PDF.js worker
const PDFJS_WORKER_PATH = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
if (typeof window === 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_PATH;
}

// Inicializar la app de Express
const app = express();
const PORT = process.env.PORT || 3000;

// Configurar middleware
app.use(cors());
app.use(express.json());

// Configurar multer para subir archivos, con límite de 20MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
});

/**
 * Elimina líneas repetidas que suelen corresponder a encabezados o pies de página.
 * Se eliminan duplicados consecutivos y líneas que se repiten más de dos veces
 * si son relativamente cortas (menos de 80 caracteres).
 *
 * @param {string} text - Texto a procesar.
 * @returns {string} Texto con líneas repetidas eliminadas.
 */
function removeRepeatedLines(text) {
  // Dividir el texto en líneas, eliminando espacios extremos y líneas vacías.
  const originalLines = text.split('\n').map(line => line.trim()).filter(line => line !== '');
  
  // Eliminar duplicados consecutivos
  const dedupedLines = [];
  for (const line of originalLines) {
    if (dedupedLines.length === 0 || dedupedLines[dedupedLines.length - 1] !== line) {
      dedupedLines.push(line);
    }
  }
  
  // Contar la frecuencia de cada línea en el texto original
  const frequency = {};
  for (const line of originalLines) {
    frequency[line] = (frequency[line] || 0) + 1;
  }
  
  // Filtrar líneas que se repiten demasiado y son cortas (probables encabezados o pies de página)
  const filteredLines = dedupedLines.filter(line => {
    if (frequency[line] > 2 && line.length < 80) {
      return false;
    }
    return true;
  });
  
  return filteredLines.join('\n');
}

// Función para extraer y formatear el texto del PDF
async function extractTextFromPDF(pdfBuffer) {
  try {
    const loadingTask = pdfjs.getDocument({ data: pdfBuffer });
    const pdf = await loadingTask.promise;
    let fullText = '';

    // Procesar cada página del PDF
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();

      // Unir los fragmentos de texto obtenidos de cada página
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += pageText + '\n\n';
    }

    // Paso 1: Eliminar líneas vacías en exceso y recortar espacios
    let cleanedText = fullText.replace(/\n\s*\n/g, '\n\n').trim();

    // Paso 2: Unir secuencias de letras individuales separadas por espacios
    // Ejemplo: "H I S T O R I A S" se convertirá en "HISTORIAS"
    cleanedText = cleanedText.replace(
      /\b(?:[A-Za-zÁÉÍÓÚÑa-záéíóú]\s+){1,}[A-Za-zÁÉÍÓÚÑa-záéíóú]\b/g,
      match => match.replace(/\s+/g, '')
    );

    // Paso 3: Normalizar espacios múltiples en uno solo
    cleanedText = cleanedText.replace(/\s{2,}/g, ' ');

    // Paso 4: Corregir errores de guionación (palabras fragmentadas)
    // Remover guiones al final de línea seguidos de salto de línea (unir palabra partida)
    cleanedText = cleanedText.replace(/-\s*\n\s*/g, '');
    // Unir palabras separadas con guion y espacios (ej.: "verifica - ción" a "verificación")
    cleanedText = cleanedText.replace(/(\w)-\s+(\w)/g, '$1$2');

    // Paso 5: Eliminar líneas repetidas (encabezados, pies, etc.)
    cleanedText = removeRepeatedLines(cleanedText);

    return cleanedText;
  } catch (error) {
    console.error('Error al extraer el texto del PDF:', error);
    throw new Error('Error al extraer el texto del PDF');
  }
}

// Endpoint de prueba
app.get('/', (req, res) => {
  res.json({
    message: 'PDF to Text Converter API',
    version: '1.0.0',
    endpoint: '/convert - POST para convertir PDF a texto'
  });
});

// Endpoint de conversión con manejo específico de errores de Multer
app.post('/convert', (req, res) => {
  upload.single('pdfFile')(req, res, async function (err) {
    if (err) {
      // Manejo específico para errores de Multer (como tamaño de archivo excedido)
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: 'El archivo es demasiado grande. El límite es 20MB.'
          });
        }
        return res.status(400).json({
          success: false,
          error: err.message
        });
      }
      return res.status(500).json({
        success: false,
        error: 'Error al subir el archivo'
      });
    }

    try {
      // Validar que se haya subido un archivo
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No se ha subido ningún archivo PDF'
        });
      }

      // Verificar que el archivo sea un PDF
      if (!req.file.mimetype.includes('pdf')) {
        return res.status(400).json({
          success: false,
          error: 'El archivo subido no es un PDF'
        });
      }

      // Extraer el texto del PDF
      const extractedText = await extractTextFromPDF(req.file.buffer);

      // Generar nombre de archivo para descarga
      const originalName = req.file.originalname;
      const fileBaseName = path.basename(originalName, path.extname(originalName));
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputFilename = `${fileBaseName}-${timestamp}.txt`;

      // Opciones de respuesta según query (JSON o descarga)
      const format = req.query.format || 'json';

      if (format === 'download') {
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
        return res.send(extractedText);
      } else {
        return res.json({
          success: true,
          filename: outputFilename,
          characters: extractedText.length,
          text: extractedText
        });
      }
    } catch (error) {
      console.error('Error procesando el PDF:', error);
      return res.status(500).json({
        success: false,
        error: 'Ocurrió un error al procesar el PDF'
      });
    }
  });
});

// Middleware para manejo de errores generales
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  res.status(500).json({
    success: false,
    error: 'Error Interno del Servidor',
    message: process.env.NODE_ENV === 'production' ? 'Algo salió mal' : err.message
  });
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`API PDF to Text corriendo en el puerto ${PORT}`);
});

module.exports = app;
