const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
let adminApp;
try {
  adminApp = admin.app();
} catch (e) {
  adminApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

exports.handler = async function(event, context) {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only accept GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const db = admin.database();
    
    // Get user count from Firebase
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val() || {};
    const userCount = Object.keys(users).length;
    
    // Get login events count
    const loginsSnapshot = await db.ref('loginEvents').once('value');
    const logins = loginsSnapshot.val() || {};
    const loginCount = Object.keys(logins).length;
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        userCount,
        loginCount
      })
    };
  } catch (error) {
    console.error('Error fetching metrics:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch metrics',
        message: error.message
      })
    };
  }
};
