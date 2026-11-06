const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
const userData = app.getPath('userData');
const settingsPath = path.join(userData, 'settings.json');
const tasksPath = path.join(userData, 'tasks.json');
const historyPath = path.join(userData, 'history.json');
const socialPath = path.join(userData, 'social.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function loadEnv() {
  const envPath = path.join(app.getAppPath(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1050, minHeight: 680,
    backgroundColor: '#0b1020',
    title: 'AI Smart Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  loadEnv();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('settings:get', () => readJson(settingsPath, { provider: process.env.AI_PROVIDER || 'openai' }));
ipcMain.handle('settings:save', (_e, settings) => {
  const safe = {
    provider: settings.provider === 'gemini' ? 'gemini' : 'openai',
    geminiKey: String(settings.geminiKey || '').trim().slice(0, 200),
    openaiKey: String(settings.openaiKey || '').trim().slice(0, 200),
    geminiModel: String(settings.geminiModel || '').trim().slice(0, 100) || 'gemini-3.8-flash'
  };
  writeJson(settingsPath, safe);
  return { ok: true };
});
ipcMain.handle('tasks:list', () => readJson(tasksPath, []));
ipcMain.handle('tasks:add', (_e, task) => {
  const tasks = readJson(tasksPath, []);
  const item = { id: Date.now().toString(), title: String(task.title || 'Untitled task').slice(0, 120),
    prompt: String(task.prompt || '').slice(0, 1000), schedule: String(task.schedule || 'Manual'),
    enabled: true, createdAt: new Date().toISOString() };
  tasks.unshift(item); writeJson(tasksPath, tasks); return item;
});
ipcMain.handle('tasks:delete', (_e, id) => {
  const tasks = readJson(tasksPath, []).filter(t => t.id !== id);
  writeJson(tasksPath, tasks); return tasks;
});
ipcMain.handle('history:add', (_e, item) => {
  const history = readJson(historyPath, []);
  history.unshift({ ...item, at: new Date().toISOString() });
  writeJson(historyPath, history.slice(0, 200)); return true;
});
ipcMain.handle('history:list', () => readJson(historyPath, []));

ipcMain.handle('social:get', () => readJson(socialPath, { tokens: {}, igUserId: '', queue: [] }));
ipcMain.handle('social:save', (_e, data) => {
  const safe = {
    tokens: {
      facebook: String(data.tokens?.facebook || '').slice(0, 300),
      youtube: String(data.tokens?.youtube || '').slice(0, 300),
      instagram: String(data.tokens?.instagram || '').slice(0, 300)
    },
    igUserId: String(data.igUserId || '').slice(0, 100),
    queue: Array.isArray(data.queue) ? data.queue.slice(0, 50).map(q => ({ id: String(q.id || ''), platform: String(q.platform || ''), text: String(q.text || '').slice(0, 2000), imageUrl: String(q.imageUrl || '').slice(0, 500), at: String(q.at || ''), status: String(q.status || 'queued') })) : []
  };
  writeJson(socialPath, safe);
  return { ok: true };
});
ipcMain.handle('ai:caption', async (_e, topic) => {
  const settings = readJson(settingsPath, {});
  const key = settings.geminiKey || process.env.GEMINI_API_KEY;
  if (!key) return { error: 'আগে Settings-এ Gemini API Key বসাও।' };
  const preferred = settings.geminiModel || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const prompt = `তুমি একজন সোশ্যাল মিডিয়া ক্যাপশন লেখক। বিষয়: "${String(topic || '').slice(0, 200)}"। বাংলায় ৩টি আলাদা আকর্ষণীয় ক্যাপশন লেখো। প্রতিটি ক্যাপশনের শেষে ৫-৮টি হ্যাশট্যাগ দাও। শুধু ক্যাপশনগুলো দাও, ভূমিকা বা ব্যাখ্যা নয়।`;
  const candidates = [preferred, 'gemini-3.6-flash', 'gemini-3.5-flash-lite'].filter((m, i, a) => a.indexOf(m) === i);
  try {
    for (const model of candidates) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } })
      });
      const data = await response.json();
      if (response.ok) {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) return { text };
      }
      if (response.status !== 503 && response.status !== 429) throw new Error(data.error?.message || 'Gemini API error');
    }
    return { error: 'Gemini এখন ব্যস্ত আছে — একটু পরে আবার চেষ্টা করো।' };
  } catch (err) {
    return { error: `ক্যাপশন বানানো যায়নি: ${err.message}` };
  }
});
ipcMain.handle('social:publish', async (_e, post) => {
  const platform = post.platform;
  if (platform === 'youtube') {
    return { action: 'open', url: 'https://www.youtube.com/upload', note: 'YouTube-এ আপলোডের জন্য Google লগইন লাগে — আপলোড পেজ ব্রাউজারে খুলে দেওয়া হচ্ছে। সেখানে ভিডিও আপলোড করো।' };
  }
  const token = String(post.token || '');
  if (!token) return { error: 'আগে প্ল্যাটফর্মে Connect করো (টোকেন বসাও)।' };
  try {
    if (platform === 'facebook') {
      const body = new URLSearchParams({ message: post.text || '', access_token: token });
      const r = await fetch('https://graph.facebook.com/v19.0/me/feed', { method: 'POST', body });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || 'Facebook API error');
      return { ok: true, id: d.id, note: 'Facebook-এ পোস্ট হয়েছে! পোস্ট ID: ' + d.id };
    }
    if (platform === 'instagram') {
      const igUserId = String(post.igUserId || '');
      if (!igUserId) return { error: 'Instagram User ID বসাও (প্ল্যাটফর্ম কার্ডে)।' };
      if (!post.imageUrl) return { error: 'Instagram পোস্টের জন্য ছবির লিংক দরকার।' };
      const createBody = new URLSearchParams({ image_url: post.imageUrl, caption: post.text || '', access_token: token });
      const c = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, { method: 'POST', body: createBody });
      const cd = await c.json();
      if (!c.ok) throw new Error(cd.error?.message || 'Instagram media error');
      const pubBody = new URLSearchParams({ creation_id: cd.id, access_token: token });
      const p = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, { method: 'POST', body: pubBody });
      const pd = await p.json();
      if (!p.ok) throw new Error(pd.error?.message || 'Instagram publish error');
      return { ok: true, id: pd.id, note: 'Instagram-এ পোস্ট হয়েছে! পোস্ট ID: ' + pd.id };
    }
    return { error: 'এই প্ল্যাটফর্মে পোস্ট করা যাচ্ছে না।' };
  } catch (err) {
    return { error: `পোস্ট করা যায়নি: ${err.message}` };
  }
});

