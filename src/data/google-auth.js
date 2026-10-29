import { initializeApp } from 'firebase/app';
import { initializeAuth, browserSessionPersistence, browserPopupRedirectResolver,
  GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';

export function createGoogleAuth(config) {
  const app = initializeApp(config.firebase, 'forx-account');
  const auth = initializeAuth(app, { persistence:browserSessionPersistence, popupRedirectResolver:browserPopupRedirectResolver });
  auth.languageCode = 'es';
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  // Only basic Google identity. No Drive, Gmail, contacts or password access.
  return {
    get currentUser() { return auth.currentUser; },
    subscribe:callback => onAuthStateChanged(auth, callback),
    signIn:() => signInWithPopup(auth, provider),
    signOut:() => signOut(auth)
  };
}
