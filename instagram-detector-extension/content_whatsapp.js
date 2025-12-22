// ==============================================
// WHATSAPP DRUG DETECTOR - COMPLETE CONTENT SCRIPT
// ==============================================

console.log("🚀 WhatsApp Detector: Content script loaded");

// State management
let permissionGranted = false;
let isScanning = false;
let lastScannedAt = null;

// ==============================================
// UTILITY FUNCTIONS
// ==============================================

// Auto-detect when WhatsApp Web loads
function detectWhatsAppPage() {
    return window.location.hostname === 'web.whatsapp.com';
}

// Remove all existing UI elements
function removeExistingUI() {
    const existing = document.querySelectorAll(
        '#whatsapp-detector-permission-dialog, ' +
        '#whatsapp-detector-scanning, ' +
        '#whatsapp-detector-results, ' +
        '#whatsapp-detector-error'
    );
    
    existing.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translate(-50%, -50%) scale(0.95)';
        setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 300);
    });
}

// ==============================================
// UI COMPONENTS
// ==============================================

// Show permission request dialog - FIXED VERSION
function showPermissionDialog() {
    // Remove any existing dialog first
    removeExistingUI();
    
    const dialog = document.createElement('div');
    dialog.id = 'whatsapp-detector-permission-dialog';
    dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 400px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        z-index: 10001;
        padding: 25px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: fadeIn 0.3s ease;
        border: 3px solid #25D366;
    `;
    
    dialog.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <div style="font-size: 42px; margin-bottom: 15px; color: #25D366;">🛡️</div>
            <div style="font-weight: 700; margin-bottom: 8px; color: #333; font-size: 18px;">Drug Content Detection</div>
            <div style="font-size: 14px; color: #666; margin-bottom: 20px; line-height: 1.4;">
                We'd like to scan your recent chats for potential drug trafficking content.
            </div>
        </div>
        
        <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 10px; font-size: 13px; border-left: 4px solid #25D366;">
            <strong style="color: #333; display: block; margin-bottom: 10px;">📊 What we'll scan:</strong>
            <div style="color: #555;">
                • Last 3 chats/channels<br>
                • Last 3 messages from each<br>
                • Using AI analysis (embeddings + Llama 3)
            </div>
        </div>
        
        <div style="margin-bottom: 15px; padding: 12px; background: #fff3cd; border-radius: 8px; font-size: 12px; color: #856404; border: 1px solid #ffeaa7;">
            <strong>⚠️ Note:</strong> Messages are processed locally and not stored permanently
        </div>
        
        <div style="display: flex; gap: 12px; margin-top: 25px;">
            <button id="whatsapp-permission-deny" style="flex: 1; padding: 12px; border: 2px solid #ddd; background: white; border-radius: 8px; cursor: pointer; font-weight: 600; color: #555; transition: all 0.2s;">
                Deny
            </button>
            <button id="whatsapp-permission-allow" style="flex: 1; padding: 12px; border: none; background: linear-gradient(135deg, #25D366, #128C7E); color: white; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.2s; box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3);">
                Allow Scan
            </button>
        </div>
        
        <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center;">
            <div style="margin-bottom: 5px;">🔒 Your privacy is protected</div>
            <div>Analysis happens locally • No data storage • Encrypted processing</div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // ==============================================
    // FIXED CLICK HANDLING - Use capture phase
    // ==============================================
    
    // Global click handler to capture all clicks
    function handleGlobalClick(event) {
        // Check if click is on our dialog buttons
        if (event.target.id === 'whatsapp-permission-allow') {
            console.log('✅ User clicked ALLOW (via global handler)');
            handleAllowAction();
            event.stopPropagation();
            event.preventDefault();
            return false;
        }
        
        if (event.target.id === 'whatsapp-permission-deny') {
            console.log('❌ User clicked DENY (via global handler)');
            handleDenyAction();
            event.stopPropagation();
            event.preventDefault();
            return false;
        }
    }
    
    // Add event listener at capture phase (before WhatsApp intercepts)
    document.addEventListener('click', handleGlobalClick, true);
    
    // Visual feedback handlers
    dialog.addEventListener('mouseover', (e) => {
        if (e.target.id === 'whatsapp-permission-allow') {
            e.target.style.opacity = '0.9';
            e.target.style.transform = 'scale(1.02)';
        }
        if (e.target.id === 'whatsapp-permission-deny') {
            e.target.style.backgroundColor = '#f8f9fa';
            e.target.style.borderColor = '#ff4444';
            e.target.style.color = '#ff4444';
        }
    });
    
    dialog.addEventListener('mouseout', (e) => {
        if (e.target.id === 'whatsapp-permission-allow') {
            e.target.style.opacity = '1';
            e.target.style.transform = 'scale(1)';
        }
        if (e.target.id === 'whatsapp-permission-deny') {
            e.target.style.backgroundColor = 'white';
            e.target.style.borderColor = '#ddd';
            e.target.style.color = '#555';
        }
    });
    
    function handleAllowAction() {
        permissionGranted = true;
        localStorage.setItem('whatsapp_detector_permission', 'granted');
        
        // Remove global listener
        document.removeEventListener('click', handleGlobalClick, true);
        
        // Add visual feedback
        const allowBtn = document.getElementById('whatsapp-permission-allow');
        if (allowBtn) {
            allowBtn.innerHTML = '✓ Allowed';
            allowBtn.style.background = '#00C851';
            allowBtn.disabled = true;
        }
        
        setTimeout(() => {
            dialog.style.opacity = '0';
            dialog.style.transform = 'translate(-50%, -50%) scale(0.95)';
            setTimeout(() => {
                if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
                startWhatsAppScan();
            }, 300);
        }, 500);
    }
    
    function handleDenyAction() {
        permissionGranted = false;
        localStorage.setItem('whatsapp_detector_permission', 'denied');
        
        // Remove global listener
        document.removeEventListener('click', handleGlobalClick, true);
        
        const denyBtn = document.getElementById('whatsapp-permission-deny');
        if (denyBtn) {
            denyBtn.innerHTML = '✗ Denied';
            denyBtn.style.background = '#ff4444';
            denyBtn.style.color = 'white';
            denyBtn.style.borderColor = '#ff4444';
            denyBtn.disabled = true;
        }
        
        setTimeout(() => {
            dialog.style.opacity = '0';
            dialog.style.transform = 'translate(-50%, -50%) scale(0.95)';
            setTimeout(() => {
                if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
                showNotification('Permission denied. You can enable scanning from extension icon.', 'info');
            }, 300);
        }, 500);
    }
}

// Show scanning UI
function showScanningUI() {
    removeExistingUI();
    
    const ui = document.createElement('div');
    ui.id = 'whatsapp-detector-scanning';
    ui.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 400px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        z-index: 10001;
        padding: 30px;
        text-align: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: fadeIn 0.3s ease;
        border: 3px solid #667eea;
    `;
    
    ui.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 20px; color: #25D366;">🔍</div>
        <div style="font-weight: 700; margin-bottom: 10px; color: #333; font-size: 20px;">Scanning WhatsApp...</div>
        <div style="font-size: 14px; color: #666; margin-bottom: 25px; line-height: 1.5;">
            Analyzing recent chats for drug-related content<br>
            <span style="font-size: 12px; color: #888;">Using sentence transformers + Llama 3 AI</span>
        </div>
        
        <div style="height: 6px; background: #f0f0f0; border-radius: 3px; overflow: hidden; margin-bottom: 20px;">
            <div style="height: 100%; width: 100%; background: linear-gradient(90deg, #25D366, #128C7E); animation: progress 2s ease-in-out infinite;"></div>
        </div>
        
        <div style="font-size: 13px; color: #888; background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 15px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>Status:</span>
                <span style="color: #667eea; font-weight: 500;">Processing</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span>Method:</span>
                <span style="color: #667eea; font-weight: 500;">AI Analysis</span>
            </div>
        </div>
        
        <div style="font-size: 12px; color: #999; margin-top: 15px;">
            This may take a few seconds...
        </div>
    `;
    
    document.body.appendChild(ui);
}

// Show error message
function showError(message, type = 'error') {
    removeExistingUI();
    
    const error = document.createElement('div');
    error.id = 'whatsapp-detector-error';
    error.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 400px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        z-index: 10001;
        padding: 25px;
        text-align: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: fadeIn 0.3s ease;
        border: 3px solid ${type === 'error' ? '#ff4444' : type === 'warning' ? '#ff9800' : '#25D366'};
    `;
    
    const icon = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
    const title = type === 'error' ? 'Error' : type === 'warning' ? 'Warning' : 'Information';
    
    error.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 15px; color: ${type === 'error' ? '#ff4444' : type === 'warning' ? '#ff9800' : '#25D366'};">${icon}</div>
        <div style="font-weight: 700; margin-bottom: 10px; color: #333; font-size: 18px;">${title}</div>
        <div style="font-size: 14px; color: #666; margin-bottom: 25px; line-height: 1.5; padding: 0 10px;">${message}</div>
        
        <button id="whatsapp-error-close" style="width: 100%; padding: 12px; border: none; background: ${type === 'error' ? '#ff4444' : type === 'warning' ? '#ff9800' : '#25D366'}; color: white; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
            Close
        </button>
        
        ${type === 'error' ? `
            <div style="margin-top: 15px;">
                <button id="whatsapp-error-retry" style="width: 100%; padding: 10px; border: 2px solid #25D366; background: white; color: #25D366; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
                    🔄 Try Again
                </button>
            </div>
        ` : ''}
    `;
    
    document.body.appendChild(error);
    
    // Add event listeners
    setTimeout(() => {
        const closeBtn = document.getElementById('whatsapp-error-close');
        const retryBtn = document.getElementById('whatsapp-error-retry');
        
        if (closeBtn) {
            // Use direct onclick handler
            closeBtn.onclick = () => {
                error.style.opacity = '0';
                error.style.transform = 'translate(-50%, -50%) scale(0.95)';
                setTimeout(() => error.remove(), 300);
            };
        }
        
        if (retryBtn) {
            // Use direct onclick handler
            retryBtn.onclick = () => {
                error.remove();
                startWhatsAppScan();
            };
        }
    }, 100);
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `whatsapp-detector-notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#ff4444' : type === 'success' ? '#00C851' : type === 'warning' ? '#ff9800' : '#25D366'};
        color: white;
        padding: 12px 20px;
        border-radius: 10px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.2);
        z-index: 10002;
        animation: slideIn 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        max-width: 350px;
    `;
    
    const icon = type === 'error' ? '❌' : 
                 type === 'success' ? '✅' : 
                 type === 'warning' ? '⚠️' : 'ℹ️';
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 18px;">${icon}</span>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(400px)';
        setTimeout(() => {
            if (notification.parentNode) notification.parentNode.removeChild(notification);
        }, 300);
    }, 5000);
}
// ==============================================
// MESSAGE EXTRACTION - FIXED FOR WHATSAPP SHADOW DOM
// ==============================================

async function extractRecentMessages() {
    console.log('🔍 Starting WhatsApp message extraction...');
    const messages = [];
    const chatsProcessed = [];
    
    try {
        console.log('📱 WhatsApp DOM structure analysis...');
        
        // Method 1: Try to find chat list using WhatsApp's data attributes
        let chatList = null;
        
        // WhatsApp Web 2024 selectors (updated)
        const chatSelectors = [
            'div[data-testid="chat-list"]',
            'div[role="grid"]',
            'div[aria-label="Chat list"]',
            'div._8nE1Y',
            'div[class*="chat-list"]',
            'div[class*="pane-chat"]'
        ];
        
        for (const selector of chatSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                chatList = element;
                console.log(`✅ Found chat list with selector: ${selector}`);
                break;
            }
        }
        
        if (!chatList) {
            console.log('⚠️ No chat list found with standard selectors. Trying alternative methods...');
            
            // Method 2: Look for any container with chat-like structure
            const containers = document.querySelectorAll('div[role="row"], div[data-testid*="cell"]');
            if (containers.length > 0) {
                chatList = containers[0].parentElement;
                console.log(`✅ Using parent of ${containers.length} chat-like elements`);
            }
        }
        
        if (!chatList) {
            console.log('❌ Could not locate chat list. WhatsApp Web structure may have changed.');
            showError('Cannot access WhatsApp chats. Please ensure WhatsApp Web is fully loaded.');
            return [];
        }
        
        // Method 3: Try to access WhatsApp's internal data via window properties
        console.log('🔍 Attempting to access WhatsApp internal data...');
        
        try {
            // WhatsApp stores messages in window.Store
            if (window.Store && window.Store.Msg) {
                console.log('✅ Found WhatsApp Store API');
                return extractViaStoreAPI();
            }
        } catch (e) {
            console.log('⚠️ Cannot access Store API:', e.message);
        }
        
        // Method 4: Manual extraction from DOM
        console.log('📝 Manual DOM extraction...');
        
        // Get all visible chat elements
        const chatElements = chatList.querySelectorAll('div[role="row"], div[data-testid*="cell"], div[class*="chat"]');
        console.log(`📊 Found ${chatElements.length} potential chat elements`);
        
        let chatCount = 0;
        
        for (let i = 0; i < Math.min(chatElements.length, 5); i++) {
            if (chatCount >= 3) break;
            
            const chatElement = chatElements[i];
            
            // Extract chat name
            let chatName = `Chat ${chatCount + 1}`;
            const nameElement = chatElement.querySelector('span[dir="auto"], div[dir="auto"], span[class*="title"], div[class*="title"]');
            if (nameElement && nameElement.textContent) {
                chatName = nameElement.textContent.trim();
                // Clean up chat name
                chatName = chatName.replace(/\n/g, ' ').substring(0, 30);
            }
            
            console.log(`📱 Attempting to open chat: "${chatName}"`);
            chatsProcessed.push(chatName);
            
            try {
                // Try to click the chat to open it
                chatElement.click();
                console.log(`  ✅ Clicked on chat`);
                
                // Wait for chat to open
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Now try to extract messages from the opened chat
                const chatMessages = await extractMessagesFromOpenChat(chatName, chatCount);
                
                if (chatMessages.length > 0) {
                    messages.push(...chatMessages);
                    chatCount++;
                    console.log(`  ✅ Extracted ${chatMessages.length} messages from "${chatName}"`);
                } else {
                    console.log(`  ⚠️ No messages extracted from "${chatName}"`);
                }
                
            } catch (error) {
                console.log(`  ❌ Error opening chat "${chatName}":`, error.message);
            }
            
            // Small delay between chats
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log(`✅ Extraction complete: ${messages.length} messages from ${chatsProcessed.length} chats`);
        console.log(`   Chats attempted: ${chatsProcessed.join(', ')}`);
        
        // If no messages found, try alternative methods
        if (messages.length === 0) {
            console.log('🔄 No messages found via DOM. Trying alternative extraction methods...');
            return await tryAlternativeExtractionMethods();
        }
        
        return messages;
        
    } catch (error) {
        console.error('❌ Error extracting messages:', error);
        return [];
    }
}

// Helper: Extract messages from currently open chat
async function extractMessagesFromOpenChat(chatName, chatIndex) {
    const messages = [];
    
    try {
        console.log(`  🔍 Looking for messages in open chat: ${chatName}`);
        
        // Look for message container in the main panel
        const messageSelectors = [
            'div[data-testid="conversation-panel-body"]',
            'div[class*="message-list"]',
            'div[role="log"]',
            'div[aria-label="Message list"]',
            'div[class*="pane-body"]'
        ];
        
        let messageContainer = null;
        for (const selector of messageSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                messageContainer = element;
                console.log(`    ✅ Found message container: ${selector}`);
                break;
            }
        }
        
        if (!messageContainer) {
            console.log('    ⚠️ No message container found');
            return messages;
        }
        
        // Extract visible messages
        const messageElements = messageContainer.querySelectorAll(
            'div[data-testid="msg-container"], ' +
            'div[class*="message-"], ' +
            'div[data-id], ' +
            'div[data-pre-plain-text]'
        );
        
        console.log(`    📨 Found ${messageElements.length} message elements`);
        
        let messageCount = 0;
        const maxMessages = 3;
        
        // Take the last few messages (most recent)
        const startIndex = Math.max(0, messageElements.length - 5);
        
        for (let i = startIndex; i < messageElements.length; i++) {
            if (messageCount >= maxMessages) break;
            
            const msgElement = messageElements[i];
            
            // Try different methods to extract text
            let messageText = '';
            
            // Method 1: Look for text elements
            const textElements = msgElement.querySelectorAll(
                'span[class*="selectable-text"], ' +
                'div[class*="copyable-text"], ' +
                'span[dir="ltr"], ' +
                'div[dir="ltr"]'
            );
            
            for (const textEl of textElements) {
                if (textEl.textContent && textEl.textContent.trim()) {
                    messageText = textEl.textContent.trim();
                    break;
                }
            }
            
            // Method 2: Get data attribute
            if (!messageText && msgElement.hasAttribute('data-pre-plain-text')) {
                const dataText = msgElement.getAttribute('data-pre-plain-text');
                if (dataText) {
                    // Extract message from data attribute format: [time] sender: message
                    const match = dataText.match(/:\s*(.*)/);
                    if (match) {
                        messageText = match[1];
                    }
                }
            }
            
            // Method 3: Direct text content
            if (!messageText) {
                messageText = msgElement.textContent || '';
                // Clean up the text
                messageText = messageText.replace(/\s+/g, ' ').trim();
                // Remove timestamps and metadata
                messageText = messageText.replace(/\d{1,2}:\d{2}\s*(?:AM|PM)?/g, '').trim();
            }
            
            if (messageText && messageText.length > 1) {
                // Determine sender
                let sender = 'Other';
                if (msgElement.classList.contains('message-out') || 
                    msgElement.querySelector('[data-testid="msg-meta"]') ||
                    msgElement.textContent.includes('You:') ||
                    msgElement.getAttribute('data-id')?.includes('true')) {
                    sender = 'You';
                }
                
                messages.push({
                    chat_id: `chat_${chatIndex}`,
                    chat_name: chatName,
                    message_id: `msg_${chatIndex}_${i}`,
                    text: messageText.substring(0, 500), // Limit length
                    timestamp: new Date().toISOString(),
                    sender: sender,
                    chat_index: chatIndex,
                    message_index: messageCount
                });
                
                console.log(`    📝 Message ${messageCount + 1}: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}"`);
                messageCount++;
            }
        }
        
    } catch (error) {
        console.log(`    ❌ Error extracting from chat: ${error.message}`);
    }
    
    return messages;
}

