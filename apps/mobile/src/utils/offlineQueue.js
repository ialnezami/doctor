import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@medi_offline_queue';

function makeId() {
  return 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2);
}

export async function getQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueue(op) {
  const queue = await getQueue();
  queue.push({ id: makeId(), ...op, createdAt: new Date().toISOString(), retries: 0 });
  await saveQueue(queue);
}

export async function removeFromQueue(id) {
  const queue = await getQueue();
  await saveQueue(queue.filter(op => op.id !== id));
}

export async function clearQueue() {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

// Processes queue FIFO. Returns { synced, failed }.
// On network failure: retries < 3 → kept; retries >= 3 → dropped (dead letter).
export async function flushQueue(apiClient) {
  const queue = await getQueue();
  if (!queue.length) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining = [];

  for (const op of queue) {
    try {
      if (op.method === 'delete') {
        await apiClient.delete(op.path);
      } else {
        await apiClient[op.method](op.path, op.body);
      }
      synced++;
    } catch (err) {
      const isNetwork = !err?.response;
      if (isNetwork && op.retries < 3) {
        remaining.push({ ...op, retries: op.retries + 1 });
        failed++;
      }
      // 4xx errors or retries exhausted → drop silently
    }
  }

  await saveQueue(remaining);
  return { synced, failed };
}
