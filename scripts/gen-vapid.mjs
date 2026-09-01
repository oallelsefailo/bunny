// One-time VAPID key generation for push reminders. Run: node scripts/gen-vapid.mjs
import { webcrypto as wc } from 'node:crypto';

const kp = await wc.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = Buffer.from(await wc.subtle.exportKey('raw', kp.publicKey)).toString('base64url');
const jwk = JSON.stringify(await wc.subtle.exportKey('jwk', kp.privateKey));

console.log('\nPUBLIC key, paste into config.js (PUSH.publicKey) AND push-worker/wrangler.toml (VAPID_PUBLIC):\n');
console.log('  ' + raw);
console.log('\nPRIVATE key, set as a secret (run in push-worker/: npx wrangler secret put VAPID_PRIVATE_JWK) and paste this when prompted:\n');
console.log('  ' + jwk);
console.log('\nKeep the private key out of git.\n');
