/**
 * Ask AI functionality - Based on original working implementation
 */

// Global variables for AI functionality
let aiProfileData = null;

// Get config from window or use defaults
const OAUTH_PDS = window.OAUTH_CONFIG?.pds || 'syu.is';
const ADMIN_HANDLE = window.OAUTH_CONFIG?.admin || 'ai.syui.ai';
const OAUTH_COLLECTION = window.OAUTH_CONFIG?.collection || 'ai.syui.log';

// Listen for AI profile data from OAuth app
window.addEventListener('aiProfileLoaded', function(event) {
    aiProfileData = event.detail;
    updateAskAIButton();
});

// Check if AI profile data is already available
if (window.aiProfileData) {
    aiProfileData = window.aiProfileData;
}

// Original functions from working implementation
function toggleAskAI() {
    const panel = document.getElementById('askAiPanel');
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
    
    if (!isVisible) {
        
        // If AI profile data is already available, show introduction immediately
        if (aiProfileData) {
            // Quick check for authentication
            const userSections = document.querySelectorAll('.user-section');
            const isAuthenticated = userSections.length > 0;
            handleAuthenticationStatus(isAuthenticated);
            return;
        }
        
        // For production fallback - if OAuth app fails to load, show profiles
        const isProd = window.location.hostname !== 'localhost' && !window.location.hostname.includes('preview');
        if (isProd) {
            // Shorter timeout for production
            setTimeout(() => {
                const userSections = document.querySelectorAll('.user-section');
                
                if (userSections.length === 0) {
                    handleAuthenticationStatus(false);
                } else {
                    handleAuthenticationStatus(true);
                }
            }, 300);
        } else {
            checkAuthenticationStatus();
        }
    }
}

function checkAuthenticationStatus() {
    // Check multiple times for OAuth app to load
    let checkCount = 0;
    const maxChecks = 10;
    
    const checkForAuth = () => {
        const userSections = document.querySelectorAll('.user-section');
        const authButtons = document.querySelectorAll('[data-auth-status]');
        const oauthContainers = document.querySelectorAll('#oauth-container');
        
        
        const isAuthenticated = userSections.length > 0;
        
        if (isAuthenticated || checkCount >= maxChecks - 1) {
            handleAuthenticationStatus(isAuthenticated);
        } else {
            checkCount++;
            setTimeout(checkForAuth, 200);
        }
    };
    
    checkForAuth();
}

function handleAuthenticationStatus(isAuthenticated) {
    
    // Always hide loading first
    document.getElementById('authCheck').style.display = 'none';
    
    if (isAuthenticated) {
        // User is authenticated - show Ask AI UI
        document.getElementById('chatForm').style.display = 'block';
        document.getElementById('chatHistory').style.display = 'block';
        
        // Show initial greeting if chat history is empty and AI profile is available
        const chatHistory = document.getElementById('chatHistory');
        if (chatHistory.children.length === 0) {
            if (aiProfileData) {
                showInitialGreeting();
            } else {
                // Wait for AI profile data
                setTimeout(() => {
                    if (aiProfileData) {
                        showInitialGreeting();
                    }
                }, 500);
            }
        }
        
        // Focus on input
        setTimeout(() => {
            document.getElementById('aiQuestion').focus();
        }, 50);
    } else {
        // User not authenticated - show AI introduction directly if profile available
        document.getElementById('chatForm').style.display = 'none';
        document.getElementById('chatHistory').style.display = 'block';
        
        if (aiProfileData) {
            // Show AI introduction directly using available profile data
            showAIIntroduction();
        } else {
            // Fallback to profile loading
            loadAndShowProfiles();
        }
    }
}

