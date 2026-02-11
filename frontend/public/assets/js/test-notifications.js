// Quick Test Script for Real-time Notification System
// Copy and paste this into browser console to test notifications

console.log('🔔 Notification System Test Starting...\n');

// Test 1: Check if notification badge exists
console.log('✓ Test 1: Checking notification badge...');
const notificationBadge = document.getElementById('notification-count');
if (notificationBadge) {
  console.log('  ✓ Notification badge found');
} else {
  console.log('  ✗ Notification badge NOT found');
}

// Test 2: Check Socket.io connection
console.log('\n✓ Test 2: Checking Socket.io connection...');
import('../assets/js/services/socket.service.js').then(socketModule => {
  const status = socketModule.getConnectionStatus();
  console.log('  Socket Status:', status);
  if (status.connected) {
    console.log('  ✓ Socket.io connected');
  } else {
    console.log('  ✗ Socket.io NOT connected');
    console.log('  → Try running: import("../assets/js/services/socket.service.js").then(m => m.initSocket())');
  }
});

// Test 3: Get unread count from API
console.log('\n✓ Test 3: Fetching unread count from API...');
import('../assets/js/core/auth.js').then(authModule => {
  const token = authModule.getToken();
  if (!token) {
    console.log('  ✗ Not authenticated. Please login first.');
    return;
  }
  
  fetch('/api/notifications/unread-count', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => response.json())
  .then(data => {
    console.log('  ✓ Unread count:', data.data.unread_count);
  })
  .catch(error => {
    console.log('  ✗ Error fetching unread count:', error);
  });
});

// Test 4: Subscribe to real-time notifications
console.log('\n✓ Test 4: Setting up real-time notification listener...');
import('../assets/js/services/socket.service.js').then(socketModule => {
  const unsubscribe = socketModule.onNotification((notification) => {
    console.log('  🔔 NEW NOTIFICATION RECEIVED:', notification);
  });
  console.log('  ✓ Listening for notifications...');
  console.log('  → Send a test notification to see it here');
  
  // Store unsubscribe function globally for cleanup
  window.notificationTestUnsubscribe = unsubscribe;
});

// Test 5: Send test notification (optional)
console.log('\n✓ Test 5: Send test notification');
console.log('  → Run this command to send a test notification:');
console.log('    testNotification()');

window.testNotification = async function() {
  try {
    const authModule = await import('../assets/js/core/auth.js');
    const token = authModule.getToken();
    
    const response = await fetch('/api/notifications/test', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    console.log('  ✓ Test notification sent:', data);
    
    if (data.data.socket.sent) {
      console.log('  ✓ Real-time notification delivered');
    } else if (data.data.socket.connected) {
      console.log('  ⚠ Socket connected but notification not sent');
    } else {
      console.log('  ⚠ Socket not connected - notification saved to database only');
    }
  } catch (error) {
    console.log('  ✗ Error sending test notification:', error);
  }
};

// Cleanup function
window.cleanupNotificationTest = function() {
  if (window.notificationTestUnsubscribe) {
    window.notificationTestUnsubscribe();
    console.log('✓ Notification listener removed');
  }
};

console.log('\n📋 Available Commands:');
console.log('  testNotification()      - Send a test notification');
console.log('  cleanupNotificationTest() - Remove notification listener');
console.log('\n✅ Notification system test ready!');
