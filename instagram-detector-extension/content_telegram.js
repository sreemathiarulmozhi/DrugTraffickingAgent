// ==============================================
// Telegram Drug Detector - Content Script
// NEW: Telegram auto-detection with permission
// ==============================================

console.log("Telegram Detector: Content script loaded");

// State management
let hasPermission = false;
let isScanning = false;
let permissionRequested = false;
let currentTelegramUrl = window.location.href;

// Configuration
const CONFIG = {
    autoDetect: true,
    askPermission: true,
    defaultChatLimit: 10,
    defaultMessagesPerChat: 10
};

// UI Functions
function showTelegramPermission() {
    if (permissionRequested) return;
    
    permissionRequested = true;
    
    const dialog = document.createElement('div');
    dialog.id = 'telegram-detector-permission';
    dialog.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 380px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 10000;
        padding: 25px;
        text-align: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: slideIn 0.3s ease;
        border: 3px solid #0088cc;
    `;
    
    dialog.innerHTML = `
        <div style="position: absolute; top: 15px; right: 15px;">
            <button id="telegram-permission-close" style="background: transparent; border: none; color: #666; font-size: 20px; cursor: pointer; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                ✕
            </button>
        </div>
        
        <div style="font-size: 32px; margin-bottom: 15px;">💬</div>
        <div style="font-weight: 600; margin-bottom: 10px; color: #333; font-size: 18px;">Scan Telegram Chats?</div>
        <div style="font-size: 14px; color: #666; margin-bottom: 20px; line-height: 1.5;">
            This extension can scan your recent Telegram chats for drug trafficking content.
            <br><br>
            <strong>What will be scanned:</strong>
        </div>
        
        <div style="text-align: left; margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; font-size: 13px;">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="color: #000; margin-right: 10px;">•</span>
                <span style="color: #000;">Last 3-5 recent chats</span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="color: #000; margin-right: 10px;">•</span>
                <span style="color: #000;">Last 3-5 messages from each chat</span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="color: #000; margin-right: 10px;">•</span>
                <span style="color: #000;">Content is analyzed locally with AI</span>
            </div>
            <div style="display: flex; align-items: center;">
                <span style="color: #000; margin-right: 10px;">•</span>
                <span style="color: #000;">No data is stored or sent externally</span>
            </div>
        </div>
        
        <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button id="telegram-permission-deny" style="flex: 1; padding: 12px; border: 1px solid #ddd; background: white; border-radius: 8px; cursor: pointer; font-weight: 500; color: #333; font-size: 14px; transition: all 0.2s;">
                Cancel
            </button>
            <button id="telegram-permission-grant" style="flex: 1; padding: 12px; border: none; background: linear-gradient(135deg, #0088cc 0%, #0055a4 100%); color: white; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px; transition: all 0.2s;">
                Scan Chats
            </button>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Add hover effects
    const denyBtn = document.getElementById('telegram-permission-deny');
    const grantBtn = document.getElementById('telegram-permission-grant');
    const closeBtn = document.getElementById('telegram-permission-close');
    
    denyBtn.onmouseenter = () => denyBtn.style.backgroundColor = '#f8f9fa';
    denyBtn.onmouseleave = () => denyBtn.style.backgroundColor = 'white';
    
    grantBtn.onmouseenter = () => grantBtn.style.opacity = '0.9';
    grantBtn.onmouseleave = () => grantBtn.style.opacity = '1';
    
    closeBtn.onmouseenter = () => {
        closeBtn.style.backgroundColor = '#f8f9fa';
        closeBtn.style.transform = 'scale(1.1)';
    };
    closeBtn.onmouseleave = () => {
        closeBtn.style.backgroundColor = 'transparent';
        closeBtn.style.transform = 'scale(1)';
    };
    
    // Event listeners
    denyBtn.addEventListener('click', () => {
        removeTelegramUI();
        permissionRequested = false;
        showTelegramNotification('Scan cancelled', 'info');
    });
    
    grantBtn.addEventListener('click', () => {
        removeTelegramUI();
        hasPermission = true;
        startTelegramScan();
    });
    
    closeBtn.addEventListener('click', () => {
        removeTelegramUI();
        permissionRequested = false;
        showTelegramNotification('Permission request closed', 'info');
    });
    
    return dialog;
}

