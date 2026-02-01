// api/detect-food.js
import formidable from 'formidable';
import fs from 'fs';
import axios from 'axios';

// Disable Next.js body parser
export const config = {
  api: {
    bodyParser: false,
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

    // Check API key
    const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;
    const ROBOFLOW_MODEL = process.env.ROBOFLOW_MODEL || 'food-detection-ysgqf/2';

    if (!ROBOFLOW_API_KEY) {
      console.error('❌ ROBOFLOW_API_KEY not set');
      return res.status(500).json({
        success: false,
        error: 'API not configured. Please set ROBOFLOW_API_KEY.',
      });
    }

    // Parse form with formidable
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
      keepExtensions: true,
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const imageFile = files.image?.[0] || files.image;
    
    if (!imageFile) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided',
      });
    }

    console.log('✅ Image received:', imageFile.originalFilename, 
      `(${(imageFile.size / 1024).toFixed(2)} KB)`);

    // Read and convert to base64
    const imageBuffer = fs.readFileSync(imageFile.filepath);
    const base64Image = imageBuffer.toString('base64');
    
    console.log('🔄 Converted to base64');
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

    // Clean up temp file
    fs.unlinkSync(imageFile.filepath);

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
    });
  }
}