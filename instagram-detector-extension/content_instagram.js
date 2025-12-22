// ==============================================
// Instagram Drug Detector Extension - Content Script
// YOUR ORIGINAL CODE - NO CHANGES
// ==============================================

console.log("InstaDetector: Content script loaded");

// State management
let currentPostId = null;
let isAnalyzing = false;
let analysisCache = new Map();
let lastAnalyzedUrl = null;

// Configuration - AUTO DETECTION ONLY
const CONFIG = {
    autoAnalyze: true,
    cacheDuration: 5 * 60 * 1000,
    retryDelay: 1000,
    maxRetries: 2,
    analysisTimeout: 50000 // 50 second timeout
};

// ==============================================
// Utility Functions
// ==============================================

function getPostIdFromUrl(url) {
    const patterns = [
        /instagram\.com\/(?:p|reel|tv)\/([^\/\?]+)/,
        /instagram\.com\/.*\/p\/([^\/\?]+)/,
        /instagr\.am\/p\/([^\/\?]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

function isInstagramPostUrl(url) {
    return getPostIdFromUrl(url) !== null;
}

function isOnInstagramPost() {
    return isInstagramPostUrl(window.location.href);
}

function getCurrentPostId() {
    return getPostIdFromUrl(window.location.href);
}

// ==============================================
// Unified UI Functions
// ==============================================

function showLoading() {
    removeAnalysisUI(); // Remove existing UI
    
    const overlay = document.createElement('div');
    overlay.id = 'insta-detector-ui';
    overlay.style.cssText = `
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
        border: 3px solid #667eea;
    `;
    
    overlay.innerHTML = `
        <div style="font-size: 32px; margin-bottom: 10px;">🔍</div>
        <div style="font-weight: 600; margin-bottom: 5px; color: #333;">Analyzing Post...</div>
        <div style="font-size: 13px; color: #666; margin-bottom: 15px;">Auto-detecting drug trafficking content</div>
        <div style="height: 4px; background: #f0f0f0; border-radius: 2px; overflow: hidden;">
            <div style="height: 100%; width: 100%; background: linear-gradient(90deg, #667eea, #764ba2); animation: progress 2s ease-in-out infinite;"></div>
        </div>
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
            <button id="insta-detector-cancel" style="width: 100%; padding: 10px; border: none; background: #ff4444; color: white; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 14px; transition: all 0.2s;">
                Cancel Analysis
            </button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Add event listener for cancel button
    const cancelButton = document.getElementById('insta-detector-cancel');
    
    cancelButton.addEventListener('mouseenter', () => {
        cancelButton.style.opacity = '0.9';
        cancelButton.style.transform = 'scale(1.02)';
    });
    
    cancelButton.addEventListener('mouseleave', () => {
        cancelButton.style.opacity = '1';
        cancelButton.style.transform = 'scale(1)';
    });
    
    cancelButton.addEventListener('click', () => {
        // Disable button to prevent multiple clicks
        cancelButton.disabled = true;
        cancelButton.innerHTML = 'Cancelling...';
        cancelButton.style.opacity = '0.7';
        
        // Set analyzing state to false
        isAnalyzing = false;
        
        // Clear any pending timeouts
        clearTimeout(window.analysisTimeoutId);
        
        // Remove UI with animation
        overlay.style.opacity = '0';
        overlay.style.transform = 'translateX(400px)';
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 300);
        
        console.log("Instagram analysis cancelled");
    });
    
    // Store timeout ID globally so we can cancel it
    window.analysisTimeoutId = setTimeout(() => {
        if (isAnalyzing) {
            isAnalyzing = false;
            showError("Analysis is taking too long. The post might be large or complex.");
        }
    }, CONFIG.analysisTimeout);
    
    return overlay;
}
function showAnalysisResult(analysis) {
    removeAnalysisUI();
    
    if (!analysis || !analysis.classification) {
        showError("Invalid analysis received");
        return;
    }
    
    const classification = analysis.classification;
    const label = classification.label || 'unknown';
    const score = classification.score || 0;
    const reason = classification.reason || 'No analysis available';
    const metadata = analysis.metadata || {};
    
    // Determine colors
    let bgColor, textColor, borderColor;
    switch(label) {
        case 'risky':
            bgColor = '#ff4444';
            textColor = 'white';
            borderColor = '#ff0000';
            break;
        case 'safe':
            bgColor = '#00C851';
            textColor = 'white';
            borderColor = '#007E33';
            break;
        default:
            bgColor = '#ffbb33';
            textColor = 'white';
            borderColor = '#FF8800';
    }
    
    const ui = document.createElement('div');
    ui.id = 'insta-detector-ui';
    ui.dataset.postId = getCurrentPostId();
    
    ui.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 350px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        overflow: hidden;
        border: 3px solid ${borderColor};
        animation: slideIn 0.3s ease;
    `;
    
    // Header
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 15px;
        background: ${bgColor};
        color: ${textColor};
        font-weight: 600;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    
    const title = document.createElement('span');
    title.innerHTML = label === 'risky' ? '⚠️ <strong>POTENTIAL DRUG CONTENT</strong>' :
                     label === 'safe' ? '✅ <strong>SAFE CONTENT</strong>' :
                     '❓ <strong>ANALYSIS</strong>';
    
    const scoreBadge = document.createElement('span');
    scoreBadge.textContent = `${(score * 100).toFixed(0)}%`;
    scoreBadge.style.cssText = `
        background: rgba(255,255,255,0.2);
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 500;
    `;
    
    header.appendChild(title);
    header.appendChild(scoreBadge);
    
    // Content
    const content = document.createElement('div');
    content.style.cssText = `
        padding: 15px;
        font-size: 14px;
        line-height: 1.5;
        color: #333;
        max-height: 300px;
        overflow-y: auto;
    `;
    
    // Reason
    const reasonDiv = document.createElement('div');
    reasonDiv.style.marginBottom = '15px';
    reasonDiv.innerHTML = `<strong>Analysis:</strong> ${reason}`;
    
    // Metadata
    let metadataHtml = '';
    if (metadata.caption && metadata.caption.length > 0) {
        const preview = metadata.caption.length > 100 ? 
            metadata.caption.substring(0, 100) + '...' : metadata.caption;
        metadataHtml += `<div style="margin-top: 10px; font-size: 12px; color: #666;">
            <strong>Caption:</strong> ${preview}</div>`;
    }
    if (metadata.comments_count !== undefined) {
        metadataHtml += `<div style="margin-top: 5px; font-size: 12px; color: #666;">
            <strong>Comments:</strong> ${metadata.comments_count}</div>`;
    }
    
    if (metadataHtml) {
        const metadataDiv = document.createElement('div');
        metadataDiv.style.cssText = 'margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;';
        metadataDiv.innerHTML = metadataHtml;
        content.appendChild(metadataDiv);
    }
    
    // Actions - Only Close and Re-analyze buttons (NO manual detect button)
    const actions = document.createElement('div');
    actions.style.cssText = `
        display: flex;
        gap: 10px;
        margin-top: 15px;
        padding-top: 15px;
        border-top: 1px solid #eee;
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
        flex: 1;
        padding: 8px;
        border: 1px solid #ddd;
        background: white;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        color: #333;
        transition: all 0.2s;
    `;
    closeBtn.onmouseenter = () => closeBtn.style.backgroundColor = '#f8f9fa';
    closeBtn.onmouseleave = () => closeBtn.style.backgroundColor = 'white';
    closeBtn.onclick = () => removeAnalysisUI();
    
    const reanalyzeBtn = document.createElement('button');
    reanalyzeBtn.textContent = 'Re-analyze';
    reanalyzeBtn.style.cssText = `
        flex: 1;
        padding: 8px;
        border: none;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
    `;
    reanalyzeBtn.onmouseenter = () => reanalyzeBtn.style.opacity = '0.9';
    reanalyzeBtn.onmouseleave = () => reanalyzeBtn.style.opacity = '1';
    reanalyzeBtn.onclick = () => {
        removeAnalysisUI();
        analyzeCurrentPost();
    };
    
    actions.appendChild(closeBtn);
    actions.appendChild(reanalyzeBtn);
    
    // Assemble
    content.appendChild(reasonDiv);
    content.appendChild(actions);
    ui.appendChild(header);
    ui.appendChild(content);
    
    document.body.appendChild(ui);
    
    // Auto-hide safe content after 8 seconds
    if (label === 'safe') {
        setTimeout(() => {
            if (document.getElementById('insta-detector-ui') === ui) {
                ui.style.opacity = '0';
                ui.style.transform = 'translateX(400px)';
                setTimeout(() => ui.remove(), 300);
            }
        }, 8000);
    }
    
    return ui;
}

function showError(message) {
    removeAnalysisUI();
    
    const error = document.createElement('div');
    error.id = 'insta-detector-ui';
    error.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 300px;
        background: white;
        border-radius: 12px;
        padding: 15px;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease;
        border: 3px solid #ff4444;
    `;
    
    error.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
            <span style="font-size: 20px; color: #ff4444;">❌</span>
            <div style="font-weight: 600; color: #333;">Error</div>
        </div>
        <div style="font-size: 13px; color: #666; margin-bottom: 10px;">${message}</div>
        <button id="insta-detector-close-error" style="width: 100%; padding: 8px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer; font-weight: 500; color: #333;">Close</button>
    `;
    
    document.body.appendChild(error);
    
    document.getElementById('insta-detector-close-error').addEventListener('click', () => {
        error.style.opacity = '0';
        error.style.transform = 'translateX(400px)';
        setTimeout(() => error.remove(), 300);
    });
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (document.getElementById('insta-detector-ui') === error) {
            error.style.opacity = '0';
            error.style.transform = 'translateX(400px)';
            setTimeout(() => error.remove(), 300);
        }
    }, 10000);
}

function removeAnalysisUI() {
    const existing = document.getElementById('insta-detector-ui');
    if (existing) {
        existing.style.opacity = '0';
        existing.style.transform = 'translateX(400px)';
        setTimeout(() => existing.remove(), 300);
    }
}

// ==============================================
// Auto-Detection Analysis Function
// ==============================================

function analyzeCurrentPost() {
    const url = window.location.href;
    const postId = getCurrentPostId();
    
    if (!postId) {
        return; // Don't show error for no post
    }
    
    // Check cache
    const cached = analysisCache.get(url);
    if (cached && (Date.now() - cached.timestamp < CONFIG.cacheDuration)) {
        console.log("Using cached analysis for:", postId);
        showAnalysisResult(cached.data);
        return;
    }
    
    // Check if already analyzing
    if (isAnalyzing) {
        console.log("Already analyzing, skipping...");
        return;
    }
    
    isAnalyzing = true;
    currentPostId = postId;
    lastAnalyzedUrl = url;
    
    // Show loading
    showLoading();
    
    // Set timeout to prevent hanging
    const timeoutId = setTimeout(() => {
        if (isAnalyzing) {
            isAnalyzing = false;
            showError("Analysis is taking too long. The post might be large or complex.");
        }
    }, CONFIG.analysisTimeout);
    
    // Send to background script
    chrome.runtime.sendMessage({
        action: 'analyzeInstagram',
        url: url,
        postId: postId
    }, (response) => {
        clearTimeout(timeoutId);
        
        if (chrome.runtime.lastError) {
            console.error("Runtime error:", chrome.runtime.lastError);
            isAnalyzing = false;
            showError("Extension error. Please reload the page.");
        }
    });
}


// ==============================================
// Auto-Detection Engine (No Manual Button)
// ==============================================

function setupAutoDetection() {
    let lastUrl = window.location.href;
    let lastPostId = getCurrentPostId();
    
    // Primary: MutationObserver for SPA navigation
    const observer = new MutationObserver(() => {
        const currentUrl = window.location.href;
        const currentPostId = getCurrentPostId();
        
        // Only proceed if we have a valid post ID change
        if (currentUrl !== lastUrl && currentPostId && currentPostId !== lastPostId) {
            console.log("Auto-detection: New post detected:", currentPostId);
            lastUrl = currentUrl;
            lastPostId = currentPostId;
            
            // Remove any existing UI
            removeAnalysisUI();
            
            // Auto-analyze immediately
            setTimeout(() => {
                if (CONFIG.autoAnalyze && isOnInstagramPost()) {
                    analyzeCurrentPost();
                }
            }, 800); // Short delay for DOM to stabilize
        } else if (!currentPostId && lastPostId) {
            // Left a post page
            lastPostId = null;
            removeAnalysisUI();
        }
    });
    
    // Start observing
    observer.observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['href', 'src', 'content']
    });
    
    // Secondary: History API for pushState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
        originalPushState.apply(this, args);
        setTimeout(() => triggerAutoDetection(), 100);
    };
    
    history.replaceState = function(...args) {
        originalReplaceState.apply(this, args);
        setTimeout(() => triggerAutoDetection(), 100);
    };
    
    window.addEventListener('popstate', () => {
        setTimeout(() => triggerAutoDetection(), 100);
    });
    
    function triggerAutoDetection() {
        const currentPostId = getCurrentPostId();
        if (currentPostId && currentPostId !== lastPostId) {
            console.log("History change detected post:", currentPostId);
            lastPostId = currentPostId;
            
            removeAnalysisUI();
            
            if (CONFIG.autoAnalyze) {
                setTimeout(() => analyzeCurrentPost(), 800);
            }
        }
    }
    
    return observer;
}

