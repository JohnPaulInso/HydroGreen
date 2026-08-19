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

// (2026-07-13) Batch stage transitions & offline missed push notifs; prev: single
  /* ================= NOTIFICATION SCHEDULING & OFFLINE DISPATCH ================= */
  
  // Schedule all daily and custom reminders with Capacitor LocalNotifications
  async scheduleDailyReminders() {
    return this.scheduleAllReminders();
  },

  async scheduleAllReminders() {
    if (!isCapacitor && !('Notification' in window)) return;
    if (typeof state === 'undefined' || !state.settings) return;

    await this.cancelAllNotifications();

    const now = new Date();
    let notifId = 100;

    const parseNextTime = (hhmm) => {
      const [h, m] = (hhmm || '08:00').split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      if (d <= now) d.setDate(d.getDate() + 1);
      return d;
    };

    // Morning Sun
    if (state.settings.sunReminder) {
      const target = parseNextTime(state.settings.sunTime || '07:00');
      await this.scheduleNotification({
        id: 1,
        title: '☀️ Morning Sun',
        body: 'Move your seedling trays into direct morning sun',
        schedule: { at: target, every: 'day' },
        data: { page: 'reminders', type: 'sun' }
      });
    }

    // Midday Heat
    if (state.settings.heatReminder) {
      const target = parseNextTime(state.settings.heatTime || '11:00');
      await this.scheduleNotification({
        id: 2,
        title: '🌡️ Heat Protection',
        body: 'Move trays to partial shade — scorching midday heat',
        schedule: { at: target, every: 'day' },
        data: { page: 'reminders', type: 'heat' }
      });
    }

    // Night Darkness
    if (state.settings.nightReminder) {
      const target = parseNextTime(state.settings.nightTime || '18:00');
      await this.scheduleNotification({
        id: 3,
        title: '🌙 Night Darkness',
        body: 'Turn off porch lights — plants need full darkness',
        schedule: { at: target, every: 'day' },
        data: { page: 'reminders', type: 'night' }
      });
    }

    // Active Custom Reminders
    const customReminders = Array.isArray(state.settings.customReminders) ? state.settings.customReminders : [];
    for (const r of customReminders) {
      if (r.active) {
        notifId++;
        const target = parseNextTime(r.time || '09:00');
        await this.scheduleNotification({
          id: notifId,
          title: '⏰ ' + r.title,
          body: 'Reminder: ' + r.title,
          schedule: { at: target, every: 'day' },
          data: { page: 'reminders', type: 'custom', remId: r.id }
        });
      }
    }
  },

  // Check stage transitions and offline missed events (Facebook-style catch-up)
  checkOfflineAndStageTransitions() {
    if (typeof state === 'undefined' || !state.towers) return;

    let delivered = {};
    try {
      delivered = JSON.parse(localStorage.getItem('ht_delivered_notifs') || '{}');
    } catch(e){ delivered = {}; }

    const lastCheck = Number(localStorage.getItem('ht_last_notif_check')) || 0;
    const now = Date.now();
    const today = (typeof todayISO === 'function') ? todayISO() : new Date().toISOString().slice(0,10);

    // Group stage transitions across trays and pockets
    const stageGroups = {};

    // Check Nursery Trays
    if (Array.isArray(state.trays)) {
      state.trays.forEach(t => {
        if (!t.variety || !t.startDate) return;
        const day = (typeof dayOfCycle === 'function') ? dayOfCycle(t.startDate) : 1;
        const stage = (typeof stageForDay === 'function') ? stageForDay(day) : { key:'seedling', label:'Seedling' };
        const key = `tray_${t.variety}_${stage.key}_${today}`;
        if (!stageGroups[key]) {
          stageGroups[key] = { type: 'tray', variety: t.variety, stageKey: stage.key, stageLabel: stage.label, count: 0, items: [] };
        }
        stageGroups[key].count++;
        stageGroups[key].items.push(t);
      });
    }

    // Check Tower Pockets
    if (Array.isArray(state.pockets)) {
      state.pockets.forEach(p => {
        if (!p.variety || !p.datePlanted) return;
        const { stage } = (typeof getPocketState === 'function') ? getPocketState(p) : { stage: { key:'vegetative', label:'Vegetative' } };
        if (!stage) return;
        const key = `pocket_${p.variety}_${stage.key}_${today}`;
        if (!stageGroups[key]) {
          stageGroups[key] = { type: 'pocket', variety: p.variety, stageKey: stage.key, stageLabel: stage.label, count: 0, items: [] };
        }
        stageGroups[key].count++;
        stageGroups[key].items.push(p);
      });
    }

    // Send single grouped notification per variety and stage
    Object.keys(stageGroups).forEach(groupKey => {
      if (delivered[groupKey]) return; // Already delivered

      const g = stageGroups[groupKey];
      let msg = '';
      if (g.type === 'tray') {
        msg = (g.count === 1)
          ? `Your ${g.variety} Seed Tray is in the ${g.stageLabel} Stage`
          : `${g.count} ${g.variety} Seed Trays are in the ${g.stageLabel} Stage`;
      } else {
        msg = (g.count === 1)
          ? `Your ${g.variety} plant is in the ${g.stageLabel} Stage`
          : `${g.count} ${g.variety} plants are in the ${g.stageLabel} Stage`;
      }

      this.sendNotification('🌱 Stage Update', msg, { page: g.type === 'tray' ? 'nursery' : 'tower' });
      if (typeof logActivityNotification === 'function') {
        logActivityNotification('Stage Update', msg, 'sprout');
      }
      delivered[groupKey] = now;
    });

    // Clean up delivered records older than 14 days
    const cutoff = now - (14 * 86400000);
    Object.keys(delivered).forEach(k => {
      if (typeof delivered[k] === 'number' && delivered[k] < cutoff) {
        delete delivered[k];
      }
    });

    try {
      localStorage.setItem('ht_delivered_notifs', JSON.stringify(delivered));
      localStorage.setItem('ht_last_notif_check', String(now));
    } catch(e){}
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
      if (pending && pending.notifications && pending.notifications.length > 0) {
        await LocalNotifications.cancel(pending);
        console.log('🗑️ Cancelled previous scheduled notifications');
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
      badge: 'assets/icons/logo.png',
      tag: options.id ? String(options.id) : 'hydrogreen',
      data: options.data
    });
  }
};

/* ================= AUTO-INITIALIZE & SYNC ================= */
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      notificationManager.init().then(() => {
        notificationManager.scheduleAllReminders();
        notificationManager.checkOfflineAndStageTransitions();
      });
    }, 1500);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      notificationManager.checkOfflineAndStageTransitions();
    }
  });
}
