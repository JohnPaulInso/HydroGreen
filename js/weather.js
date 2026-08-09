/* ============================================================
   Weather Service — Real-time weather monitoring with auto-location
   Uses Open-Meteo API (free, no key required)
   ============================================================ */

const weatherService = {
  API_URL: 'https://api.open-meteo.com/v1/forecast',
  GEOCODE_URL: 'https://nominatim.openstreetmap.org/reverse',
  
  monitoring: false,
  monitorInterval: null,
  lastWeather: null,

  /* ================= AUTO-DETECT LOCATION ================= */
  // (2026-07-13) Add IP geolocation fallback for PWA & HTTP; prev: HTML5 only
  async detectLocation() {
    if (typeof showToast !== 'undefined') showToast('Detecting location…', 'forest', 'map-pin');
    
    // 1. Try HTML5 Browser Geolocation
    if (navigator.geolocation) {
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 }));
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const location = await this.reverseGeocode(lat, lng);
        return { coordinates: { lat, lng }, city: location.city, country: location.country, formatted: location.formatted };
      } catch (err) {
        console.warn('Browser geolocation failed/denied, using IP fallback:', err);
      }
    }

    // 2. IP-based Geolocation Fallback (PWA / HTTP friendly)
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (res.ok) {
        const data = await res.json();
        if (data && data.latitude && data.longitude) {
          const formatted = `${data.city || 'Local Area'}, ${data.country_name || ''}`.trim();
          return {
            coordinates: { lat: data.latitude, lng: data.longitude },
            city: data.city || 'Local Area',
            country: data.country_name || '',
            formatted
          };
        }
      }
    } catch(e) {
      console.warn('IP geolocation fallback failed:', e);
    }

    // 3. Default fallback
    return {
      coordinates: { lat: 11.0517, lng: 124.0055 },
      city: 'Bogo City',
      country: 'Philippines',
      formatted: 'Bogo City, Philippines'
    };
  },

  async reverseGeocode(lat, lng) {
    try {
      const response = await fetch(
        `${this.GEOCODE_URL}?lat=${lat}&lon=${lng}&format=json&zoom=10`,
        {
          headers: {
            'User-Agent': 'HydroTrack App'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Geocoding failed');
      }

      const data = await response.json();
      const addr = data.address || {};

      const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || 'Unknown';
      const country = addr.country || 'Unknown';

      return {
        city: city,
        country: country,
        formatted: `${city}, ${country}`,
        full: data.display_name
      };
    } catch (error) {
      console.error('Reverse geocode error:', error);
      return {
        city: 'Unknown',
        country: 'Unknown',
        formatted: 'Unknown Location'
      };
    }
  },

  // (2026-07-13) Add searchLocation forward geocode; prev: reverseGeocode only
  async searchLocation(query) {
    if (!query || !query.trim()) return null;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query.trim())}&format=json&limit=1`, { headers: { 'User-Agent': 'HydroTrack App' } });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.length) return null;
      const lat = Number(data[0].lat), lng = Number(data[0].lon);
      const name = data[0].display_name.split(',')[0] || query.trim();
      return { coordinates: { lat, lng }, formatted: name };
    } catch (e) {
      console.error('Location search failed:', e);
      return null;
    }
  },

  // (2026-07-13) Weather fetch timeout & offline cached fallback; prev: throw error
  async getWeather(lat, lng) {
    try {
      const params = new URLSearchParams({
        latitude: lat,
        longitude: lng,
        current: 'temperature_2m,relative_humidity_2m,precipitation,rain,showers,weathercode,windspeed_10m,winddirection_10m',
        hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,windspeed_10m',
        daily: 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',
        timezone: 'auto',
        forecast_days: 7
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const response = await fetch(`${this.API_URL}?${params}`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Weather API request failed');
      }

      const data = await response.json();
      this.lastWeather = this.parseWeatherData(data);
      try { localStorage.setItem('ht_cached_weather', JSON.stringify(this.lastWeather)); } catch(e){}
      return this.lastWeather;
    } catch (error) {
      console.warn('Weather fetch timeout or network error, using fallback:', error.message || error);
      try {
        const cached = localStorage.getItem('ht_cached_weather');
        if(cached){
          this.lastWeather = JSON.parse(cached);
          return this.lastWeather;
        }
      } catch(e){}
      this.lastWeather = this.getFallbackWeather();
      return this.lastWeather;
    }
  },

  getFallbackWeather() {
    const now = new Date();
    const hourlyTimes = Array.from({length:24}, (_,i)=>{
      const d = new Date(now);
      d.setHours(i, 0, 0, 0);
      return d.toISOString();
    });
    return {
      current: {
        temperature: 28,
        humidity: 75,
        precipitation: 0,
        weatherCode: 2,
        weatherDesc: 'Partly cloudy',
        windSpeed: 12,
        windDirection: 90,
        time: now.toISOString()
      },
      hourly: {
        times: hourlyTimes,
        temperatures: Array(24).fill(28),
        humidity: Array(24).fill(75),
        precipitationProb: Array(24).fill(20),
        precipitation: Array(24).fill(0),
        windSpeed: Array(24).fill(12)
      },
      daily: {
        dates: [now.toISOString().split('T')[0]],
        weatherCodes: [2],
        tempMax: [31],
        tempMin: [24],
        precipitationSum: [0],
        precipitationProbMax: [20]
      }
    };
  },

  parseWeatherData(data) {
    const current = data.current || {};
    const hourly = data.hourly || {};
    const daily = data.daily || {};

    return {
      current: {
        temperature: current.temperature_2m,
        humidity: current.relative_humidity_2m || 75,
        precipitation: current.precipitation || current.rain || 0,
        weatherCode: current.weathercode,
        weatherDesc: this.getWeatherDescription(current.weathercode),
        windSpeed: current.windspeed_10m,
        windDirection: current.winddirection_10m,
        time: current.time
      },
      hourly: {
        times: hourly.time || [],
        temperatures: hourly.temperature_2m || [],
        humidity: hourly.relative_humidity_2m || [],
        precipitation: hourly.precipitation || [],
        precipitationProb: hourly.precipitation_probability || [],
        windSpeed: hourly.windspeed_10m || []
      },
      daily: {
        dates: daily.time || [],
        weatherCodes: daily.weathercode || [],
        tempMax: daily.temperature_2m_max || [],
        tempMin: daily.temperature_2m_min || [],
        precipitationSum: daily.precipitation_sum || [],
        precipitationProbMax: daily.precipitation_probability_max || []
      }
    };
  },

  // (2026-07-13) Add getDefaultWeatherData fallback for weather widget; prev: none
  getDefaultWeatherData(){
    const now = new Date();
    const times = [];
    const temps = [];
    const baseTemp = 28;
    for(let i=0; i<8; i++){
      const t = new Date(now.getTime() + i*3600*1000);
      times.push(t.toISOString());
      temps.push(Math.round(baseTemp + Math.sin(i*0.8)*3));
    }
    const dates = [];
    const weatherCodes = [2, 1, 3, 61, 2, 0, 1];
    const tempMax = [30, 31, 29, 28, 30, 32, 31];
    const tempMin = [24, 25, 23, 22, 24, 25, 24];
    for(let i=0; i<7; i++){
      const d = new Date(now.getTime() + i*24*3600*1000);
      dates.push(d.toISOString().split('T')[0]);
    }
    return {
      current: {
        temperature: 28,
        humidity: 79,
        precipitation: 11,
        weatherCode: 2,
        weatherDesc: 'Mostly cloudy',
        windSpeed: 13,
        windDirection: 90,
        time: now.toISOString()
      },
      hourly: {
        times,
        temperatures: temps,
        humidity: [79, 78, 76, 75, 74, 76, 78, 80],
        precipitation: [0, 0, 0.2, 0.5, 0, 0, 0, 0],
        precipitationProb: [10, 15, 25, 20, 10, 5, 0, 0],
        windSpeed: [12, 14, 15, 13, 11, 10, 9, 8]
      },
      daily: {
        dates,
        weatherCodes,
        tempMax,
        tempMin,
        precipitationSum: [0, 0, 4.2, 12.0, 1.0, 0, 0],
        precipitationProbMax: [20, 15, 60, 85, 40, 10, 15]
      }
    };
  },

  getWeatherDescription(code) {
    const codes = {
      0: 'Clear sky',
      1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Foggy', 48: 'Depositing rime fog',
      51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
      61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
      71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
      77: 'Snow grains',
      80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
      85: 'Slight snow showers', 86: 'Heavy snow showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
    };
    return codes[code] || 'Unknown';
  },

  /* ================= WEATHER ALERTS ================= */
  async checkForAlerts(lat, lng) {
    try {
      const weather = await this.getWeather(lat, lng);
      const alerts = [];

      // Check next 12 hours
      const now = new Date();
      const next12Hours = weather.hourly.times.slice(0, 12);

      // RAIN ALERTS (50%+ chance or current rain)
      if (state.settings.rainAlerts) {
        const highRainProb = weather.hourly.precipitationProb.slice(0, 12).some(prob => prob >= 50);
        const currentRain = weather.current.precipitation > 0;

        if (highRainProb || currentRain) {
          alerts.push({
            type: 'rain',
            severity: 'moderate',
            title: '🌧️ Rain Alert',
            message: currentRain ? 
              'It\'s raining now — cover your seedling trays!' :
              'Rain expected in the next 12 hours — prepare to cover trays',
            action: 'Move trays under shelter or cover with plastic'
          });
        }

        // HEAVY RAIN (5mm+ per hour)
        const heavyRain = weather.hourly.precipitation.slice(0, 12).some(amount => amount >= 5);
        if (heavyRain) {
          alerts.push({
            type: 'heavyRain',
            severity: 'high',
            title: '⚠️ Heavy Rain Warning',
            message: 'Heavy rainfall expected — protect your setup!',
            action: 'Secure all equipment, move trays indoors if possible'
          });
        }
      }

      // WIND ALERTS (40+ km/h)
      if (state.settings.windAlerts) {
        const strongWind = weather.hourly.windSpeed.slice(0, 12).some(speed => speed >= 40);
        const currentStrongWind = weather.current.windSpeed >= 40;

        if (strongWind || currentStrongWind) {
          const isTyphoon = weather.current.windSpeed >= 62;
          
          alerts.push({
            type: isTyphoon ? 'typhoon' : 'wind',
            severity: isTyphoon ? 'critical' : 'high',
            title: isTyphoon ? '🌀 TYPHOON ALERT' : '💨 Strong Wind Warning',
            message: isTyphoon ?
              'Typhoon-force winds detected — Emergency preparation needed!' :
              'Strong winds expected — secure your tower and trays',
            action: isTyphoon ?
              'Bring all equipment indoors, secure or disassemble tower if possible' :
              'Check tower stability, secure loose items, protect trays'
          });
        }
      }

      return alerts;
    } catch (error) {
      console.error('Alert check error:', error);
      return [];
    }
  },

  /* ================= WEATHER MONITORING ================= */
  async startMonitoring() {
    if (this.monitoring) {
      console.log('Weather monitoring already running');
      return;
    }

    // Check if location is set
    if (!state.settings.coordinates) {
      try {
        const location = await this.detectLocation();
        state.settings.location = location.formatted;
        state.settings.coordinates = location.coordinates;
        persist('settings');
        
        showToast(`Location set: ${location.formatted}`, 'forest', 'map-pin');
      } catch (error) {
        console.error('Location detection failed:', error);
        showToast('Could not detect location for weather alerts', 'clay', 'alert-triangle');
        return;
      }
    }

    // Initial check
    await this.checkAndNotify();

    // Check every hour
    this.monitorInterval = setInterval(async () => {
      await this.checkAndNotify();
    }, 3600000); // 1 hour

    this.monitoring = true;
    console.log('✅ Weather monitoring started');
  },

  async checkAndNotify() {
    if (!state.settings.coordinates) return;

    try {
      const alerts = await this.checkForAlerts(
        state.settings.coordinates.lat,
        state.settings.coordinates.lng
      );

      alerts.forEach(alert => {
        // Add to alert log
        state.alertLog.unshift({
          id: uid(),
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          action: alert.action,
          timestamp: Date.now()
        });
        persist('alertLog');

        // Show toast
        showToast(alert.message, alert.severity === 'critical' ? 'clay' : 'forest', 'alert-triangle');

        // Send push notification if available
        if (typeof notificationManager !== 'undefined' && notificationManager.initialized) {
          notificationManager.sendWeatherAlert(alert.type, alert.message);
        }

        // Show banner on dashboard and reminders page
        showWeatherBanner(alert);
      });

      if (alerts.length > 0) {
        console.log(`⚠️ ${alerts.length} weather alert(s) triggered`);
      }
    } catch (error) {
      console.error('Weather check failed:', error);
    }
  },

  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.monitoring = false;
    console.log('🛑 Weather monitoring stopped');
  }
};

// (2026-07-13) Add interactive weather tabs & hourly graph rendering; prev: static
let currentTempUnit = 'C';
let activeWeatherTab = 'temp';
let cachedWeatherData = null;

function getWeatherIconEmoji(code){
  if(code===0) return '☀️';
  if(code>=1 && code<=3) return '⛅';
  if(code===45 || code===48) return '🌫️';
  if(code>=51 && code<=67) return '🌧️';
  if(code>=71 && code<=77) return '❄️';
  if(code>=80 && code<=82) return '🌦️';
  if(code>=95) return '🌩️';
  return '☁️';
}

// (2026-07-13) Add unit toggle click handlers to switch green highlight between C and F; prev: unhandled click
function setupWeatherUnitToggles(){
  const btnC = document.getElementById('btnUnitC');
  const btnF = document.getElementById('btnUnitF');
  if(!btnC || !btnF || btnC.dataset.wired) return;
  btnC.dataset.wired = '1';

  const updateUnitsUI = (unit) => {
    currentTempUnit = unit;
    btnC.className = unit==='C' ? 'text-[10px] font-bold text-white bg-forest px-2 py-0.5 rounded-full transition-all' : 'text-[10px] font-medium text-ink-soft px-2 py-0.5 rounded-full transition-all';
    btnF.className = unit==='F' ? 'text-[10px] font-bold text-white bg-forest px-2 py-0.5 rounded-full transition-all' : 'text-[10px] font-medium text-ink-soft px-2 py-0.5 rounded-full transition-all';
    if(cachedWeatherData){
      renderGoogleWeatherWidget(cachedWeatherData);
    }
  };

  btnC.onclick = () => updateUnitsUI('C');
  btnF.onclick = () => updateUnitsUI('F');
}

function setupWeatherTabs(){
  const tabTemp = document.getElementById('tabWeatherTemp');
  const tabPrecip = document.getElementById('tabWeatherPrecip');
  const tabWind = document.getElementById('tabWeatherWind');
  if(!tabTemp || tabTemp.dataset.wired) return;
  tabTemp.dataset.wired = '1';

  const setTab = (tab) => {
    activeWeatherTab = tab;
    [tabTemp, tabPrecip, tabWind].forEach(t => {
      if(!t) return;
      const isActive = t.id === `tabWeather${tab.charAt(0).toUpperCase() + tab.slice(1)}`;
      // (2026-07-13) Segmented pill control active styling toggle; prev: underline border
      t.className = `px-3.5 py-1.5 rounded-lg text-[12.5px] whitespace-nowrap transition-all flex-shrink-0 cursor-pointer ${isActive ? 'font-bold text-forest bg-white shadow-xs border border-line/60' : 'font-semibold text-ink-soft hover:text-ink bg-transparent hover:bg-white/60 border border-transparent'}`;
    });
    if(cachedWeatherData) renderHourlyGraph(cachedWeatherData);
  };

  tabTemp.onclick = () => setTab('temp');
  tabPrecip.onclick = () => setTab('precip');
  tabWind.onclick = () => setTab('wind');
}

// (2026-07-13) Fix chart clipping by adding padLeft & padRight inset margins; prev: point at 560px clipped edge
function renderHourlyGraph(weather){
  const svg = document.getElementById('weatherHourlySvg');
  if(!svg || !weather || !weather.hourly) return;
  
  let values = [];
  let unitSymbol = '°';
  let strokeColor = '#E8A33D';

  if(activeWeatherTab === 'temp'){
    values = (weather.hourly.temperatures || []).slice(0, 8).map(t => Math.round(currentTempUnit==='C' ? t : (t*9/5)+32));
    unitSymbol = '°';
    strokeColor = '#E8A33D';
  } else if(activeWeatherTab === 'precip'){
    values = (weather.hourly.precipitationProb || [10,15,20,10,5,0,0,0]).slice(0, 8);
    unitSymbol = '%';
    strokeColor = '#2563A6';
  } else if(activeWeatherTab === 'wind'){
    values = (weather.hourly.windSpeeds || [12,14,13,15,11,10,9,8]).slice(0, 8).map(w => Math.round(w));
    unitSymbol = ' km/h';
    strokeColor = '#2F9E5B';
  }

  const times = (weather.hourly.times || []).slice(0, 8);
  const minV = Math.min(...values) - (activeWeatherTab==='precip'?5:2);
  const maxV = Math.max(...values) + (activeWeatherTab==='precip'?10:2);
  const range = (maxV - minV) || 1;
  const width = 600, height = 90, padY = 24, graphH = 38;
  const padLeft = 32, padRight = 32;
  const stepX = (width - padLeft - padRight) / Math.max(1, values.length - 1);

  const points = values.map((v, i)=>{
    const x = padLeft + (i * stepX);
    const y = padY + graphH - (((v - minV) / range) * graphH);
    return { x, y, val: v, time: times[i] ? new Date(times[i]).toLocaleTimeString('en-US',{hour:'numeric'}) : `${i+1}h` };
  });

  const pathD = points.map((p, i) => `${i===0?'M':'L'}${p.x},${p.y}`).join(' ');
  const areaD = `${pathD} L${points[points.length-1].x},${height-14} L${points[0].x},${height-14} Z`;

  let html = `<defs>
    <linearGradient id="weatherGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0"/>
    </linearGradient>
  </defs>`;

  html += `<path d="${areaD}" fill="url(#weatherGrad)"/>`;
  html += `<path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="3" stroke-linecap="round"/>`;

  points.forEach(p => {
    html += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#FFFFFF" stroke="${strokeColor}" stroke-width="2.5"/>`;
    html += `<text x="${p.x}" y="${p.y - 7}" font-size="11" font-family="Montserrat,sans-serif" font-weight="700" fill="#1C231F" text-anchor="middle">${p.val}${unitSymbol}</text>`;
    html += `<text x="${p.x}" y="${height - 2}" font-size="10" font-family="Montserrat,sans-serif" font-weight="500" fill="#5B6B64" text-anchor="middle">${p.time}</text>`;
  });

  svg.setAttribute('viewBox', '0 0 600 90');
  svg.innerHTML = html;
}

