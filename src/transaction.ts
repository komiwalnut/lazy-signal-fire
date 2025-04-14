import { ethers } from 'ethers';
import { config, isTestMode } from './config';
import { loadAndDecryptKey } from './crypto';
import fetch from 'node-fetch';

const FIRE_FUNCTION = "0x457094cc";

const REASONABLE_GAS_LIMIT = 55000;

async function estimateGas(walletAddress: string): Promise<bigint> {
  try {
    console.log('Estimating gas for transaction...');
    
    const response = await fetch(config.drpcEndpoint, {
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
      console.error('Gas estimation error:', result.error);
      throw new Error(`Gas estimation failed: ${result.error.message}`);
    }
    
    const estimatedGas = BigInt(result.result);
    console.log(`RPC estimated gas: ${estimatedGas}`);

    if (estimatedGas > BigInt(REASONABLE_GAS_LIMIT)) {
      console.log(`Using capped gas limit of ${REASONABLE_GAS_LIMIT} instead of ${estimatedGas}`);
      return BigInt(REASONABLE_GAS_LIMIT);
    }
    
    return estimatedGas;
  } catch (error) {
    console.error('Failed to estimate gas:', error);
    console.log(`Using default gas limit of ${REASONABLE_GAS_LIMIT}`);
    return BigInt(REASONABLE_GAS_LIMIT);
  }
}

export async function sendFireTransaction(): Promise<string> {
  try {
    const provider = new ethers.JsonRpcProvider(config.roninRpcUrl);

    const privateKey = loadAndDecryptKey();

    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log(`Using wallet: ${wallet.address}`);
    console.log(`Preparing to call fire() on contract: ${config.contractAddress}`);

    const nonce = await provider.getTransactionCount(wallet.address);
    console.log(`Current nonce: ${nonce}`);

    const gasLimit = await estimateGas(wallet.address);
    
    if (isTestMode) {
      console.log('TEST MODE: Transaction not sent');
      return 'test-transaction-hash';
    }

    const priorityFee = ethers.parseUnits(config.priorityFee.toString(), 'gwei');
    const baseFee = ethers.parseUnits(config.maxFee.toString(), 'gwei');

    const maxFeePerGas = priorityFee + baseFee;
    
    console.log(`Gas settings: priorityFee=${config.priorityFee} GWEI, baseFee=${config.maxFee} GWEI, maxFee=${Number(ethers.formatUnits(maxFeePerGas, 'gwei'))} GWEI`);

    const tx = await wallet.sendTransaction({
      to: config.contractAddress,
      data: FIRE_FUNCTION,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas: priorityFee,
      nonce
    });
    
    console.log(`Transaction sent with hash: ${tx.hash}`);

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error('Transaction receipt is null');
    }
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed}`);
    
    return tx.hash;
  } catch (error) {
    console.error('Error sending transaction:', error);
    throw error;
  }
}