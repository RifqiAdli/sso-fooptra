// api/detect-food.js
// Deploy to: sso.fooptra.com/api/detect-food
const formidable = require('formidable');
const fs = require('fs');
const axios = require('axios');

// Next.js API configuration
export const config = {
  api: {
    bodyParser: false,
  },
};

// Food category mapping for YOLO results
const categorizeFoodYOLO = (label) => {
  const lowerLabel = label.toLowerCase();
  
  const categories = {
    'Vegetables': [
      'carrot', 'broccoli', 'cabbage', 'potato', 'onion', 'tomato', 
      'lettuce', 'pepper', 'cucumber', 'corn', 'spinach', 'celery',
      'eggplant', 'zucchini', 'mushroom', 'pumpkin', 'cauliflower'
    ],
    'Fruits': [
      'apple', 'banana', 'orange', 'grape', 'strawberry', 'watermelon',
      'mango', 'pineapple', 'lemon', 'lime', 'cherry', 'peach', 'pear',
      'kiwi', 'papaya', 'avocado', 'melon', 'berry'
    ],
    'Meat & Fish': [
      'chicken', 'beef', 'pork', 'fish', 'salmon', 'shrimp', 'turkey',
      'meat', 'steak', 'bacon', 'sausage', 'ham'
    ],
    'Dairy': [
      'milk', 'cheese', 'yogurt', 'butter', 'cream', 'ice cream',
      'mozzarella', 'cheddar', 'dairy'
    ],
    'Grains': [
      'bread', 'rice', 'pasta', 'cereal', 'noodle', 'bagel', 'tortilla',
      'cracker', 'croissant', 'muffin', 'roll', 'grain'
    ],
    'Beverages': [
      'juice', 'coffee', 'tea', 'soda', 'wine', 'beer', 'smoothie',
      'latte', 'drink', 'beverage'
    ],
    'Cooked Food': [
      'pizza', 'burger', 'sandwich', 'soup', 'salad', 'fries', 'hot dog',
      'burrito', 'taco', 'wrap', 'curry', 'stir fry', 'fried'
    ]
  };
  
  for (const [category, items] of Object.entries(categories)) {
    if (items.some(item => lowerLabel.includes(item))) {
      return category;
    }
  }
  
  return 'Other';
};

// Estimate quantity based on bounding box size
const estimateQuantity = (bbox, imageWidth, imageHeight) => {
  // Calculate relative area (0-1)
  const relativeArea = (bbox.width / imageWidth) * (bbox.height / imageHeight);
  
  // Base quantity estimation (50g - 500g)
  const minQuantity = 50;
  const maxQuantity = 500;
  
  // Scale based on area
  const quantity = minQuantity + (relativeArea * (maxQuantity - minQuantity) * 5);
  
  return Math.round(Math.min(maxQuantity, Math.max(minQuantity, quantity)));
};

// Main handler
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed. Use POST.' 
    });
  }

  let tempFilePath = null;

  try {
    console.log('📸 Starting food detection...');

    // Parse multipart form data with formidable v3 syntax
    const form = formidable({ 
      maxFileSize: 10 * 1024 * 1024, // 10MB max
      keepExtensions: true,
    });

    // Parse form - formidable v3 returns promise
    let fields, files;
    try {
      [fields, files] = await form.parse(req);
    } catch (parseError) {
      console.error('Formidable parse error:', parseError);
      return res.status(400).json({ 
        success: false,
        error: 'Failed to parse uploaded image',
        details: parseError.message
      });
    }

    // Get image file (handle both array and single file)
    const imageFile = Array.isArray(files.image) ? files.image[0] : files.image;
    
    if (!imageFile) {
      console.error('No image file found. Files:', files);
      return res.status(400).json({ 
        success: false,
        error: 'No image provided. Please upload an image file.'
      });
    }

    tempFilePath = imageFile.filepath;
    console.log('📂 Image file received:', tempFilePath);

    // Check if file exists
    if (!fs.existsSync(tempFilePath)) {
      return res.status(400).json({ 
        success: false,
        error: 'Image file not found after upload'
      });
    }

    // Read image as base64
    const imageBuffer = fs.readFileSync(tempFilePath);
    const base64Image = imageBuffer.toString('base64');
    console.log('🔄 Image converted to base64:', (base64Image.length / 1024).toFixed(2), 'KB');

    // Get API credentials
    const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;
    const ROBOFLOW_MODEL = process.env.ROBOFLOW_MODEL || 'food-detection-ysgqf/2';

    if (!ROBOFLOW_API_KEY) {
      console.error('❌ ROBOFLOW_API_KEY not configured');
      return res.status(500).json({
        success: false,
        error: 'API configuration error. Please contact administrator.',
        details: 'ROBOFLOW_API_KEY not set'
      });
    }

    console.log('🚀 Calling Roboflow API...');

    // Call Roboflow API
    const roboflowResponse = await axios({
      method: 'POST',
      url: `https://detect.roboflow.com/${ROBOFLOW_MODEL}`,
      params: {
        api_key: ROBOFLOW_API_KEY,
        confidence: 30, // 30% minimum confidence
        overlap: 30,
      },
      data: base64Image,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 30000, // 30 second timeout
    });

    const predictions = roboflowResponse.data.predictions || [];
    const imageWidth = roboflowResponse.data.image?.width || 640;
    const imageHeight = roboflowResponse.data.image?.height || 640;

    console.log(`✅ Detected ${predictions.length} objects from Roboflow`);

    // Process predictions
    const items = predictions
      .filter(pred => {
        // Filter out non-food items and low confidence
        const category = categorizeFoodYOLO(pred.class);
        const isValid = category !== 'Other' && pred.confidence > 0.3;
        if (!isValid) {
          console.log(`⚠️  Filtered out: ${pred.class} (confidence: ${pred.confidence})`);
        }
        return isValid;
      })
      .map(pred => {
        const bbox = {
          x: pred.x,
          y: pred.y,
          width: pred.width,
          height: pred.height,
        };

        // Format food name
        const foodName = pred.class
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');

        return {
          name: foodName,
          quantity: estimateQuantity(bbox, imageWidth, imageHeight),
          category: categorizeFoodYOLO(pred.class),
          confidence: Math.round(pred.confidence * 100),
          bbox: bbox,
          originalLabel: pred.class,
        };
      });

    console.log(`✅ Processed ${items.length} valid food items`);

    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
      console.log('🗑️  Cleaned up temp file');
    }

    return res.status(200).json({
      success: true,
      items: items,
      imageSize: {
        width: imageWidth,
        height: imageHeight,
      },
      detectedCount: items.length,
    });

  } catch (error) {
    console.error('❌ Food detection error:', error);

    // Clean up temp file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('🗑️  Cleaned up temp file after error');
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }

    // Handle specific errors
    let errorMessage = 'Failed to detect food items';
    let statusCode = 500;

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      errorMessage = 'Request timeout. Image processing took too long.';
      statusCode = 504;
    } else if (error.response) {
      // Roboflow API error
      errorMessage = `Roboflow API error: ${error.response.statusText}`;
      statusCode = error.response.status;
      console.error('Roboflow error response:', error.response.data);
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Cannot connect to Roboflow API';
      statusCode = 503;
    }

    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}