function showTelegramLoading() {
    removeTelegramUI();
    
    const loading = document.createElement('div');
    loading.id = 'telegram-detector-scanning';
    loading.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 350px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 10000;
        padding: 20px;
        text-align: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: slideIn 0.3s ease;
        border: 3px solid #0088cc;
    `;
    
    loading.innerHTML = `
        <div style="font-size: 32px; margin-bottom: 10px;">🔍</div>
        <div style="font-weight: 600; margin-bottom: 5px; color: #333;">Scanning Telegram Chats...</div>
        <div style="font-size: 13px; color: #666; margin-bottom: 15px;">
            Analyzing recent chats for drug trafficking content
            <br>
            <small style="color: #999;">This may take up to 60 seconds</small>
        </div>
        <div style="height: 4px; background: #f0f0f0; border-radius: 2px; overflow: hidden;">
            <div style="height: 100%; width: 100%; background: linear-gradient(90deg, #0088cc, #0055a4); animation: progress 2s ease-in-out infinite;"></div>
        </div>
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
            <button id="telegram-scan-cancel" style="width: 100%; padding: 8px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer; font-weight: 500; color: #333;">Cancel Scan</button>
        </div>
    `;
    
    document.body.appendChild(loading);
    
    document.getElementById('telegram-scan-cancel').addEventListener('click', () => {
        removeTelegramUI();
        isScanning = false;
        showTelegramNotification('Scan cancelled', 'info');
    });
    
    return loading;
}

// In background.js
async function scanTelegramChats(chatLimit = 3, messagesPerChat = 3) {
    cleanCache();
    
    const cacheKey = `telegram_scan_${chatLimit}_${messagesPerChat}`;
    const cached = analysisCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        console.log('Using cached Telegram scan');
        return cached.data;
    }
    
    try {
        console.log('📱 Scanning Telegram chats...');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes timeout
        
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
        
        console.log('✅ Telegram scan complete:', {
            riskyChats: result.risky_chats?.length || 0,
            riskyMessages: result.risky_messages?.length || 0,
            totalMessages: result.scan_summary?.total_messages || 0
        });
        
        // Cache the result
        analysisCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });
        
        return result;
        
    } catch (error) {
        console.error('❌ Telegram scan failed:', error);
        
        if (error.name === 'AbortError') {
            return {
                error: true,
                message: "Scan timeout (2 minutes)",
                scan_summary: {
                    total_messages: 0,
                    risky_chats_found: 0,
                    error: "Timeout"
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

function createSummaryTab(summary, allChatsAnalysis) {
    const byChatType = summary.by_chat_type || {};
    const riskyMessages = summary.risky_messages || [];
    
    return `
        <!-- Existing summary stats... -->
        
        ${riskyMessages.length > 0 ? `
            <div style="background: #fff5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ff4444;">
                <div style="font-weight: 600; margin-bottom: 10px; color: #333; display: flex; align-items: center; gap: 8px;">
                    <span>⚠️ Top Risky Messages</span>
                    <span style="font-size: 11px; background: #ff4444; color: white; padding: 2px 8px; border-radius: 10px;">
                        ${riskyMessages.length} found
                    </span>
                </div>
                <div style="display: grid; gap: 10px;">
                    ${riskyMessages.slice(0, 3).map((msg, index) => `
                        <div style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #ffdddd;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                <span style="font-size: 12px; font-weight: 500; color: #333;">
                                    ${index + 1}. ${msg.chat_name || 'Unknown'}
                                </span>
                                <span style="font-size: 11px; background: ${getRiskColor(msg.risk_score)}; color: white; padding: 2px 8px; border-radius: 10px;">
                                    ${(msg.risk_score * 100).toFixed(0)}%
                                </span>
                            </div>
                            <div style="font-size: 11px; color: #666; margin-bottom: 5px;">
                                ${msg.truncated_message || msg.message || ''}
                            </div>
                            <div style="font-size: 10px; color: #ff4444;">
                                ${msg.reason?.substring(0, 80)}${msg.reason?.length > 80 ? '...' : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
            <div style="font-weight: 600; margin-bottom: 10px; color: #333;">🔍 Top Risk Factors</div>
            <div style="display: grid; gap: 8px;">
                ${(summary.top_risk_factors || []).map(factor => `
                    <div style="background: white; padding: 8px 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid #ff4444;">
                        <span style="font-size: 13px;">${factor.indicator}</span>
                        <span style="font-size: 11px; background: #ff4444; color: white; padding: 2px 8px; border-radius: 10px;">
                            ${factor.count} occurrences
                        </span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function createRiskyChatsTab(riskyChats) {
    if (riskyChats.length === 0) {
        return `
            <div style="text-align: center; padding: 40px 20px; color: #00C851;">
                <div style="font-size: 48px; margin-bottom: 10px;">✅</div>
                <div style="font-weight: 600; margin-bottom: 5px;">No Risky Chats Found</div>
                <div style="font-size: 14px; color: #666;">
                    All scanned chats appear safe
                </div>
            </div>
        `;
    }
    
    return `
        <div style="margin-bottom: 15px; font-size: 13px; color: #666;">
            Showing ${riskyChats.length} risky chats sorted by risk score
        </div>
        
        <div style="display: grid; gap: 15px;">
            ${riskyChats.map((chat, index) => `
                <div style="background: #fff5f5; padding: 15px; border-radius: 8px; border-left: 4px solid #ff4444;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <div>
                            <div style="font-weight: 600; color: #333; font-size: 15px;">
                                ${index + 1}. ${chat.chat_name || 'Unknown Chat'}
                                <span style="font-size: 11px; background: #ff4444; color: white; padding: 2px 8px; border-radius: 10px; margin-left: 10px;">
                                    ${chat.chat_type?.toUpperCase()}
                                </span>
                            </div>
                            <div style="font-size: 12px; color: #666; margin-top: 3px;">
                                ${chat.message_count || 0} messages • ${chat.risky_message_count || 0} risky messages
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 24px; font-weight: 600; color: #ff4444;">
                                ${(chat.risk_score * 100).toFixed(0)}%
                            </div>
                            <div style="font-size: 11px; color: #666;">Risk Score</div>
                        </div>
                    </div>
                    
                    <div style="background: white; padding: 10px; border-radius: 6px; margin-top: 10px; border: 1px solid #ffdddd;">
                        <div style="font-weight: 500; color: #333; font-size: 13px; margin-bottom: 5px;">🔄 Analysis:</div>
                        <div style="font-size: 12px; color: #666;">${chat.reason || 'No specific reason provided'}</div>
                    </div>
                    
                    ${chat.top_risky_message ? `
                        <div style="margin-top: 10px;">
                            <div style="font-size: 12px; font-weight: 500; color: #333; margin-bottom: 5px;">💬 Most Risky Message:</div>
                            <div style="background: white; padding: 10px; border-radius: 6px; font-size: 12px; color: #666; border: 1px solid #ffdddd;">
                                "${chat.top_risky_message.text || chat.top_risky_message.message || 'No text'}"
                                ${chat.top_risky_message.analysis ? `
                                    <div style="margin-top: 5px; font-size: 11px; color: #ff4444;">
                                        Score: ${(chat.top_risky_message.analysis.score * 100).toFixed(0)}% • 
                                        ${chat.top_risky_message.analysis.reason || ''}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

function createMessagesTab(riskyMessages) {
    if (!riskyMessages || riskyMessages.length === 0) {
        return `
            <div style="text-align: center; padding: 40px 20px; color: #00C851;">
                <div style="font-size: 48px; margin-bottom: 10px;">✅</div>
                <div style="font-weight: 600; margin-bottom: 5px;">No Risky Messages</div>
                <div style="font-size: 14px; color: #666;">
                    All messages appear safe
                </div>
            </div>
        `;
    }
    
    return `
        <div style="margin-bottom: 15px; font-size: 13px; color: #666;">
            Showing ${riskyMessages.length} risky messages sorted by risk score
        </div>
        
        <div style="display: grid; gap: 15px;">
            ${riskyMessages.map((msg, index) => `
                <div style="background: #fff5f5; padding: 15px; border-radius: 8px; border-left: 4px solid ${getRiskColor(msg.risk_score)};">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <div>
                            <div style="font-weight: 600; color: #333; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                                <span>${index + 1}. ${msg.chat_name || 'Unknown Chat'}</span>
                                <span style="font-size: 11px; background: ${getRiskColor(msg.risk_score)}; color: white; padding: 2px 8px; border-radius: 10px;">
                                    ${msg.chat_type?.toUpperCase() || 'CHAT'}
                                </span>
                            </div>
                            <div style="font-size: 12px; color: #666; margin-top: 3px;">
                                <span style="margin-right: 15px;">👤 ${msg.sender || 'Unknown'}</span>
                                <span>📅 ${formatDate(msg.date)}</span>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 24px; font-weight: 600; color: ${getRiskColor(msg.risk_score)};">
                                ${(msg.risk_score * 100).toFixed(0)}%
                            </div>
                            <div style="font-size: 11px; color: #666;">Risk Score</div>
                        </div>
                    </div>
                    
                    <div style="background: white; padding: 12px; border-radius: 6px; margin-top: 10px; border: 1px solid #ffdddd;">
                        <div style="font-size: 13px; color: #333; line-height: 1.4; font-family: 'Courier New', monospace;">
                            "${msg.message || msg.truncated_message || 'No message text'}"
                        </div>
                    </div>
                    
                    <div style="margin-top: 10px;">
                        <div style="font-size: 12px; font-weight: 500; color: #333; margin-bottom: 5px;">🔄 Analysis:</div>
                        <div style="font-size: 12px; color: #ff4444; padding: 8px; background: #fff5f5; border-radius: 6px;">
                            ${msg.reason || 'Suspicious content detected'}
                        </div>
                    </div>
                    
                    ${msg.indicators && msg.indicators.length > 0 ? `
                        <div style="margin-top: 10px;">
                            <div style="font-size: 12px; font-weight: 500; color: #333; margin-bottom: 5px;">🔍 Indicators Found:</div>
                            <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                                ${msg.indicators.map(indicator => `
                                    <span style="font-size: 10px; background: #ff4444; color: white; padding: 2px 8px; border-radius: 12px;">
                                        ${indicator}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #ffdddd; display: flex; justify-content: space-between; font-size: 11px; color: #666;">
                        <span>Message ID: ${msg.message_id || 'N/A'}</span>
                        <span>Similarity: ${(msg.similarity_score * 100).toFixed(0)}%</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Helper function to get color based on risk score
function getRiskColor(score) {
    if (score >= 0.8) return '#ff0000';  // High risk - red
    if (score >= 0.6) return '#ff4444';  // Medium-high risk - dark red
    if (score >= 0.4) return '#ff8800';  // Medium risk - orange
    return '#ffbb33';  // Low risk - yellow
}

// Helper function to format date
function formatDate(dateString) {
    if (!dateString) return 'Unknown date';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    } catch {
        return dateString;
    }
}

function showTelegramNotification(message, type = 'info') {
    const colors = {
        info: '#0088cc',
        success: '#00C851',
        warning: '#ffbb33',
        error: '#ff4444'
    };
    
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type]};
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10001;
        animation: slideIn 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 18px;">
                ${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}
            </span>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(400px)';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

function removeTelegramUI() {
    const elements = [
        'telegram-detector-permission',
        'telegram-detector-scanning', 
        'telegram-detector-results'
    ];
    
    elements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.opacity = '0';
            element.style.transform = 'translateX(400px)';
            setTimeout(() => element.remove(), 300);
        }
    });
}

// Telegram Scan Function
// In content_telegram.js
function startTelegramScan() {
    if (isScanning) {
        showTelegramNotification('Scan already in progress', 'warning');
        return;
    }
    
    isScanning = true;
    showTelegramLoading();
    
    // Store start time
    const startTime = Date.now();
    
    // Add progress timer
    const progressTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progressText = `Scanning... ${Math.floor(elapsed / 1000)}s elapsed`;
        const progressElement = document.querySelector('#telegram-scan-progress');
        if (progressElement) {
            progressElement.textContent = progressText;
        }
    }, 1000);
    
    // Send scan request to background script
    chrome.runtime.sendMessage({
        action: 'scanTelegram',
        chatLimit: 3, // REDUCE FOR SPEED
        messagesPerChat: 3 // REDUCE FOR SPEED
    }, (response) => {
        // Clear timers
        clearInterval(progressTimer);
        isScanning = false;
        
        if (chrome.runtime.lastError) {
            console.error("Runtime error:", chrome.runtime.lastError);
            showTelegramNotification('Extension error: ' + chrome.runtime.lastError.message, 'error');
            removeTelegramUI();
            return;
        }
        
        // This response is immediate acknowledgement, NOT the actual result
        console.log("Scan request acknowledged");
    });
    
    // Listen for results separately
    const scanListener = (message, sender, sendResponse) => {
        if (message.action === 'telegramScanResult') {
            console.log("✅ Telegram results received:", {
                hasResult: !!message.result,
                riskyChats: message.result?.risky_chats?.length || 0,
                riskyMessages: message.result?.risky_messages?.length || 0
            });
            
            clearInterval(progressTimer);
            isScanning = false;
            
            showTelegramResults(message.result);
            
            if (message.result?.error) {
                showTelegramNotification('Scan failed: ' + message.result.message, 'error');
            } else if (message.result?.scan_summary?.risky_chats_found > 0) {
                showTelegramNotification(`Found ${message.result.scan_summary.risky_chats_found} risky chats!`, 'warning');
            } else {
                showTelegramNotification('Scan complete - No risky content found', 'success');
            }
            
            // Remove listener
            chrome.runtime.onMessage.removeListener(scanListener);
        }
        
        if (message.action === 'telegramScanError') {
            console.error("❌ Telegram scan error:", message.error);
            clearInterval(progressTimer);
            isScanning = false;
            showTelegramNotification('Scan error: ' + message.error, 'error');
            removeTelegramUI();
            
            // Remove listener
            chrome.runtime.onMessage.removeListener(scanListener);
        }
        
        return true;
    };
    
    // Add listener for results
    chrome.runtime.onMessage.addListener(scanListener);
    
    // Auto-timeout after 150 seconds
    setTimeout(() => {
        if (isScanning) {
            clearInterval(progressTimer);
            isScanning = false;
            showTelegramNotification('Scan timeout (150s). Try with smaller limits.', 'error');
            removeTelegramUI();
            
            // Remove listener
            chrome.runtime.onMessage.removeListener(scanListener);
        }
    }, 150000);
}

// Update showTelegramLoading to show progress
function showTelegramLoading() {
    removeTelegramUI();
    
    const loading = document.createElement('div');
    loading.id = 'telegram-detector-scanning';
    loading.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 400px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 10000;
        padding: 20px;
        text-align: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: slideIn 0.3s ease;
        border: 3px solid #0088cc;
    `;
    
    loading.innerHTML = `
        <div style="font-size: 32px; margin-bottom: 10px;">🔍</div>
        <div style="font-weight: 600; margin-bottom: 5px; color: #333;">Scanning Telegram Chats...</div>
        <div id="telegram-scan-progress" style="font-size: 13px; color: #666; margin-bottom: 15px;">
            Starting scan (3 chats, 3 messages each)...
        </div>
        <div style="font-size: 12px; color: #999; margin-bottom: 15px;">
            ⚡ This may take 1-2 minutes<br>
            ⚠️ Large chats will be slower
        </div>
        <div style="height: 4px; background: #f0f0f0; border-radius: 2px; overflow: hidden;">
            <div id="telegram-progress-bar" style="height: 100%; width: 30%; background: linear-gradient(90deg, #0088cc, #0055a4); animation: progress 2s ease-in-out infinite;"></div>
        </div>
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
            <button id="telegram-scan-cancel" style="width: 100%; padding: 10px; border: none; background: #ff4444; color: white; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 14px; transition: all 0.2s;">
                Cancel Scan
            </button>
        </div>
    `;
    
    document.body.appendChild(loading);
    
    // Add proper event listener for cancel button
    document.getElementById('telegram-scan-cancel').addEventListener('click', function() {
        this.disabled = true;
        this.innerHTML = 'Cancelling...';
        this.style.opacity = '0.7';
        
        showTelegramNotification('Scan cancelled', 'info');
        removeTelegramUI();
    });
    
    return loading;
}

// Auto-detection for Telegram
function setupTelegramAutoDetection() {
    console.log("Telegram auto-detection setup");
    
    // Show permission dialog on Telegram Web detection
    if (CONFIG.autoDetect && CONFIG.askPermission && !permissionRequested) {
        setTimeout(() => {
            if (!permissionRequested) {
                showTelegramPermission();
            }
        }, 2000);
    }
    
    // Also detect navigation within Telegram
    let lastUrl = window.location.href;
    
    const observer = new MutationObserver(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl && currentUrl.includes('web.telegram.org')) {
            lastUrl = currentUrl;
            currentTelegramUrl = currentUrl;
            
            // Reset permission on navigation if not already granted
            if (!hasPermission && !permissionRequested) {
                setTimeout(() => {
                    showTelegramPermission();
                }, 1000);
            }
        }
    });
    
    observer.observe(document, {
        subtree: true,
        childList: true,
        attributes: true
    });
    
    return observer;
}

// Message Listeners
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Telegram content script received:", message.action);
    
    if (message.action === 'telegramAutoDetect') {
        console.log("Auto-detection triggered for Telegram");
        setupTelegramAutoDetection();
    }
    
    if (message.action === 'telegramScanResult') {
        showTelegramResults(message.result);
    }
    
    if (message.action === 'telegramScanError') {
        showTelegramNotification(message.error || "Scan failed", 'error');
    }
    
    if (message.action === 'startTelegramScan') {
        if (!hasPermission) {
            showTelegramPermission();
        } else {
            startTelegramScan();
        }
    }
    
    return true;
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes progress {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
    }
`;
document.head.appendChild(style);

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}


function showTelegramResults(result) {
    removeTelegramUI();
    
    if (!result) {
        showTelegramNotification('No results received', 'error');
        return;
    }
    
    if (result.error) {
        showTelegramNotification(`Scan error: ${result.message || result.error}`, 'error');
        return;
    }
    
    // Create results UI
    const resultsUI = document.createElement('div');
    resultsUI.id = 'telegram-detector-results';
    resultsUI.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 500px;
        max-height: 600px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        overflow: hidden;
        animation: slideIn 0.3s ease;
        border: 3px solid #0088cc;
        display: flex;
        flex-direction: column;
    `;
    
    // Header with proper close button
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 15px 20px;
        background: linear-gradient(135deg, #0088cc 0%, #0055a4 100%);
        color: white;
        font-weight: 600;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    
    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display: flex; align-items: center; gap: 10px;';
    headerLeft.innerHTML = `
        <span style="font-size: 20px;">📱</span>
        <span>Telegram Scan Results</span>
    `;
    
    const closeButton = document.createElement('button');
    closeButton.id = 'telegram-results-close';
    closeButton.innerHTML = '✕';
    closeButton.style.cssText = `
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    `;
    
    closeButton.onmouseenter = () => {
        closeButton.style.background = 'rgba(255,255,255,0.3)';
        closeButton.style.transform = 'scale(1.1)';
    };
    
    closeButton.onmouseleave = () => {
        closeButton.style.background = 'rgba(255,255,255,0.2)';
        closeButton.style.transform = 'scale(1)';
    };
    
    closeButton.onclick = () => {
        removeTelegramUI();
    };
    
    header.appendChild(headerLeft);
    header.appendChild(closeButton);
    
    // Content area with tabs
    const content = document.createElement('div');
    content.style.cssText = `
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    `;
    
    // Create tab container
    const tabContainer = document.createElement('div');
    tabContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        height: 100%;
    `;
    
    // Tabs navigation
    const tabsNav = document.createElement('div');
    tabsNav.style.cssText = `
        display: flex;
        background: #f8f9fa;
        border-bottom: 1px solid #e0e0e0;
    `;
    
    const tabContentArea = document.createElement('div');
    tabContentArea.id = 'telegram-tab-content';
    tabContentArea.style.cssText = `
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        min-height: 300px;
        max-height: 450px;
    `;
    
    // Prevent clicks inside tab content from closing the UI
    tabContentArea.addEventListener('click', (e) => {
        e.stopPropagation();  // ADD THIS LINE
    });
    
    // Prevent text selection inside tab content
    tabContentArea.addEventListener('mousedown', (e) => {
        if (e.detail > 1) {  // Double-click prevention
            e.preventDefault();
        }
    });
    
    // Create tabs data
    const tabData = [
        {
            id: 'summary',
            label: '📊 Summary',
            content: createSummaryTab(result)
        },
        {
            id: 'risky-chats',
            label: `🚨 Risky Chats (${result.risky_chats?.length || 0})`,
            content: createRiskyChatsTab(result.risky_chats || [])
        },
        {
            id: 'messages',
            label: `💬 Messages (${result.risky_messages?.length || 0})`,
            content: createMessagesTab(result.risky_messages || [])
        }
    ];
    
    // Create tab buttons and content
    let activeTab = 'summary';
    
    function switchTab(tabId) {
        activeTab = tabId;
        
        // Update tab buttons
        tabsNav.querySelectorAll('button').forEach(btn => {
            const isActive = btn.dataset.tab === activeTab;
            btn.style.background = isActive ? 'white' : 'transparent';
            btn.style.fontWeight = isActive ? '600' : '500';
            btn.style.color = isActive ? '#333' : '#666';
            btn.style.borderBottom = `2px solid ${isActive ? '#0088cc' : 'transparent'}`;
        });
        
        // Update content
        const activeTabData = tabData.find(t => t.id === activeTab);
        if (activeTabData) {
            tabContentArea.innerHTML = activeTabData.content;
            
            // Add event listeners to any close buttons in tab content
            setTimeout(() => {
                const tabCloseButtons = tabContentArea.querySelectorAll('[data-close-tab]');
                tabCloseButtons.forEach(btn => {
                    btn.addEventListener('click', () => {
                        removeTelegramUI();
                    });
                });
            }, 10);
        }
    }
    
    tabData.forEach((tab) => {
        const tabButton = document.createElement('button');
        tabButton.textContent = tab.label;
        tabButton.dataset.tab = tab.id;
        tabButton.style.cssText = `
            flex: 1;
            padding: 12px;
            border: none;
            background: ${tab.id === activeTab ? 'white' : 'transparent'};
            font-weight: ${tab.id === activeTab ? '600' : '500'};
            color: ${tab.id === activeTab ? '#333' : '#666'};
            cursor: pointer;
            font-size: 13px;
            border-bottom: 2px solid ${tab.id === activeTab ? '#0088cc' : 'transparent'};
            transition: all 0.2s;
            user-select: none;  // ADD THIS LINE to prevent text selection
        `;
        
        tabButton.addEventListener('click', (e) => {
            e.stopPropagation();  // ADD THIS LINE to prevent event bubbling
            switchTab(tab.id);
        });
        
        tabsNav.appendChild(tabButton);
    });    
    // Set initial content
    switchTab('summary');
    
    // Footer with stats
    const footer = document.createElement('div');
    footer.style.cssText = `
        padding: 12px 20px;
        background: #f8f9fa;
        border-top: 1px solid #e0e0e0;
        font-size: 12px;
        color: #666;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    
    const summary = result.scan_summary || {};
    footer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px;">
            <div style="display: flex; align-items: center; gap: 5px;">
                <span style="color: #0088cc;">•</span>
                <span>${summary.total_messages || 0} messages</span>
            </div>
            <div style="display: flex; align-items: center; gap: 5px;">
                <span style="color: #ff4444;">•</span>
                <span>${summary.risky_chats_found || 0} risky</span>
            </div>
        </div>
        <div style="display: flex; align-items: center; gap: 5px;">
            <span>⏱️</span>
            <span >${result.processing_time_seconds || 0}s</span>
        </div>
    `;
    
    // Assemble UI
    tabContainer.appendChild(tabsNav);
    tabContainer.appendChild(tabContentArea);
    content.appendChild(tabContainer);
    resultsUI.appendChild(header);
    resultsUI.appendChild(content);
    resultsUI.appendChild(footer);
    
    document.body.appendChild(resultsUI);
    
    // Add escape key listener
    const escapeListener = (e) => {
        if (e.key === 'Escape') {
            removeTelegramUI();
            document.removeEventListener('keydown', escapeListener);
        }
    };
    
    document.addEventListener('keydown', escapeListener);
    
    // Add click outside to close
        // Add click outside to close
        const outsideClickListener = (e) => {
            if (!resultsUI.contains(e.target) && !e.target.closest('#telegram-detector-permission') && 
                !e.target.closest('#telegram-detector-scanning')) {
                removeTelegramUI();
                document.removeEventListener('click', outsideClickListener);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', outsideClickListener);
        }, 100);
    
    
}

// Also update the removeTelegramUI function to properly clean up
function removeTelegramUI() {
    const elements = [
        'telegram-detector-permission',
        'telegram-detector-scanning', 
        'telegram-detector-results'
    ];
    
    elements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.opacity = '0';
            element.style.transform = 'translateX(400px)';
            setTimeout(() => {
                if (element && element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            }, 300);
        }
    });
    
    // Also remove any notification dialogs
    const notifications = document.querySelectorAll('[class*="notification"]');
    notifications.forEach(notification => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    });
}

// Helper function for summary tab
function createSummaryTab(result) {
    const summary = result.scan_summary || {};
    const riskyChats = result.risky_chats || [];
    const riskyMessages = result.risky_messages || [];
    
    // Calculate risk levels
    const highRisk = riskyChats.filter(c => c.risk_score >= 0.8).length;
    const mediumRisk = riskyChats.filter(c => c.risk_score >= 0.6 && c.risk_score < 0.8).length;
    const lowRisk = riskyChats.filter(c => c.risk_score < 0.6).length;
    
    return `
        <div style="text-align: center; margin-bottom: 20px;">
            <div style="font-size: 32px; margin-bottom: 10px;">📱</div>
            <div style="font-weight: 600; font-size: 18px; color: #333; margin-bottom: 5px;">
                Telegram Scan Complete
            </div>
            <div style="color: #666; font-size: 13px; margin-bottom: 20px;">
                Scanned ${summary.total_messages || 0} messages from ${summary.chats_scanned || 0} chats
            </div>
        </div>
        
        <!-- Risk Overview -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 20px;">
            <div style="background: #fff5f5; padding: 15px; border-radius: 8px; text-align: center; border-left: 4px solid #ff4444;">
                <div style="font-size: 24px; font-weight: 600; color: #ff4444;">${highRisk}</div>
                <div style="font-size: 12px; color: #666;">High Risk</div>
            </div>
            <div style="background: #fff8e1; padding: 15px; border-radius: 8px; text-align: center; border-left: 4px solid #ffbb33;">
                <div style="font-size: 24px; font-weight: 600; color: #ffbb33;">${mediumRisk}</div>
                <div style="font-size: 12px; color: #666;">Medium Risk</div>
            </div>
            <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; text-align: center; border-left: 4px solid #00C851;">
                <div style="font-size: 24px; font-weight: 600; color: #00C851;">${lowRisk}</div>
                <div style="font-size: 12px; color: #666;">Low Risk</div>
            </div>
        </div>
        
        <!-- Scan Details -->
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <div style="font-weight: 600; margin-bottom: 10px; color: #333;">Scan Details</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
                <div style="color: #666;">Total Messages:</div>
                <div style="font-weight: 500; color:#000;text-align: right;">${summary.total_messages || 0}</div>
                
                <div style="color: #666;">Messages Analyzed:</div>
                <div style="font-weight: 500;color:#000; text-align: right;">${summary.messages_analyzed || 0}</div>
                
                <div style="color: #666;">Risky Messages:</div>
                <div style="font-weight: 500; color: #ff4444; text-align: right;">${riskyMessages.length}</div>
                
                <div style="color: #666;">Processing Time:</div>
                <div style="font-weight: 500;color=#000; text-align: right;">${result.processing_time_seconds || 0}s</div>
            </div>
        </div>
        
        <!-- Top Risky Chat -->
        ${riskyChats.length > 0 ? `
            <div style="background: #fff5f5; padding: 15px; border-radius: 8px; border-left: 4px solid #ff4444;">
                <div style="font-weight: 600; margin-bottom: 10px; color: #333; display: flex; justify-content: space-between;">
                    <span>🚨 Top Risky Chat</span>
                    <span style="background: #ff4444; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px;">
                        ${(riskyChats[0].risk_score * 100).toFixed(0)}% Risk
                    </span>
                </div>
                <div style="font-size: 14px; color: #333; margin-bottom: 5px;">
                    ${riskyChats[0].chat_name || 'Unknown Chat'}
                </div>
                <div style="font-size: 12px; color: #666;">
                    Found ${riskyChats[0].risky_message_count || 0} risky messages
                </div>
                ${riskyChats[0].sample_messages && riskyChats[0].sample_messages.length > 0 ? `
                    <div style="margin-top: 10px; font-size: 12px; color: #ff4444;">
                        "${riskyChats[0].sample_messages[0].text || ''}"
                    </div>
                ` : ''}
            </div>
        ` : `
            <div style="text-align: center; padding: 30px 20px; color: #00C851;">
                <div style="font-size: 48px; margin-bottom: 10px;">✅</div>
                <div style="font-weight: 600; margin-bottom: 5px;">No Risky Content Found</div>
                <div style="font-size: 14px; color: #666;">
                    All Telegram chats appear safe
                </div>
            </div>
        `}
    `;
}

// Helper function for risky chats tab
function createRiskyChatsTab(riskyChats) {
    if (riskyChats.length === 0) {
        return `
            <div style="text-align: center; padding: 40px 20px; color: #00C851;">
                <div style="font-size: 48px; margin-bottom: 10px;">✅</div>
                <div style="font-weight: 600; margin-bottom: 5px;">No Risky Chats Found</div>
                <div style="font-size: 14px; color: #666;">
                    All scanned chats appear safe
                </div>
            </div>
        `;
    }
    
    return `
        <div style="margin-bottom: 15px; font-size: 13px; color: #666;">
            Showing ${riskyChats.length} risky chats sorted by risk score
        </div>
        
        <div style="display: grid; gap: 15px;">
            ${riskyChats.map((chat, index) => `
                <div style="background: #fff5f5; padding: 15px; border-radius: 8px; border-left: 4px solid ${getRiskColor(chat.risk_score)};">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <div>
                            <div style="font-weight: 600; color: #333; font-size: 15px;">
                                ${index + 1}. ${chat.chat_name || 'Unknown Chat'}
                                <span style="font-size: 11px; background: ${getRiskColor(chat.risk_score)}; color: white; padding: 2px 8px; border-radius: 10px; margin-left: 10px;">
                                    ${chat.chat_type?.toUpperCase() || 'CHAT'}
                                </span>
                            </div>
                            <div style="font-size: 12px; color: #666; margin-top: 3px;">
                                ${chat.total_messages || 0} messages • ${chat.risky_message_count || 0} risky messages
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 24px; font-weight: 600; color: ${getRiskColor(chat.risk_score)};">
                                ${(chat.risk_score * 100).toFixed(0)}%
                            </div>
                            <div style="font-size: 11px; color: #666;">Risk Score</div>
                        </div>
                    </div>
                    
                    <div style="background: white; padding: 10px; border-radius: 6px; margin-top: 10px; border: 1px solid #ffdddd;">
                        <div style="font-weight: 500; color: #333; font-size: 13px; margin-bottom: 5px;">🔄 Analysis:</div>
                        <div style="font-size: 12px; color: #666;">${chat.reason || 'No specific reason provided'}</div>
                    </div>
                    
                    ${chat.sample_messages && chat.sample_messages.length > 0 ? `
                        <div style="margin-top: 10px;">
                            <div style="font-size: 12px; font-weight: 500; color: #333; margin-bottom: 5px;">💬 Sample Messages:</div>
                            <div style="display: grid; gap: 8px;">
                                ${chat.sample_messages.map(msg => `
                                    <div style="background: white; padding: 8px; border-radius: 6px; font-size: 11px; color: #666; border: 1px solid #ffdddd;">
                                        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                            <span style="color: #333;">${msg.text || ''}</span>
                                            <span style="color: #ff4444; font-size: 10px;">${(msg.score * 100).toFixed(0)}%</span>
                                        </div>
                                        <div style="font-size: 10px; color: #999;">${msg.reason || ''}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

// Helper function for messages tab
function createMessagesTab(riskyMessages) {
    if (!riskyMessages || riskyMessages.length === 0) {
        return `
            <div style="text-align: center; padding: 40px 20px; color: #00C851;">
                <div style="font-size: 48px; margin-bottom: 10px;">✅</div>
                <div style="font-weight: 600; margin-bottom: 5px;">No Risky Messages</div>
                <div style="font-size: 14px; color: #666;">
                    All messages appear safe
                </div>
            </div>
        `;
    }
    
    return `
        <div style="margin-bottom: 15px; font-size: 13px; color: #666;">
            Showing ${riskyMessages.length} risky messages sorted by risk score
        </div>
        
        <div style="display: grid; gap: 15px; max-height: 400px; overflow-y: auto;">
            ${riskyMessages.map((msg, index) => `
                <div style="background: #fff5f5; padding: 15px; border-radius: 8px; border-left: 4px solid ${getRiskColor(msg.risk_score)};">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <div>
                            <div style="font-weight: 600; color: #333; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                                <span>${index + 1}. ${msg.chat_name || 'Unknown Chat'}</span>
                                <span style="font-size: 11px; background: ${getRiskColor(msg.risk_score)}; color: white; padding: 2px 8px; border-radius: 10px;">
                                    ${msg.chat_type?.toUpperCase() || 'CHAT'}
                                </span>
                            </div>
                            <div style="font-size: 12px; color: #666; margin-top: 3px;">
                                <span style="margin-right: 15px;">👤 ${msg.sender || 'Unknown'}</span>
                                <span>📅 ${formatDate(msg.date)}</span>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 24px; font-weight: 600; color: ${getRiskColor(msg.risk_score)};">
                                ${(msg.risk_score * 100).toFixed(0)}%
                            </div>
                            <div style="font-size: 11px; color: #666;">Risk Score</div>
                        </div>
                    </div>
                    
                    <div style="background: white; padding: 12px; border-radius: 6px; margin-top: 10px; border: 1px solid #ffdddd;">
                        <div style="font-size: 13px; color: #333; line-height: 1.4;">
                            "${msg.message || msg.full_message || 'No message text'}"
                        </div>
                    </div>
                    
                    <div style="margin-top: 10px;">
                        <div style="font-size: 12px; font-weight: 500; color: #333; margin-bottom: 5px;">🔄 Analysis:</div>
                        <div style="font-size: 12px; color: #ff4444; padding: 8px; background: #fff5f5; border-radius: 6px;">
                            ${msg.reason || 'Suspicious content detected'}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Helper function to get color based on risk score
function getRiskColor(score) {
    if (score >= 0.8) return '#ff0000';
    if (score >= 0.6) return '#ff4444';
    if (score >= 0.4) return '#ff8800';
    return '#ffbb33';
}

// Helper function to format date
function formatDate(dateString) {
    if (!dateString) return 'Unknown date';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    } catch {
        return dateString;
    }
}


function initialize() {
    console.log('Telegram Detector initialized');
    
    // Only run on Telegram Web
    if (!window.location.hostname.includes('web.telegram.org')) {
        return;
    }
    
    // Setup auto-detection
    setupTelegramAutoDetection();
    
    // Store for debugging
    window.TelegramDetector = {
        requestScan: showTelegramPermission,
        startScan: startTelegramScan
    };
}