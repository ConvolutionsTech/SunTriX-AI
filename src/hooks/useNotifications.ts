import { useState, useEffect } from "react";
import { apiRequest, ENDPOINTS } from "../lib/api";
import { authManager } from "../lib/auth";

export interface NotificationsData {
  newTasks: number;
  unreadMessages: number;
  newSubscribers: number;
  total: number;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationsData>({
    newTasks: 0,
    unreadMessages: 0,
    newSubscribers: 0,
    total: 0,
  });

  const fetchNotifications = async () => {
    if (!authManager.isAuthenticated()) return;

    try {
      const { data } = await apiRequest<NotificationsData>(ENDPOINTS.ADMIN_NOTIFICATIONS, { auth: true });
      if (data) {
        setNotifications({
          newTasks: data.newTasks || 0,
          unreadMessages: data.unreadMessages || 0,
          newSubscribers: data.newSubscribers || 0,
          total: (data.newTasks || 0) + (data.unreadMessages || 0) + (data.newSubscribers || 0),
        });
      }
    } catch {
      // Silently fail — notifications are non-critical
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000); // poll every 60s
    return () => clearInterval(interval);
  }, []);

  return notifications;
}