ipcMain.handle('ai:chat', async (_e, payload) => {
  const provider = payload.provider || readJson(settingsPath, {}).provider || process.env.AI_PROVIDER || 'openai';
  const system = `You are Smart AI, a careful Bengali/English browser assistant. Reply in the user's language.
You can propose at most ONE browser action. Return ONLY valid JSON with this shape:
{"reply":"short helpful answer","action":null}
or {"reply":"explanation","action":{"type":"navigate","url":"https://example.com"}}
Allowed action types: navigate, search, scroll, extract.
For search use {"type":"search","query":"..."}.
For scroll use {"type":"scroll","direction":"down"}.
For extract use {"type":"extract"}.
Never propose clicking, submitting forms, purchases, payments, deleting, sending messages, or changing account settings. Never ask for passwords or OTPs. Do not claim an action was completed.`;
  const messages = [{ role: 'system', content: system }, ...(payload.messages || []).slice(-12)];
  try {
    let raw = '';
    if (provider === 'gemini') {
      const key = readJson(settingsPath, {}).geminiKey || process.env.GEMINI_API_KEY;
      if (!key) return { error: 'Gemini API key পাওয়া যায়নি। Settings-এ Gemini API Key বসাও (ফ্রি key: aistudio.google.com)।' };
      const prompt = system + '\n\n' + messages.slice(1).map(m => `${m.role}: ${m.content}`).join('\n');
      const preferred = readJson(settingsPath, {}).geminiModel || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
      const candidates = [preferred, 'gemini-3.6-flash', 'gemini-3.5-flash-lite'].filter((m, i, a) => a.indexOf(m) === i);
      let lastError = '';
      for (const model of candidates) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } })
        });
        const data = await response.json();
        if (response.ok) { raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ''; lastError = ''; break; }
        lastError = data.error?.message || 'Gemini API error';
        if (response.status !== 503 && response.status !== 429) break;
      }
      if (lastError) throw new Error(lastError);
    } else {
      const key = readJson(settingsPath, {}).openaiKey || process.env.OPENAI_API_KEY;
      if (!key) return { error: 'OpenAI API key পাওয়া যায়নি। Settings-এ OpenAI API Key বসাও।' };
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages, temperature: 0.3 })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'OpenAI API error');
      raw = data.choices?.[0]?.message?.content || '';
    }
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const allowed = ['navigate', 'search', 'scroll', 'extract'];
    if (parsed.action && !allowed.includes(parsed.action.type)) parsed.action = null;
    return { reply: String(parsed.reply || 'আমি কীভাবে সাহায্য করতে পারি?'), action: parsed.action || null };
  } catch (err) {
    return { error: `AI সংযোগে সমস্যা: ${err.message}` };
  }
});

ipcMain.handle('external:open', async (_e, url) => {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP/HTTPS links are allowed');
    await shell.openExternal(parsed.href); return true;
  } catch { return false; }
});