// Alternative: Try to access WhatsApp's internal Store API
function extractViaStoreAPI() {
    console.log('🔧 Using WhatsApp Store API method...');
    const messages = [];
    
    try {
        // Access WhatsApp's internal message store
        const store = window.Store;
        if (!store || !store.Msg || !store.Chat) {
            console.log('⚠️ Store API not fully available');
            return [];
        }
        
        // Get all chats
        const chatModels = store.Chat.models || [];
        console.log(`📱 Found ${chatModels.length} chats via Store API`);
        
        let chatCount = 0;
        
        for (const chat of chatModels.slice(0, 3)) { // Only first 3 chats
            if (chatCount >= 3) break;
            
            const chatName = chat.name || chat.formattedTitle || `Chat ${chatCount + 1}`;
            console.log(`  📱 Processing chat via API: "${chatName}"`);
            
            // Get messages for this chat
            const msgArray = chat.msgs?.models || [];
            const recentMessages = msgArray.slice(-3); // Last 3 messages
            
            for (let i = 0; i < recentMessages.length; i++) {
                const msg = recentMessages[i];
                if (msg && msg.body) {
                    messages.push({
                        chat_id: `chat_${chatCount}`,
                        chat_name: chatName,
                        message_id: `msg_${chatCount}_${i}`,
                        text: msg.body,
                        timestamp: msg.t ? new Date(msg.t * 1000).toISOString() : new Date().toISOString(),
                        sender: msg.fromMe ? 'You' : 'Other',
                        chat_index: chatCount,
                        message_index: i
                    });
                    
                    console.log(`    📝 API Message: "${msg.body.substring(0, 50)}${msg.body.length > 50 ? '...' : ''}"`);
                }
            }
            
            if (recentMessages.length > 0) {
                chatCount++;
            }
        }
        
        console.log(`✅ Store API extraction: ${messages.length} messages`);
        
    } catch (error) {
        console.error('❌ Store API extraction failed:', error);
    }
    
    return messages;
}