// ==============================================
// Message Listeners
// ==============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Content script received:", message.action);
    
    if (message.action === 'analysisResult') {
        isAnalyzing = false;
        
        if (message.result && message.result.url === window.location.href) {
            // Cache the result
            analysisCache.set(message.result.url, {
                data: message.result,
                timestamp: Date.now()
            });
            
            // Show analysis result
            showAnalysisResult(message.result);
        }
    }
    
    if (message.action === 'analysisError') {
        isAnalyzing = false;
        showError(message.error || "Analysis failed");
    }
    
    if (message.action === 'analyzeCurrent') {
        // Manual trigger from extension icon (still supported)
        analyzeCurrentPost();
    }
    
    if (message.action === 'checkStatus') {
        sendResponse({
            isPost: isOnInstagramPost(),
            postId: getCurrentPostId(),
            isAnalyzing: isAnalyzing,
            lastAnalyzedUrl: lastAnalyzedUrl,
            config: CONFIG
        });
    }
    
    return true;
});

// ==============================================
// Initialization
// ==============================================

function initialize() {
    console.log("InstaDetector: Initializing auto-detection...");
    
    // Only run on Instagram
    if (!window.location.hostname.includes('instagram.com')) {
        return;
    }
    
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
    
    // Setup auto-detection
    setupAutoDetection();
    
    // If already on a post when page loads
    if (isOnInstagramPost()) {
        const postId = getCurrentPostId();
        console.log("Auto-detection: Already on post on load:", postId);
        
        // Auto-analyze after delay
        setTimeout(() => {
            if (CONFIG.autoAnalyze) {
                analyzeCurrentPost();
            }
        }, 1500);
    }
    
    console.log("InstaDetector: Auto-detection initialized");
}

// Start when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// Export for debugging
window.InstaDetector = {
    analyzeCurrentPost,
    getCurrentPostId,
    isOnInstagramPost,
    forceRefresh: initialize
};