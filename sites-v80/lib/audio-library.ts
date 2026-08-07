const DB_NAME = "deepcast-audio-library";
const STORE_NAME = "episodes";
const DB_VERSION = 1;

type StoredEpisodeAudio = {
  id: string;
  blob: Blob;
  updatedAt: string;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Audio library could not be opened."));
  });
}

export async function saveEpisodeAudio(id: string, blob: Blob) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ id, blob, updatedAt: new Date().toISOString() } satisfies StoredEpisodeAudio);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Episode audio could not be saved."));
  });
  database.close();
  window.dispatchEvent(new CustomEvent("deepcast-audio-library-updated", { detail: { id } }));
}

export async function readEpisodeAudio(id: string) {
  const database = await openDatabase();
  const value = await new Promise<StoredEpisodeAudio | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as StoredEpisodeAudio | undefined);
    request.onerror = () => reject(request.error || new Error("Episode audio could not be read."));
  });
  database.close();
  return value?.blob || null;
}

export async function deleteEpisodeAudio(id: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Episode audio could not be deleted."));
  });
  database.close();
}

export function requestEpisodePlayback(id: string) {
  window.dispatchEvent(new CustomEvent("deepcast-play-episode", { detail: { id } }));
}
