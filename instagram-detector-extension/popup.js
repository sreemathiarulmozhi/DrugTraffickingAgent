document.addEventListener('DOMContentLoaded', async () => {
    console.log("Popup initialized");
    
    // Get DOM elements
    const backendStatus = document.getElementById('backend-status');
    const currentPlatform = document.getElementById('current-platform');
    const instagramAction = document.getElementById('instagram-action');
    const telegramAction = document.getElementById('telegram-action');
    const loadingContainer = document.getElementById('loading-container');
    
    // Check backend status
    async function checkBackend() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'checkBackend'
            });
            
            if (response.connected) {
                backendStatus.textContent = 'Connected';
                backendStatus.className = 'status-value connected';
                return true;
            } else {
                backendStatus.textContent = 'Disconnected';
                backendStatus.className = 'status-value disconnected';
                return false;
            }
            
        } catch (error) {
            console.error('Status check failed:', error);
            backendStatus.textContent = 'Error';
            backendStatus.className = 'status-value disconnected';
            return false;
        }
    }
    
    // Check current platform
    async function checkCurrentPlatform() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab || !tab.url) {
                currentPlatform.textContent = 'Unknown';
                return null;
            }
            
            if (tab.url.includes('instagram.com')) {
                currentPlatform.textContent = 'Instagram';
                instagramAction.disabled = false;
                telegramAction.disabled = true;
                return 'instagram';
            } else if (tab.url.includes('web.telegram.org')) {
                currentPlatform.textContent = 'Telegram';
                instagramAction.disabled = true;
                telegramAction.disabled = false;
                return 'telegram';
            } else {
                currentPlatform.textContent = 'Not Supported';
                instagramAction.disabled = true;
                telegramAction.disabled = true;
                return null;
            }
            
        } catch (error) {
            console.error('Platform check failed:', error);
            currentPlatform.textContent = 'Error';
            return null;
        }
    }
    
    // Instagram action
    instagramAction.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab && tab.url.includes('instagram.com')) {
                showLoading('Triggering Instagram analysis...');
                
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'triggerInstagramAnalysis'
                });
                
                setTimeout(() => window.close(), 500);
            }
        } catch (error) {
            console.error('Instagram action failed:', error);
            alert('Failed to trigger Instagram analysis: ' + error.message);
        } finally {
            hideLoading();
        }
    });
    
    // Telegram action
    telegramAction.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab && tab.url.includes('web.telegram.org')) {
                showLoading('Requesting Telegram permission...');
                
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'showTelegramPermission'
                });
                
                setTimeout(() => window.close(), 500);
            }
        } catch (error) {
            console.error('Telegram action failed:', error);
            alert('Failed to trigger Telegram scan: ' + error.message);
        } finally {
            hideLoading();
        }
    });
    
    function showLoading(message) {
        loadingContainer.style.display = 'block';
        document.getElementById('loading-text').textContent = message;
        
        instagramAction.disabled = true;
        telegramAction.disabled = true;
    }
    
    function hideLoading() {
        loadingContainer.style.display = 'none';
    }
    
    // Initialize
    const backendConnected = await checkBackend();
    const platform = await checkCurrentPlatform();
    
    if (!backendConnected) {
        alert('Backend server is not connected. Please start the backend server.');
        instagramAction.disabled = true;
        telegramAction.disabled = true;
    }
    
    // Auto-close after 10 seconds if no interaction
    setTimeout(() => {
        if (!instagramAction.disabled || !telegramAction.disabled) {
            // User might be interacting, don't close
            return;
        }
        window.close();
    }, 10000);
});