import { createHash } from 'node:crypto';
import { originalExpiresAt } from '../domain/retention.js';

// Private, content-addressed objects. A failed Firestore transaction can leave
// an orphan, but never a public URL or a replacement of an existing original.
// Expiry metadata also covers those orphans for the future retention worker.
export class PrivateOriginals {
  constructor(bucket, { clock=()=>Date.now() }={}) { this.bucket = bucket; this.clock=clock; }
  async retain(value) {
    const bytes = Buffer.from(value.bytes || []);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (value.hash !== hash || value.id !== `xml_${hash}` || value.path !== `originals/${value.id}.xml`
      || value.expiresAt !== originalExpiresAt(value.uploadedAt) || Date.parse(value.expiresAt)<=this.clock()) throw new Error('Original o vencimiento inconsistente.');
    const file = this.bucket.file(value.path);
    const adopt=async existing=>{
      const saved=existing.metadata;
      if (saved?.sha256 !== hash || !/^\d+$/.test(String(existing.generation)) || !/^\d+$/.test(String(existing.metageneration))
        || !Number.isFinite(Date.parse(saved.uploadedAt)) || saved.uploadedAt>value.uploadedAt
        || saved.expiresAt !== originalExpiresAt(saved.uploadedAt) || Date.parse(saved.expiresAt)<=this.clock()) throw new Error('El objeto existente no coincide con su huella o retención vigente.');
      // Recover an orphan using its ORIGINAL retention, never the retry date.
      // Pin the download to a generation and recheck metadata before adoption.
      const [stored]=await this.bucket.file(value.path,{generation:existing.generation}).download();
      const [current]=await file.getMetadata();
      if (!Buffer.from(stored).equals(bytes) || current.generation!==existing.generation || current.metageneration!==existing.metageneration)
        throw new Error('El original cambió durante la comprobación; no se adoptó.');
      return {uploadedAt:saved.uploadedAt,expiresAt:saved.expiresAt};
    };
    // Do not attempt a write for known objects. The generation precondition
    // below remains mandatory for a concurrent creation after this read.
    let existing;
    try {[existing]=await file.getMetadata();}catch(error){if(Number(error.code)!==404)throw error;}
    if(existing)return adopt(existing);
    try {
      await file.save(bytes, { resumable:false, preconditionOpts:{ifGenerationMatch:0},
        metadata:{contentType:'application/xml',cacheControl:'private, no-store',
          metadata:{sha256:hash,uploadedAt:value.uploadedAt,expiresAt:value.expiresAt}} });
    } catch (error) {
      if (Number(error.code) !== 412) throw error;
      return adopt((await file.getMetadata())[0]);
    }
    return {uploadedAt:value.uploadedAt,expiresAt:value.expiresAt};
  }
}
