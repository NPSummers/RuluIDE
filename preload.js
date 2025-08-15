const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  send: (channel, data) => {
    const validChannels = ['open-file', 'save-file', 'open-project', 'get-files', 'run-rulu'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    const validChannels = ['file-opened', 'project-opened', 'files-list'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  invoke: (channel, data) => {
    const validChannels = ['open-file', 'save-file', 'save-file-silent', 'open-project', 'get-files', 'run-rulu'];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
  }
});