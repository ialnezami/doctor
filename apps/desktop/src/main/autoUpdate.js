'use strict';

const { dialog } = require('electron');

let _updater = null;

try {
  const { autoUpdater } = require('electron-updater');

  autoUpdater.autoDownload    = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update ready',
      message: 'A new version has been downloaded and will be installed when you restart.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[autoUpdate] error:', err.message);
  });

  // Delay check so main window is ready first
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[autoUpdate] check failed:', err.message);
    });
  }, 30_000);

  _updater = autoUpdater;
} catch {
  // electron-updater not available in dev without GitHub token
}

module.exports = _updater;