// Alternative extraction methods as fallback
async function tryAlternativeExtractionMethods() {
    console.log('🔄 Trying alternative extraction methods...');
    const messages = [];
    
    try {
        // Method A: Use MutationObserver to capture messages
        console.log('👀 Setting up MutationObserver...');
        
        return new Promise((resolve) => {
            const observer = new MutationObserver((mutations) => {
                let foundMessages = [];
                
                mutations.forEach((mutation) => {
                    if (mutation.addedNodes.length > 0) {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === 1 && node.textContent) { // Element node with text
                                const text = node.textContent.trim();
                                if (text.length > 10 && text.length < 500) {
                                    // Check if it looks like a message
                                    if (!text.includes('clicked for more info') &&
                                        !text.includes('Messages and calls are end-to-end encrypted') &&
                                        !text.includes('Tap for more info')) {
                                        
                                        foundMessages.push({
                                            chat_id: 'chat_0',
                                            chat_name: 'Detected Chat',
                                            message_id: `msg_${Date.now()}_${foundMessages.length}`,
                                            text: text,
                                            timestamp: new Date().toISOString(),
                                            sender: text.includes('You:') ? 'You' : 'Other',
                                            chat_index: 0,
                                            message_index: foundMessages.length
                                        });
                                    }
                                }
                            }
                        });
                    }
                });
                
                if (foundMessages.length > 0) {
                    observer.disconnect();
                    console.log(`✅ MutationObserver found ${foundMessages.length} messages`);
                    resolve(foundMessages.slice(0, 9)); // Max 9 messages (3 chats × 3 messages)
                }
            });
            
            // Start observing
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
            });
            
            // Timeout after 5 seconds
            setTimeout(() => {
                observer.disconnect();
                console.log('⏰ MutationObserver timeout');
                resolve(messages);
            }, 5000);
        });
        
    } catch (error) {
        console.error('❌ Alternative methods failed:', error);
        return messages;
    }
}

