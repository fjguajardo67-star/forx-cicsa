import { initializeApp, applicationDefault, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { deploymentConfig, requireCloudApproval, assertInstance, assertBucketPolicy } from './deployment-config.js';
import { FirestoreEntityRepository } from './firestore-entity-repository.js';
import { PrivateOriginals } from './private-originals.js';
import { AccessService } from './access-service.js';
import { createRecipeAIProvider } from './recipe-ai-configuration.js';

export function runtimeRecipeGeneration(configuration,{connectRecipeAI=true,env=process.env,fetchImpl=globalThis.fetch}={}) {
  return connectRecipeAI?createRecipeAIProvider(configuration,{env,fetchImpl})
    :{generationProvider:null,generationBudgetPolicy:null};
}

export async function createCloudRuntime(raw,{env=process.env,allowUninitialized=false,connectRecipeAI=true}={}) {
  const config=deploymentConfig(raw,env);requireCloudApproval(config,env);
  // Private maintenance/reconciliation jobs must not need the OpenAI secret or
  // accidentally gain a generation transport merely because the API has one.
  const generation=runtimeRecipeGeneration(config.recipeGeneration,{connectRecipeAI,env});
  const app=initializeApp({projectId:config.projectId,credential:applicationDefault()},`forx-cloud-${crypto.randomUUID()}`);
  try {
    const db=getFirestore(app,config.databaseId);db.settings({ignoreUndefinedProperties:true});
    const auth=getAuth(app),storage=getStorage(app);
    const bucket=storage.bucket(config.originalsBucket),backupsBucket=storage.bucket(config.backupsBucket);
    const assertReady=async()=>assertInstance((await db.collection('_forx_system').doc('instance').get()).data(),config);
    if (!allowUninitialized) await assertReady();
    assertBucketPolicy((await bucket.getMetadata())[0],config,'originals');
    assertBucketPolicy((await backupsBucket.getMetadata())[0],config,'backups');
    const repository=new FirestoreEntityRepository(db,{originals:new PrivateOriginals(bucket),guardTransaction:async tx=>{
      assertInstance((await tx.get(db.collection('_forx_system').doc('instance'))).data(),config);
    }});
    return {config,db,auth,bucket,backupsBucket,repository,assertReady,
      access:new AccessService({auth,db,provider:config.signInProvider}),...generation,close:()=>deleteApp(app)};
  } catch(error) { await deleteApp(app);throw error; }
}
