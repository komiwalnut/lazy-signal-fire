import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import fs from 'fs';
import { KEY_FILE_PATH, config } from './config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export function encryptAndSaveKey(privateKey: string): void {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);

  const derivedKey = scryptSync(
    config.encryptionKey, 
    salt, 
    KEY_LENGTH, 
    { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }
  );

  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);

  let encryptedData = cipher.update(privateKey, 'utf8', 'hex');
  encryptedData += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  const dataToStore = 
    salt.toString('hex') + 
    iv.toString('hex') + 
    authTag.toString('hex') + 
    encryptedData;

  fs.writeFileSync(KEY_FILE_PATH, dataToStore);
  fs.chmodSync(KEY_FILE_PATH, 0o600);
  
  console.log(`Encrypted key saved to ${KEY_FILE_PATH}`);
}

export function loadAndDecryptKey(): string {
  if (!fs.existsSync(KEY_FILE_PATH)) {
    throw new Error(`Key file not found at ${KEY_FILE_PATH}`);
  }

  const data = fs.readFileSync(KEY_FILE_PATH, 'utf8');

  const saltHex = data.slice(0, SALT_LENGTH * 2);
  const ivHex = data.slice(SALT_LENGTH * 2, (SALT_LENGTH + IV_LENGTH) * 2);
  const authTagHex = data.slice(
    (SALT_LENGTH + IV_LENGTH) * 2, 
    (SALT_LENGTH + IV_LENGTH + TAG_LENGTH) * 2
  );
  const encryptedDataHex = data.slice((SALT_LENGTH + IV_LENGTH + TAG_LENGTH) * 2);

  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encryptedData = Buffer.from(encryptedDataHex, 'hex');

  const derivedKey = scryptSync(
    config.encryptionKey, 
    salt, 
    KEY_LENGTH, 
    { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }
  );

  const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString('utf8');
}