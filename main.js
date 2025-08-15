const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');

let mainWindow;

const isMac = process.platform === 'darwin';
// Ensure Windows shows the app icon correctly in the taskbar
if (process.platform === 'win32') {
  app.setAppUserModelId('com.rulu.rulu-ide');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'icon', 'rulu.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// File handling
ipcMain.handle('open-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { content, filePath };
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to open file: ${err.message}`);
    return null;
  }
});

ipcMain.handle('save-file', async (event, content) => {
  try {
    const result = await dialog.showSaveDialog({
      filters: [{ name: 'Rulu Files', extensions: ['rulu'] }]
    });
    if (!result.canceled && result.filePath) {
      await fs.writeFile(result.filePath, content);
      return result.filePath;
    }
    return null;
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to save file: ${err.message}`);
    return null;
  }
});

// Silent save: if a filePath is provided, write to it directly; otherwise behave like save-file
ipcMain.handle('save-file-silent', async (event, { content, filePath, defaultDir }) => {
  try {
    if (filePath) {
      await fs.writeFile(filePath, content);
      return filePath;
    }
    // If defaultDir is provided, auto-create an untitled file there instead of prompting
    if (defaultDir) {
      // Generate unique untitled name: untitled.rulu, untitled-1.rulu, ...
      for (let i = 0; i < 1000; i++) {
        const name = i === 0 ? 'untitled.rulu' : `untitled-${i}.rulu`;
        const candidate = path.join(defaultDir, name);
        try {
          await fs.access(candidate);
          // exists, try next
          continue;
        } catch (e) {
          // does not exist: write here
          await fs.writeFile(candidate, content);
          return candidate;
        }
      }
      // fallback to interactive if we couldn't find a free name
    }
    // No filePath and no defaultDir: fallback to interactive save
    const result = await dialog.showSaveDialog({
      filters: [{ name: 'Rulu Files', extensions: ['rulu'] }]
    });
    if (!result.canceled && result.filePath) {
      await fs.writeFile(result.filePath, content);
      return result.filePath;
    }
    return null;
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to save file: ${err.message}`);
    return null;
  }
});

ipcMain.handle('open-project', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to open project: ${err.message}`);
    return null;
  }
});

ipcMain.handle('get-files', async (event, dir) => {
  try {
    const baseDir = dir || (await dialog.showOpenDialog({ properties: ['openDirectory'] })).filePaths[0];
    if (!baseDir) return [];
    const items = await fs.readdir(baseDir, { withFileTypes: true });
    const files = items.map(item => ({
      id: path.join(dir || baseDir, item.name),
      text: item.name,
      type: item.isDirectory() ? 'directory' : 'file',
      children: item.isDirectory(),
      icon: item.isDirectory() ? 'jstree-folder' : 'jstree-file'
    })).filter(item => item.type === 'directory' || item.text.endsWith('.rulu'));
    return files;
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to read directory: ${err.message}`);
    return [];
  }
});

// Helper that uses execFile to run a binary and returns { code, stdout, stderr }
function execute(fileName, params, cwd) {
  return new Promise((resolve) => {
    execFile(fileName, params, { cwd }, (err, stdout, stderr) => {
      if (err) {
        // Normalize error for caller and give a clear ENOENT message
        let exitCode = err.code || 1;
        let errMsg = stderr || err.message || String(err);
        if (err && err.code === 'ENOENT') {
          exitCode = 127;
          errMsg = `Executable not found: ${fileName}. Make sure '${fileName}' is on PATH or provide the full path.`;
        }
        resolve({ code: exitCode, stdout: stdout || '', stderr: errMsg });
      } else {
        resolve({ code: 0, stdout: stdout || '', stderr: stderr || '' });
      }
    });
  });
}

// Run Rulu
ipcMain.handle('run-rulu', async (event, filePath) => {
  try {
    const cwd = path.dirname(filePath) || process.cwd();
    const result = await execute('rulu', [filePath], cwd);
    return result;
  } catch (err) {
    return { code: 1, stdout: '', stderr: err.message };
  }
});