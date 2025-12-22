const BACKEND_URL = "http://127.0.0.1:8000";
const analysisCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;

// Store ongoing scans
const ongoingScans = new Map();

function cleanCache() {
    const now = Date.now();
    for (const [key, value] of analysisCache.entries()) {
        if (now - value.timestamp > CACHE_DURATION) {
            analysisCache.delete(key);
        }
    }
}

async function checkBackend() {
    try {
        const response = await fetch(`${BACKEND_URL}/health`);
        return response.ok;
    } catch (error) {
        console.error("Backend check failed:", error);
        return false;
    }
}

async function analyzeInstagramWithEmbeddings(url, postId) {
    cleanCache();
    
    const cacheKey = `instagram_embed_${postId}`;
    const cached = analysisCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        console.log('Using cached Instagram analysis');
        return cached.data;
    }
    
    try {
        console.log('📸 Analyzing Instagram with embeddings...');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        // FIXED: Use correct endpoint
        const response = await fetch(`${BACKEND_URL}/api/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ url: url }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`Backend error: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Cache result
        analysisCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });
        
        console.log('✅ Instagram analysis complete:', {
            label: result.classification?.label,
            score: result.classification?.score
        });
        
        return result;
        
    } catch (error) {
        console.error('❌ Instagram analysis failed:', error);
        
        if (error.name === 'AbortError') {
            return {
                error: true,
                message: "Analysis timeout",
                classification: {
                    label: "error",
                    score: 0.0,
                    reason: "Analysis took too long"
                }
            };
        }
        
        return {
            error: true,
            message: error.message,
            classification: {
                label: "error",
                score: 0.0,
                reason: `Analysis failed: ${error.message}`
            }
        };
    }
}

// Telegram scan with progress updates
async function scanTelegramChats(chatLimit = 5, messagesPerChat = 5) {
    cleanCache();
    
    const cacheKey = `telegram_scan_${chatLimit}_${messagesPerChat}`;
    const cached = analysisCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        console.log('Using cached Telegram scan');
        return cached.data;
    }
    
    // Generate unique scan ID
    const scanId = `telegram_${Date.now()}`;
    
    try {
        console.log('📱 Starting Telegram scan (ID:', scanId, ')');
        
        // Store that we're starting a scan
        ongoingScans.set(scanId, {
            startTime: Date.now(),
            status: 'starting'
        });
        
        // Use VERY long timeout for slow backends
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes
        
        const response = await fetch(`${BACKEND_URL}/api/analyze/telegram`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                chat_limit: chatLimit,
                messages_per_chat: messagesPerChat
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`Backend error: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Cache successful result
        analysisCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });
        
        // Remove from ongoing scans
        ongoingScans.delete(scanId);
        
        console.log('✅ Telegram scan complete:', {
            scanId: scanId,
            duration: Date.now() - ongoingScans.get(scanId)?.startTime || 0,
            riskyChats: result.risky_chats?.length || 0,
            riskyMessages: result.risky_messages?.length || 0
        });
        
        return result;
        
    } catch (error) {
        console.error('❌ Telegram scan failed:', error);
        
        // Remove from ongoing scans
        ongoingScans.delete(scanId);
        
        if (error.name === 'AbortError') {
            return {
                error: true,
                message: "Scan timeout (5 minutes)",
                scan_summary: {
                    total_messages: 0,
                    risky_chats_found: 0,
                    error: "Timeout",
                    note: "Backend is taking too long. Try reducing chat limit."
                }
            };
        }
        
        return {
            error: true,
            message: error.message,
            scan_summary: {
                total_messages: 0,
                risky_chats_found: 0,
                error: error.message
            }
        };
    }
}


async function analyzeWhatsAppMessages(messages) {
    cleanCache();
    
    const cacheKey = `whatsapp_${Date.now()}`;
    
    try {
        console.log('📱 Analyzing WhatsApp messages:', messages.length);
        
        const response = await fetch(`${BACKEND_URL}/api/analyze/whatsapp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                messages: messages,
                scan_type: 'whatsapp_recent',
                limit_chats: 3,
                limit_messages: 3
            })
        });
        
        if (!response.ok) throw new Error(`Backend error: ${response.status}`);
        
        const result = await response.json();
        
        // Cache result
        analysisCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });
        
        return result;
        
    } catch (error) {
        console.error('❌ WhatsApp analysis failed:', error);
        return {
            error: true,
            message: error.message,
            scan_summary: {
                total_messages_scanned: 0,
                risky_chats_found: 0,
                error: error.message
            }
        };
    }
}

