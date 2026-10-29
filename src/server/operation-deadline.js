// A response deadline does not roll back work already confirmed by Firestore.
// Retain the concurrency slot until the underlying operation actually settles.
export async function withOperationDeadline(action, { timeoutMs, onSettled = () => {} }) {
  const controller = new AbortController();
  let timer;
  const work = Promise.resolve().then(() => action(controller.signal));
  const settled = work.then(value => { onSettled(); return value; }, error => { onSettled(); throw error; });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(Object.assign(new Error('Operation deadline exceeded; outcome may be partial.'), { status: 503 }));
    }, timeoutMs);
  });
  try { return await Promise.race([settled, timeout]); }
  finally { clearTimeout(timer); }
}

export function assertOperationActive(signal) {
  if (signal.aborted) throw Object.assign(new Error('Operation expired.'), { status: 503 });
}