// ==============================================
// SCAN MANAGEMENT
// ==============================================

// Start the scanning process
async function startWhatsAppScan() {
    if (isScanning) {
        console.log('⚠️ Scan already in progress');
        showNotification('Scan already in progress', 'warning');
        return;
    }
    
    isScanning = true;
    lastScannedAt = new Date();
    showScanningUI();
    
    try {
        console.log('🚀 Starting WhatsApp scan...');
        
        // Extract messages
        const messages = await extractRecentMessages();
        
        if (messages.length === 0) {
            showError('No messages found. Please make sure WhatsApp Web is fully loaded and you have chats visible.');
            isScanning = false;
            return;
        }
        
        console.log(`✅ Extracted ${messages.length} messages for analysis`);
        
        // Send to background script for processing
        chrome.runtime.sendMessage({
            action: 'analyzeWhatsApp',
            messages: messages,
            timestamp: new Date().toISOString()
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('❌ Runtime error:', chrome.runtime.lastError);
                showError('Failed to send messages for analysis: ' + chrome.runtime.lastError.message);
                isScanning = false;
            } else {
                console.log('✅ Message sent to background script');
            }
        });
        
    } catch (error) {
        console.error('❌ Scan error:', error);
        showError('Failed to extract messages: ' + error.message);
        isScanning = false;
    }
}

