/**
 * Urban Digital Twin - Auth Utilities
 * This file contains client-side authentication utilities for managing user sessions
 * All Firebase operations have been moved to Netlify functions for security
 */

// Authentication state management
let currentUser = null;

// Load user data from localStorage on page load
try {
  const userData = localStorage.getItem('authUser');
  if (userData) {
    currentUser = JSON.parse(userData);
  }
} catch (error) {
  console.error('Error loading authentication state:', error);
}

// Metrics (for index.html sidebar)
window.setupLiveMetrics = async function (usersCountId, loginsCountId) {
  try {
    // Fetch metrics from Netlify function
    const response = await fetch('/.netlify/functions/get-metrics');
    const data = await response.json();
    
    if (response.ok) {
      // Update metrics in the sidebar
      document.getElementById(usersCountId).textContent = data.userCount || 0;
      document.getElementById(loginsCountId).textContent = data.loginCount || 0;
    } else {
      console.error('Error fetching metrics:', data.error);
    }
  } catch (error) {
    console.error('Failed to fetch metrics:', error);
  }
  
  // Refresh metrics every minute
  setTimeout(() => {
    window.setupLiveMetrics(usersCountId, loginsCountId);
  }, 60000);
};

// Handle email verification
window.handleEmailVerification = async function() {
  const urlParams = new URLSearchParams(window.location.search);
  const oobCode = urlParams.get('oobCode');
  const mode = urlParams.get('mode');
  
  if (oobCode) {
    try {
      let endpoint = '';
      
      if (mode === 'verifyEmail') {
        endpoint = '/.netlify/functions/verify-email';
      } else if (mode === 'resetPassword') {
        // For password reset, we don't handle it here as it's done in login.html
        return;
      }
      
      if (!endpoint) return;
      
      // Call the appropriate Netlify function
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ oobCode })
      });
      
      const data = await response.json();
      
      // Show appropriate message
      const messageDiv = document.getElementById('register-message');
      if (messageDiv) {
        if (response.ok) {
          messageDiv.textContent = 'Email verified successfully! You can now log in.';
          messageDiv.style.display = 'block';
          messageDiv.style.color = 'green';
          
          // Redirect to login page after 3 seconds
          setTimeout(() => {
            window.location.href = 'login.html';
          }, 3000);
        } else {
          messageDiv.textContent = data.error || 'Error verifying email. Please try again.';
          messageDiv.style.display = 'block';
          messageDiv.style.color = 'red';
        }
      }
    } catch (error) {
      console.error('Error verifying email:', error);
      const messageDiv = document.getElementById('register-message');
      if (messageDiv) {
        messageDiv.textContent = 'Error verifying email. Please try again.';
        messageDiv.style.display = 'block';
        messageDiv.style.color = 'red';
      }
    }
  }
};

// Call the verification handler when the page loads
window.addEventListener('load', window.handleEmailVerification);

// Check authentication status
window.checkAuthStatus = function() {
  const authToken = localStorage.getItem('authToken');
  const authUser = localStorage.getItem('authUser');
  
  // If no token or user data, redirect to login
  if (!authToken || !authUser) {
    window.location.href = 'login.html';
  } else {
    try {
      // Parse user data to verify it's valid JSON
      const userData = JSON.parse(authUser);
      return userData;
    } catch (error) {
      console.error('Invalid auth data:', error);
      window.location.href = 'login.html';
    }
  }
};

// Helper for pages that require authentication
window.requireAuth = function() {
  return window.checkAuthStatus();
};

// Logout function
window.logoutUser = async function () {
  try {
    // Call the Netlify logout function
    await fetch('/.netlify/functions/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // Clear authentication data from localStorage
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    
    // Redirect to login page
    window.location.href = "login.html";
  } catch (error) {
    console.error('Logout error:', error);
    // Even if there's an error calling the function, still clear local storage and redirect
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    window.location.href = "login.html";
  }
};
