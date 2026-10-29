const errors = {
  400:'Revisa los datos antes de repetir la operación.', 401:'Tu sesión venció. Vuelve a entrar con Google.',
  403:'Tu cuenta no tiene permiso para esta operación.', 409:'El registro cambió. Actualiza los datos y revisa antes de guardar.',
  413:'El lote supera el tamaño permitido. Divídelo en cargas menores.', 429:'Se alcanzó un límite temporal. Espera un minuto y reintenta.',
  503:'FORX no está disponible en este momento. Inténtalo más tarde.'
};

export function createAuthenticatedApi({endpoint, auth, user, onUnauthorized=()=>{}, fetchImpl=fetch, timeoutMs=120000}) {
  let closed = false;
  const pending = new Set();
  const assertCurrent = () => {
    if (closed || auth.currentUser?.uid !== user.uid) throw Object.assign(new Error(errors[401]), {status:401});
  };
  return {
    close() { closed = true; for (const controller of pending) controller.abort(); pending.clear(); },
    async request(path, input={}) {
      if (!['/identity','/commands','/access/list','/access/lookup','/access/update'].includes(path)) throw new Error('Ruta no permitida.');
      assertCurrent();
      const controller = new AbortController(); pending.add(controller);
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const token = await user.getIdToken(); // SDK renews expiring ID tokens.
        assertCurrent();
        const response = await fetchImpl(endpoint+path, {method:'POST',
          credentials:'omit', redirect:'error', cache:'no-store', signal:controller.signal,
          headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body:JSON.stringify(input)});
        assertCurrent();
        const value = await response.json();
        assertCurrent();
        if (!response.ok) {
          if (response.status === 401) onUnauthorized();
          throw Object.assign(new Error(errors[response.status] || 'No se pudo completar la operación. Inténtalo más tarde.'),
            {status:response.status, requestId:typeof value.requestId==='string' && /^[a-f0-9-]{36}$/.test(value.requestId) ? value.requestId : undefined});
        }
        return value.result;
      } catch (error) {
        if (error.status) throw error;
        // Never retry a write automatically after an uncertain response.
        throw new Error('No se pudo confirmar la respuesta del servidor. Actualiza los datos antes de repetir una operación.');
      } finally {clearTimeout(timer);pending.delete(controller);}
    }
  };
}
