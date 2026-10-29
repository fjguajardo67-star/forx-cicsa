// Build-time public configuration only. Neither URL parameters nor browser
// storage can choose a cloud project or redirect authenticated API requests.
export function clientConfig(raw, location) {
  const fail = () => { throw new Error('El acceso de FORX todavía no está configurado. Contacta a administración.'); };
  let value; try { value = JSON.parse(raw); } catch { fail(); }
  if (!value || value.enabled !== true || !['staging','production'].includes(value.environment)) fail();
  const { firebase, apiOrigin, appOrigin } = value;
  if (!firebase || !/^forx-v2-[a-z0-9-]{2,22}$/.test(firebase.projectId)) fail();
  for (const origin of [apiOrigin,appOrigin]) {
    let url; try { url = new URL(origin); } catch { fail(); }
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || url.hostname.endsWith('.invalid')) fail();
  }
  if (location.origin !== appOrigin || location.protocol !== 'https:') fail();
  if (firebase.authDomain !== `${firebase.projectId}.firebaseapp.com`
    || !/^AIza[\w-]{30,60}$/.test(firebase.apiKey) || !/^1:\d+:web:[a-f0-9]+$/.test(firebase.appId)) fail();
  return Object.freeze({ environment:value.environment, apiOrigin, appOrigin,
    firebase:{ projectId:firebase.projectId, authDomain:firebase.authDomain, apiKey:firebase.apiKey, appId:firebase.appId } });
}

export function browserMode({dev, hostname, search}) {
  // A built artifact always requires authentication, even on localhost. Dev
  // convenience modes can never turn a published build into a local editor.
  if (!dev || !['127.0.0.1','localhost'].includes(hostname)) return 'authenticated';
  const query = new URLSearchParams(search);
  if (query.get('authPreview') === '1') return 'auth-preview';
  return query.get('backend') === 'emulator' ? 'emulator' : 'local';
}
