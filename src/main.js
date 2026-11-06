const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
const userData = app.getPath('userData');
const settingsPath = path.join(userData, 'settings.json');
const tasksPath = path.join(userData, 'tasks.json');
const historyPath = path.join(userData, 'history.json');

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
  const safe = { provider: settings.provider === 'gemini' ? 'gemini' : 'openai' };
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
      const key = process.env.GEMINI_API_KEY;
      if (!key) return { error: 'GEMINI_API_KEY পাওয়া যায়নি। .env ফাইলে API key যোগ করুন।' };
      const prompt = system + '\n\n' + messages.slice(1).map(m => `${m.role}: ${m.content}`).join('\n');
      const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Gemini API error');
      raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return { error: 'OPENAI_API_KEY পাওয়া যায়নি। .env ফাইলে API key যোগ করুন।' };
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
