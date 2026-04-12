import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface DictionaryData {
  id: string;
  name: string; // Internal name or filename base
  bookName: string; // From .ifo
  wordCount: number; // From .ifo
  ifoData: string; // .ifo is usually text
  idxData: ArrayBuffer; // .idx is binary
  dictData: ArrayBuffer; // .dict is binary (possibly compressed)
  enabled: boolean;
}

interface DictionaryDB extends DBSchema {
  dictionaries: {
    key: string;
    value: DictionaryData;
  };
}

let dbPromise: Promise<IDBPDatabase<DictionaryDB>>;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<DictionaryDB>('sanctuary-dictionaries', 1, {
      upgrade(db) {
        db.createObjectStore('dictionaries', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function saveDictionary(dict: DictionaryData) {
  const db = await getDB();
  await db.put('dictionaries', dict);
}

export async function getDictionaries(): Promise<DictionaryData[]> {
  const db = await getDB();
  return db.getAll('dictionaries');
}

export async function deleteDictionary(id: string) {
  const db = await getDB();
  await db.delete('dictionaries', id);
}

export async function toggleDictionary(id: string, enabled: boolean) {
  const db = await getDB();
  const dict = await db.get('dictionaries', id);
  if (dict) {
    dict.enabled = enabled;
    await db.put('dictionaries', dict);
  }
}
