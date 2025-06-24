const fetch = require('node-fetch');
require('dotenv').config();

exports.handler = async (event) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  
  // Handle OPTIONS request for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  // Get API key from environment variables
  const apiKey = process.env.TOMTOM_API_KEY || "yQWgvqceUQoSR7g3MySgTGirgroZtMMc"; // Fallback key if env not set
  
  // Extract query parameters
  const { z, x, y, ts } = event.queryStringParameters || {};
  
  if (!z || !x || !y) {
    console.error("Missing tile parameters:", event.queryStringParameters);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing tile parameters' })
    };
  }

  // Construct TomTom API URL
  const url = `https://api.tomtom.com/traffic/map/4/tile/flow/absolute/${z}/${x}/${y}.png?key=${apiKey}&ts=${ts || Date.now()}`;
  
  try {
    // Fetch image from TomTom API
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`TomTom API error: ${response.status} - ${response.statusText}`);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: `TomTom API error: ${response.status}` })
      };
    }
    
    // Get binary image data
    const imageBuffer = await response.buffer();
    
    // Return successful response with image data
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'image/png'
      },
      // For serverless functions, we need to encode binary data as base64
      body: imageBuffer.toString('base64'),
      isBase64Encoded: true
    };
  } catch (error) {
    // Log and return error
    console.error("Failed to fetch TomTom traffic data:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch TomTom traffic data: ' + error.message })
    };
  }
};
