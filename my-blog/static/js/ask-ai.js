/**
 * Ask AI functionality - Based on original working implementation
 */

// Global variables for AI functionality
let aiProfileData = null;

// Original functions from working implementation
function toggleAskAI() {
    const panel = document.getElementById('askAiPanel');
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
    
    if (!isVisible) {
        checkAuthenticationStatus();
    }
}

function checkAuthenticationStatus() {
    const userSections = document.querySelectorAll('.user-section');
    const isAuthenticated = userSections.length > 0;
    
    if (isAuthenticated) {
        // User is authenticated - show Ask AI UI
        document.getElementById('authCheck').style.display = 'none';
        document.getElementById('chatForm').style.display = 'block';
        document.getElementById('chatHistory').style.display = 'block';
        
        // Show initial greeting if chat history is empty
        const chatHistory = document.getElementById('chatHistory');
        if (chatHistory.children.length === 0) {
            showInitialGreeting();
        }
        
        // Focus on input
        setTimeout(() => {
            document.getElementById('aiQuestion').focus();
        }, 50);
    } else {
        // User not authenticated - show auth message
        document.getElementById('authCheck').style.display = 'block';
        document.getElementById('chatForm').style.display = 'none';
        document.getElementById('chatHistory').style.display = 'none';
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
        console.error('Failed to ask question:', error);
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
                <div class="handle">@${userHandle}</div>
                <div class="timestamp">${new Date().toLocaleString()}</div>
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
                <div class="handle">@${aiProfileData.handle}</div>
                <div class="timestamp">${new Date().toLocaleString()}</div>
            </div>
        </div>
        <div class="message-content">
            Hello! I'm an AI assistant trained on this blog's content. I can answer questions about the articles, provide insights, and help you understand the topics discussed here. What would you like to know?
        </div>
    `;
    chatHistory.appendChild(greetingDiv);
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
        console.error('AI profile data is missing');
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
                <div class="handle">@${aiProfile.handle}</div>
                <div class="timestamp">${timestamp.toLocaleString()}</div>
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
        console.log('AI profile loaded:', aiProfileData);
        updateAskAIButton();
    });
    
    // Listen for AI responses
    window.addEventListener('aiResponseReceived', function(event) {
        handleAIResponse(event.detail);
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const panel = document.getElementById('askAiPanel');
            if (panel) {
                panel.style.display = 'none';
            }
        }
        
        // Enter key to send message (only when not composing Japanese input)
        if (e.key === 'Enter' && e.target.id === 'aiQuestion' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            askQuestion();
        }
    });
}

// Initialize Ask AI when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    setupAskAIEventListeners();
    console.log('Ask AI initialized successfully');
});

// Global functions for onclick handlers
window.toggleAskAI = toggleAskAI;
window.askQuestion = askQuestion;