// Load and display profiles from ai.syui.log.profile collection
async function loadAndShowProfiles() {
    const chatHistory = document.getElementById('chatHistory');
    chatHistory.innerHTML = '<div class="loading-message">Loading profiles...</div>';
    
    try {
        const response = await fetch(`https://${OAUTH_PDS}/xrpc/com.atproto.repo.listRecords?repo=${ADMIN_HANDLE}&collection=${OAUTH_COLLECTION}&limit=100`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch profiles');
        }
        
        const data = await response.json();
        
        // Filter only profile records and sort
        const profileRecords = (data.records || []).filter(record => record.value.type === 'profile');
        
        const profiles = profileRecords.sort((a, b) => {
            if (a.value.profileType === 'admin' && b.value.profileType !== 'admin') return -1;
            if (a.value.profileType !== 'admin' && b.value.profileType === 'admin') return 1;
            return 0;
        });
        
        // Clear loading message
        chatHistory.innerHTML = '';
        
        // Display profiles using the same format as chat
        profiles.forEach(profile => {
            const profileDiv = document.createElement('div');
            profileDiv.className = 'chat-message ai-message comment-style';
            
            const avatarElement = profile.value.author.avatar 
                ? `<img src="${profile.value.author.avatar}" alt="${profile.value.author.displayName || profile.value.author.handle}" class="profile-avatar">`
                : `<div class="profile-avatar-fallback">${(profile.value.author.displayName || profile.value.author.handle || '?').charAt(0).toUpperCase()}</div>`;
            
            const adminBadge = profile.value.profileType === 'admin' 
                ? '<span class="admin-badge">Admin</span>' 
                : '';
            
            profileDiv.innerHTML = `
                <div class="message-header">
                    <div class="avatar">${avatarElement}</div>
                    <div class="user-info">
                        <div class="display-name">${profile.value.author.displayName || profile.value.author.handle} ${adminBadge}</div>
                        <div class="handle"><a href="https://${OAUTH_PDS}/profile/${profile.value.author.handle}" target="_blank" rel="noopener noreferrer">@${profile.value.author.handle}</a></div>
                    </div>
                </div>
                <div class="message-content">${profile.value.text}</div>
            `;
            chatHistory.appendChild(profileDiv);
        });
        
        if (profiles.length === 0) {
            chatHistory.innerHTML = '<div class="no-profiles">No profiles available</div>';
        }
        
    } catch (error) {
        chatHistory.innerHTML = '<div class="error-message">Failed to load profiles. Please try again later.</div>';
    }
}

function askQuestion() {
    const question = document.getElementById('aiQuestion').value;
    if (!question.trim()) return;
    
    const askButton = document.getElementById('askButton');
    askButton.disabled = true;
    askButton.textContent = 'Posting...';
    
    try {
        // Add user message to chat
        addUserMessage(question);
        
        // Clear input
        document.getElementById('aiQuestion').value = '';
        
        // Show loading
        showLoadingMessage();
        
        // Post question via OAuth app
        window.dispatchEvent(new CustomEvent('postAIQuestion', {
            detail: { question: question }
        }));
        
    } catch (error) {
        showErrorMessage('Sorry, I encountered an error. Please try again.');
    } finally {
        askButton.disabled = false;
        askButton.textContent = 'Ask';
    }
}

function addUserMessage(question) {
    const chatHistory = document.getElementById('chatHistory');
    const userSection = document.querySelector('.user-section');
    
    let userAvatar = '👤';
    let userDisplay = 'You';
    let userHandle = 'user';
    
    if (userSection) {
        const avatarImg = userSection.querySelector('.user-avatar');
        const displayName = userSection.querySelector('.user-display-name');
        const handle = userSection.querySelector('.user-handle');
        
        if (avatarImg && avatarImg.src) {
            userAvatar = `<img src="${avatarImg.src}" alt="${displayName?.textContent || 'User'}" class="profile-avatar">`;
        }
        if (displayName?.textContent) {
            userDisplay = displayName.textContent;
        }
        if (handle?.textContent) {
            userHandle = handle.textContent.replace('@', '');
        }
    }
    
    const questionDiv = document.createElement('div');
    questionDiv.className = 'chat-message user-message comment-style';
    questionDiv.innerHTML = `
        <div class="message-header">
            <div class="avatar">${userAvatar}</div>
            <div class="user-info">
                <div class="display-name">${userDisplay}</div>
                <div class="handle"><a href="https://${OAUTH_PDS}/profile/${userHandle}" target="_blank" rel="noopener noreferrer">@${userHandle}</a></div>
            </div>
        </div>
        <div class="message-content">${question}</div>
    `;
    chatHistory.appendChild(questionDiv);
}