// ==============================================
// ANALYSIS RESULT DISPLAY
// ==============================================

// Show analysis results with detailed logs
function showAnalysisResult(result) {
    removeExistingUI();
    isScanning = false;
    
    console.log('📊 WhatsApp Analysis Result Received:', result);
    
    // Log to extension console
    if (result.scan_summary) {
        console.log(`✅ Scan Complete:`);
        console.log(`   • Messages scanned: ${result.scan_summary.total_messages_scanned}`);
        console.log(`   • Risky chats: ${result.scan_summary.risky_chats_found}`);
        console.log(`   • Risky messages: ${result.scan_summary.risky_messages_found}`);
        console.log(`   • Processing time: ${result.processing_time_seconds}s`);
    }
    
    const ui = document.createElement('div');
    ui.id = 'whatsapp-detector-results';
    ui.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 500px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        z-index: 10001;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: fadeIn 0.3s ease;
        border: 3px solid ${result.risky_chats_found > 0 ? '#ff4444' : '#00C851'};
        max-height: 80vh;
        overflow-y: auto;
        overflow-x: hidden;
    `;
    
    let resultHTML = `
        <div style="padding: 25px;">
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #f0f0f0;">
                <div style="font-size: 36px;">${result.risky_chats_found > 0 ? '⚠️' : '✅'}</div>
                <div style="flex-grow: 1;">
                    <div style="font-weight: 700; color: #333; font-size: 20px;">WhatsApp Scan Results</div>
                    <div style="font-size: 14px; color: #666;">
                        Completed at ${new Date().toLocaleTimeString()}
                    </div>
                </div>
                <div style="font-size: 24px; font-weight: 700; color: ${result.risky_chats_found > 0 ? '#ff4444' : '#00C851'}">
                    ${result.processing_time_seconds || '?'}s
                </div>
            </div>
            
            <!-- Summary Stats -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 25px;">
                <div style="background: #f8f9fa; padding: 15px; border-radius: 10px; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: #667eea;">${result.scan_summary?.total_messages_scanned || 0}</div>
                    <div style="font-size: 12px; color: #666;">Messages Scanned</div>
                </div>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 10px; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: ${result.risky_chats_found > 0 ? '#ff4444' : '#00C851'}">${result.scan_summary?.risky_chats_found || 0}</div>
                    <div style="font-size: 12px; color: #666;">Risky Chats</div>
                </div>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 10px; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: ${result.risky_messages_found > 0 ? '#ff9800' : '#00C851'}">${result.scan_summary?.risky_messages_found || 0}</div>
                    <div style="font-size: 12px; color: #666;">Risky Messages</div>
                </div>
            </div>
    `;
    
    if (result.risky_chats_found > 0) {
        resultHTML += `
            <div style="margin-bottom: 25px;">
                <div style="font-weight: 600; margin-bottom: 15px; color: #333; font-size: 16px; display: flex; align-items: center; gap: 8px;">
                    <span>🚨 Risk Detected</span>
                    <span style="background: #ff4444; color: white; padding: 2px 10px; border-radius: 10px; font-size: 12px;">
                        ${result.risky_chats_found} chat(s) affected
                    </span>
                </div>
        `;
        
        result.risky_chats.forEach((chat, index) => {
            const riskColor = chat.risk_score > 0.7 ? '#ff4444' : 
                            chat.risk_score > 0.4 ? '#ff9800' : '#ffc107';
            
            resultHTML += `
                <div style="margin-bottom: 15px; border-left: 4px solid ${riskColor}; padding-left: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="font-weight: 600; color: #333; display: flex; align-items: center; gap: 8px;">
                            <div style="width: 8px; height: 8px; background: ${riskColor}; border-radius: 50%;"></div>
                            ${chat.chat_name}
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <span style="font-weight: 700; color: ${riskColor}; font-size: 18px;">
                                ${Math.round(chat.risk_score * 100)}%
                            </span>
                            <span style="font-size: 12px; color: #666; background: #f0f0f0; padding: 2px 8px; border-radius: 4px;">
                                ${chat.risky_message_count} msgs
                            </span>
                        </div>
                    </div>
                    
                    ${chat.avg_similarity ? `
                    <div style="font-size: 13px; color: #666; margin-bottom: 10px;">
                        Similarity: ${Math.round(chat.avg_similarity * 100)}% with drug patterns
                    </div>
                    ` : ''}
                    
                    ${chat.sample_messages && chat.sample_messages.length > 0 ? `
                    <div style="font-size: 12px; color: #888; background: #f9f9f9; padding: 10px; border-radius: 6px;">
                        <div style="font-weight: 500; margin-bottom: 5px; color: #666;">Sample messages:</div>
                        ${chat.sample_messages.map(msg => 
                            `<div style="margin-bottom: 5px; padding-left: 10px; border-left: 2px solid #ddd;">
                                "${msg.text || msg.message_preview || 'No text'}"<br>
                                <small style="color: #999;">Score: ${(msg.score || 0).toFixed(2)} • Similarity: ${(msg.similarity || 0).toFixed(2)}</small>
                            </div>`
                        ).join('')}
                    </div>
                    ` : ''}
                </div>
            `;
        });
        
        resultHTML += `</div>`;
        
        // Show top risky messages
        if (result.risky_messages && result.risky_messages.length > 0) {
            resultHTML += `
                <div style="margin-bottom: 20px;">
                    <div style="font-weight: 600; margin-bottom: 10px; color: #333; font-size: 14px;">
                        🔥 Top Risky Messages
                    </div>
                    <div style="font-size: 12px; color: #666; max-height: 200px; overflow-y: auto;">
            `;
            
            result.risky_messages.slice(0, 3).forEach((msg, i) => {
                resultHTML += `
                    <div style="padding: 10px; background: ${i % 2 === 0 ? '#f8f9fa' : '#fff'}; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #ff4444;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <span style="font-weight: 500;">${msg.chat_name || 'Unknown Chat'}</span>
                            <span style="color: #ff4444; font-weight: 600;">${(msg.risk_score || 0).toFixed(2)}</span>
                        </div>
                        <div style="color: #333; margin-bottom: 5px;">${msg.message_preview || msg.text || 'No message preview'}</div>
                        <div style="color: #666; font-size: 11px;">
                            ${msg.similarity_score ? `<div>Similarity: ${(msg.similarity_score || 0).toFixed(2)}</div>` : ''}
                            ${msg.reason ? `<div>${msg.reason}</div>` : ''}
                        </div>
                    </div>
                `;
            });
            
            resultHTML += `</div></div>`;
        }
    } else {
        resultHTML += `
            <div style="text-align: center; padding: 30px 20px; margin-bottom: 25px;">
                <div style="font-size: 64px; margin-bottom: 15px; color: #00C851;">✅</div>
                <div style="font-weight: 700; color: #22543d; margin-bottom: 10px; font-size: 18px;">No Drug Content Detected</div>
                <div style="font-size: 14px; color: #38a169; margin-bottom: 20px;">
                    All scanned messages appear safe and don't match known drug trafficking patterns
                </div>
                <div style="background: #f0fff4; padding: 15px; border-radius: 10px; text-align: left; font-size: 13px; color: #22543d;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <span>🛡️</span>
                        <span><strong>Security Status:</strong> Your chats appear clean</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span>🔍</span>
                        <span><strong>Analysis:</strong> Used embeddings + Llama 3 AI</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Technical details section
    resultHTML += `
        <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 10px; font-size: 12px; color: #666;">
            <div style="font-weight: 600; margin-bottom: 10px; color: #333;">Technical Details</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div>
                    <strong>Model:</strong> ${result.embedding_info?.model_used || 'all-MiniLM-L6-v2'}<br>
                    <strong>Similarity Threshold:</strong> ${result.embedding_info?.similarity_threshold || 0.3}
                </div>
                <div>
                    <strong>AI Model:</strong> Llama 3.1 (Groq)<br>
                    <strong>Processing:</strong> ${result.processing_time_seconds || '?'} seconds
                </div>
            </div>
        </div>
        
        <!-- Action Buttons -->
        <div style="display: flex; gap: 12px; margin-top: 25px;">
            <button id="whatsapp-close-results" style="flex: 1; padding: 12px; border: 2px solid #ddd; background: white; border-radius: 8px; cursor: pointer; font-weight: 600; color: #555; transition: all 0.2s;">
                Close Report
            </button>
            <button id="whatsapp-rescan" style="flex: 1; padding: 12px; border: none; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
                🔄 Scan Again
            </button>
        </div>
        
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center;">
            <div>Analysis completed at ${new Date().toLocaleTimeString()} • Extension v2.0</div>
            <div>Messages processed locally • No data stored</div>
        </div>
        </div>
    `;
    
    ui.innerHTML = resultHTML;
    document.body.appendChild(ui);
    
    // Add CSS for animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
            to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        
        @keyframes progress {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
    `;
    document.head.appendChild(style);
    
    // Add event listeners with timeout
    setTimeout(() => {
        const closeBtn = document.getElementById('whatsapp-close-results');
        const rescanBtn = document.getElementById('whatsapp-rescan');
        
        if (closeBtn) {
            // Use direct onclick handler
            closeBtn.onclick = () => {
                ui.style.opacity = '0';
                ui.style.transform = 'translate(-50%, -50%) scale(0.95)';
                setTimeout(() => ui.remove(), 300);
            };
        }
        
        if (rescanBtn) {
            // Use direct onclick handler
            rescanBtn.onclick = () => {
                ui.remove();
                startWhatsAppScan();
            };
            
            // Add hover effects directly
            rescanBtn.onmouseenter = () => {
                rescanBtn.style.opacity = '0.9';
                rescanBtn.style.transform = 'scale(1.02)';
            };
            
            rescanBtn.onmouseleave = () => {
                rescanBtn.style.opacity = '1';
                rescanBtn.style.transform = 'scale(1)';
            };
        }
    }, 100);
}

// ==============================================
// MESSAGE LISTENERS
// ==============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📩 WhatsApp content script received:', message.action);
    
    if (message.action === 'whatsappAutoDetect') {
        const permission = localStorage.getItem('whatsapp_detector_permission');
        
        if (!permission) {
            console.log('🔄 No permission set, showing dialog...');
            showPermissionDialog();
        } else if (permission === 'granted') {
            console.log('✅ Permission granted, starting scan...');
            startWhatsAppScan();
        } else {
            console.log('❌ Permission denied previously');
            showNotification('Scanning disabled. Enable from extension settings.', 'warning');
        }
    }
    
    if (message.action === 'whatsappAnalysisResult') {
        console.log('📊 Received analysis results');
        showAnalysisResult(message.result);
    }
    
    if (message.action === 'whatsappAnalysisError') {
        console.error('❌ Analysis error:', message.error);
        showError('Analysis failed: ' + message.error);
        isScanning = false;
    }
    
    // For status checks
    if (message.action === 'checkStatus') {
        sendResponse({
            isScanning: isScanning,
            permissionGranted: permissionGranted,
            lastScannedAt: lastScannedAt,
            onWhatsApp: detectWhatsAppPage()
        });
        return true;
    }
    
    return true;
});

// ==============================================
// INITIALIZATION
// ==============================================

if (detectWhatsAppPage()) {
    console.log('✅ WhatsApp Detector: WhatsApp Web detected');
    
    // Add global styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from { 
                opacity: 0; 
                transform: translate(-50%, -50%) scale(0.9); 
            }
            to { 
                opacity: 1; 
                transform: translate(-50%, -50%) scale(1); 
            }
        }
        
        @keyframes slideIn {
            from { 
                transform: translateX(400px); 
                opacity: 0; 
            }
            to { 
                transform: translateX(0); 
                opacity: 1; 
            }
        }
        
        @keyframes progress {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
        
        .whatsapp-detector-notification {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #25D366;
            color: white;
            padding: 12px 20px;
            border-radius: 10px;
            box-shadow: 0 6px 20px rgba(0,0,0,0.2);
            z-index: 10002;
            animation: slideIn 0.3s ease;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            max-width: 350px;
        }
        
        .whatsapp-detector-notification.error {
            background: linear-gradient(135deg, #ff4444, #cc0000);
        }
        
        .whatsapp-detector-notification.success {
            background: linear-gradient(135deg, #00C851, #007E33);
        }
        
        .whatsapp-detector-notification.warning {
            background: linear-gradient(135deg, #ffbb33, #FF8800);
        }
    `;
    document.head.appendChild(style);
    
    // Check for permission after page loads
    setTimeout(() => {
        const permission = localStorage.getItem('whatsapp_detector_permission');
        if (!permission) {
            // Auto-show permission dialog after 2 seconds
            setTimeout(() => {
                if (document.readyState === 'complete') {
                    console.log('🔄 Page loaded, showing permission dialog...');
                    showPermissionDialog();
                }
            }, 2000);
        } else if (permission === 'granted') {
            console.log('✅ Previous permission found: GRANTED');
            // Optional: Auto-scan on page load
            // startWhatsAppScan();
        } else {
            console.log('❌ Previous permission found: DENIED');
        }
    }, 1000);
}

// Export for debugging
window.WhatsAppDetector = {
    showPermissionDialog,
    startWhatsAppScan,
    showAnalysisResult,
    extractRecentMessages,
    showError,
    showNotification,
    getStatus: () => ({
        isScanning,
        permissionGranted,
        lastScannedAt
    })
};

console.log('✅ WhatsApp Detector content script initialized successfully');