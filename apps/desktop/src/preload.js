'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  auth: {
    getToken:   () => ipcRenderer.invoke('auth:getToken'),
    getUser:    () => ipcRenderer.invoke('auth:getUser'),
    setToken:   (t) => ipcRenderer.invoke('auth:setToken', t),
    setUser:    (u) => ipcRenderer.invoke('auth:setUser', u),
    clearToken: () => ipcRenderer.invoke('auth:clearToken'),
  },
  db: {
    products: {
      list:        () => ipcRenderer.invoke('db:products:list'),
      adjustStock: (id, delta) => ipcRenderer.invoke('db:products:adjustStock', id, delta),
      upsert:      (rows) => ipcRenderer.invoke('db:products:upsert', rows),
      remove:      (id) => ipcRenderer.invoke('db:products:remove', id),
    },
    sales: {
      list:   () => ipcRenderer.invoke('db:sales:list'),
      create: (sale) => ipcRenderer.invoke('db:sales:create', sale),
    },
    appointments: {
      list:       () => ipcRenderer.invoke('db:appointments:list'),
      listByDate: (date) => ipcRenderer.invoke('db:appointments:listByDate', date),
      upsert:     (rows) => ipcRenderer.invoke('db:appointments:upsert', rows),
    },
    patients: {
      list:   () => ipcRenderer.invoke('db:patients:list'),
      get:    (id) => ipcRenderer.invoke('db:patients:get', id),
      upsert: (rows) => ipcRenderer.invoke('db:patients:upsert', rows),
    },
    prescriptions: {
      list:   () => ipcRenderer.invoke('db:prescriptions:list'),
      create: (rx) => ipcRenderer.invoke('db:prescriptions:create', rx),
    },
    labOrders: {
      list:         () => ipcRenderer.invoke('db:labOrders:list'),
      updateStatus: (id, status, tests) => ipcRenderer.invoke('db:labOrders:updateStatus', id, status, tests),
    },
    syncQueue: {
      // CR-04: entity type validated in main process; URL constructed there, never from renderer
      enqueue: (entity, entityId, operation, payload) =>
        ipcRenderer.invoke('db:syncQueue:enqueue', entity, entityId, operation, payload),
      list:   () => ipcRenderer.invoke('db:syncQueue:list'),
      remove: (id) => ipcRenderer.invoke('db:syncQueue:remove', id),
    },
  },
  sync: {
    trigger: () => ipcRenderer.invoke('sync:trigger'),
    status:  () => ipcRenderer.invoke('sync:status'),
    onStatus: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on('sync:status', handler);
      return () => ipcRenderer.removeListener('sync:status', handler);
    },
  },
  print: {
    receipt: (html, receiptNumber) => ipcRenderer.invoke('print:receipt', { html, receiptNumber }),
    pdf:     (html, filename)       => ipcRenderer.invoke('print:pdf',     { html, filename }),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
});
