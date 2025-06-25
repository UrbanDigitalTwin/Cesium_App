const admin = require('firebase-admin');
const { initializeApp } = require('firebase/app');
const { getAuth, applyActionCode } = require('firebase/auth');

// Initialize Firebase Admin SDK if not already initialized
let adminApp;
try {
  adminApp = admin.app();
} catch (e) {
  adminApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\n/g, '\n'),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

// Initialize Firebase Client SDK for auth
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

// Initialize Firebase app and auth
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

exports.handler = async function(event, context) {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse request body
    const { oobCode } = JSON.parse(event.body);

    if (!oobCode) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Verification code is required' })
      };
    }

    // Verify email with Firebase Authentication using modular API
    await applyActionCode(auth, oobCode);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Email verified successfully'
      })
    };
  } catch (error) {
    console.error('Email verification error:', error);
    
    // Map Firebase error codes to user-friendly messages
    let errorMessage = 'Failed to verify email';
    let statusCode = 400;
    
    if (error.code === 'auth/invalid-action-code') {
      errorMessage = 'The verification link is invalid or has already been used';
    } else if (error.code === 'auth/expired-action-code') {
      errorMessage = 'The verification link has expired';
    } else if (error.code === 'auth/user-disabled') {
      errorMessage = 'The user account has been disabled';
    } else {
      statusCode = 500;
      errorMessage = 'An error occurred during email verification';
    }
    
    return {
      statusCode,
      headers,
      body: JSON.stringify({ 
        error: errorMessage,
        code: error.code || 'unknown'
      })
    };
  }
};
