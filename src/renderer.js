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
  document.querySelectorAll('[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  if (name === 'tasks') loadTasks();
  if (name === 'history') loadHistory();
}
document.querySelectorAll('[data-panel]').forEach(b => b.addEventListener('click', () => showPanel(b.dataset.panel)));

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
