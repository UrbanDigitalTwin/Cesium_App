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
    const { email, password } = JSON.parse(event.body);

    if (!email || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email and password are required' })
      };
    }

    // Log in with Firebase Authentication
    const auth = firebase.auth();
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // Get custom token for session maintenance
    const customToken = await admin.auth().createCustomToken(user.uid);
    
    // Update login count in the database if needed
    try {
      const db = admin.database();
      const statsRef = db.ref('stats/logins');
      await statsRef.transaction(currentValue => (currentValue || 0) + 1);
    } catch (dbError) {
      console.error('Database error:', dbError);
      // Continue even if the database update fails
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Login successful',
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        token: customToken
      })
    };
  } catch (error) {
    console.error('Login error:', error);
    
    // Map Firebase error codes to user-friendly messages
    let errorMessage = 'Authentication failed';
    if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
      errorMessage = 'Invalid email or password';
    } else if (error.code === 'auth/too-many-requests') {
      errorMessage = 'Too many unsuccessful login attempts. Please try again later.';
    }
    
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ 
        error: errorMessage,
        code: error.code || 'unknown'
      })
    };
  }
};
