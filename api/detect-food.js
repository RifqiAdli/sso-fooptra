// api/detect-food.js
// Deploy this to: sso.fooptra.com
const formidable = require('formidable');
const fs = require('fs');
const axios = require('axios');

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

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let tempFilePath = null;

  try {
    // Parse multipart form data
    const form = formidable({ 
      multiples: false,
      maxFileSize: 10 * 1024 * 1024, // 10MB max
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const imageFile = files.image;
    
    if (!imageFile) {
      return res.status(400).json({ 
        error: 'No image provided',
        success: false 
      });
    }

    tempFilePath = imageFile.filepath;

    // Read image as base64
    const imageBuffer = fs.readFileSync(tempFilePath);
    const base64Image = imageBuffer.toString('base64');

    console.log('Sending to Roboflow API...');

    // Call Roboflow API
    const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;
    const ROBOFLOW_MODEL = process.env.ROBOFLOW_MODEL || 'food-detection-ysgqf/2';

    if (!ROBOFLOW_API_KEY) {
      throw new Error('ROBOFLOW_API_KEY not configured');
    }

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
    });

    const predictions = roboflowResponse.data.predictions || [];
    const imageWidth = roboflowResponse.data.image?.width || 640;
    const imageHeight = roboflowResponse.data.image?.height || 640;

    console.log(`Detected ${predictions.length} objects`);

    // Process predictions
    const items = predictions
      .filter(pred => {
        // Filter out non-food items and low confidence
        const category = categorizeFoodYOLO(pred.class);
        return category !== 'Other' && pred.confidence > 0.3;
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

    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
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
    console.error('Food detection error:', error);

    // Clean up temp file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to detect food items',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};