function showLoadingMessage() {
    const chatHistory = document.getElementById('chatHistory');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'ai-loading-simple';
    loadingDiv.innerHTML = `
        <i class="fas fa-robot"></i>
        <span>考えています</span>
        <i class="fas fa-spinner fa-spin"></i>
    `;
    chatHistory.appendChild(loadingDiv);
}

function showErrorMessage(message) {
    const chatHistory = document.getElementById('chatHistory');
    removeLoadingMessage();
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'chat-message error-message comment-style';
    errorDiv.innerHTML = `
        <div class="message-header">
            <div class="avatar">⚠️</div>
            <div class="user-info">
                <div class="display-name">System</div>
                <div class="handle">@system</div>
                <div class="timestamp">${new Date().toLocaleString()}</div>
            </div>
        </div>
        <div class="message-content">${message}</div>
    `;
    chatHistory.appendChild(errorDiv);
}

function removeLoadingMessage() {
    const loadingMsg = document.querySelector('.ai-loading-simple');
    if (loadingMsg) {
        loadingMsg.remove();
    }
}

function showInitialGreeting() {
    if (!aiProfileData) return;

    const chatHistory = document.getElementById('chatHistory');
    const greetingDiv = document.createElement('div');
    greetingDiv.className = 'chat-message ai-message comment-style initial-greeting';
    
    const avatarElement = aiProfileData.avatar 
        ? `<img src="${aiProfileData.avatar}" alt="${aiProfileData.displayName}" class="profile-avatar">`
        : '🤖';
    
    greetingDiv.innerHTML = `
        <div class="message-header">
            <div class="avatar">${avatarElement}</div>
            <div class="user-info">
                <div class="display-name">${aiProfileData.displayName}</div>
                <div class="handle"><a href="https://${OAUTH_PDS}/profile/${aiProfileData.handle}" target="_blank" rel="noopener noreferrer">@${aiProfileData.handle}</a></div>
            </div>
        </div>
        <div class="message-content">Hello! I'm an AI assistant trained on this blog's content. I can answer questions about the articles, provide insights, and help you understand the topics discussed here. What would you like to know?</div>
    `;
    chatHistory.appendChild(greetingDiv);
}

function showAIIntroduction() {
    if (!aiProfileData) return;

    const chatHistory = document.getElementById('chatHistory');
    chatHistory.innerHTML = ''; // Clear any existing content
    
    // AI Introduction message
    const introDiv = document.createElement('div');
    introDiv.className = 'chat-message ai-message comment-style initial-greeting';
    
    const avatarElement = aiProfileData.avatar 
        ? `<img src="${aiProfileData.avatar}" alt="${aiProfileData.displayName}" class="profile-avatar">`
        : '🤖';
    
    introDiv.innerHTML = `
        <div class="message-header">
            <div class="avatar">${avatarElement}</div>
            <div class="user-info">
                <div class="display-name">${aiProfileData.displayName}</div>
                <div class="handle"><a href="https://${OAUTH_PDS}/profile/${aiProfileData.handle}" target="_blank" rel="noopener noreferrer">@${aiProfileData.handle}</a></div>
            </div>
        </div>
        <div class="message-content">Hello! I'm an AI assistant trained on this blog's content. I can answer questions about the articles, provide insights, and help you understand the topics discussed here. What would you like to know?</div>
    `;
    chatHistory.appendChild(introDiv);
    
    // OAuth login message
    const loginDiv = document.createElement('div');
    loginDiv.className = 'chat-message user-message comment-style initial-greeting';
    
    loginDiv.innerHTML = `
        <div class="message-header">
            <div class="avatar">${avatarElement}</div>
            <div class="user-info">
                <div class="display-name">${aiProfileData.displayName}</div>
                <div class="handle"><a href="https://${OAUTH_PDS}/profile/${aiProfileData.handle}" target="_blank" rel="noopener noreferrer">@${aiProfileData.handle}</a></div>
            </div>
        </div>
        <div class="message-content">Please atproto oauth login</div>
    `;
    chatHistory.appendChild(loginDiv);
}

function updateAskAIButton() {
    const button = document.getElementById('askAiButton');
    if (!button) return;
    
    // Only update text, never modify the icon
    if (aiProfileData && aiProfileData.displayName) {
        const textNode = button.childNodes[2] || button.lastChild;
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            textNode.textContent = aiProfileData.displayName;
        }
    }
}

