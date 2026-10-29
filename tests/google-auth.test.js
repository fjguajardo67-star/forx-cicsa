import {test,expect,vi} from 'vitest';
const mocked=vi.hoisted(()=>({auth:{currentUser:null},provider:{setCustomParameters:vi.fn()},initializeApp:vi.fn(()=>({name:'app'})),initializeAuth:vi.fn(),subscribe:vi.fn(),popup:vi.fn(),signOut:vi.fn()}));
vi.mock('firebase/app',()=>({initializeApp:mocked.initializeApp}));
vi.mock('firebase/auth',()=>({initializeAuth:mocked.initializeAuth,browserSessionPersistence:'session-only',browserPopupRedirectResolver:'popup-resolver',
  GoogleAuthProvider:class{constructor(){return mocked.provider;}},onAuthStateChanged:mocked.subscribe,signInWithPopup:mocked.popup,signOut:mocked.signOut}));
import {createGoogleAuth} from '../src/data/google-auth.js';
test('SDK usa Google, selector de cuenta y persistencia solo por pestaña; sin scopes adicionales',async()=>{
  mocked.initializeAuth.mockReturnValue(mocked.auth);
  const config={firebase:{projectId:'forx-v2-test'}},client=createGoogleAuth(config);
  expect(mocked.initializeApp).toHaveBeenCalledWith(config.firebase,'forx-account');
  expect(mocked.initializeAuth).toHaveBeenCalledWith({name:'app'},{persistence:'session-only',popupRedirectResolver:'popup-resolver'});
  expect(mocked.provider.setCustomParameters).toHaveBeenCalledWith({prompt:'select_account'});
  expect(mocked.auth.languageCode).toBe('es');
  await client.signIn();expect(mocked.popup).toHaveBeenCalledWith(mocked.auth,mocked.provider);
  await client.signOut();expect(mocked.signOut).toHaveBeenCalledWith(mocked.auth);
});
