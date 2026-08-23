// Minimal promise wrapper over IndexedDB (no dependencies). Just enough for the
// asset cache; a broader helper for user data lands with the storage layer.

export function openDb(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version)
    req.onupgradeneeded = () => upgrade(req.result)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export const idbGet = <T>(store: IDBObjectStore, key: IDBValidKey) =>
  promisify<T>(store.get(key) as IDBRequest<T>)

export const idbGetAll = <T>(source: IDBObjectStore | IDBIndex, query?: IDBValidKey | IDBKeyRange) =>
  promisify<T[]>(source.getAll(query) as IDBRequest<T[]>)

export const idbCount = (source: IDBObjectStore | IDBIndex) => promisify(source.count())
