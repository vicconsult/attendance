/* Attendance build 2026.08.17-server21-mysql - server-backed, multi-office */
(function () {
  'use strict';

  const ACCOUNT_KEY = 'attendance-account-v1';
  const LEGACY_RECORDS_KEY = 'attendance-records-v1';
  const LEGACY_SETTINGS_KEY = 'attendance-settings-v1';
  const THEME_KEY = 'attendance-theme';
  const DEFAULTS = { windowWeeks:12, targetAverage:2, normalWeekly:3, attendanceStartMinutes:300, attendanceEndMinutes:900 };
  const $ = id => document.getElementById(id);
  let account = loadAccount();
  let settings = loadLegacySettings();
  let records = [];
  let usernameCheckSequence = 0;
  let justCreatedToken = '';

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    applyStoredTheme();
    bindEvents();
    setupPwa();
    setupCollapsibleLinks();
    $('shortcutTimezone').value = browserTimezone();
    if (account) {
      await connectAccount(false);
    } else {
      showRegistration();
    }
  }

  function bindEvents() {
    $('themeButton').addEventListener('click', toggleTheme);
    $('usernameInput').addEventListener('input', debounceUsernameCheck);
    $('reserveUsernameButton').addEventListener('click', reserveUsername);
    $('connectButton').addEventListener('click', connectExistingAccount);
    $('forgetDeviceButton').addEventListener('click', forgetDevice);
    $('copyTokenButton').addEventListener('click', () => copyText(justCreatedToken || (account && account.token), 'Private token copied'));
    $('showAddButton').addEventListener('click', showAddForm);
    $('cancelAddButton').addEventListener('click', hideAddForm);
    $('addForm').addEventListener('submit', addOrCorrectAttendance);
    $('historyList').addEventListener('click', deleteAttendance);
    $('shortcutOffice').addEventListener('input', updateShortcutUrl);
    $('shortcutTimezone').addEventListener('input', updateShortcutUrl);
    $('copyShortcutButton').addEventListener('click', () => copyText($('shortcutUrl').dataset.url || '', 'Shortcut URL copied'));
    $('exportButton').addEventListener('click', exportBackup);
    $('importFile').addEventListener('change', importBackup);
  }

  function showRegistration() {
    $('registrationPanel').hidden = false;
    $('registrationView').hidden = false;
    $('accountPanel').hidden = true;
    $('accountView').hidden = true;
    $('trackerArea').hidden = true;
  }

  function showAccount() {
    $('registrationPanel').hidden = true;
    $('registrationView').hidden = true;
    $('accountPanel').hidden = false;
    $('accountView').hidden = false;
    $('trackerArea').hidden = false;
    $('accountUsername').textContent = account.username;
    if (justCreatedToken) {
      $('newTokenNotice').hidden = false;
      $('privateTokenText').textContent = justCreatedToken;
    } else {
      $('newTokenNotice').hidden = true;
    }
    updateShortcutUrl();
  }

  function debounceUsernameCheck() {
    const seq = ++usernameCheckSequence;
    const username = normalizeUsername($('usernameInput').value);
    $('reserveUsernameButton').disabled = true;
    if (!validUsername(username)) {
      setAvailability('', 'Use 3–32 letters, numbers, _ or -.', '');
      return;
    }
    setAvailability('…', 'Checking availability…', 'checking');
    setTimeout(async () => {
      if (seq !== usernameCheckSequence) return;
      try {
        const response = await fetch('/api/username?name=' + encodeURIComponent(username), { cache:'no-store' });
        const data = await response.json();
        if (seq !== usernameCheckSequence) return;
        if (data.available) {
          setAvailability('✓', 'Username available', 'good');
          $('reserveUsernameButton').disabled = false;
        } else if (data.valid) {
          setAvailability('×', 'Username already taken', 'error');
        } else {
          setAvailability('×', 'Username is not valid', 'error');
        }
      } catch (error) {
        setAvailability('×', 'Unable to check username right now', 'error');
      }
    }, 350);
  }

  function setAvailability(icon, text, type) {
    $('usernameIcon').textContent = icon;
    $('usernameIcon').className = 'username-icon' + (type ? ' ' + type : '');
    $('usernameStatus').textContent = text;
    $('usernameStatus').className = 'availability-status' + (type ? ' ' + type : '');
  }

  async function reserveUsername() {
    const username = normalizeUsername($('usernameInput').value);
    if (!validUsername(username)) return;
    const button = $('reserveUsernameButton');
    setBusy(button, true, 'Reserving…');
    try {
      const body = new URLSearchParams({ username });
      const response = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'}, body:body.toString(), cache:'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'Unable to reserve username.');
      account = { username:data.username, token:data.token };
      justCreatedToken = data.token;
      const persisted = saveAccount(account);
      await migrateLegacyRecords();
      showAccount();
      if (!persisted) toast('Save the private token — this browser could not remember it');
      await refresh();
      toast('Username reserved');
    } catch (error) {
      if (/already taken/i.test(error.message || '')) setAvailability('×', 'Username already taken', 'error');
      else toast(error.message || 'Unable to reserve username');
    } finally {
      setBusy(button, false, 'Reserve username');
      if (!$('usernameStatus').classList.contains('good')) button.disabled = true;
    }
  }

  async function connectExistingAccount() {
    const username = normalizeUsername($('existingUsername').value);
    const token = $('existingToken').value.trim();
    const message = $('connectMessage');
    if (!username || !token) { setMessage(message, 'Enter both username and private token.', true); return; }
    const button = $('connectButton');
    setBusy(button, true, 'Connecting…');
    try {
      const testAccount = { username, token };
      await fetchRecords(testAccount);
      account = testAccount;
      justCreatedToken = '';
      saveAccount(account);
      setMessage(message, 'Connected.', false, true);
      showAccount();
      await migrateLegacyRecords();
      await refresh();
      toast('Device connected');
    } catch (error) {
      setMessage(message, error.message || 'Unable to connect.', true);
    } finally { setBusy(button, false, 'Connect this device'); }
  }

  async function connectAccount(showError) {
    try {
      await refresh();
      showAccount();
      await handleLegacyAutomaticCheckin();
    } catch (error) {
      if (error && error.status === 401) {
        const remembered = account;
        account = null;
        showRegistration();
        $('existingUsername').value = remembered ? remembered.username : '';
        setMessage($('connectMessage'), 'The saved private token was not accepted. Reconnect with a valid token.', true);
      } else {
        showAccount();
        $('trackerArea').hidden = false;
        $('todayStatus').textContent = 'Server unavailable';
        $('todayDetail').textContent = 'Your private account is still saved on this device. Try again when the server is reachable.';
        $('todayBadge').textContent = 'OFFLINE';
        $('todayBadge').className = 'status-badge pending';
        if (showError || error) toast(error.message || 'Unable to reach attendance server');
      }
    }
  }

  function forgetDevice() {
    const username = account && account.username ? '@' + account.username : 'this account';
    const confirmed = window.confirm(
      'Forget ' + username + ' on this device?\n\n' +
      'This removes the saved username and private token from this browser only. Your attendance on the server will NOT be deleted.'
    );
    if (!confirmed) return;
    clearAccount(); account = null; records = []; justCreatedToken = '';
    $('usernameInput').value = '';
    $('existingUsername').value = '';
    $('existingToken').value = '';
    showRegistration();
    toast('Account forgotten on this device');
  }

  async function migrateLegacyRecords() {
    if (!account) return;
    const marker = 'attendance-server-migrated-' + account.username;
    if (safeGet(marker) === '1') return;
    let legacy = [];
    try { legacy = JSON.parse(safeGet(LEGACY_RECORDS_KEY) || '[]'); } catch (e) { legacy = []; }
    if (!Array.isArray(legacy) || !legacy.length) { safeSet(marker, '1'); return; }
    let migrated = 0;
    for (const record of legacy) {
      if (!record || !/^\d{4}-\d{2}-\d{2}$/.test(record.date || '')) continue;
      const time = record.attendanceLocalTime || timeFromInstant(record.attendedAt || record.createdAt) || '09:00';
      const office = cleanOfficeName(record.officeName || record.officeAlias || record.officeAddress || 'Legacy office');
      try {
        await postAttendance({ date:record.date, time, office, source:'legacy-migration', tz:record.timezone || browserTimezone() });
        migrated++;
      } catch (e) { console.warn('Legacy attendance migration skipped', record.date, e); }
    }
    safeSet(marker, '1');
    if (migrated) toast('Imported ' + migrated + ' existing attendance day' + (migrated === 1 ? '' : 's'));
  }

  async function refresh() {
    if (!account) return;
    records = await fetchRecords(account);
    records.sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
    renderDashboard(); renderHistory(); renderOfficeSuggestions(); updateShortcutUrl();
  }

  async function fetchRecords(whichAccount) {
    const url = '/api/attendance?u=' + encodeURIComponent(whichAccount.username);
    const response = await fetch(url, { headers:{'Authorization':'Bearer ' + whichAccount.token}, cache:'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) { const error = new Error(data.message || 'Unable to load attendance.'); error.status = response.status; throw error; }
    return Array.isArray(data.records) ? data.records : [];
  }

  async function postAttendance(values) {
    const body = new URLSearchParams({ u:account.username, date:values.date, time:values.time, office:values.office, source:values.source || 'manual-backfill', tz:values.tz || browserTimezone() });
    const response = await fetch('/api/attendance', { method:'POST', headers:{'Authorization':'Bearer ' + account.token,'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'}, body:body.toString(), cache:'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || 'Unable to save attendance.');
    return data.record;
  }

  async function deleteServerAttendance(date) {
    const url = '/api/attendance?u=' + encodeURIComponent(account.username) + '&date=' + encodeURIComponent(date);
    const response = await fetch(url, { method:'DELETE', headers:{'Authorization':'Bearer ' + account.token}, cache:'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || 'Unable to remove attendance.');
  }

  async function handleLegacyAutomaticCheckin() {
    if (!account) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('autoCheckin') !== '1') return;
    const office = cleanOfficeName(url.searchParams.get('office')) || 'Office';
    const tz = browserTimezone();
    try {
      const endpoint = '/checkin?u=' + encodeURIComponent(account.username) + '&office=' + encodeURIComponent(office) + '&tz=' + encodeURIComponent(tz);
      const response = await fetch(endpoint, { headers:{'Authorization':'Bearer ' + account.token}, cache:'no-store' });
      const data = await response.json();
      toast(data.message || 'Check-in processed');
      await refresh();
    } catch (e) { toast('Unable to process old Shortcut check-in'); }
    url.searchParams.delete('autoCheckin'); url.searchParams.delete('office');
    history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + url.hash);
  }

  function renderDashboard() {
    const now = localNow();
    const today = now.date;
    const counted = records.filter(r => evaluateRecord(r).eligible);
    const todayRecord = counted.find(r => r.date === today);
    const weekStart = startOfWeekMonday(today);
    const start = addDays(weekStart, -((settings.windowWeeks - 1) * 7));
    const rolling = counted.filter(r => r.date >= start && r.date <= today);
    const targetTotal = Math.ceil(settings.targetAverage * settings.windowWeeks);
    const average = rolling.length / settings.windowWeeks;
    const thisWeek = counted.filter(r => r.date >= weekStart && r.date <= today).length;

    $('averageValue').textContent = average.toFixed(2); $('rollingTotal').textContent = rolling.length; $('targetTotal').textContent = ' / ' + targetTotal;
    $('rollingRange').textContent = formatShort(start) + ' – ' + formatShort(today); $('thisWeek').textContent = thisWeek; $('neededValue').textContent = Math.max(0,targetTotal-rolling.length); $('attendanceDate').max = today;
    const avgStatus = $('averageStatus');
    avgStatus.textContent = average >= settings.targetAverage ? 'Meeting target of ' + settings.targetAverage.toFixed(2) + ' / week' : 'Target ' + settings.targetAverage.toFixed(2) + ' / week';
    avgStatus.className = 'metric-note ' + (average >= settings.targetAverage ? 'good' : 'warn');

    if (todayRecord) {
      $('todayStatus').textContent = 'Office day counted'; $('todayDetail').textContent = officeNameForRecord(todayRecord) + ' · ' + formatTime(todayRecord.attendanceLocalTime); $('todayBadge').textContent = 'COUNTED'; $('todayBadge').className = 'status-badge good';
    } else if (!now.isWeekday) {
      $('todayStatus').textContent = 'Weekend — not counted'; $('todayDetail').textContent = 'Attendance is counted Monday through Friday only.'; $('todayBadge').textContent = 'NOT ELIGIBLE'; $('todayBadge').className = 'status-badge pending';
    } else if (!now.inWindow) {
      $('todayStatus').textContent = 'Attendance window closed'; $('todayDetail').textContent = 'Attendance counts from 5:00 AM through 3:00 PM in the office time zone.'; $('todayBadge').textContent = 'CLOSED'; $('todayBadge').className = 'status-badge pending';
    } else {
      $('todayStatus').textContent = 'Not counted yet'; $('todayDetail').textContent = 'An office Arrive automation can count today in the background.'; $('todayBadge').textContent = 'PENDING'; $('todayBadge').className = 'status-badge pending';
    }
    renderChart(start,today,counted); renderOfficeStats(start,today,counted);
  }

  function renderOfficeStats(start,today,counted) {
    const container = $('officeStatsList'); const rolling = counted.filter(r => r.date >= start && r.date <= today); const groups = new Map();
    counted.forEach(record => { const name=officeNameForRecord(record), key=name.toLocaleLowerCase(); if(!groups.has(key)) groups.set(key,{name,rolling:0,allTime:0,lastVisit:''}); const g=groups.get(key); g.allTime++; if(!g.lastVisit||record.date>g.lastVisit) g.lastVisit=record.date; });
    rolling.forEach(record => { const key=officeNameForRecord(record).toLocaleLowerCase(); if(groups.has(key)) groups.get(key).rolling++; });
    const items=Array.from(groups.values()).sort((a,b)=>b.rolling-a.rolling||b.allTime-a.allTime||a.name.localeCompare(b.name));
    container.innerHTML=''; $('emptyOfficeStats').hidden=items.length!==0; if(!items.length)return;
    const header=document.createElement('div'); header.className='office-stat-row header'; header.innerHTML='<div>Office</div><div>12 weeks</div><div>Avg/week</div><div class="mobile-hide hide-tablet">All time</div><div class="mobile-hide hide-tablet">Last visit</div>'; container.appendChild(header);
    items.forEach(item=>{ const row=document.createElement('div'); row.className='office-stat-row'; row.innerHTML='<div><div class="office-name">'+escapeHtml(item.name)+'</div><div class="office-sub">'+percent(item.rolling,rolling.length)+' of rolling visits</div></div><div class="office-value">'+item.rolling+'</div><div class="office-value">'+(item.rolling/settings.windowWeeks).toFixed(2)+'</div><div class="office-value mobile-hide hide-tablet">'+item.allTime+'</div><div class="office-value mobile-hide hide-tablet">'+escapeHtml(formatShort(item.lastVisit))+'</div>'; container.appendChild(row); });
  }

  function renderChart(start,today,counted) {
    const chart=$('weeksChart'); chart.innerHTML=''; const rolling=counted.filter(r=>r.date>=start&&r.date<=today);
    for(let i=0;i<settings.windowWeeks;i++){ const periodStart=addDays(start,i*7), periodEnd=addDays(periodStart,6), cappedEnd=periodEnd>today?today:periodEnd; const count=rolling.filter(r=>r.date>=periodStart&&r.date<=cappedEnd).length; const height=Math.max(3,Math.min(100,(count/5)*100)); const col=document.createElement('div'); col.className='week-column'; col.title='Week of '+formatShort(periodStart)+' ('+formatShort(periodStart)+' – '+formatShort(cappedEnd)+'): '+count+' day'+(count===1?'':'s'); col.innerHTML='<div class="week-track"><div class="week-bar" style="height:'+height+'%"></div></div><div class="week-count">'+count+'</div><div class="week-label">'+formatTiny(periodStart)+'</div>'; chart.appendChild(col); }
  }

  function renderHistory() {
    const list=$('historyList'); list.innerHTML=''; $('emptyHistory').hidden=records.length!==0;
    records.forEach(record=>{ const e=evaluateRecord(record); const row=document.createElement('div'); row.className='history-row'; const meta=[sourceLabel(record.source),e.localTime?formatTime(e.localTime):'time missing']; if(record.timezone)meta.push(record.timezone); if(!e.eligible)meta.push('Not counted: '+e.reason); row.innerHTML='<div><div class="history-date">'+escapeHtml(formatLong(record.date))+'</div><div class="history-office">'+escapeHtml(officeNameForRecord(record))+'</div><div class="history-meta">'+escapeHtml(meta.join(' · '))+'</div></div><button class="delete-button" type="button" data-date="'+escapeHtml(record.date)+'">Remove</button>'; list.appendChild(row); });
  }

  function renderOfficeSuggestions() {
    const seen=[], keys=new Set(); records.forEach(r=>{const name=officeNameForRecord(r),key=name.toLocaleLowerCase(); if(name&&!keys.has(key)){keys.add(key);seen.push(name);}}); $('officeSuggestions').innerHTML=seen.map(n=>'<option value="'+escapeHtml(n)+'"></option>').join('');
  }

  function showAddForm(){ const now=localNow(); $('addForm').hidden=false; $('showAddButton').hidden=true; $('attendanceDate').value=now.date; $('attendanceTime').value=now.inWindow?now.time:'09:00'; $('attendanceOffice').value=records.length?officeNameForRecord(records[0]):''; $('attendanceDate').focus(); }
  function hideAddForm(){ $('addForm').hidden=true; $('showAddButton').hidden=false; $('addMessage').textContent=''; }

  async function addOrCorrectAttendance(event) {
    event.preventDefault(); const date=$('attendanceDate').value,time=$('attendanceTime').value,office=cleanOfficeName($('attendanceOffice').value),message=$('addMessage');
    if(!date||!time||!office){setMessage(message,'Date, time and office name are required.',true);return;} if(date>localNow().date){setMessage(message,'Future dates cannot be added.',true);return;} if(!isWeekday(date)){setMessage(message,'Only Monday through Friday can be counted.',true);return;} if(!isWithinAttendanceWindow(timeToMinutes(time))){setMessage(message,'Time must be between 5:00 AM and 3:00 PM.',true);return;}
    const button=$('addForm').querySelector('.primary'); setBusy(button,true,'Saving…');
    try { const existed=records.some(r=>r.date===date); await postAttendance({date,time,office,source:'manual-backfill',tz:browserTimezone()}); const text=existed?'Attendance updated.':'Attendance added.'; setMessage(message,text,false,true); toast(text.replace(/\.$/,'')); await refresh(); }
    catch(error){setMessage(message,error.message||'Unable to save attendance.',true);} finally{setBusy(button,false,'Save');}
  }

  async function deleteAttendance(event) {
    const button=event.target.closest('.delete-button'); if(!button)return; const date=button.dataset.date; if(!window.confirm('Remove attendance for '+formatLong(date)+'?'))return;
    try{await deleteServerAttendance(date);toast('Attendance removed');await refresh();}catch(error){toast(error.message||'Unable to remove attendance');}
  }

  function updateShortcutUrl() {
    if(!account)return; const office=cleanOfficeName($('shortcutOffice').value),tz=$('shortcutTimezone').value.trim()||browserTimezone(),code=$('shortcutUrl'),button=$('copyShortcutButton');
    if(!office){code.textContent='Enter an office name.';code.dataset.url='';button.disabled=true;return;}
    const url=window.location.origin+'/checkin?u='+encodeURIComponent(account.username)+'&token='+encodeURIComponent(account.token)+'&office='+encodeURIComponent(office)+'&tz='+encodeURIComponent(tz);
    code.textContent=url; code.dataset.url=url; button.disabled=false;
  }

  function evaluateRecord(record){ if(!record||!/^\d{4}-\d{2}-\d{2}$/.test(record.date||''))return{eligible:false,reason:'invalid date'}; if(!isWeekday(record.date))return{eligible:false,reason:'weekends do not count'}; const minutes=timeToMinutes(record.attendanceLocalTime); if(!Number.isFinite(minutes))return{eligible:false,reason:'attendance time is missing'}; if(!isWithinAttendanceWindow(minutes))return{eligible:false,reason:'outside the 5:00 AM–3:00 PM window'}; return{eligible:true,localTime:record.attendanceLocalTime}; }
  function officeNameForRecord(record){return cleanOfficeName(record&&(record.officeName||record.officeAlias||record.officeAddress))||'Unknown office';}
  function cleanOfficeName(v){return String(v||'').replace(/[\r\n\t]+/g,' ').replace(/\s{2,}/g,' ').trim().slice(0,80);}

  function localNow(d){d=d||new Date();const year=d.getFullYear(),month=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'),hour=String(d.getHours()).padStart(2,'0'),minute=String(d.getMinutes()).padStart(2,'0'),date=year+'-'+month+'-'+day,time=hour+':'+minute,minutes=d.getHours()*60+d.getMinutes();return{date,time,minutes,isWeekday:isWeekday(date),inWindow:isWithinAttendanceWindow(minutes)};}
  function isWeekday(iso){const day=new Date(iso+'T12:00:00Z').getUTCDay();return day>=1&&day<=5;}
  function timeToMinutes(time){if(!/^\d{2}:\d{2}$/.test(time||''))return NaN;const p=time.split(':').map(Number);if(p[0]>23||p[1]>59)return NaN;return p[0]*60+p[1];}
  function isWithinAttendanceWindow(m){return Number.isFinite(m)&&m>=settings.attendanceStartMinutes&&m<=settings.attendanceEndMinutes;}
  function addDays(iso,days){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
  function startOfWeekMonday(iso){const d=new Date(iso+'T12:00:00Z'),day=d.getUTCDay();return addDays(iso,-(day===0?6:day-1));}
  function percent(part,total){return total?Math.round(part/total*100)+'%':'0%';}
  function formatTime(time){const p=String(time||'').split(':').map(Number);if(p.length!==2||p.some(Number.isNaN))return time||'';return(p[0]%12||12)+':'+String(p[1]).padStart(2,'0')+' '+(p[0]>=12?'PM':'AM');}
  function formatLong(iso){return new Date(iso+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'});}
  function formatShort(iso){return iso?new Date(iso+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}):'—';}
  function formatTiny(iso){return new Date(iso+'T12:00:00').toLocaleDateString(undefined,{month:'numeric',day:'numeric'});}
  function sourceLabel(s){if(s==='iphone-arrive-automation')return'iPhone automation';if(s==='manual-backfill')return'Manual correction';if(s==='legacy-migration')return'Imported from device';return s||'Attendance';}
  function browserTimezone(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Toronto';}catch(e){return'America/Toronto';}}
  function timeFromInstant(value){if(!value)return'';const d=new Date(value);if(Number.isNaN(d.getTime()))return'';return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}

  async function exportBackup(){if(!account)return;const data={version:5,exportedAt:new Date().toISOString(),username:account.username,settings,records};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='attendance-backup-'+localNow().date+'.json';document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);}
  async function importBackup(event){const file=event.target.files&&event.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text());if(!parsed||!Array.isArray(parsed.records))throw new Error('Invalid attendance backup.');let imported=0;for(const record of parsed.records){if(!record||!/^\d{4}-\d{2}-\d{2}$/.test(record.date||''))continue;const time=record.attendanceLocalTime||'09:00',office=officeNameForRecord(record);await postAttendance({date:record.date,time,office,source:'backup-import',tz:record.timezone||browserTimezone()});imported++;}toast('Imported '+imported+' attendance day'+(imported===1?'':'s'));await refresh();}catch(error){toast(error.message||'Unable to import backup');}finally{event.target.value='';}}

  function normalizeUsername(v){return String(v||'').trim().toLowerCase();}
  function validUsername(v){return /^[a-z0-9][a-z0-9_-]{2,31}$/.test(v);}
  function loadAccount(){try{const parsed=JSON.parse(safeGet(ACCOUNT_KEY)||'null');return parsed&&validUsername(parsed.username)&&typeof parsed.token==='string'&&parsed.token.length>=20?parsed:null;}catch(e){return null;}}
  function saveAccount(value){return safeSet(ACCOUNT_KEY,JSON.stringify(value));}
  function clearAccount(){try{localStorage.removeItem(ACCOUNT_KEY);}catch(e){}}
  function loadLegacySettings(){try{return Object.assign({},DEFAULTS,JSON.parse(safeGet(LEGACY_SETTINGS_KEY)||'{}'));}catch(e){return Object.assign({},DEFAULTS);}}
  function safeGet(key){try{return localStorage.getItem(key);}catch(e){return null;}}
  function safeSet(key,value){try{localStorage.setItem(key,value);return true;}catch(e){return false;}}

  function setupCollapsibleLinks() {
    function openHashTarget() {
      const id = (window.location.hash || '').replace(/^#/, '');
      if (!id) return;
      const target = document.getElementById(id);
      if (target && target.tagName === 'DETAILS') target.open = true;
    }
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', () => {
        const id = (link.getAttribute('href') || '').replace(/^#/, '');
        const target = document.getElementById(id);
        if (target && target.tagName === 'DETAILS') target.open = true;
      });
    });
    openHashTarget();
    window.addEventListener('hashchange', openHashTarget);
  }

  function setupPwa(){if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js?v=20260817-20').catch(console.warn));}
  function applyStoredTheme(){const stored=safeGet(THEME_KEY);if(stored==='dark'||stored==='light')document.documentElement.dataset.theme=stored;else if(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.dataset.theme='dark';}
  function toggleTheme(){const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;safeSet(THEME_KEY,next);}
  async function copyText(text,success){if(!text)return;try{await navigator.clipboard.writeText(text);toast(success);}catch(e){const area=document.createElement('textarea');area.value=text;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();toast(success);}}
  function setBusy(button,busy,text){button.disabled=busy;button.textContent=text;}
  function setMessage(element,text,isError,isGood){element.textContent=text||'';element.className='inline-message'+(isError?' error':isGood?' good':'');}
  function escapeHtml(value){return String(value==null?'':value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
  let toastTimer;function toast(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600);}
})();
