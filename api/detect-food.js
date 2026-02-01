// api/detect-food.js
import axios from 'axios';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// Food category mapping
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

const estimateQuantity = (bbox, imageWidth, imageHeight) => {
  const relativeArea = (bbox.width / imageWidth) * (bbox.height / imageHeight);
  const minQuantity = 50;
  const maxQuantity = 500;
  const quantity = minQuantity + (relativeArea * (maxQuantity - minQuantity) * 5);
  return Math.round(Math.min(maxQuantity, Math.max(minQuantity, quantity)));
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed' 
    });
  }

  try {
    console.log('📸 Starting food detection...');

    // Check for API key first
    const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;
    const ROBOFLOW_MODEL = process.env.ROBOFLOW_MODEL || 'food-detection-ysgqf/2';

    if (!ROBOFLOW_API_KEY) {
      console.error('❌ ROBOFLOW_API_KEY not set');
      return res.status(500).json({
        success: false,
        error: 'API not configured. Please set ROBOFLOW_API_KEY in Vercel environment variables.',
      });
    }

    // Get base64 image from request body
    let base64Image;
    
    if (typeof req.body === 'string') {
      base64Image = req.body;
    } else if (req.body.image) {
      base64Image = req.body.image;
    } else {
      return res.status(400).json({
        success: false,
        error: 'No image data provided. Send base64 image in request body.',
      });
    }

    console.log('✅ Image received, size:', (base64Image.length / 1024).toFixed(2), 'KB');
    console.log('🚀 Calling Roboflow API...');

    // Call Roboflow
    const roboflowResponse = await axios({
      method: 'POST',
      url: `https://detect.roboflow.com/${ROBOFLOW_MODEL}`,
      params: {
        api_key: ROBOFLOW_API_KEY,
        confidence: 30,
        overlap: 30,
      },
      data: base64Image,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 30000,
    });

    const predictions = roboflowResponse.data.predictions || [];
    const imageWidth = roboflowResponse.data.image?.width || 640;
    const imageHeight = roboflowResponse.data.image?.height || 640;

    console.log(`✅ Detected ${predictions.length} objects`);

    // Process predictions
    const items = predictions
      .filter(pred => {
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

    console.log(`✅ Processed ${items.length} food items`);

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
    console.error('❌ Error:', error);

    let errorMessage = 'Failed to detect food items';
    let statusCode = 500;

    if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout';
      statusCode = 504;
    } else if (error.response) {
      errorMessage = `Roboflow API error: ${error.response.statusText}`;
      statusCode = error.response.status;
      console.error('Roboflow response:', error.response.data);
    }

    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}