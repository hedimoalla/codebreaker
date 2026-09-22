const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const isDev = process.argv.includes('--dev');

let mainWindow;

function getSaveFile() {
  return path.join(app.getPath('userData'), 'save.json');
}

function readSave() {
  try {
    return JSON.parse(fs.readFileSync(getSaveFile(), 'utf-8'));
  } catch {
    return null;
  }
}

function writeSave(data) {
  const SAVE_FILE = getSaveFile();
  fs.mkdirSync(path.dirname(SAVE_FILE), { recursive: true });
  fs.writeFileSync(SAVE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 640,
    backgroundColor: '#667eea',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  Menu.setApplicationMenu(buildMenu());
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Keep external links (store pages, credits, etc.) out of the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: 'Game',
      submenu: [
        { label: 'New Game', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:new-game') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About CodeBreaker',
          click: () => mainWindow?.webContents.send('menu:about')
        }
      ]
    }
  ];
  return Menu.buildFromTemplate(template);
}

app.whenReady().then(() => {
  // --- Persistence IPC (see src/persistence.js in the renderer) ---
  ipcMain.handle('storage:get', () => readSave());
  ipcMain.handle('storage:set', (_event, data) => {
    writeSave(data);
    return true;
  });
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getEnv', () => ({
    STEAM_APP_ID: process.env.STEAM_APP_ID || '480',
    ANALYTICS_ENABLED: process.env.ANALYTICS_ENABLED === 'true',
    IAP_SANDBOX: process.env.IAP_SANDBOX !== 'false',
    APP_ENV: process.env.APP_ENV || 'development'
  }));

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