function renderGoogleWeatherWidget(weather, locationName){
  if(!weather || !weather.current) return;
  cachedWeatherData = weather;
  setupWeatherTabs();
  // (2026-07-13) Wire C/F unit toggles; prev: none
  setupWeatherUnitToggles();

  const c = weather.current;
  const tempC = Math.round(c.temperature);
  const tempF = Math.round((c.temperature * 9/5) + 32);
  const displayTemp = currentTempUnit==='C' ? tempC : tempF;

  const tempBig = document.getElementById('weatherTempBig');
  if(tempBig) tempBig.textContent = displayTemp;

  const mainIcon = document.getElementById('weatherMainIcon');
  if(mainIcon) mainIcon.textContent = getWeatherIconEmoji(c.weatherCode);

  const condText = document.getElementById('weatherConditionText');
  if(condText) condText.textContent = c.weatherDesc;

  // (2026-07-13) Populate split detail spans; prev: single weatherDetailsLine
  const precipProb = weather.hourly.precipitationProb && weather.hourly.precipitationProb.length ? weather.hourly.precipitationProb[0] : 0;
  const humVal = document.getElementById('weatherHumVal');
  if(humVal) humVal.textContent = `${c.humidity}%`;
  const windVal = document.getElementById('weatherWindVal');
  if(windVal) windVal.textContent = `${Math.round(c.windSpeed)} km/h`;
  const precipVal = document.getElementById('weatherPrecipVal');
  if(precipVal) precipVal.textContent = `${precipProb}%`;

  const dateSub = document.getElementById('weatherDateSub');
  if(dateSub){
    const now = new Date();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    dateSub.textContent = `${dayName} ${timeStr}`;
  }

  renderHourlyGraph(weather);

  // (2026-07-13) 7-day strip as full-bleed column cells; prev: gap grid cards
  const dailyStrip = document.getElementById('weatherDailyStrip');
  if(dailyStrip && weather.daily && weather.daily.dates && weather.daily.dates.length){
    dailyStrip.innerHTML = '';
    weather.daily.dates.slice(0, 7).forEach((d, i)=>{
      const dateObj = new Date(d);
      const dayShort = i===0 ? 'Today' : dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const code = weather.daily.weatherCodes[i] || 0;
      const maxT = Math.round(currentTempUnit==='C' ? weather.daily.tempMax[i] : (weather.daily.tempMax[i]*9/5)+32);
      const minT = Math.round(currentTempUnit==='C' ? weather.daily.tempMin[i] : (weather.daily.tempMin[i]*9/5)+32);
      // (2026-07-13) Google Weather style daily forecast cards with active day highlight; prev: basic column cells
      const cell = document.createElement('div');
      cell.className = `flex flex-col items-center py-2 px-2.5 text-center min-w-[56px] rounded-xl border flex-shrink-0 transition-all ${i===0 ? 'bg-forest text-white border-forest shadow-xs' : 'bg-white text-ink border-line/60 hover:border-forest/40'}`;
      cell.innerHTML = `
        <span class="text-[11px] font-semibold ${i===0?'text-white':'text-ink-soft'} leading-tight mb-1">${dayShort}</span>
        <span class="text-[20px] leading-none my-1">${getWeatherIconEmoji(code)}</span>
        <span class="text-[11px] font-bold ${i===0?'text-white':'text-ink'} leading-tight">${maxT}° <span class="font-normal ${i===0?'text-white/70':'text-ink-soft'}">${minT}°</span></span>
      `;
      dailyStrip.appendChild(cell);
    });
  }
}

