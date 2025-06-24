const admin = require('firebase-admin');
const firebase = require('firebase/app');
require('firebase/auth');

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

let firebaseApp;
try {
  firebaseApp = firebase.app();
} catch (e) {
  firebaseApp = firebase.initializeApp(firebaseConfig);
}

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
    const { oobCode, newPassword } = JSON.parse(event.body);

    if (!oobCode || !newPassword) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Code and new password are required' })
      };
    }

    // Confirm password reset with Firebase Authentication
    const auth = firebase.auth();
    await auth.confirmPasswordReset(oobCode, newPassword);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Password has been reset successfully'
      })
    };
  } catch (error) {
    console.error('Password reset confirmation error:', error);
    
    // Map Firebase error codes to user-friendly messages
    let errorMessage = 'Failed to reset password';
    let statusCode = 400;
    
    if (error.code === 'auth/invalid-action-code' || error.code === 'auth/expired-action-code') {
      errorMessage = 'The password reset link is invalid or has expired. Please request a new one.';
    } else if (error.code === 'auth/weak-password') {
      errorMessage = 'The password is too weak. Please choose a stronger password.';
    } else if (error.code === 'auth/user-disabled') {
      errorMessage = 'The user account has been disabled.';
    } else {
      statusCode = 500;
      errorMessage = 'An error occurred while resetting your password.';
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