// Check scan status
function getScanStatus(scanId) {
    const scan = ongoingScans.get(scanId);
    if (!scan) return { status: 'not_found' };
    
    return {
        status: scan.status,
        elapsed: Date.now() - scan.startTime,
        estimated: scan.estimated || 120000 // 2 minutes default
    };
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Background received:", message.action);
    
    // IMMEDIATELY return true for async operations
    if (message.action === 'analyzeInstagram' && message.url && message.postId) {
        // Use enhanced version
        analyzeInstagramWithEmbeddings(message.url, message.postId).then(result => {
            if (sender.tab && sender.tab.id) {
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: 'analysisResult',
                    result: result
                });
            }
        }).catch(error => {
            if (sender.tab && sender.tab.id) {
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: 'analysisError',
                    error: error.message
                });
            }
        });
        
        return true; // Keep message channel open
    }
    
    if (message.action === 'scanTelegram') {
        const chatLimit = message.chatLimit || 5; // Reduced for speed
        const messagesPerChat = message.messagesPerChat || 5;
        
        console.log(`📱 Starting Telegram scan: ${chatLimit} chats, ${messagesPerChat} msgs`);
        
        // Start scan and return immediately
        scanTelegramChats(chatLimit, messagesPerChat).then(result => {
            console.log("📊 Sending Telegram results to content script:", {
                hasResult: !!result,
                riskyChats: result.risky_chats?.length || 0,
                riskyMessages: result.risky_messages?.length || 0
            });
            
            if (sender.tab && sender.tab.id) {
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: 'telegramScanResult',
                    result: result
                }).catch(err => {
                    console.error("❌ Failed to send results:", err);
                });
            }
        }).catch(error => {
            console.error("❌ Telegram scan error:", error);
            if (sender.tab && sender.tab.id) {
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: 'telegramScanError',
                    error: error.message
                });
            }
        });
        
        return true; // MUST return true for async!
    }
    
    if (message.action === 'checkBackend') {
        checkBackend().then(isConnected => {
            sendResponse({ connected: isConnected });
        });
        return true;
    }
    
    if (message.action === 'checkScanStatus') {
        const status = getScanStatus(message.scanId);
        sendResponse(status);
        return true;
    }
    
    
    if (message.action === 'cancelTelegramScan') {
        // Mark scan as cancelled
        if (ongoingScans.has(message.scanId)) {
            ongoingScans.set(message.scanId, { ...ongoingScans.get(message.scanId), status: 'cancelled' });
        }
        sendResponse({ cancelled: true });
        return true;
    }
    
        
    if (message.action === 'analyzeWhatsApp' && message.messages) {
        analyzeWhatsAppMessages(message.messages).then(result => {
            if (sender.tab && sender.tab.id) {
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: 'whatsappAnalysisResult',
                    result: result
                });
            }
        }).catch(error => {
            if (sender.tab && sender.tab.id) {
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: 'whatsappAnalysisError',
                    error: error.message
                });
            }
        });
        
        return true;
    }
    
    return false;
});


// Auto-detect when tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        
        // Instagram auto-detection
        if (tab.url.includes('instagram.com')) {
            const isPost = /instagram\.com\/(p|reel|tv)\//.test(tab.url);
            
            if (isPost) {
                console.log("Auto-detected Instagram post");
                
                setTimeout(() => {
                    chrome.tabs.sendMessage(tabId, {
                        action: 'analyzeCurrent'
                    }).catch(() => {
                        // Content script not ready
                    });
                }, 1500);
            }
        }
        
        // Telegram auto-detection
        else if (tab.url.includes('web.telegram.org')) {
            console.log("Auto-detected Telegram Web");
            
            setTimeout(() => {
                chrome.tabs.sendMessage(tabId, {
                    action: 'telegramAutoDetect'
                }).catch(() => {
                    // Content script not ready
                });
            }, 1000);
        }
        if (tab.url.includes('web.whatsapp.com')) {
            console.log("Auto-detected WhatsApp Web");
            setTimeout(() => {
                chrome.tabs.sendMessage(tabId, {
                    action: 'whatsappAutoDetect'
                }).catch(() => {});
            }, 2000);
        }
    }
});

// Handle tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (tab.url && tab.url.includes('instagram.com')) {
            const isPost = /instagram\.com\/(p|reel|tv)\//.test(tab.url);
            
            if (isPost) {
                setTimeout(() => {
                    chrome.tabs.sendMessage(activeInfo.tabId, {
                        action: 'analyzeCurrent'
                    }).catch(() => {});
                }, 1000);
            }
        }
        else if (tab.url && tab.url.includes('web.telegram.org')) {
            setTimeout(() => {
                chrome.tabs.sendMessage(activeInfo.tabId, {
                    action: 'telegramAutoDetect'
                }).catch(() => {});
            }, 1000);
        }
    });
});

// Extension icon click
chrome.action.onClicked.addListener((tab) => {
    console.log("Extension icon clicked");
});