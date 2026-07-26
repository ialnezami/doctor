'use strict';

const { BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

async function _loadHtml(html) {
  const win = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return win;
}

async function printReceipt(_event, { html }) {
  const win = await _loadHtml(html);
  try {
    await new Promise((resolve, reject) => {
      win.webContents.print({ silent: false, printBackground: true }, (success, errType) => {
        if (!success && errType !== 'Print cancelled') reject(new Error(errType));
        else resolve();
      });
    });
  } finally {
    win.destroy();
  }
}

async function savePDF(_event, { html, filename }) {
  const win = await _loadHtml(html);
  try {
    const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A5' });

    const defaultPath = path.join(
      os.homedir(), 'Downloads',
      filename ?? `receipt-${Date.now()}.pdf`
    );
    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (!canceled && filePath) {
      fs.writeFileSync(filePath, data);
      shell.openPath(filePath);
      return filePath;
    }
    return null;
  } finally {
    win.destroy();
  }
}

module.exports = { printReceipt, savePDF };
