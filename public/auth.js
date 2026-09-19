import {firebaseConfig} from './firebase-config.js';

const SDK_VERSION='12.19.0';
const configured=Object.values(firebaseConfig).every(Boolean);
let api=null,auth=null,currentUser=null;
const listeners=new Set();

function publish(){
  for(const listener of listeners)listener(currentUser);
  document.dispatchEvent(new CustomEvent('dypfinn:auth',{detail:{user:currentUser}}));
}

function friendly(error){
  const code=error?.code||'';
  if(code==='auth/email-already-in-use')return 'E-postadressen er allerede registrert.';
  if(code==='auth/weak-password')return 'Passordet oppfyller ikke sikkerhetskravene.';
  if(code==='auth/invalid-email')return 'Skriv inn en gyldig e-postadresse.';
  if(code==='auth/too-many-requests')return 'For mange forsøk. Vent litt før du prøver igjen.';
  if(code==='auth/network-request-failed')return 'Kunne ikke kontakte innloggingstjenesten. Sjekk nettet.';
  if(code==='auth/operation-not-allowed')return 'E-postinnlogging er ikke aktivert ennå.';
  return 'E-post eller passord er feil.';
}

async function ready(){
  if(!configured)throw Object.assign(new Error('Innlogging er ikke konfigurert.'),{code:'auth/not-configured'});
  if(auth)return auth;
  const [{initializeApp},authApi]=await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`)
  ]);
  api=authApi;
  auth=api.getAuth(initializeApp(firebaseConfig));
  api.setPersistence(auth,api.browserLocalPersistence).catch(()=>{});
  api.onAuthStateChanged(auth,user=>{currentUser=user;publish();});
  return auth;
}

export const AuthService={
  get configured(){return configured;},
  get user(){return currentUser;},
  async init(){if(!configured){publish();return null;}return ready();},
  subscribe(listener){listeners.add(listener);listener(currentUser);return()=>listeners.delete(listener);},
  async signUp(email,password){
    try{
      const instance=await ready();
      const result=await api.createUserWithEmailAndPassword(instance,email.trim(),password);
      await api.sendEmailVerification(result.user,{url:location.origin+location.pathname+'#profil'});
      return result.user;
    }catch(error){throw new Error(friendly(error));}
  },
  async signIn(email,password){
    try{const instance=await ready();return (await api.signInWithEmailAndPassword(instance,email.trim(),password)).user;}
    catch(error){throw new Error(friendly(error));}
  },
  async sendReset(email){
    try{const instance=await ready();await api.sendPasswordResetEmail(instance,email.trim(),{url:location.origin+location.pathname+'#profil'});}
    catch(error){
      if(error?.code==='auth/invalid-email')throw new Error(friendly(error));
      // Keep the response generic so an attacker cannot enumerate registered users.
    }
  },
  async resendVerification(){
    if(!currentUser)throw new Error('Logg inn først.');
    try{await api.sendEmailVerification(currentUser,{url:location.origin+location.pathname+'#profil'});}
    catch(error){throw new Error(friendly(error));}
  },
  async signOut(){if(auth)await api.signOut(auth);}
};
