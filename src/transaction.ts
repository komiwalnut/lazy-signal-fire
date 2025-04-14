import { ethers } from 'ethers';
import { config, isTestMode } from './config';
import { loadAndDecryptKey } from './crypto';
import fetch from 'node-fetch';
import { logger } from './logger';

const FIRE_FUNCTION = "0x457094cc";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const CONFIRMATION_TIMEOUT_MS = 180000;

const RPC_ENDPOINTS = [
  { url: config.drpcEndpoint, name: "dRPC" },
  { url: 'https://api.roninchain.com/rpc', name: "Ronin RPC" }
];

async function estimateGas(walletAddress: string, rpcUrl: string): Promise<bigint> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        method: "eth_estimateGas",
        params: [
          {
            from: walletAddress,
            to: config.contractAddress,
            data: FIRE_FUNCTION
          }
        ],
        id: 1,
        jsonrpc: "2.0"
      })
    });
    
    const result = await response.json();
    
    if (result.error) {
      logger.warn(`Gas estimation error: ${JSON.stringify(result.error)}`);
      throw new Error(`Gas estimation failed: ${result.error.message}`);
    }
    
    const estimatedGas = BigInt(result.result);
    logger.info(`Estimated gas: ${estimatedGas}`);

    return estimatedGas;
  } catch (error) {
    const defaultGas = BigInt(100000);
    logger.warn(`Failed to estimate gas: ${error}. Using default: ${defaultGas}`);
    return defaultGas;
  }
}

async function getTransactionReceipt(txHash: string, rpcUrl: string): Promise<any | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        method: "eth_getTransactionReceipt",
        params: [txHash],
        id: 1,
        jsonrpc: "2.0"
      })
    });
    
    const result = await response.json();
    
    if (result.error) {
      logger.warn(`Error checking receipt: ${JSON.stringify(result.error)}`);
      return null;
    }
    
    return result.result;
  } catch (error) {
    logger.warn(`Failed to check transaction receipt: ${error}`);
    return null;
  }
}

async function waitForTransaction(txHash: string, rpcUrl: string): Promise<any> {
  logger.info(`Waiting for transaction ${txHash} to be mined...`);
  
  const startTime = Date.now();
  let lastLog = startTime;
  
  while (Date.now() - startTime < CONFIRMATION_TIMEOUT_MS) {
    try {
      const receipt = await getTransactionReceipt(txHash, rpcUrl);
      
      if (receipt) {
        const blockNumber = parseInt(receipt.blockNumber, 16);
        const status = parseInt(receipt.status, 16);
        const gasUsed = parseInt(receipt.gasUsed, 16);
        
        if (status === 1) {
          logger.info(`Transaction confirmed in block ${blockNumber}! Gas used: ${gasUsed}`);
        } else {
          logger.warn(`Transaction was mined in block ${blockNumber} but failed with status: ${status}`);
        }
        
        return receipt;
      }

      const now = Date.now();
      if (now - lastLog > 15000) {
        logger.info(`Still waiting for confirmation... (${Math.floor((now - startTime) / 1000)}s elapsed)`);
        lastLog = now;
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      logger.warn(`Error checking transaction status: ${error}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  logger.warn(`Transaction confirmation timed out after ${CONFIRMATION_TIMEOUT_MS / 1000} seconds`);
  return null;
}

export async function sendFireTransaction(): Promise<string> {
  let attemptCount = 0;
  
  while (attemptCount < MAX_RETRIES) {
    for (const rpc of RPC_ENDPOINTS) {
      try {
        logger.info(`Transaction attempt ${attemptCount + 1} using ${rpc.name}`);

        const provider = new ethers.JsonRpcProvider(rpc.url);
        await provider.getBlockNumber();
        
        const privateKey = loadAndDecryptKey();
        const wallet = new ethers.Wallet(privateKey, provider);
        
        logger.info(`Using wallet: ${wallet.address}`);

        const nonce = await provider.getTransactionCount(wallet.address);

        const gasLimit = await estimateGas(wallet.address, rpc.url);
        
        if (isTestMode) {
          logger.info('TEST MODE: Transaction not sent');
          return 'test-transaction-hash';
        }

        let txRequest;
        
        if (rpc.name === "dRPC") {
          const priorityFee = ethers.parseUnits(config.priorityFee.toString(), 'gwei');
          const baseFee = ethers.parseUnits(config.maxFee.toString(), 'gwei');
          
          txRequest = {
            to: config.contractAddress,
            data: FIRE_FUNCTION,
            gasLimit,
            maxFeePerGas: priorityFee + baseFee,
            maxPriorityFeePerGas: priorityFee,
            nonce
          };
        } else {
          const gasPrice = ethers.parseUnits((config.priorityFee + config.maxFee).toString(), 'gwei');
          
          txRequest = {
            to: config.contractAddress,
            data: FIRE_FUNCTION,
            gasLimit,
            gasPrice,
            nonce
          };
        }

        logger.info('Sending transaction...');
        const tx = await wallet.sendTransaction(txRequest);
        logger.info(`Transaction sent with hash: ${tx.hash}`);

        const receipt = await waitForTransaction(tx.hash, rpc.url);
        
        if (!receipt) {
          logger.warn('Could not confirm if transaction was mined, but it was submitted');
          logger.warn('Will assume transaction is successful since it was properly sent to the network');
        }
        
        return tx.hash;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed with ${rpc.name}: ${errorMessage}`);
        
        continue;
      }
    }
    
    attemptCount++;
    
    if (attemptCount < MAX_RETRIES) {
      logger.warn(`All RPC endpoints failed. Retry attempt ${attemptCount} of ${MAX_RETRIES}`);
      logger.info(`Waiting ${RETRY_DELAY_MS / 1000} seconds before retry...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    } else {
      logger.error('All RPC endpoints failed after maximum retry attempts');
      throw new Error('Failed to send transaction after trying all available RPC endpoints');
    }
  }
  
  throw new Error('All transaction attempts failed');
}