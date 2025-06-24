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
    const { email } = JSON.parse(event.body);

    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email is required' })
      };
    }

    // Send password reset email
    const auth = firebase.auth();
    await auth.sendPasswordResetEmail(email);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Password reset email sent successfully'
      })
    };
  } catch (error) {
    console.error('Password reset error:', error);
    
    // Map Firebase error codes to user-friendly messages
    let errorMessage = 'Failed to send password reset email';
    if (error.code === 'auth/user-not-found') {
      // For security, don't reveal if the user exists or not
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'If the email is registered, a password reset link will be sent'
        })
      };
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Invalid email format';
    }
    
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ 
        error: errorMessage,
        code: error.code || 'unknown'
      })
    };
  }
};
