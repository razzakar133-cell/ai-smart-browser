const $ = id => document.getElementById(id);
const webview = $('browserView');
let provider = 'openai';
let pendingAction = null;
let chatMessages = [];
let currentTab = 1;

function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  $('chatPanel').classList.toggle('hidden', name !== 'chat');
  $('tasksPanel').classList.toggle('hidden', name !== 'tasks');
  $('historyPanel').classList.toggle('hidden', name !== 'history');
  $('settingsPanel').classList.toggle('hidden', name !== 'settings');
  $('socialPanel').classList.toggle('hidden', name !== 'social');
  document.querySelectorAll('[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  if (name === 'tasks') loadTasks();
  if (name === 'history') loadHistory();
  if (name === 'social') loadSocial();
}
document.querySelectorAll('[data-panel]').forEach(b => b.addEventListener('click', () => showPanel(b.dataset.panel)));
const SOCIAL_URLS = { facebook: 'https://www.facebook.com', youtube: 'https://www.youtube.com', instagram: 'https://www.instagram.com' };
document.querySelectorAll('[data-social]').forEach(b => b.addEventListener('click', () => { showPanel('social'); navigate(SOCIAL_URLS[b.dataset.social]); }));

function normalizeUrl(value) {
  const v = value.trim();
  if (!v) return 'https://www.google.com';
  if (/^https?:\/\//i.test(v)) return v;
  if (v.includes('.') && !v.includes(' ')) return 'https://' + v;
  return 'https://www.google.com/search?q=' + encodeURIComponent(v);
}
function navigate(value) {
  const url = normalizeUrl(value);
  $('address').value = url;
  $('browserStart').classList.add('hidden');
  webview.src = url;
  $('browserStatus').textContent = 'Loading…';
  window.smartAI.addHistory({ type: 'Navigate', detail: url });
}
$('go').onclick = () => navigate($('address').value);
$('startGo').onclick = () => navigate($('startAddress').value);
$('address').addEventListener('keydown', e => { if (e.key === 'Enter') navigate($('address').value); });
$('startAddress').addEventListener('keydown', e => { if (e.key === 'Enter') navigate($('startAddress').value); });
document.querySelectorAll('[data-url]').forEach(b => b.onclick = () => navigate(b.dataset.url));
$('back').onclick = () => { if (webview.canGoBack()) webview.goBack(); };
$('forward').onclick = () => { if (webview.canGoForward()) webview.goForward(); };
$('reload').onclick = () => webview.reload();
$('newTab').onclick = () => { currentTab++; $('tabStrip').innerHTML = `<button class="tab active">🌐 Tab ${currentTab}</button>`; $('browserStart').classList.remove('hidden'); $('address').value = ''; webview.src = 'about:blank'; };

webview.addEventListener('did-start-loading', () => $('browserStatus').textContent = 'Loading…');
webview.addEventListener('did-stop-loading', () => {
  $('browserStatus').textContent = 'Page loaded';
  try { $('address').value = webview.getURL(); } catch {}
});
webview.addEventListener('did-fail-load', e => { if (e.errorCode !== -3) $('browserStatus').textContent = 'Could not load page'; });
webview.addEventListener('page-title-updated', e => {
  const tab = $('tabStrip').querySelector('.tab'); if (tab) tab.textContent = '🌐 ' + (e.title || 'Browser').slice(0, 24);
});
webview.addEventListener('new-window', e => window.smartAI.openExternal(e.url));

function addMessage(role, text, action) {
  const node = document.createElement('div');
  node.className = 'message ' + role;
  node.textContent = text;
  if (action) {
    const proposal = document.createElement('div');
    proposal.className = 'action-proposal';
    const label = action.type === 'navigate' ? `Open: ${action.url}` : action.type === 'search' ? `Search: ${action.query}` : action.type === 'scroll' ? 'Scroll page' : 'Read page text';
    const desc = document.createElement('div'); desc.textContent = 'প্রস্তাবিত কাজ: ' + label;
    const btn = document.createElement('button'); btn.textContent = 'Review & approve';
    btn.onclick = () => proposeAction(action);
    proposal.append(desc, btn); node.appendChild(proposal);
  }
  $('messages').appendChild(node);
  $('messages').scrollTop = $('messages').scrollHeight;
  $('chatPanel').scrollTop = $('chatPanel').scrollHeight;
}
function proposeAction(action) {
  pendingAction = action;
  $('actionDescription').textContent = action.type === 'navigate' ? `এই ওয়েবসাইট খুলতে চান? ${action.url}` :
    action.type === 'search' ? `Google-এ এই বিষয়টি খুঁজতে চান? ${action.query}` :
    action.type === 'scroll' ? 'বর্তমান পেজ নিচে স্ক্রল করা হবে।' : 'বর্তমান ওয়েবপেজের দৃশ্যমান লেখা পড়া হবে।';
  $('actionModal').classList.remove('hidden');
}
$('cancelAction').onclick = () => { pendingAction = null; $('actionModal').classList.add('hidden'); };
$('approveAction').onclick = async () => {
  if (!pendingAction) return;
  const action = pendingAction; pendingAction = null; $('actionModal').classList.add('hidden');
  try {
    if (action.type === 'navigate') navigate(action.url);
    if (action.type === 'search') navigate('https://www.google.com/search?q=' + encodeURIComponent(action.query));
    if (action.type === 'scroll') await webview.executeJavaScript('window.scrollBy({top: Math.max(400, window.innerHeight * 0.75), behavior: "smooth"})');
    if (action.type === 'extract') {
      const text = await webview.executeJavaScript('document.body.innerText.slice(0, 7000)');
      addMessage('ai', 'ওয়েবপেজের দৃশ্যমান লেখা:\n' + text.slice(0, 4500));
    }
    $('browserStatus').textContent = 'Approved action executed';
    window.smartAI.addHistory({ type: 'AI action', detail: action.type });
  } catch (e) { addMessage('ai', 'কাজটি করা যায়নি: ' + e.message); }
};

async function sendMessage(text) {
  const value = (text || $('prompt').value).trim();
  if (!value) return;
  $('prompt').value = '';
  addMessage('user', value);
  chatMessages.push({ role: 'user', content: value });
  $('send').disabled = true;
  try {
    const result = await window.smartAI.chat({ provider, messages: chatMessages });
    if (result.error) { addMessage('ai', result.error); return; }
    addMessage('ai', result.reply, result.action);
    chatMessages.push({ role: 'assistant', content: result.reply });
  } finally { $('send').disabled = false; }
}
$('send').onclick = () => sendMessage();
$('prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
document.querySelectorAll('[data-prompt]').forEach(b => b.onclick = () => sendMessage(b.dataset.prompt));

$('voice').onclick = () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { addMessage('ai', 'এই কম্পিউটারের Web Speech API সমর্থিত নয়। Chrome/Electron-এর আপডেটেড সংস্করণ ব্যবহার করুন।'); return; }
  const recognition = new SpeechRecognition(); recognition.lang = 'bn-BD'; recognition.interimResults = false;
  $('voice').textContent = '🔴';
  recognition.onresult = e => { $('prompt').value = e.results[0][0].transcript; sendMessage(); };
  recognition.onerror = () => addMessage('ai', 'ভয়েস শনাক্ত করা যায়নি। মাইক্রোফোন অনুমতি পরীক্ষা করুন।');
  recognition.onend = () => $('voice').textContent = '🎙';
  recognition.start();
};

async function loadTasks() {
  const tasks = await window.smartAI.listTasks(); const list = $('taskList'); list.innerHTML = '';
  if (!tasks.length) { list.textContent = 'এখনো কোনো task নেই।'; return; }
  tasks.forEach(t => {
    const item = document.createElement('div'); item.className = 'list-item';
    const title = document.createElement('b'); title.textContent = t.title;
    const p = document.createElement('p'); p.textContent = `${t.schedule} · ${t.prompt}`;
    const del = document.createElement('button'); del.textContent = 'Delete'; del.onclick = async () => { await window.smartAI.deleteTask(t.id); loadTasks(); };
    item.append(title, p, del); list.appendChild(item);
  });
}
$('addTask').onclick = async () => {
  const title = $('taskTitle').value.trim(), prompt = $('taskPrompt').value.trim();
  if (!title || !prompt) return alert('Task name এবং instruction লিখুন।');
  await window.smartAI.addTask({ title, prompt, schedule: $('taskSchedule').value });
  $('taskTitle').value = ''; $('taskPrompt').value = ''; loadTasks();
};
async function loadHistory() {
  const rows = await window.smartAI.listHistory(); const list = $('historyList'); list.innerHTML = '';
  if (!rows.length) { list.textContent = 'কোনো activity নেই।'; return; }
  rows.forEach(r => {
    const item = document.createElement('div'); item.className = 'list-item';
    const b = document.createElement('b'); b.textContent = r.type || 'Activity';
    const p = document.createElement('p'); p.textContent = `${r.detail || ''} · ${new Date(r.at).toLocaleString()}`;
    item.append(b, p); list.appendChild(item);
  });
}
(async () => {
  const settings = await window.smartAI.getSettings(); provider = settings.provider || 'openai'; $('provider').value = provider;
  $('geminiKey').value = settings.geminiKey || '';
  $('geminiModel').value = settings.geminiModel || 'gemini-3.8-flash';
  $('openaiKey').value = settings.openaiKey || '';
})();
$('saveSettings').onclick = async () => {
  provider = $('provider').value;
  await window.smartAI.saveSettings({ provider, geminiKey: $('geminiKey').value.trim(), geminiModel: $('geminiModel').value.trim(), openaiKey: $('openaiKey').value.trim() });
  $('settingsStatus').textContent = 'Settings saved.';
};

// ---------- Social / Auto-post ----------
const SOCIAL_NAMES = { facebook: 'Facebook', youtube: 'YouTube', instagram: 'Instagram' };
const SOCIAL_HINTS = {
  facebook: 'Facebook Page Token — developers.facebook.com → Graph API Explorer থেকে নাও (ফ্রি)।',
  youtube: 'API Key — console.cloud.google.com থেকে নাও (ফ্রি)। ভিডিও আপলোড ব্রাউজারে হবে।',
  instagram: 'Access Token — developers.facebook.com থেকে নাও (ফ্রি)। ছবির লিংক দরকার।'
};
let social = { tokens: {}, igUserId: '', queue: [] };
async function loadSocial() {
  social = await window.smartAI.getSocial();
  renderPlatforms(); renderQueue();
}
function renderPlatforms() {
  const wrap = $('platformCards'); wrap.innerHTML = '';
  ['facebook', 'youtube', 'instagram'].forEach(p => {
    const card = document.createElement('div'); card.className = 'platform-card';
    const connected = !!(social.tokens && social.tokens[p]);
    const title = document.createElement('b'); title.textContent = SOCIAL_NAMES[p] + ' ';
    const status = document.createElement('span'); status.className = connected ? 'status-ok' : 'status-no';
    status.textContent = connected ? '● সংযুক্ত' : '○ সংযুক্ত নয়';
    const hint = document.createElement('p'); hint.className = 'muted'; hint.textContent = SOCIAL_HINTS[p];
    const input = document.createElement('input'); input.type = 'password'; input.placeholder = 'টোকেন / API Key বসাও'; input.value = (social.tokens && social.tokens[p]) || ''; input.autocomplete = 'off';
    card.append(title, status, hint, input);
    if (p === 'instagram') {
      const idInput = document.createElement('input'); idInput.placeholder = 'Instagram User ID'; idInput.value = social.igUserId || '';
      idInput.onchange = async () => { social.igUserId = idInput.value.trim(); await window.smartAI.saveSocial(social); };
      card.appendChild(idInput);
    }
    const row = document.createElement('div'); row.style.marginTop = '8px';
    const openBtn = document.createElement('button'); openBtn.className = 'secondary'; openBtn.textContent = 'খোলো';
    openBtn.onclick = () => navigate(SOCIAL_URLS[p]);
    const saveBtn = document.createElement('button'); saveBtn.className = 'primary'; saveBtn.textContent = connected ? 'আপডেট' : 'Connect';
    saveBtn.style.marginLeft = '6px';
    saveBtn.onclick = async () => {
      social.tokens = social.tokens || {}; social.tokens[p] = input.value.trim();
      await window.smartAI.saveSocial(social); renderPlatforms();
    };
    const disBtn = document.createElement('button'); disBtn.className = 'secondary'; disBtn.textContent = 'Disconnect'; disBtn.style.marginLeft = '6px';
    disBtn.onclick = async () => { social.tokens = social.tokens || {}; social.tokens[p] = ''; await window.smartAI.saveSocial(social); renderPlatforms(); };
    row.append(openBtn, saveBtn, disBtn); card.appendChild(row);
    wrap.appendChild(card);
  });
}
function renderQueue() {
  const list = $('queueList'); list.innerHTML = '';
  const q = social.queue || [];
  if (!q.length) { list.textContent = 'কিউ খালি।'; return; }
  q.forEach(item => {
    const el = document.createElement('div'); el.className = 'list-item';
    const b = document.createElement('b'); b.textContent = SOCIAL_NAMES[item.platform] + ' · ' + (item.status === 'posted' ? 'পোস্ট হয়েছে' : 'অপেক্ষায়');
    const p = document.createElement('p'); p.textContent = item.text.slice(0, 120);
    const pub = document.createElement('button'); pub.textContent = 'পোস্ট করো';
    pub.style.cssText = 'background:#2767d8;color:#fff;padding:7px 10px;border-radius:8px;margin-right:6px';
    pub.onclick = () => doPublish(true, item);
    const del = document.createElement('button'); del.textContent = 'Delete';
    del.onclick = async () => { social.queue = social.queue.filter(x => x.id !== item.id); await window.smartAI.saveSocial(social); renderQueue(); };
    el.append(b, p, pub, del); list.appendChild(el);
  });
}
$('makeCaption').onclick = async () => {
  const topic = $('captionTopic').value.trim();
  if (!topic) return alert('ক্যাপশনের বিষয় লেখো।');
  const out = $('captionOut'); out.innerHTML = '<p class="muted">ক্যাপশন বানানো হচ্ছে…</p>';
  const result = await window.smartAI.caption(topic);
  out.innerHTML = '';
  if (result.error) { out.textContent = result.error; return; }
  const item = document.createElement('div'); item.className = 'list-item';
  const p = document.createElement('p'); p.textContent = result.text;
  const use = document.createElement('button'); use.textContent = 'পোস্টে ব্যবহার করো';
  use.style.cssText = 'background:#2767d8;color:#fff;padding:7px 10px;border-radius:8px;margin-top:8px';
  use.onclick = () => { $('postText').value = result.text; };
  item.append(p, use); out.appendChild(item);
};
async function doPublish(fromQueue, item) {
  const platform = fromQueue ? item.platform : $('postPlatform').value;
  const text = fromQueue ? item.text : $('postText').value.trim();
  const imageUrl = fromQueue ? item.imageUrl : $('postImage').value.trim();
  if (!text) return alert('পোস্টের লেখা লেখো।');
  $('publishStatus').textContent = 'পোস্ট করা হচ্ছে…';
  const result = await window.smartAI.publishPost({ platform, text, imageUrl, token: (social.tokens && social.tokens[platform]) || '', igUserId: social.igUserId || '' });
  if (result.action === 'open') { navigate(result.url); $('publishStatus').textContent = result.note; return; }
  if (result.error) { $('publishStatus').textContent = result.error; return; }
  $('publishStatus').textContent = result.note || 'পোস্ট হয়েছে!';
  window.smartAI.addHistory({ type: 'Social post', detail: platform + ' · ' + text.slice(0, 60) });
  if (fromQueue) { item.status = 'posted'; await window.smartAI.saveSocial(social); renderQueue(); }
  else { $('postText').value = ''; $('postImage').value = ''; }
}
$('publishNow').onclick = () => doPublish(false);
$('queuePost').onclick = async () => {
  const text = $('postText').value.trim();
  if (!text) return alert('পোস্টের লেখা লেখো।');
  social.queue = social.queue || [];
  social.queue.unshift({ id: Date.now().toString(), platform: $('postPlatform').value, text, imageUrl: $('postImage').value.trim(), at: new Date().toISOString(), status: 'queued' });
  await window.smartAI.saveSocial(social);
  $('postText').value = ''; $('postImage').value = '';
  renderQueue();
};
