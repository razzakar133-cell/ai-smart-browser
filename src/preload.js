const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('smartAI', {
  chat: payload => ipcRenderer.invoke('ai:chat', payload),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  addTask: task => ipcRenderer.invoke('tasks:add', task),
  deleteTask: id => ipcRenderer.invoke('tasks:delete', id),
  addHistory: item => ipcRenderer.invoke('history:add', item),
  listHistory: () => ipcRenderer.invoke('history:list'),
  getSocial: () => ipcRenderer.invoke('social:get'),
  saveSocial: data => ipcRenderer.invoke('social:save', data),
  caption: topic => ipcRenderer.invoke('ai:caption', topic),
  publishPost: post => ipcRenderer.invoke('social:publish', post),
  openExternal: url => ipcRenderer.invoke('external:open', url)
});
