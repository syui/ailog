/**
 * Ask AI functionality - Pure JavaScript, no jQuery dependency
 */
class AskAI {
    constructor() {
        this.isReady = false;
        this.aiProfile = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthOnLoad();
    }

    setupEventListeners() {
        // Listen for AI ready signal
        window.addEventListener('aiChatReady', () => {
            this.isReady = true;
            console.log('AI Chat is ready');
        });

        // Listen for AI profile updates
        window.addEventListener('aiProfileLoaded', (event) => {
            this.aiProfile = event.detail;
            console.log('AI profile loaded:', this.aiProfile);
            this.updateButton();
        });

        // Listen for AI responses
        window.addEventListener('aiResponseReceived', (event) => {
            this.handleAIResponse(event.detail);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hide();
            }
            if (e.key === 'Enter' && e.target.id === 'aiQuestion' && !e.shiftKey) {
                e.preventDefault();
                this.ask();
            }
        });

        // Monitor authentication changes
        this.observeAuth();
    }

    toggle() {
        const panel = document.getElementById('askAiPanel');
        const isVisible = panel.style.display !== 'none';
        
        if (isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    show() {
        const panel = document.getElementById('askAiPanel');
        panel.style.display = 'block';
        this.checkAuth();
    }

    hide() {
        const panel = document.getElementById('askAiPanel');
        panel.style.display = 'none';
    }

    checkAuth() {
        const userSections = document.querySelectorAll('.user-section');
        const isAuthenticated = userSections.length > 0;
        
        const authCheck = document.getElementById('authCheck');
        const chatForm = document.getElementById('chatForm');
        const chatHistory = document.getElementById('chatHistory');
        
        if (isAuthenticated) {
            authCheck.style.display = 'none';
            chatForm.style.display = 'block';
            chatHistory.style.display = 'block';
            
            if (chatHistory.children.length === 0) {
                this.showGreeting();
            }
            
            setTimeout(() => {
                document.getElementById('aiQuestion').focus();
            }, 50);
        } else {
            authCheck.style.display = 'block';
            chatForm.style.display = 'none';
            chatHistory.style.display = 'none';
        }
    }

    checkAuthOnLoad() {
        setTimeout(() => {
            this.checkAuth();
        }, 500);
    }

    observeAuth() {
        const observer = new MutationObserver(() => {
            const userSections = document.querySelectorAll('.user-section');
            if (userSections.length > 0) {
                this.checkAuth();
                observer.disconnect();
            }
        });
        
        observer.observe(document.body, { 
            childList: true, 
            subtree: true 
        });
    }

    updateButton() {
        const button = document.getElementById('askAiButton');
        if (this.aiProfile && this.aiProfile.displayName) {
            const textNode = button.childNodes[2];
            if (textNode) {
                textNode.textContent = this.aiProfile.displayName;
            }
        }
    }

    showGreeting() {
        if (!this.aiProfile) return;

        const chatHistory = document.getElementById('chatHistory');
        const greetingDiv = document.createElement('div');
        greetingDiv.className = 'chat-message ai-message comment-style initial-greeting';
        
        const avatarElement = this.aiProfile.avatar 
            ? `<img src="${this.aiProfile.avatar}" alt="${this.aiProfile.displayName}" class="profile-avatar">`
            : '🤖';
        
        greetingDiv.innerHTML = `
            <div class="message-header">
                <div class="avatar">${avatarElement}</div>
                <div class="user-info">
                    <div class="display-name">${this.aiProfile.displayName}</div>
                    <div class="handle">@${this.aiProfile.handle}</div>
                    <div class="timestamp">${new Date().toLocaleString()}</div>
                </div>
            </div>
            <div class="message-content">
                Hello! I'm an AI assistant trained on this blog's content. I can answer questions about the articles, provide insights, and help you understand the topics discussed here. What would you like to know?
            </div>
        `;
        chatHistory.appendChild(greetingDiv);
    }

    async ask() {
        const question = document.getElementById('aiQuestion').value;
        const chatHistory = document.getElementById('chatHistory');
        const askButton = document.getElementById('askButton');
        
        if (!question.trim()) return;
        
        // Wait for AI to be ready
        if (!this.isReady) {
            await this.waitForReady();
        }
        
        // Disable button
        askButton.disabled = true;
        askButton.textContent = 'Posting...';
        
        try {
            // Add user message
            this.addUserMessage(question);
            
            // Clear input
            document.getElementById('aiQuestion').value = '';
            
            // Show loading
            this.showLoading();
            
            // Post question
            const event = new CustomEvent('postAIQuestion', {
                detail: { question: question }
            });
            window.dispatchEvent(event);
            
        } catch (error) {
            this.showError('Sorry, I encountered an error. Please try again.');
        } finally {
            askButton.disabled = false;
            askButton.textContent = 'Ask';
        }
    }

    waitForReady() {
        return new Promise(resolve => {
            const checkReady = setInterval(() => {
                if (this.isReady) {
                    clearInterval(checkReady);
                    resolve();
                }
            }, 100);
        });
    }

    addUserMessage(question) {
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

    showLoading() {
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

    showError(message) {
        const chatHistory = document.getElementById('chatHistory');
        this.removeLoading();
        
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

    removeLoading() {
        const loadingMsg = document.querySelector('.ai-loading-simple');
        if (loadingMsg) {
            loadingMsg.remove();
        }
    }

    handleAIResponse(responseData) {
        const chatHistory = document.getElementById('chatHistory');
        this.removeLoading();
        
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
        this.limitChatHistory();
    }

    limitChatHistory() {
        const chatHistory = document.getElementById('chatHistory');
        if (chatHistory.children.length > 10) {
            chatHistory.removeChild(chatHistory.children[0]);
            if (chatHistory.children.length > 0) {
                chatHistory.removeChild(chatHistory.children[0]);
            }
        }
    }
}

// Initialize Ask AI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.askAIInstance = new AskAI();
        console.log('Ask AI initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Ask AI:', error);
    }
});

// Global function for onclick
window.AskAI = {
    toggle: function() {
        console.log('AskAI.toggle called');
        if (window.askAIInstance) {
            window.askAIInstance.toggle();
        } else {
            console.error('Ask AI instance not available');
        }
    },
    ask: function() {
        console.log('AskAI.ask called');
        if (window.askAIInstance) {
            window.askAIInstance.ask();
        } else {
            console.error('Ask AI instance not available');
        }
    }
};