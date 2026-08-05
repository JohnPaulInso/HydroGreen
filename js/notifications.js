/* ============================================================
   Push Notifications for HydroTrack APK
   Using Capacitor Local Notifications + FCM Push Notifications
   ============================================================ */

// Import Capacitor plugins (will be available after `npm install`)
let LocalNotifications, PushNotifications, App;

// Check if running in Capacitor (mobile app)
const isCapacitor = window.Capacitor !== undefined;

if (isCapacitor) {
  LocalNotifications = window.Capacitor.Plugins.LocalNotifications;
  PushNotifications = window.Capacitor.Plugins.PushNotifications;
  App = window.Capacitor.Plugins.App;
}

/* ================= NOTIFICATION MANAGER ================= */
const notificationManager = {
  fcmToken: null,
  initialized: false,

  async init() {
    if (!isCapacitor) {
      console.log('📱 Running in browser - notifications limited to browser API');
      return this.initBrowserNotifications();
    }

    console.log('📱 Initializing Capacitor notifications...');
    await this.requestPermissions();
    await this.registerPushNotifications();
    await this.setupLocalNotifications();
    this.initialized = true;
  },

  /* ================= PERMISSIONS ================= */
  async requestPermissions() {
    if (!isCapacitor) return;

    try {
      const result = await LocalNotifications.requestPermissions();
      if (result.display !== 'granted') {
        showToast('Notification permissions denied', 'clay', 'alert-triangle');
        return false;
      }

      const pushResult = await PushNotifications.requestPermissions();
      if (pushResult.receive !== 'granted') {
        showToast('Push notification permissions denied', 'clay', 'alert-triangle');
        return false;
      }

      console.log('✅ Notification permissions granted');
      return true;
    } catch (error) {
      console.error('❌ Permission request failed:', error);
      return false;
    }
  },

  /* ================= PUSH NOTIFICATIONS (FCM) ================= */
  async registerPushNotifications() {
    if (!isCapacitor) return;

    try {
      // Register with FCM
      await PushNotifications.register();

      // Listen for registration success
      await PushNotifications.addListener('registration', (token) => {
        this.fcmToken = token.value;
        console.log('📲 FCM Token:', token.value);
        
        // Save token to Firebase for this user
        this.saveFCMToken(token.value);
        
        showToast('Push notifications enabled', 'forest', 'bell');
      });

      // Listen for registration errors
      await PushNotifications.addListener('registrationError', (error) => {
        console.error('❌ FCM Registration error:', error);
        showToast('Push notification setup failed', 'clay', 'alert-triangle');
      });

      // Listen for incoming push notifications
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('📬 Push notification received:', notification);
        this.handleIncomingPush(notification);
      });

      // Listen for notification tap
      await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('👆 Push notification tapped:', notification);
        this.handleNotificationTap(notification);
      });

    } catch (error) {
      console.error('❌ Push notification registration failed:', error);
    }
  },

  async saveFCMToken(token) {
    if (typeof cloudSync !== 'undefined' && cloudSync.connected) {
      try {
        // Save to Firebase user profile
        await cloudSync.fns.setDoc(
          cloudSync.fns.doc(cloudSync.db, 'hydrotrack_towers', cloudSync.user.uid, 'profile', 'device'),
          { fcmToken: token, updatedAt: Date.now() },
          { merge: true }
        );
        console.log('✅ FCM token saved to Firebase');
      } catch (error) {
        console.error('❌ Failed to save FCM token:', error);
      }
    }
  },

  handleIncomingPush(notification) {
    // Show toast for incoming notification
    showToast(notification.body || notification.title, 'forest', 'bell');
    
    // Log to alert log
    if (state && state.alertLog) {
      state.alertLog.unshift({
        id: uid(),
        type: 'push',
        title: notification.title,
        message: notification.body,
        timestamp: Date.now(),
        data: notification.data
      });
      persist('alertLog');
    }
  },

  handleNotificationTap(notification) {
    // Navigate to relevant page based on notification data
    const data = notification.notification.data;
    
    if (data && data.page) {
      showPage(data.page);
    }
    
    // Show notification details
    if (data && data.action) {
      this.executeNotificationAction(data.action, data);
    }
  },

  executeNotificationAction(action, data) {
    switch (action) {
      case 'open_tower':
        showPage('tower');
        break;
      case 'open_reminders':
        showPage('reminders');
        break;
      case 'check_weather':
        showPage('reminders');
        if (document.getElementById('alertBanner2')) {
          document.getElementById('alertBanner2').scrollIntoView({ behavior: 'smooth' });
        }
        break;
      default:
        console.log('Unknown action:', action);
    }
  },

  /* ================= LOCAL NOTIFICATIONS ================= */
  async setupLocalNotifications() {
    if (!isCapacitor) return;

    try {
      // Listen for local notification tap
      await LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
        console.log('👆 Local notification tapped:', notification);
        this.handleNotificationTap(notification);
      });

      console.log('✅ Local notifications ready');
    } catch (error) {
      console.error('❌ Local notification setup failed:', error);
    }
  },

  /* ================= SCHEDULE NOTIFICATIONS ================= */
  async scheduleNotification(options) {
    if (!isCapacitor) {
      return this.showBrowserNotification(options);
    }

    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: options.id || Date.now(),
          title: options.title,
          body: options.body,
          schedule: options.schedule,
          sound: 'default',
          smallIcon: 'ic_stat_icon',
          iconColor: '#2F9E5B',
          extra: options.data || {}
        }]
      });
      
      console.log('📅 Notification scheduled:', options.title);
    } catch (error) {
      console.error('❌ Failed to schedule notification:', error);
    }
  },

  /* ================= IMMEDIATE NOTIFICATION ================= */
  async sendNotification(title, body, data = {}) {
    if (!isCapacitor) {
      return this.showBrowserNotification({ title, body, data });
    }

    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: Date.now(),
          title: title,
          body: body,
          schedule: { at: new Date(Date.now() + 1000) }, // 1 second from now
          sound: 'default',
          smallIcon: 'ic_stat_icon',
          iconColor: '#2F9E5B',
          extra: data
        }]
      });
      
      console.log('📬 Notification sent:', title);
    } catch (error) {
      console.error('❌ Failed to send notification:', error);
    }
  },

  /* ================= CUSTOM NOTIFICATIONS ================= */
  
  // Daily reminders (7AM, 11AM, 6PM)
  async scheduleDailyReminders() {
    if (!state.settings.sunReminder && !state.settings.heatReminder && !state.settings.nightReminder) {
      return;
    }

    const now = new Date();
    
    // Morning sun reminder (7:00 AM)
    if (state.settings.sunReminder) {
      const morning = new Date();
      morning.setHours(7, 0, 0, 0);
      if (morning <= now) morning.setDate(morning.getDate() + 1);
      
      await this.scheduleNotification({
        id: 1,
        title: '☀️ Morning Sun',
        body: 'Move your seedling trays into direct morning sun',
        schedule: { at: morning, every: 'day' },
        data: { page: 'reminders', type: 'sun' }
      });
    }

    // Midday heat protection (11:00 AM)
    if (state.settings.heatReminder) {
      const midday = new Date();
      midday.setHours(11, 0, 0, 0);
      if (midday <= now) midday.setDate(midday.getDate() + 1);
      
      await this.scheduleNotification({
        id: 2,
        title: '🌡️ Heat Protection',
        body: 'Move trays to partial shade — scorching midday heat',
        schedule: { at: midday, every: 'day' },
        data: { page: 'reminders', type: 'heat' }
      });
    }

    // Night darkness (6:00 PM)
    if (state.settings.nightReminder) {
      const evening = new Date();
      evening.setHours(18, 0, 0, 0);
      if (evening <= now) evening.setDate(evening.getDate() + 1);
      
      await this.scheduleNotification({
        id: 3,
        title: '🌙 Night Darkness',
        body: 'Turn off porch lights — plants need full darkness',
        schedule: { at: evening, every: 'day' },
        data: { page: 'reminders', type: 'night' }
      });
    }

    showToast('Daily reminders scheduled', 'forest', 'bell');
  },

  // Weather alerts
  async sendWeatherAlert(alertType, message) {
    const icons = {
      rain: '🌧️',
      heavyRain: '⚠️',
      wind: '💨',
      typhoon: '🌀'
    };

    await this.sendNotification(
      `${icons[alertType] || '⚠️'} Weather Alert`,
      message,
      { page: 'reminders', action: 'check_weather', type: alertType }
    );
  },

  // Plant milestone notifications
  async sendMilestoneNotification(plant, milestone) {
    const messages = {
      germination: `${plant.variety} — Day 3: Check germination, uncover tray`,
      thinning: `${plant.variety} — Day 10: Thinning time, keep 1 sprout per cube`,
      transplant: `${plant.variety} — Day 12: Ready to transplant to tower`,
      harvest: `${plant.variety} — Day 36: Harvest window is open!`
    };

    await this.sendNotification(
      '🌱 Plant Milestone',
      messages[milestone] || `${plant.variety} milestone reached`,
      { page: 'tower', action: 'open_tower', plantId: plant.id }
    );
  },

  /* ================= CANCEL NOTIFICATIONS ================= */
  async cancelAllNotifications() {
    if (!isCapacitor) return;

    try {
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel(pending);
        console.log('🗑️ Cancelled all notifications');
      }
    } catch (error) {
      console.error('❌ Failed to cancel notifications:', error);
    }
  },

  /* ================= BROWSER FALLBACK ================= */
  initBrowserNotifications() {
    if (!('Notification' in window)) {
      console.log('❌ Browser doesn\'t support notifications');
      return;
    }

    if (Notification.permission === 'granted') {
      this.initialized = true;
      return;
    }

    if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        this.initialized = permission === 'granted';
      });
    }
  },

  showBrowserNotification(options) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      console.log('⚠️ Browser notifications not available');
      return;
    }

    new Notification(options.title, {
      body: options.body,
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-64.png',
      tag: options.id || 'hydrotrack',
      data: options.data
    });
  }
};

/* ================= AUTO-INITIALIZE ================= */
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for app to load
    setTimeout(() => {
      notificationManager.init();
    }, 2000);
  });
}
