import { ethers } from 'ethers';
import { config, isTestMode } from './config';
import { loadAndDecryptKey } from './crypto';
import fetch from 'node-fetch';
import { logger } from './logger';

const FIRE_FUNCTION = "0x457094cc";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const CONFIRMATION_TIMEOUT_MS = 180000;
const DEFAULT_GAS = BigInt(100000);

const RPC_ENDPOINTS = [
  { url: config.drpcEndpoint, name: "dRPC" },
  { url: 'https://api.roninchain.com/rpc', name: "Ronin RPC" }
];

async function callRPC(rpcUrl: string, method: string, params: any[]): Promise<any> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        method: method,
        params: params,
        id: Math.floor(Math.random() * 1000),
        jsonrpc: "2.0"
      }),
      timeout: 10000
    });
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(JSON.stringify(result.error));
    }
    
    return result.result;
  } catch (error) {
    throw error;
  }
}

async function estimateGas(walletAddress: string, rpcUrl: string): Promise<bigint> {
  try { 
    logger.info(`Estimating gas...`);
    const gasEstimate = await callRPC(rpcUrl, "eth_estimateGas", [
      {
        from: walletAddress,
        to: config.contractAddress,
        data: FIRE_FUNCTION
      }
    ]);
    
    const estimatedGas = BigInt(gasEstimate);
    logger.info(`Estimated gas: ${estimatedGas}`);
    return estimatedGas;
  } catch (error) {
    logger.warn(`Gas estimation error: ${error}. Using default: ${DEFAULT_GAS}`);
    return DEFAULT_GAS;
  }
}

async function getTransactionReceipt(txHash: string, rpcUrl: string): Promise<any | null> {
  try {
    const receipt = await callRPC(rpcUrl, "eth_getTransactionReceipt", [txHash]);
    return receipt;
  } catch (error) {
    const errorStr = String(error);
    if (errorStr.includes("Unknown block")) {
      logger.warn(`Receipt not available yet (Unknown block). The network may be catching up.`);
    } else {
      logger.warn(`Failed to check receipt: ${error}`);
    }
    return null;
  }
}

async function isRPCHealthy(rpc: {url: string, name: string}): Promise<boolean> {
  try {
    const blockNumber = await callRPC(rpc.url, "eth_blockNumber", []);
    return typeof blockNumber === 'string';
  } catch (error) {
    logger.warn(`${rpc.name} endpoint check failed: ${error}`);
    return false;
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

  const healthyRPCs = [];
  for (const rpc of RPC_ENDPOINTS) {
    logger.info(`Checking health of ${rpc.name}...`);
    if (await isRPCHealthy(rpc)) {
      logger.info(`${rpc.name} is healthy`);
      healthyRPCs.push(rpc);
    } else {
      logger.warn(`${rpc.name} appears to be unhealthy, may skip`);
    }
  }

  const endpointsToTry = healthyRPCs.length > 0 ? healthyRPCs : RPC_ENDPOINTS;
  
  while (attemptCount < MAX_RETRIES) {
    for (const rpc of endpointsToTry) {
      try {
        logger.info(`Transaction attempt ${attemptCount + 1} using ${rpc.name}`);

        const provider = new ethers.JsonRpcProvider(rpc.url);

        try {
          await provider.getBlockNumber();
        } catch (error) {
          logger.warn(`Failed ethers connection test with ${rpc.name}: ${error}`);
          continue;
        }
        
        const privateKey = loadAndDecryptKey();
        const wallet = new ethers.Wallet(privateKey, provider);
        
        logger.info(`Using wallet: ${wallet.address}`);

        let nonce;
        try {
          nonce = await provider.getTransactionCount(wallet.address);
          logger.info(`Current nonce: ${nonce}`);
        } catch (nonceError) {
          logger.warn(`Failed to get nonce from ${rpc.name}: ${nonceError}`);
          continue;
        }

        const gasLimit = await estimateGas(wallet.address, rpc.url);
        
        if (isTestMode) {
          logger.info('TEST MODE: Transaction not sent');
          return 'test-transaction-hash';
        }

        logger.info(`Preparing to call fire() on contract: ${config.contractAddress}`);

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
          
          logger.info(`Using EIP-1559 transaction with max fee ${ethers.formatUnits(priorityFee + baseFee, 'gwei')} GWEI`);
        } else {
          const gasPrice = ethers.parseUnits((config.priorityFee + config.maxFee).toString(), 'gwei');
          
          txRequest = {
            to: config.contractAddress,
            data: FIRE_FUNCTION,
            gasLimit,
            gasPrice,
            nonce
          };
          
          logger.info(`Using legacy transaction with gas price ${config.priorityFee + config.maxFee} GWEI`);
        }

        logger.info('Sending transaction...');

        let tx;
        try {
          tx = await wallet.sendTransaction(txRequest);
          logger.info(`Transaction sent with hash: ${tx.hash}`);
        } catch (sendError) {
          const errorMsg = sendError instanceof Error ? sendError.message : String(sendError);
          
          if (errorMsg.includes("execution reverted")) {
            logger.warn(`Contract execution reverted: ${errorMsg}`);
            logger.warn("The contract may have time restrictions or other conditions for the fire() function.");
          } else {
            logger.warn(`Failed to send transaction: ${errorMsg}`);
          }
          continue;
        }

        try {
          const receipt = await waitForTransaction(tx.hash, rpc.url);
          
          if (!receipt) {
            logger.warn('Transaction submitted but confirmation timed out');
            logger.warn('The transaction may still be successful, check explorer later');
          }
        } catch (confirmError) {
          logger.warn(`Error during confirmation: ${confirmError}`);
          logger.warn('Transaction was sent but confirmation status is unknown');
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