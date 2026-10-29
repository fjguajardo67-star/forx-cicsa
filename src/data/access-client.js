// The same authenticated transport as business commands, never a demo session.
export function createAccessClient(api) {
  return {
    list:()=>api.request('/access/list'),
    lookup:uid=>api.request('/access/lookup',{uid}),
    update:input=>api.request('/access/update',input)
  };
}
