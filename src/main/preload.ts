import { contextBridge, ipcRenderer } from 'electron';
import type { WidgetApi, WidgetState } from '../shared/types';

const api: WidgetApi = {
  getState: () => ipcRenderer.invoke('get-state'),
  onState: (cb) => {
    const listener = (_e: unknown, state: WidgetState) => cb(state);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  },
  addAccount: (input) => ipcRenderer.invoke('add-account', input),
  updateAccount: (id, patch) => ipcRenderer.invoke('update-account', id, patch),
  removeAccount: (id) => ipcRenderer.invoke('remove-account', id),
  installBridge: (id) => ipcRenderer.invoke('install-bridge', id),
  uninstallBridge: (id) => ipcRenderer.invoke('uninstall-bridge', id),
  pickDirectory: () => ipcRenderer.invoke('pick-directory'),
  defaultConfigDir: (kind) => ipcRenderer.invoke('default-config-dir', kind),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  setSettings: (patch) => ipcRenderer.invoke('set-settings', patch),
  resize: (height) => ipcRenderer.send('resize', height),
  hide: () => ipcRenderer.send('hide'),
};

contextBridge.exposeInMainWorld('widget', api);
