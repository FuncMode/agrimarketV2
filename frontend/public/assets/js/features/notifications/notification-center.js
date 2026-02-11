// assets/js/features/notifications/notification-center.js
import { getMyNotifications, markAsRead, markAllAsRead, deleteNotification } from '../../services/notification.service.js';
import { createModal } from '../../components/modal.js';
import { formatRelativeTime } from '../../utils/formatters.js';
import { showToast } from '../../components/toast.js';
import { updateUnreadCount } from '../../components/notification-bell.js';

const showNotificationCenter = async () => {
  try {
    const response = await getMyNotifications({ limit: 20 });
    const notifications = response.data?.notifications || [];
    
    const notificationList = notifications.length > 0
      ? notifications.map(notif => createNotificationItem(notif)).join('')
      : '<p class="text-center text-gray-500 py-8">No notifications</p>';
    
    const modalContent = `
      <style>
        .notification-item {
          transition: all 0.3s ease;
        }
        .btn-delete-notification {
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .notification-item:hover .btn-delete-notification {
          opacity: 1;
        }
      </style>
      <div class="space-y-4">
        <div class="flex justify-between items-center">
          <p class="text-sm text-gray-600">${notifications.length} notifications</p>
          <button id="btn-mark-all-read" class="btn btn-sm btn-outline">
            <i class="bi bi-check-all"></i> Mark all as read
          </button>
        </div>
        
        <div class="space-y-2 max-h-96 overflow-y-auto">
          ${notificationList}
        </div>
      </div>
    `;
    
    const modal = createModal({
      title: 'Notifications',
      content: modalContent,
      size: 'md'
    });
    
    // Mark all as read
    const btnMarkAll = document.getElementById('btn-mark-all-read');
    if (btnMarkAll) {
      btnMarkAll.addEventListener('click', async () => {
        try {
          await markAllAsRead();
          showToast('All notifications marked as read', 'success');
          // Update the badge count
          await updateUnreadCount();
          // Update all notification items visually
          document.querySelectorAll('.notification-item').forEach(item => {
            item.classList.remove('unread', 'bg-blue-50');
            const unreadDot = item.querySelector('.bg-primary.rounded-full');
            if (unreadDot) {
              unreadDot.remove();
            }
          });
        } catch (error) {
          console.error('Error marking all as read:', error);
        }
      });
    }
    
    // Individual notification clicks (mark as read)
    document.querySelectorAll('.notification-content').forEach(content => {
      content.addEventListener('click', async () => {
        const item = content.closest('.notification-item');
        const notifId = item.dataset.notificationId;
        const wasUnread = item.classList.contains('unread');
        try {
          await markAsRead(notifId);
          // Remove all unread styling
          item.classList.remove('unread', 'bg-blue-50');
          // Remove the unread dot indicator if it exists
          const unreadDot = item.querySelector('.bg-primary.rounded-full');
          if (unreadDot) {
            unreadDot.remove();
          }
          // Update badge count if notification was unread
          if (wasUnread) {
            await updateUnreadCount();
          }
        } catch (error) {
          console.error('Error marking as read:', error);
        }
      });
    });
    
    // Delete notification buttons
    document.querySelectorAll('.btn-delete-notification').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent marking as read when deleting
        const notifId = btn.dataset.notificationId;
        const item = btn.closest('.notification-item');
        const wasUnread = item.classList.contains('unread');
        
        try {
          await deleteNotification(notifId);
          // Animate removal
          item.style.opacity = '0';
          item.style.transform = 'translateX(100%)';
          setTimeout(() => {
            item.remove();
            // Check if there are no more notifications
            const remainingNotifs = document.querySelectorAll('.notification-item');
            if (remainingNotifs.length === 0) {
              const container = document.querySelector('.space-y-2.max-h-96');
              if (container) {
                container.innerHTML = '<p class="text-center text-gray-500 py-8">No notifications</p>';
              }
            }
          }, 300);
          
          showToast('Notification deleted', 'success');
          // Update badge count if notification was unread
          if (wasUnread) {
            await updateUnreadCount();
          }
        } catch (error) {
          console.error('Error deleting notification:', error);
          showToast('Failed to delete notification', 'error');
        }
      });
    });
    
  } catch (error) {
    console.error('Error loading notifications:', error);
  }
};

const createNotificationItem = (notification) => {
  const icons = {
    order: 'bi-cart',
    message: 'bi-chat',
    verification: 'bi-shield-check',
    issue: 'bi-exclamation-triangle',
    system: 'bi-info-circle'
  };
  
  const icon = icons[notification.type] || 'bi-bell';
  const unreadClass = notification.is_read ? '' : 'unread bg-blue-50';
  
  return `
    <div class="notification-item ${unreadClass} p-4 rounded-lg hover:bg-gray-100 transition relative"
         data-notification-id="${notification.id}">
      <div class="flex gap-3">
        <i class="bi ${icon} text-2xl text-primary"></i>
        <div class="flex-1 cursor-pointer notification-content">
          <p class="font-semibold">${notification.title}</p>
          <p class="text-sm text-gray-600">${notification.message}</p>
          <p class="text-xs text-gray-400 mt-1">${formatRelativeTime(notification.created_at)}</p>
        </div>
        <div class="flex items-start gap-2">
          ${!notification.is_read ? '<span class="w-2 h-2 bg-primary rounded-full mt-2"></span>' : ''}
          <button class="btn-delete-notification text-gray-400 hover:text-red-500 transition" 
                  data-notification-id="${notification.id}"
                  title="Delete notification">
            <i class="bi bi-trash text-lg"></i>
          </button>
        </div>
      </div>
    </div>
  `;
};

export { showNotificationCenter, createNotificationItem };