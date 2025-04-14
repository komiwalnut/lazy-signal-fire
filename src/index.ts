import { keyFileExists } from './config';
import { encryptAndSaveKey } from './crypto';
import { sendFireTransaction } from './transaction';
import prompts from 'prompts';
import { isTestMode } from './config';
import { logger } from './logger';

function isValidEthereumPrivateKey(key: string): boolean {
  const cleanKey = key.startsWith('0x') ? key.substring(2) : key;

  const hexRegex = /^[0-9a-fA-F]{64}$/;
  return hexRegex.test(cleanKey);
}

async function main() {
  logger.info('🔥 Lazy Signal Fire 🔥');
  logger.info('------------------------');

  if (!keyFileExists()) {
    logger.info('No encrypted key file found. Setting up...');

    logger.warn('\n⚠️  SECURITY WARNING ⚠️');
    logger.warn('Make sure no one can see your screen');
    logger.warn('Your private key will be encrypted, but it\'s sensitive during input');
    logger.warn('Press Ctrl+C to cancel if you\'re in a public place\n');

    const response = await prompts({
      type: 'password',
      name: 'privateKey',
      message: 'Enter your private key (will be encrypted):',
      validate: value => 
        isValidEthereumPrivateKey(value) ? 
          true : 'Invalid private key format. Must be a 64-character hex string.'
    });
    
    if (!response.privateKey) {
      logger.error('Operation cancelled or invalid input. Exiting...');
      process.exit(1);
    }
    
    try {
      encryptAndSaveKey(response.privateKey);
      logger.info('Key encrypted and saved successfully!');
    } catch (error) {
      logger.error('Failed to encrypt and save key:', error);
      process.exit(1);
    } finally {
      response.privateKey = '';
    }
  }
  
  logger.info(`Mode: ${isTestMode ? 'TEST' : 'PRODUCTION'}`);

  try {
    logger.info('Executing fire() transaction...');
    const txHash = await sendFireTransaction();
  } catch (error) {
    logger.error('Failed to execute transaction:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  logger.info('\nOperation cancelled. Exiting...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Unhandled exception:', error);
  process.exit(1);
});

main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});