/* ================= WEATHER BANNER ================= */
function showWeatherBanner(alert) {
  const banners = ['alertBanner', 'alertBanner2'];
  
  banners.forEach(bannerId => {
    const banner = document.getElementById(bannerId);
    if (!banner) return;

    const bgColor = {
      critical: 'bg-clay',
      high: 'bg-[#E8A33D]',
      moderate: 'bg-[#2563A6]'
    }[alert.severity] || 'bg-forest';

    banner.className = `banner-enter mb-5 ${bgColor} text-white rounded-2xl p-4 flex items-center gap-3`;
    banner.innerHTML = `
      <span class="text-2xl flex-shrink-0">${alert.title.split(' ')[0]}</span>
      <div class="flex-1">
        <div class="font-semibold text-[14px]">${alert.title}</div>
        <div class="text-[12px] text-white/85 mt-1">${alert.message}</div>
        <div class="text-[11.5px] text-white/70 mt-2 bg-white/10 rounded-lg px-2 py-1 inline-block">
          <strong>Action:</strong> ${alert.action}
        </div>
      </div>
      <button onclick="this.parentElement.classList.add('hidden')" class="text-white/70 hover:text-white p-1 flex-shrink-0">✕</button>
    `;
  });
}

/* ================= AUTO-START ================= */
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Start weather monitoring after app loads
    setTimeout(async () => {
      // Only start if weather alerts are enabled
      if (typeof state !== 'undefined' && state && state.settings && (state.settings.rainAlerts || state.settings.windAlerts)) {
        try {
          await weatherService.startMonitoring();
        } catch (error) {
          console.error('Failed to start weather monitoring:', error);
        }
      }
    }, 3000);
  });
}
