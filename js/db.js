/* Stockage local (IndexedDB) : ta collection, tes photos, ton profil et le cache des données */
App.db = (() => {
  const NAME = 'collecdex';
  const VERSION = 1;
  let dbp = null;

  const open = () => {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');      // réponses API
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items');      // cartes possédées
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');    // photos perso
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');            // réglages, profil
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  };

  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  const get = async (store, key) => { const db = await open(); return reqP(db.transaction(store).objectStore(store).get(key)); };
  const set = async (store, key, val) => { const db = await open(); const t = db.transaction(store, 'readwrite'); t.objectStore(store).put(val, key); return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); }); };
  const del = async (store, key) => { const db = await open(); const t = db.transaction(store, 'readwrite'); t.objectStore(store).delete(key); return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); }); };
  const clear = async (store) => { const db = await open(); const t = db.transaction(store, 'readwrite'); t.objectStore(store).clear(); return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); }); };
  const all = async (store) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const out = {};
      const r = db.transaction(store).objectStore(store).openCursor();
      r.onsuccess = () => { const c = r.result; if (c) { out[c.key] = c.value; c.continue(); } else resolve(out); };
      r.onerror = () => reject(r.error);
    });
  };

  return { open, get, set, del, clear, all };
})();
