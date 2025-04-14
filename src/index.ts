import { keyFileExists } from './config';
import { encryptAndSaveKey } from './crypto';
import { sendFireTransaction } from './transaction';
import prompts from 'prompts';
import { isTestMode } from './config';

function isValidEthereumPrivateKey(key: string): boolean {
  const cleanKey = key.startsWith('0x') ? key.substring(2) : key;

  const hexRegex = /^[0-9a-fA-F]{64}$/;
  return hexRegex.test(cleanKey);
}

async function main() {
  console.log('🔥 Lazy Signal Fire 🔥');
  console.log('------------------------');

  if (!keyFileExists()) {
    console.log('No encrypted key file found. Setting up...');

    console.log('\n⚠️  SECURITY WARNING ⚠️');
    console.log('Make sure no one can see your screen');
    console.log('Your private key will be encrypted, but it\'s sensitive during input');
    console.log('Press Ctrl+C to cancel if you\'re in a public place\n');

    const response = await prompts({
      type: 'password',
      name: 'privateKey',
      message: 'Enter your private key (will be encrypted):',
      validate: value => 
        isValidEthereumPrivateKey(value) ? 
          true : 'Invalid private key format. Must be a 64-character hex string.'
    });
    
    if (!response.privateKey) {
      console.error('Operation cancelled or invalid input. Exiting...');
      process.exit(1);
    }
    
    try {
      encryptAndSaveKey(response.privateKey);
      console.log('Key encrypted and saved successfully!');
    } catch (error) {
      console.error('Failed to encrypt and save key:', error);
      process.exit(1);
    } finally {
      response.privateKey = '';
    }
  }
  
  console.log(`Mode: ${isTestMode ? 'TEST' : 'PRODUCTION'}`);

  try {
    console.log('Executing fire() transaction...');
    const txHash = await sendFireTransaction();
    console.log(`Transaction completed with hash: ${txHash}`);
  } catch (error) {
    console.error('Failed to execute transaction:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\nOperation cancelled. Exiting...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('Unhandled exception:', error);
  process.exit(1);
});

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});