import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import {
  rpc,
  Horizon,
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  Address,
  Contract,
  xdr,
} from '@stellar/stellar-sdk';

dotenv.config();

const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const HORIZON_URL = process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;
const SECRET_KEY =
  process.env.SERVER_SIGNER_SECRET_KEY ||
  'SC6WBWPGSIELKLKKRCY5GOIIF3JIJTS2GDKSJD7K6M6MHR3G3RI7EXYP';

/**
 * Robust polling for Protocol 22 transaction completion using raw RPC responses,
 * bypassing SDK's TransactionMetaV4 parsing mismatch.
 */
async function pollRawTransaction(
  server: rpc.Server,
  hash: string,
  maxAttempts = 30,
  intervalMs = 2000
): Promise<rpc.Api.RawGetTransactionResponse> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await server._getTransaction(hash);
    if (raw.status === 'SUCCESS') {
      return raw;
    }
    if (raw.status === 'FAILED') {
      throw new Error(`Transaction ${hash} failed on-chain: ${JSON.stringify(raw)}`);
    }
    // Status is 'NOT_FOUND' or pending; wait for next ledger inclusion
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Transaction ${hash} timed out after ${maxAttempts} attempts`);
}

async function main() {
  console.log('====================================================');
  console.log('   Soroban InvoiceRegistry Testnet Deployment      ');
  console.log('====================================================\n');

  const rpcServer = new rpc.Server(SOROBAN_RPC_URL, { allowHttp: false });
  const horizonServer = new Horizon.Server(HORIZON_URL);

  // 1. Check RPC Health
  console.log('1. Checking Soroban RPC health...');
  const health = await rpcServer.getHealth();
  console.log(`   RPC Status: ${health.status}\n`);

  // 2. Load Deployer Keypair
  console.log('2. Loading Deployer Account...');
  const deployer = Keypair.fromSecret(SECRET_KEY);
  console.log(`   Deployer Public Key: ${deployer.publicKey()}`);

  let account = await horizonServer.loadAccount(deployer.publicKey());
  const nativeBal = account.balances.find((b) => b.asset_type === 'native')?.balance;
  console.log(`   Account Balance: ${nativeBal} XLM`);
  console.log(`   Current Sequence: ${account.sequence}\n`);

  // 3. Read Compiled WASM File
  const wasmPath = path.resolve('../bill-generator-contracts/invoice_registry.wasm');
  console.log(`3. Reading contract binary from: ${wasmPath}`);
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`WASM file not found at ${wasmPath}`);
  }
  const wasmBytes = fs.readFileSync(wasmPath);
  const wasmHash = crypto.createHash('sha256').update(wasmBytes).digest();
  console.log(`   Binary Size: ${wasmBytes.length} bytes`);
  console.log(`   Computed WASM Hash: ${wasmHash.toString('hex')}\n`);

  // 4. Verify WASM Bytecode On-Chain
  console.log('4. Verifying WASM Bytecode on testnet...');
  let wasmAlreadyUploaded = false;
  try {
    const existingWasm = await rpcServer.getContractWasmByHash(wasmHash);
    if (existingWasm && existingWasm.length > 0) {
      console.log('   Confirmed: WASM is already installed on-chain.\n');
      wasmAlreadyUploaded = true;
    }
  } catch {
    console.log('   WASM not found on-chain. Proceeding with upload...\n');
  }

  let uploadTxHash = 'b0e2c3dd8a392dab5d50f1fef980a0506f91f67b63c429810d4008b01f7d5897';

  if (!wasmAlreadyUploaded) {
    account = await horizonServer.loadAccount(deployer.publicKey());
    const uploadOp = Operation.uploadContractWasm({ wasm: wasmBytes });

    const tx = new TransactionBuilder(account, {
      fee: '100000',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .setTimeout(300)
      .addOperation(uploadOp)
      .build();

    console.log('   Preparing upload transaction via Soroban RPC...');
    const preparedTx = await rpcServer.prepareTransaction(tx);
    preparedTx.sign(deployer);

    console.log('   Submitting upload transaction...');
    const sendRes = await rpcServer.sendTransaction(preparedTx);
    uploadTxHash = sendRes.hash;
    console.log(`   Submitted tx: ${sendRes.hash} (status: ${sendRes.status})`);

    console.log('   Polling for transaction confirmation...');
    const pollRes = await pollRawTransaction(rpcServer, sendRes.hash);
    console.log(`   WASM uploaded successfully! Ledger: ${pollRes.ledger}\n`);
  }

  // 5. Create Contract Instance
  console.log('5. Deploying Contract Instance...');
  const salt = crypto.randomBytes(32);
  const deployerAddress = Address.fromString(deployer.publicKey());
  const createOp = Operation.createCustomContract({
    address: deployerAddress,
    wasmHash: wasmHash,
    salt: salt,
  });

  account = await horizonServer.loadAccount(deployer.publicKey());
  const createTx = new TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .setTimeout(300)
    .addOperation(createOp)
    .build();

  console.log('   Simulating create contract transaction...');
  const sim = await rpcServer.simulateTransaction(createTx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) {
    throw new Error(`Create contract simulation failed: ${JSON.stringify(sim)}`);
  }

  const deployedContractId = Address.fromScVal(sim.result.retval).toString();
  console.log(`   Contract ID calculated from simulation: ${deployedContractId}`);

  console.log('   Preparing create contract transaction...');
  const preparedCreateTx = await rpcServer.prepareTransaction(createTx);
  preparedCreateTx.sign(deployer);

  console.log('   Submitting create contract transaction...');
  const sendCreateRes = await rpcServer.sendTransaction(preparedCreateTx);
  const createTxHash = sendCreateRes.hash;
  console.log(`   Submitted tx: ${createTxHash} (status: ${sendCreateRes.status})`);

  console.log('   Polling for confirmation...');
  const pollCreateRes = await pollRawTransaction(rpcServer, createTxHash);
  console.log(`   Contract deployed successfully! Ledger: ${pollCreateRes.ledger}`);
  console.log(`   CONTRACT ID: ${deployedContractId}\n`);

  // 6. Initialize Contract (admin = deployer)
  console.log('6. Initializing Contract on-chain (initialize)...');
  const contract = new Contract(deployedContractId);
  const initOp = contract.call('initialize', deployerAddress.toScVal());

  account = await horizonServer.loadAccount(deployer.publicKey());
  const initTx = new TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .setTimeout(300)
    .addOperation(initOp)
    .build();

  console.log('   Preparing initialize transaction...');
  const preparedInitTx = await rpcServer.prepareTransaction(initTx);
  preparedInitTx.sign(deployer);

  console.log('   Submitting initialize transaction...');
  const sendInitRes = await rpcServer.sendTransaction(preparedInitTx);
  const initTxHash = sendInitRes.hash;
  console.log(`   Submitted tx: ${initTxHash} (status: ${sendInitRes.status})`);

  console.log('   Polling for confirmation...');
  const pollInitRes = await pollRawTransaction(rpcServer, initTxHash);
  console.log(`   Contract initialized successfully! Ledger: ${pollInitRes.ledger}\n`);

  // 7. Verify Contract State (Query get_admin)
  console.log('7. Verifying Contract State (get_admin)...');
  account = await horizonServer.loadAccount(deployer.publicKey());
  const verifyTx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .setTimeout(300)
    .addOperation(contract.call('get_admin'))
    .build();

  const simVerify = await rpcServer.simulateTransaction(verifyTx);
  if (!rpc.Api.isSimulationSuccess(simVerify) || !simVerify.result?.retval) {
    throw new Error('Failed to simulate get_admin query on deployed contract.');
  }

  const retval = simVerify.result.retval;
  let adminAddress: string = '';
  try {
    adminAddress = Address.fromScVal(retval).toString();
  } catch {
    const vec = retval.vec();
    if (vec && vec.length > 0) {
      adminAddress = Address.fromScVal(vec[0]).toString();
    }
  }

  console.log(`   Contract admin read from contract state: ${adminAddress}`);
  if (adminAddress !== deployer.publicKey()) {
    console.warn(`   Admin address mismatch: expected ${deployer.publicKey()}, got ${adminAddress}`);
  } else {
    console.log('   VERIFIED: Admin address matches deployer public key on-chain!\n');
  }

  // 8. Output Deployment Summary
  const deploymentRecord = {
    network: 'Stellar Testnet',
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: SOROBAN_RPC_URL,
    horizonUrl: HORIZON_URL,
    contractName: 'InvoiceRegistry',
    contractId: deployedContractId,
    wasmHash: wasmHash.toString('hex'),
    deployerAddress: deployer.publicKey(),
    creationTxHash: createTxHash,
    initTxHash: initTxHash,
    uploadTxHash: uploadTxHash,
    verifiedAdmin: adminAddress,
    explorerUrl: `https://stellar.expert/explorer/testnet/contract/${deployedContractId}`,
    deployedAt: new Date().toISOString(),
  };

  const recordPath = path.resolve('./deployed_contract.json');
  fs.writeFileSync(recordPath, JSON.stringify(deploymentRecord, null, 2));

  console.log('====================================================');
  console.log('           DEPLOYMENT SUCCESSFUL!                   ');
  console.log('====================================================');
  console.log(`Contract ID:       ${deploymentRecord.contractId}`);
  console.log(`WASM Hash:         ${deploymentRecord.wasmHash}`);
  console.log(`Deployer:          ${deploymentRecord.deployerAddress}`);
  console.log(`Create Tx Hash:    ${deploymentRecord.creationTxHash}`);
  console.log(`Init Tx Hash:      ${deploymentRecord.initTxHash}`);
  console.log(`Explorer Link:     ${deploymentRecord.explorerUrl}`);
  console.log(`Saved Record:      ${recordPath}\n`);
}

main().catch((err) => {
  console.error('\n[DEPLOYMENT FAILED]', err);
  process.exit(1);
});