function handleAIResponse(responseData) {
    const chatHistory = document.getElementById('chatHistory');
    removeLoadingMessage();
    
    const aiProfile = responseData.aiProfile;
    if (!aiProfile || !aiProfile.handle || !aiProfile.displayName) {
        return;
    }
    
    const timestamp = new Date(responseData.timestamp || Date.now());
    const avatarElement = aiProfile.avatar 
        ? `<img src="${aiProfile.avatar}" alt="${aiProfile.displayName}" class="profile-avatar">`
        : '🤖';
    
    const answerDiv = document.createElement('div');
    answerDiv.className = 'chat-message ai-message comment-style';
    answerDiv.innerHTML = `
        <div class="message-header">
            <div class="avatar">${avatarElement}</div>
            <div class="user-info">
                <div class="display-name">${aiProfile.displayName}</div>
                <div class="handle"><a href="https://${OAUTH_PDS}/profile/${aiProfile.handle}" target="_blank" rel="noopener noreferrer">@${aiProfile.handle}</a></div>
            </div>
        </div>
        <div class="message-content">${responseData.answer}</div>
    `;
    chatHistory.appendChild(answerDiv);
    
    // Limit chat history
    limitChatHistory();
}

function limitChatHistory() {
    const chatHistory = document.getElementById('chatHistory');
    if (chatHistory.children.length > 10) {
        chatHistory.removeChild(chatHistory.children[0]);
        if (chatHistory.children.length > 0) {
            chatHistory.removeChild(chatHistory.children[0]);
        }
    }
}

// Event listeners setup
function setupAskAIEventListeners() {
    // Listen for AI profile updates from OAuth app
    window.addEventListener('aiProfileLoaded', function(event) {
        aiProfileData = event.detail;
        updateAskAIButton();
    });
    
    // Listen for AI responses
    window.addEventListener('aiResponseReceived', function(event) {
        handleAIResponse(event.detail);
    });
    
    // Listen for OAuth callback completion from iframe
    window.addEventListener('message', function(event) {
        if (event.data.type === 'oauth_success') {
            
            // Close any OAuth popups/iframes
            const oauthFrame = document.getElementById('oauth-frame');
            if (oauthFrame) {
                oauthFrame.remove();
            }
            
            // Reload the page to refresh OAuth app state
            setTimeout(() => {
                window.location.reload();
            }, 500);
        }
    });
    
    // Track IME composition state
    let isComposing = false;
    const aiQuestionInput = document.getElementById('aiQuestion');
    
    if (aiQuestionInput) {
        aiQuestionInput.addEventListener('compositionstart', function() {
            isComposing = true;
        });
        
        aiQuestionInput.addEventListener('compositionend', function() {
            isComposing = false;
        });
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const panel = document.getElementById('askAiPanel');
            if (panel) {
                panel.style.display = 'none';
            }
        }
        
        // Enter key to send message (only when not composing Japanese input)
        if (e.key === 'Enter' && e.target.id === 'aiQuestion' && !e.shiftKey && !isComposing) {
            e.preventDefault();
            askQuestion();
        }
    });
}

// Initialize Ask AI when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    setupAskAIEventListeners();
    
    // Also listen for OAuth app load completion
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
                // Check if user-section was added/removed
                const userSectionAdded = Array.from(mutation.addedNodes).some(node => 
                    node.nodeType === Node.ELEMENT_NODE && 
                    (node.classList?.contains('user-section') || node.querySelector?.('.user-section'))
                );
                const userSectionRemoved = Array.from(mutation.removedNodes).some(node => 
                    node.nodeType === Node.ELEMENT_NODE && 
                    (node.classList?.contains('user-section') || node.querySelector?.('.user-section'))
                );
                
                if (userSectionAdded || userSectionRemoved) {
                    // Update Ask AI panel if it's visible
                    const panel = document.getElementById('askAiPanel');
                    if (panel && panel.style.display !== 'none') {
                        checkAuthenticationStatus();
                    }
                }
            }
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
});

// Global functions for onclick handlers
window.toggleAskAI = toggleAskAI;
window.askQuestion = askQuestion;
