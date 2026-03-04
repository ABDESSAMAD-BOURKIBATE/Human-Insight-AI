/**
 * Human Insight AI — Frontend Application
 * Handles navigation, chat with SSE streaming, translation, and analytics.
 */

const API_BASE = window.location.origin;
let sessionId = crypto.randomUUID();
let isLoading = false;
let currentAgentId = 'default';
let documentContext = null;
let isRecording = false;
let speechRecognition = null;
let abortController = null;

// Analytics counters
let stats = { total: 0, positive: 0, neutral: 0, negative: 0 };

// ─── DOM Elements ──────────────────────────────────────────────
const chatArea = document.getElementById('chatArea');
const welcomeScreen = document.getElementById('welcomeScreen');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const statusDot = document.getElementById('statusDot');
const clearBtn = document.getElementById('clearBtn');
const themeBtn = document.getElementById('themeBtn');
const sidebarElement = document.getElementById('sidebar');
const sidebarToggleBtn = document.getElementById('sidebarToggle');

// ─── Initialize ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initSidebar();
    checkHealth();
    setupEventListeners();
    setupNavigation();
    setupLanguageSwitcher();
    initLanguage();
    initAgentMenu();
    loadAgents();
    setupDocumentUpload();
    setupSpeechRecognition();
    messageInput.focus();
    lucide.createIcons();
});

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if (themeBtn) themeBtn.querySelector('span').textContent = 'تبديل المظهر';
    }
}

function initSidebar() {
    const isSidebarCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
    if (isSidebarCollapsed && sidebarElement) {
        sidebarElement.classList.add('collapsed');
    }
}

function setupEventListeners() {
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            lucide.createIcons();
        });
    }

    if (sidebarToggleBtn && sidebarElement) {
        sidebarToggleBtn.addEventListener('click', () => {
            sidebarElement.classList.toggle('collapsed');
            const isCollapsed = sidebarElement.classList.contains('collapsed');
            localStorage.setItem('sidebar_collapsed', isCollapsed);
        });
    }

    // ─── Mobile Menu Toggle ─────────────────────────────────────
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenuIcon = document.getElementById('mobileMenuIcon');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    function openMobileSidebar() {
        if (sidebarElement) sidebarElement.classList.add('mobile-open');
        if (sidebarOverlay) sidebarOverlay.classList.add('active');
        if (mobileMenuIcon) {
            mobileMenuIcon.className = 'ph-bold ph-x';
        }
    }

    function closeMobileSidebar() {
        if (sidebarElement) sidebarElement.classList.remove('mobile-open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
        if (mobileMenuIcon) {
            mobileMenuIcon.className = 'ph-bold ph-list';
        }
    }

    // Expose for use in navigation
    window._closeMobileSidebar = closeMobileSidebar;

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            const isOpen = sidebarElement && sidebarElement.classList.contains('mobile-open');
            if (isOpen) {
                closeMobileSidebar();
            } else {
                openMobileSidebar();
            }
        });
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeMobileSidebar);
    }

    sendBtn.addEventListener('click', sendMessage);

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    messageInput.addEventListener('input', autoResize);

    clearBtn.addEventListener('click', clearChat);

    // Export buttons
    const exportChatBtn = document.getElementById('exportChatBtn');
    if (exportChatBtn) exportChatBtn.addEventListener('click', exportChatPDF);
    const exportAnalysisPDFBtn = document.getElementById('exportAnalysisPDFBtn');
    if (exportAnalysisPDFBtn) exportAnalysisPDFBtn.addEventListener('click', exportAnalysisPDF);
    const exportAnalysisCSVBtn = document.getElementById('exportAnalysisCSVBtn');
    if (exportAnalysisCSVBtn) exportAnalysisCSVBtn.addEventListener('click', () => exportCSV('analysis'));
    const exportTableCSVBtn = document.getElementById('exportTableCSVBtn');
    if (exportTableCSVBtn) exportTableCSVBtn.addEventListener('click', () => exportCSV('table'));

    // Suggestion chips
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            messageInput.value = chip.dataset.message;
            autoResize();
            messageInput.focus();
        });
    });

    // Landing Page
    const landingPage = document.getElementById('landing-page');
    const startBtn = document.getElementById('start-btn');
    if (landingPage && startBtn) {
        startBtn.addEventListener('click', () => {
            landingPage.classList.add('hidden');
            setTimeout(() => {
                landingPage.style.display = 'none';
            }, 800);
        });

        // Generate particles for landing page
        const particlesContainer = document.getElementById('landingParticles');
        if (particlesContainer) {
            const colors = [
                'rgba(124, 58, 237, 0.4)',
                'rgba(59, 130, 246, 0.3)',
                'rgba(6, 182, 212, 0.3)',
                'rgba(167, 139, 250, 0.35)',
                'rgba(99, 102, 241, 0.3)',
            ];
            for (let i = 0; i < 25; i++) {
                const particle = document.createElement('div');
                particle.className = 'landing-particle';
                particle.style.setProperty('--size', Math.random() * 4 + 2 + 'px');
                particle.style.setProperty('--color', colors[Math.floor(Math.random() * colors.length)]);
                particle.style.setProperty('--duration', Math.random() * 10 + 8 + 's');
                particle.style.setProperty('--delay', Math.random() * 8 + 's');
                particle.style.left = Math.random() * 100 + '%';
                particlesContainer.appendChild(particle);
            }
        }
    }
}

// ─── Panel Navigation ──────────────────────────────────────────
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-panel]');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const panelId = item.dataset.panel;
            navigateToPanel(panelId);
            // Close mobile sidebar after navigation
            if (window._closeMobileSidebar) window._closeMobileSidebar();
        });
    });
}

function navigateToPanel(panelId) {
    // Update nav active state
    document.querySelectorAll('.nav-item[data-panel]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.panel === panelId);
    });

    // Switch panel
    document.querySelectorAll('.panel').forEach(panel => {
        panel.classList.remove('active');
    });

    const targetPanel = document.getElementById(`panel-${panelId}`);
    if (targetPanel) {
        targetPanel.classList.add('active');
    }

    // Focus input if chat
    if (panelId === 'chat' && messageInput) {
        setTimeout(() => messageInput.focus(), 100);
    }

    // Update analytics when switching to analysis panel
    if (panelId === 'analysis') {
        updateAnalytics();
    }

    // Load sessions when switching to sessions panel
    if (panelId === 'sessions') {
        loadSessions();
    }

    lucide.createIcons();
}

// Global helper for HTML onclick
window.navigateToPanel = navigateToPanel;

// Switch to chat and pre-fill a message
function switchToChat(message) {
    navigateToPanel('chat');
    if (welcomeScreen) welcomeScreen.style.display = 'none';
    messageInput.value = message;
    autoResize();
    setTimeout(() => sendMessage(), 200);
}

window.switchToChat = switchToChat;

function autoResize() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

// ─── Health Check ──────────────────────────────────────────────
async function checkHealth() {
    try {
        const res = await fetch(`${API_BASE}/api/health`);
        const data = await res.json();
        if (data.status === 'ok' && data.model_loaded) {
            statusDot.classList.remove('offline');
            statusText.textContent = 'النظام متصل — النموذج جاهز';
        } else {
            statusDot.classList.add('offline');
            statusText.textContent = 'النموذج غير محمّل';
        }
    } catch {
        statusDot.classList.add('offline');
        statusText.textContent = 'خطأ في الاتصال';
    }
}

// ─── Send Message (Streaming SSE) ──────────────────────────────
async function sendMessage() {
    if (isLoading) {
        if (abortController) {
            abortController.abort();
        }
        return;
    }

    const message = messageInput.value.trim();
    if (!message) return;

    const isArabic = /[\u0600-\u06FF]/.test(message);

    if (welcomeScreen) welcomeScreen.style.display = 'none';

    const userMsgDiv = appendMessage('user', message, null, null, isArabic);

    messageInput.value = '';
    messageInput.style.height = 'auto';

    isLoading = true;
    abortController = new AbortController();

    // Change send button to 'stop' button
    sendBtn.innerHTML = '<i class="ph-bold ph-stop"></i>';
    sendBtn.classList.add('btn-stop');
    sendBtn.title = 'إيقاف التوليد';

    typingIndicator.classList.add('active');
    scrollToBottom();

    const { msgDiv, contentDiv } = createStreamingMessage();
    let streamedText = '';

    try {
        const res = await fetch(`${API_BASE}/api/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                session_id: sessionId,
                agent_id: currentAgentId,
                document_context: documentContext,
            }),
            signal: abortController.signal
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const jsonStr = line.slice(6);

                try {
                    const event = JSON.parse(jsonStr);

                    if (event.type === 'token') {
                        streamedText += event.content;
                        contentDiv.innerHTML = renderMarkdown(streamedText);
                        scrollToBottom();
                    }

                    if (event.type === 'done') {
                        const responseArabic = /[\u0600-\u06FF]/.test(event.response || '');
                        if (responseArabic) {
                            contentDiv.dir = 'rtl';
                            contentDiv.style.textAlign = 'right';
                        }
                        contentDiv.innerHTML = renderMarkdown(event.response);
                        addAnalysisBadges(msgDiv, event.intent, event.emotion);

                        // Update stats
                        stats.total++;
                        const pol = (event.emotion?.polarity || 'neutral').toLowerCase();
                        if (pol === 'positive') stats.positive++;
                        else if (pol === 'negative') stats.negative++;
                        else stats.neutral++;

                        // Emotion pulse animation on avatar
                        triggerEmotionPulse(msgDiv, event.emotion);

                        // Add TTS speaker button
                        addSpeakerButton(msgDiv, event.response);

                        lucide.createIcons();
                        scrollToBottom();
                    }

                    if (event.type === 'error') {
                        contentDiv.innerHTML = `⚠️ خطأ: ${event.message}`;
                    }
                } catch (parseErr) { /* skip */ }
            }
        }

    } catch (err) {
        if (err.name === 'AbortError') {
            // Remove messages from chat
            if (userMsgDiv) userMsgDiv.remove();
            if (msgDiv) msgDiv.remove();

            // Restore user input
            messageInput.value = message;
            autoResize();

            // Show welcome screen if chat is empty
            if (chatArea.querySelectorAll('.message').length === 0 && welcomeScreen) {
                welcomeScreen.style.display = 'flex';
            }
        } else {
            console.error('Chat error:', err);
            contentDiv.innerHTML = `⚠️ خطأ: ${err.message}. تأكد أن السيرفر يعمل.`;
        }
    } finally {
        isLoading = false;
        abortController = null;

        sendBtn.innerHTML = '<i class="ph-bold ph-paper-plane-tilt"></i>';
        sendBtn.classList.remove('btn-stop');
        sendBtn.title = 'Send message';

        typingIndicator.classList.remove('active');
        scrollToBottom();
    }
}

function createStreamingMessage() {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message assistant';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar assistant-avatar';
    avatar.innerHTML = '<i data-lucide="brain" width="20" height="20"></i>';

    const body = document.createElement('div');
    body.className = 'message-body';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = '<span class="streaming-cursor">▊</span>';

    body.appendChild(contentDiv);
    msgDiv.appendChild(avatar);
    msgDiv.appendChild(body);

    typingIndicator.classList.remove('active');

    chatArea.appendChild(msgDiv);
    lucide.createIcons();
    scrollToBottom();

    return { msgDiv, contentDiv, body };
}

function addAnalysisBadges(msgDiv, intent, emotion) {
    if (!intent && !emotion) return;

    const body = msgDiv.querySelector('.message-body');
    const badges = document.createElement('div');
    badges.className = 'analysis-badges';

    if (intent) {
        let iconName = 'target';
        const label = (intent.label_en || '').toLowerCase();
        if (label.includes('greeting')) iconName = 'hand';
        if (label.includes('question')) iconName = 'help-circle';
        if (label.includes('task') || label.includes('request')) iconName = 'check-square';

        badges.appendChild(createBadge(
            'intent',
            `<i data-lucide="${iconName}" width="12" height="12"></i> ${intent.label_en || intent.category || 'Unknown'}`,
            `Confidence: ${Math.round((intent.confidence || 0) * 100)}%`
        ));
    }

    if (emotion) {
        let emoIcon = 'smile';
        const polarity = (emotion.polarity || 'neutral').toLowerCase();
        if (polarity === 'negative') emoIcon = 'frown';
        if (polarity === 'neutral') emoIcon = 'meh';

        const emotionBadge = createBadge(
            'emotion',
            `<i data-lucide="${emoIcon}" width="12" height="12"></i> ${emotion.label_en || emotion.state || 'Unknown'}`,
            `${emotion.polarity || 'neutral'} · ${emotion.intensity || 'low'}`
        );
        const emoColor = emotion.color || '#6B7280';
        emotionBadge.style.background = hexToRgba(emoColor, 0.12);
        emotionBadge.style.borderColor = hexToRgba(emoColor, 0.3);
        emotionBadge.style.color = emoColor;
        badges.appendChild(emotionBadge);

        const polarityColor = emotion.polarity_color || '#6B7280';
        const polarityBadge = createBadge(
            'polarity',
            `<i data-lucide="bar-chart-2" width="12" height="12"></i> ${emotion.polarity || 'neutral'}`,
            ''
        );
        polarityBadge.style.background = hexToRgba(polarityColor, 0.12);
        polarityBadge.style.borderColor = hexToRgba(polarityColor, 0.3);
        polarityBadge.style.color = polarityColor;
        badges.appendChild(polarityBadge);
    }

    body.appendChild(badges);
}

function appendMessage(role, content, intent, emotion, isArabic) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = `message-avatar ${role === 'assistant' ? 'assistant-avatar' : 'user-avatar'}`;
    avatar.innerHTML = role === 'user' ? '<i data-lucide="user" width="20" height="20"></i>' : '<i data-lucide="brain" width="20" height="20"></i>';

    const body = document.createElement('div');
    body.className = 'message-body';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    if (isArabic) {
        contentDiv.dir = 'rtl';
        contentDiv.style.textAlign = 'right';
    }

    contentDiv.innerHTML = renderMarkdown(content);
    body.appendChild(contentDiv);

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(body);
    chatArea.appendChild(msgDiv);

    lucide.createIcons();
    scrollToBottom();

    return msgDiv;
}

function createBadge(type, textHTML, title) {
    const badge = document.createElement('span');
    badge.className = `badge badge-${type}`;
    badge.innerHTML = textHTML;
    if (title) badge.title = title;
    return badge;
}

// ─── Translation ───────────────────────────────────────────────
function setupTranslation() {
    const translateBtn = document.getElementById('translateBtn');
    const swapBtn = document.getElementById('swapLangsBtn');

    if (translateBtn) {
        translateBtn.addEventListener('click', async () => {
            const sourceText = document.getElementById('sourceText').value.trim();
            if (!sourceText) return;

            const sourceLang = document.getElementById('sourceLang').value;
            const targetLang = document.getElementById('targetLang').value;

            const langNames = { ar: 'Arabic', en: 'English', fr: 'French' };
            const prompt = `Translate the following text from ${langNames[sourceLang]} to ${langNames[targetLang]}. ONLY output the translation, nothing else:\n\n"${sourceText}"`;

            const outputEl = document.getElementById('translatedText');
            outputEl.textContent = 'جاري الترجمة...';
            outputEl.style.fontStyle = 'italic';

            try {
                const res = await fetch(`${API_BASE}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: prompt, session_id: 'translate-' + Date.now() }),
                });

                if (!res.ok) throw new Error('Translation failed');
                const data = await res.json();

                outputEl.textContent = data.response || 'لم تتم الترجمة';
                outputEl.style.fontStyle = 'normal';

                if (targetLang === 'ar') {
                    outputEl.dir = 'rtl';
                    outputEl.style.textAlign = 'right';
                } else {
                    outputEl.dir = 'ltr';
                    outputEl.style.textAlign = 'left';
                }
            } catch (err) {
                outputEl.textContent = '⚠️ خطأ في الترجمة: ' + err.message;
                outputEl.style.fontStyle = 'normal';
            }
        });
    }

    if (swapBtn) {
        swapBtn.addEventListener('click', () => {
            const sourceLang = document.getElementById('sourceLang');
            const targetLang = document.getElementById('targetLang');
            const sourceText = document.getElementById('sourceText');
            const translatedText = document.getElementById('translatedText');

            const tempLang = sourceLang.value;
            sourceLang.value = targetLang.value;
            targetLang.value = tempLang;

            const tempText = sourceText.value;
            sourceText.value = translatedText.textContent !== 'الترجمة ستظهر هنا...' ? translatedText.textContent : '';
            translatedText.textContent = tempText || 'الترجمة ستظهر هنا...';
        });
    }
}

// ─── Analytics Update ──────────────────────────────────────────
function updateAnalytics() {
    const el = (id) => document.getElementById(id);

    el('totalMessages').textContent = stats.total;
    el('positiveCount').textContent = stats.positive;
    el('neutralCount').textContent = stats.neutral;
    el('negativeCount').textContent = stats.negative;

    const total = stats.total || 1;
    const posPercent = Math.round((stats.positive / total) * 100);
    const neuPercent = Math.round((stats.neutral / total) * 100);
    const negPercent = Math.round((stats.negative / total) * 100);

    el('barPositive').style.width = posPercent + '%';
    el('barNeutral').style.width = neuPercent + '%';
    el('barNegative').style.width = negPercent + '%';

    el('barPositiveVal').textContent = posPercent + '%';
    el('barNeutralVal').textContent = neuPercent + '%';
    el('barNegativeVal').textContent = negPercent + '%';
}

// ─── Markdown Rendering ───────────────────────────────────────
function renderMarkdown(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code style="background:rgba(124,58,237,0.15);padding:2px 6px;border-radius:4px;font-family:var(--font-mono);font-size:0.85em;">$1</code>')
        .replace(/\n/g, '<br>');
}

// ─── Utils ─────────────────────────────────────────────────────
function scrollToBottom() {
    requestAnimationFrame(() => {
        chatArea.scrollTop = chatArea.scrollHeight;
    });
}

function hexToRgba(hex, alpha) {
    if (!hex || !hex.startsWith('#')) return `rgba(148, 163, 184, ${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Emotion Pulse Animation ───────────────────────────────────
function triggerEmotionPulse(msgDiv, emotion) {
    if (!emotion) return;
    const avatar = msgDiv.querySelector('.message-avatar');
    if (!avatar) return;

    const polarity = (emotion.polarity || 'neutral').toLowerCase();
    let pulseColor;
    if (polarity === 'positive') pulseColor = emotion.color || '#10b981';
    else if (polarity === 'negative') pulseColor = emotion.color || '#ef4444';
    else pulseColor = emotion.color || '#3b82f6';

    avatar.style.setProperty('--emotion-color', pulseColor);
    avatar.classList.add('emotion-pulse');

    // Remove animation class after it completes (3 pulses × 0.8s = 2.4s)
    setTimeout(() => {
        avatar.classList.remove('emotion-pulse');
    }, 2500);
}

// ─── Export Functions ──────────────────────────────────────────
function exportChatPDF() {
    const messages = chatArea.querySelectorAll('.message');
    if (messages.length === 0) return;

    const printWindow = window.open('', '_blank');
    let chatHTML = '';
    messages.forEach(msg => {
        const role = msg.classList.contains('user') ? '👤 User' : '🤖 AI';
        const content = msg.querySelector('.message-content');
        const badges = msg.querySelector('.analysis-badges');
        if (content) {
            chatHTML += `<div style="margin-bottom:18px;padding:14px 18px;border-radius:12px;background:${msg.classList.contains('user') ? '#f0ecff' : '#f8f9fa'};border:1px solid #e5e7eb;">`;
            chatHTML += `<div style="font-weight:700;color:#7c3aed;margin-bottom:6px;font-size:13px;">${role}</div>`;
            chatHTML += `<div style="font-size:14px;line-height:1.7;color:#1a1a2e;">${content.innerHTML}</div>`;
            if (badges) {
                chatHTML += `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">`;
                badges.querySelectorAll('.badge').forEach(b => {
                    chatHTML += `<span style="font-size:11px;padding:3px 10px;border-radius:20px;background:#f3f0ff;color:#7c3aed;border:1px solid #e0d9ff;">${b.textContent}</span>`;
                });
                chatHTML += `</div>`;
            }
            chatHTML += `</div>`;
        }
    });

    printWindow.document.write(`
        <!DOCTYPE html><html><head><title>Human Insight AI — Chat Export</title>
        <style>body{font-family:'Segoe UI',Inter,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#1a1a2e;}
        h1{text-align:center;color:#7c3aed;font-size:22px;margin-bottom:8px;}
        .date{text-align:center;color:#64748b;font-size:13px;margin-bottom:30px;}
        @media print{body{margin:20px;}}</style>
        </head><body>
        <h1>Human Insight AI</h1>
        <div class="date">${new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        ${chatHTML}
        </body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 300);
}

function exportAnalysisPDF() {
    const printWindow = window.open('', '_blank');
    const total = stats.total || 0;
    const posP = stats.total ? Math.round((stats.positive / stats.total) * 100) : 0;
    const neuP = stats.total ? Math.round((stats.neutral / stats.total) * 100) : 0;
    const negP = stats.total ? Math.round((stats.negative / stats.total) * 100) : 0;

    printWindow.document.write(`
        <!DOCTYPE html><html><head><title>Human Insight AI — Analysis Report</title>
        <style>body{font-family:'Segoe UI',Inter,sans-serif;max-width:650px;margin:40px auto;padding:20px;color:#1a1a2e;}
        h1{text-align:center;color:#7c3aed;font-size:22px;margin-bottom:4px;}
        .subtitle{text-align:center;color:#64748b;font-size:13px;margin-bottom:30px;}
        .stats{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:30px;}
        .stat{padding:18px;border-radius:12px;border:1px solid #e5e7eb;background:#f8f9fa;text-align:center;}
        .stat .val{font-size:28px;font-weight:700;color:#7c3aed;}
        .stat .lbl{font-size:12px;color:#64748b;margin-top:4px;}
        .bar-group{margin-top:20px;}
        .bar-item{margin-bottom:14px;}
        .bar-label{font-size:13px;color:#4a4a68;margin-bottom:4px;display:flex;justify-content:space-between;}
        .bar-track{height:20px;background:#f1f5f9;border-radius:10px;overflow:hidden;}
        .bar-fill{height:100%;border-radius:10px;}
        .pos{background:linear-gradient(90deg,#10b981,#34d399);}
        .neu{background:linear-gradient(90deg,#f59e0b,#fbbf24);}
        .neg{background:linear-gradient(90deg,#ef4444,#f87171);}
        @media print{body{margin:20px;}}</style>
        </head><body>
        <h1>Human Insight AI</h1>
        <div class="subtitle">Emotion Analysis Report — ${new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        <div class="stats">
            <div class="stat"><div class="val">${total}</div><div class="lbl">Total Messages</div></div>
            <div class="stat"><div class="val" style="color:#10b981">${stats.positive}</div><div class="lbl">Positive</div></div>
            <div class="stat"><div class="val" style="color:#f59e0b">${stats.neutral}</div><div class="lbl">Neutral</div></div>
            <div class="stat"><div class="val" style="color:#ef4444">${stats.negative}</div><div class="lbl">Negative</div></div>
        </div>
        <div class="bar-group">
            <div class="bar-item"><div class="bar-label"><span>Positive</span><span>${posP}%</span></div><div class="bar-track"><div class="bar-fill pos" style="width:${posP}%"></div></div></div>
            <div class="bar-item"><div class="bar-label"><span>Neutral</span><span>${neuP}%</span></div><div class="bar-track"><div class="bar-fill neu" style="width:${neuP}%"></div></div></div>
            <div class="bar-item"><div class="bar-label"><span>Negative</span><span>${negP}%</span></div><div class="bar-track"><div class="bar-fill neg" style="width:${negP}%"></div></div></div>
        </div>
        </body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 300);
}

function exportCSV(type) {
    let csvContent = '';
    let filename = '';

    if (type === 'table') {
        const table = document.querySelector('.data-table');
        if (!table) return;
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('th, td');
            const rowData = [];
            cells.forEach(cell => {
                let text = cell.textContent.trim().replace(/"/g, '""');
                rowData.push(`"${text}"`);
            });
            csvContent += rowData.join(',') + '\n';
        });
        filename = 'human_insight_ai_table.csv';
    } else if (type === 'analysis') {
        csvContent = '"Metric","Value","Percentage"\n';
        const total = stats.total || 1;
        csvContent += `"Total Messages","${stats.total}","100%"\n`;
        csvContent += `"Positive","${stats.positive}","${Math.round((stats.positive / total) * 100)}%"\n`;
        csvContent += `"Neutral","${stats.neutral}","${Math.round((stats.neutral / total) * 100)}%"\n`;
        csvContent += `"Negative","${stats.negative}","${Math.round((stats.negative / total) * 100)}%"\n`;
        filename = 'human_insight_ai_analysis.csv';
    }

    // BOM for Excel Arabic support
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

// ─── Clear Chat ────────────────────────────────────────────────
async function clearChat() {
    try {
        await fetch(`${API_BASE}/api/memory/${sessionId}`, { method: 'DELETE' });
    } catch { /* ignore */ }

    sessionId = crypto.randomUUID();
    stats = { total: 0, positive: 0, neutral: 0, negative: 0 };
    documentContext = null;

    const docBar = document.getElementById('documentContextBar');
    if (docBar) docBar.style.display = 'none';

    chatArea.innerHTML = '';

    if (welcomeScreen) {
        welcomeScreen.style.display = 'flex';
        chatArea.appendChild(welcomeScreen);
    }
}

// ─── AI Agents System ──────────────────────────────────────────
function initAgentMenu() {
    const agentMenuBtn = document.getElementById('agentMenuBtn');
    const agentDropdownMenu = document.getElementById('agentDropdownMenu');

    if (agentMenuBtn && agentDropdownMenu) {
        agentMenuBtn.addEventListener('click', (e) => {
            agentDropdownMenu.classList.toggle('show');
            e.stopPropagation();
        });

        document.addEventListener('click', (e) => {
            if (!agentDropdownMenu.contains(e.target) && e.target !== agentMenuBtn) {
                agentDropdownMenu.classList.remove('show');
            }
        });
    }
}

async function loadAgents() {
    try {
        const res = await fetch(`${API_BASE}/api/agents`);
        const data = await res.json();
        const container = document.getElementById('agentCards');
        if (!container || !data.agents) return;

        container.innerHTML = '';
        data.agents.forEach(agent => {
            const card = document.createElement('button');
            card.className = `agent-card${agent.id === currentAgentId ? ' active' : ''}`;
            card.dataset.agentId = agent.id;
            card.style.setProperty('--agent-color', agent.color);
            card.innerHTML = `
                <i class="ph-fill ${agent.icon}" style="font-size:18px; color:${agent.color}"></i>
                <span class="agent-name">${currentLang === 'en' ? agent.name_en : agent.name_ar}</span>
            `;
            card.title = currentLang === 'en' ? agent.description_en : agent.description_ar;
            card.addEventListener('click', () => selectAgent(agent.id));
            container.appendChild(card);
        });
    } catch (err) {
        console.error('Failed to load agents:', err);
    }
}

function selectAgent(agentId) {
    currentAgentId = agentId;
    document.querySelectorAll('.agent-card').forEach(card => {
        card.classList.toggle('active', card.dataset.agentId === agentId);
    });

    // Close dropdown after selection
    const agentDropdownMenu = document.getElementById('agentDropdownMenu');
    if (agentDropdownMenu) {
        agentDropdownMenu.classList.remove('show');
    }
}

// ─── Document Upload (RAG) ─────────────────────────────────────
function setupDocumentUpload() {
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');
    const removeDocBtn = document.getElementById('removeDocBtn');

    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            await uploadDocument(file);
            fileInput.value = '';
        });
    }

    if (removeDocBtn) {
        removeDocBtn.addEventListener('click', () => {
            documentContext = null;
            document.getElementById('documentContextBar').style.display = 'none';
        });
    }
}

async function uploadDocument(file) {
    const formData = new FormData();
    formData.append('file', file);

    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) uploadBtn.classList.add('loading');

    try {
        const res = await fetch(`${API_BASE}/api/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            const err = await res.json();
            alert(err.detail || 'خطأ في رفع الملف');
            return;
        }

        const data = await res.json();
        documentContext = data.full_text;

        // Show document badge
        const docBar = document.getElementById('documentContextBar');
        const docName = document.getElementById('docFileName');
        const docLen = document.getElementById('docTextLength');
        if (docBar && docName && docLen) {
            docName.textContent = data.filename;
            docLen.textContent = `(${data.text_length} حرف)`;
            docBar.style.display = 'flex';
        }
    } catch (err) {
        console.error('Upload error:', err);
        alert('خطأ في رفع الملف: ' + err.message);
    } finally {
        if (uploadBtn) uploadBtn.classList.remove('loading');
    }
}

// ─── Speech Recognition (STT) ──────────────────────────────────
function setupSpeechRecognition() {
    const micBtn = document.getElementById('micBtn');
    if (!micBtn) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        micBtn.title = 'المتصفح لا يدعم التعرف على الصوت';
        micBtn.style.opacity = '0.4';
        micBtn.disabled = true;
        return;
    }

    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = false;
    speechRecognition.interimResults = true;
    speechRecognition.lang = 'ar-SA';

    speechRecognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        messageInput.value = transcript;
        autoResize();
    };

    speechRecognition.onend = () => {
        isRecording = false;
        micBtn.classList.remove('recording');
    };

    speechRecognition.onerror = (event) => {
        console.error('Speech error:', event.error);
        isRecording = false;
        micBtn.classList.remove('recording');
    };

    micBtn.addEventListener('click', () => {
        if (isRecording) {
            speechRecognition.stop();
            isRecording = false;
            micBtn.classList.remove('recording');
        } else {
            // Detect language for better recognition
            const lang = currentLang === 'en' ? 'en-US' : 'ar-SA';
            speechRecognition.lang = lang;
            speechRecognition.start();
            isRecording = true;
            micBtn.classList.add('recording');
        }
    });
}

// ─── Text-to-Speech (TTS) ──────────────────────────────────────
function addSpeakerButton(msgDiv, text) {
    const body = msgDiv.querySelector('.message-body');
    if (!body) return;

    const speakerBtn = document.createElement('button');
    speakerBtn.className = 'btn-speaker';
    speakerBtn.title = 'استمع للرد';
    speakerBtn.innerHTML = '<i class="ph-bold ph-speaker-high" style="font-size:14px"></i>';

    speakerBtn.addEventListener('click', async () => {
        speakerBtn.classList.add('playing');
        speakerBtn.innerHTML = '<i class="ph-bold ph-spinner" style="font-size:14px"></i>';
        try {
            const isArabic = /[\u0600-\u06FF]/.test(text);
            const lang = isArabic ? 'ar' : 'en';

            const res = await fetch(`${API_BASE}/api/speech/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text.substring(0, 5000), lang }),
            });

            if (!res.ok) throw new Error('TTS failed');

            const blob = await res.blob();
            const audio = new Audio(URL.createObjectURL(blob));
            audio.onended = () => {
                speakerBtn.classList.remove('playing');
                speakerBtn.innerHTML = '<i class="ph-bold ph-speaker-high" style="font-size:14px"></i>';
            };
            audio.play();
        } catch (err) {
            console.error('TTS error:', err);
            speakerBtn.classList.remove('playing');
            speakerBtn.innerHTML = '<i class="ph-bold ph-speaker-high" style="font-size:14px"></i>';
        }
    });

    body.appendChild(speakerBtn);
}

// ─── Persistent Sessions ───────────────────────────────────────
async function loadSessions() {
    try {
        const res = await fetch(`${API_BASE}/api/memory/sessions`);
        const data = await res.json();
        const container = document.getElementById('sessionsList');
        const emptyState = document.getElementById('sessionsEmptyState');
        if (!container) return;

        // Clear existing session items (but keep empty state)
        const existingItems = container.querySelectorAll('.session-item');
        existingItems.forEach(item => item.remove());

        if (!data.sessions || data.sessions.length === 0) {
            if (emptyState) emptyState.style.display = 'flex';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        data.sessions.forEach(session => {
            const item = document.createElement('div');
            item.className = 'session-item';
            item.dataset.sessionId = session.session_id;

            const agentColors = { default: '#6366f1', psychologist: '#a78bfa', academic: '#3b82f6', career_counselor: '#10b981' };
            const agentColor = agentColors[session.agent_id] || '#6366f1';
            const date = new Date(session.updated_at).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            item.innerHTML = `
                <div class="session-dot" style="background:${agentColor}"></div>
                <div class="session-info">
                    <div class="session-title">${session.title || 'محادثة'}</div>
                    <div class="session-meta">${date} · ${session.turn_count} رسالة</div>
                </div>
                <button class="session-delete" title="حذف الجلسة">
                    <i class="ph-bold ph-trash" style="font-size:14px"></i>
                </button>
            `;

            // Click to load session
            item.querySelector('.session-info').addEventListener('click', () => {
                loadSession(session.session_id);
            });

            // Delete button
            item.querySelector('.session-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                await fetch(`${API_BASE}/api/memory/${session.session_id}`, { method: 'DELETE' });
                item.remove();
                // Check if list is now empty
                if (!container.querySelector('.session-item') && emptyState) {
                    emptyState.style.display = 'flex';
                }
            });

            container.appendChild(item);
        });
    } catch (err) {
        console.error('Failed to load sessions:', err);
    }
}

async function loadSession(sid) {
    try {
        const res = await fetch(`${API_BASE}/api/memory/history/${sid}`);
        const data = await res.json();

        // Switch to chat panel and clear current
        sessionId = sid;
        chatArea.innerHTML = '';
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
            chatArea.appendChild(welcomeScreen);
        }
        navigateToPanel('chat');

        // Render history
        if (data.history) {
            data.history.forEach(msg => {
                const isArabic = /[\u0600-\u06FF]/.test(msg.content);
                appendMessage(msg.role, msg.content, null, null, isArabic);
            });
        }
        scrollToBottom();
    } catch (err) {
        console.error('Failed to load session:', err);
    }
}

window.loadSession = loadSession;

// Refresh sessions button
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refreshSessionsBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadSessions);
});

// ─── i18n Translation System ───────────────────────────────────
let currentLang = localStorage.getItem('ui_lang') || 'ar';

const i18n = {
    ar: {
        // Navigation
        nav_main: 'الرئيسية',
        nav_chat: 'محادثة ذكية',
        nav_lab: 'المختبر',
        nav_translate: 'ترجمة',
        nav_academic: 'أكاديمي',
        nav_sessions: 'الجلسات',
        nav_tables: 'الجداول',
        nav_analysis: 'تحليل و رسوميات',
        nav_proofs: 'البراهين',
        nav_study: 'الدراسة',
        nav_system: 'النظام',
        nav_theme: 'تبديل المظهر',
        nav_lang_toggle: 'تبديل اللغة',
        nav_clear: 'مسح المحادثة',
        nav_about: 'نبذة عن المشروع',
        badge_new: 'جديد',
        badge_ai: 'ذ.إ',
        lang_indicator: 'EN',

        // Landing Page
        landing_subtitle: 'نظام ذكاء اصطناعي معرفي متقدم',
        landing_badge: 'مشروع مشارك في IBM Dev Day: AI Demystified',
        landing_btn: 'ابدأ التجربة',

        // Language Switcher Panel
        lang_title: 'ترجمة واجهة المشروع',
        lang_subtitle: 'تبديل لغة الواجهة بين العربية والإنجليزية',
        lang_hint: 'اختر اللغة التي تريد عرض واجهة المشروع بها:',
        lang_preview: 'معاينة',
        lang_preview_text: 'سيتم تحويل جميع عناصر الواجهة بما في ذلك القوائم والأزرار والعناوين إلى اللغة المختارة',
        lang_ar_name: 'العربية',
        lang_ar_desc: 'واجهة باللغة العربية',
        lang_en_name: 'English',
        lang_en_desc: 'Interface in English',

        // Chat
        input_placeholder: 'اكتب رسالتك... بأي لغة',
        status_online: 'النظام متصل — النموذج جاهز',
        status_offline: 'النموذج غير محمّل',
        status_error: 'خطأ في الاتصال',
        status_connecting: 'جاري الاتصال...',
        header_subtitle: 'منصة بحث أكاديمية',

        // Welcome Screen
        welcome_title: 'Human Insight AI',
        welcome_desc: 'لا أكتفي بالرد فقط — بل أفهمك. أحلل نيتك، أكتشف مشاعرك، وأقدم ذكاءً مبنياً على البصيرة. جرّبني.',
        chip_ai: 'ما هو الذكاء الاصطناعي؟',
        chip_career: 'إرشاد مهني',
        chip_ethics: 'أخلاقيات الذكاء الاصطناعي في الصحة',
        chip_advice: 'أحتاج نصيحة',
        chip_ml: 'مقارنة تعلم الآلة',
        chip_quantum: 'الحوسبة الكمية',

        // Lab Panel
        lab_title: 'المختبر التجريبي',
        lab_subtitle: 'اختبر النماذج والأفكار في بيئة آمنة',
        lab_text_analysis: 'تحليل النصوص',
        lab_text_analysis_desc: 'تحليل معمّق للنصوص مع استخراج الكيانات والعلاقات',
        lab_text_analysis_btn: 'تجربة',
        lab_intelligence: 'اختبار الذكاء',
        lab_intelligence_desc: 'اختبار قدرات النموذج في التفكير والاستدلال المنطقي',
        lab_intelligence_btn: 'تجربة',
        lab_creative: 'توليد إبداعي',
        lab_creative_desc: 'توليد نصوص إبداعية وقصائد ومحتوى فني',
        lab_creative_btn: 'تجربة',
        lab_ethical: 'تقييم أخلاقي',
        lab_ethical_desc: 'فحص النصوص من المنظور الأخلاقي والثقافي',
        lab_ethical_btn: 'تجربة',

        // Sessions Panel
        sessions_title: 'الجلسات',
        sessions_subtitle: 'سجل جلسات المحادثات والبحث',
        sessions_empty: 'لا توجد جلسات سابقة',
        sessions_empty_desc: 'ابدأ محادثة جديدة وستظهر الجلسات هنا',
        sessions_new_btn: 'بدء محادثة',

        // Tables Panel
        tables_title: 'الجداول',
        tables_subtitle: 'تنظيم البيانات والمعلومات في جداول تفاعلية',
        th_feature: 'الميزة',
        th_description: 'الوصف',
        th_status: 'الحالة',
        th_priority: 'الأولوية',
        td_intent: 'تحليل النية',
        td_intent_desc: 'تصنيف تلقائي لنية المستخدم',
        td_emotion: 'اكتشاف المشاعر',
        td_emotion_desc: 'استشعار الحالة العاطفية',
        td_multilang: 'دعم متعدد اللغات',
        td_multilang_desc: 'عربي، إنجليزي، فرنسي',
        td_streaming: 'استجابة فورية',
        td_streaming_desc: 'بث مباشر للردود (Streaming)',
        td_memory: 'ذاكرة المحادثة',
        td_memory_desc: 'تخزين السياق لمحادثات أفضل',
        td_ethical: 'تقييم أخلاقي',
        td_ethical_desc: 'مراعاة السياق الثقافي والأخلاقي',
        tag_active: 'مفعّل',
        tag_beta: 'تجريبي',
        tag_high: 'عالية',
        tag_medium: 'متوسطة',
        tag_low: 'منخفضة',

        // Analysis Panel
        analysis_title: 'التحليل و الرسوميات',
        analysis_subtitle: 'تحليل بياني وبصري للمحادثات والنتائج',
        stat_total: 'إجمالي الرسائل',
        stat_positive: 'مشاعر إيجابية',
        stat_neutral: 'مشاعر محايدة',
        stat_negative: 'مشاعر سلبية',
        chart_positive: 'إيجابي',
        chart_neutral: 'محايد',
        chart_negative: 'سلبي',

        // Proofs Panel
        proofs_title: 'البراهين',
        proofs_subtitle: 'أدلة وبراهين منطقية وعلمية',
        proof1_title: 'برهان التحليل الدلالي',
        proof1_desc: 'النظام يستخدم نموذج LLM لتحليل البنية الدلالية للنصوص، مما يمكّنه من فهم المعنى العميق وليس فقط الكلمات المفردة. هذا مبني على أبحاث معالجة اللغة الطبيعية (NLP).',
        proof2_title: 'برهان تصنيف النية',
        proof2_desc: 'يُصنّف النظام نية المستخدم إلى 6 فئات (معلوماتي، عاطفي، تحليلي، أخلاقي، إقناعي، غامض) باستخدام تقنيات التعلم العميق مع مستوى ثقة قابل للقياس.',
        proof3_title: 'برهان اكتشاف المشاعر',
        proof3_desc: 'يكتشف النظام 11 حالة عاطفية مختلفة مع تحديد القطبية (إيجابي/محايد/سلبي) والكثافة (منخفض/متوسط/عالي) في الوقت الحقيقي.',

        // Study Panel
        study_title: 'الدراسة',
        study_subtitle: 'مواد دراسية ومصادر تعليمية في الذكاء الاصطناعي',
        study_nn: 'الشبكات العصبية',
        study_nn_desc: 'فهم كيف تعمل الشبكات العصبية الاصطناعية',
        study_llm: 'نماذج اللغة الكبيرة',
        study_llm_desc: 'LLM و Transformer وكيف تفهم اللغة',
        study_nlp: 'معالجة اللغة الطبيعية',
        study_nlp_desc: 'NLP وتطبيقاتها في تحليل النصوص',
        study_ethics: 'أخلاقيات الذكاء الاصطناعي',
        study_ethics_desc: 'التحديات الأخلاقية والمسؤولية',
        study_sentiment: 'تحليل المشاعر',
        study_sentiment_desc: 'Sentiment Analysis وتقنياته',

        // About Panel
        about_title: 'نبذة عن المشروع',
        about_subtitle: 'Human Insight AI — نظام ذكاء معرفي متقدم',
        about_tagline: 'نظام ذكاء اصطناعي معرفي متقدم يفهم النية البشرية والمشاعر والسياق',
        about_feat_intent: 'تصنيف النية',
        about_feat_intent_desc: 'تحديد تلقائي لنية المستخدم بدقة عالية',
        about_feat_emotion: 'اكتشاف المشاعر',
        about_feat_emotion_desc: '11 حالة عاطفية مع تحليل القطبية والكثافة',
        about_feat_multilang: 'متعدد اللغات',
        about_feat_multilang_desc: 'دعم كامل للعربية والإنجليزية والفرنسية',
        about_feat_realtime: 'استجابة فورية',
        about_feat_realtime_desc: 'بث مباشر للردود بدون انتظار',
        about_tech_title: 'التقنيات المستخدمة',
        about_dev_title: 'المطوّر',
        about_dev_role: 'مهندس ذكاء اصطناعي ومطوّر برمجيات',
        about_cert_title: 'الشهادات',
        about_cert_type: 'شهادة مشاركة',
        about_footer: 'صُمم وطُوّر بشغف بواسطة المهندس عبد الصمد بوركيبات 💜 — 2026',

        // Floating button
        float_btn_label: 'EN',

        // Export
        export_pdf: 'تصدير PDF',
        export_csv: 'تصدير Excel',
        export_chat: 'تصدير المحادثة',
    },
    en: {
        // Navigation
        nav_main: 'Main',
        nav_chat: 'Smart Chat',
        nav_lab: 'Lab',
        nav_translate: 'Language',
        nav_academic: 'Academic',
        nav_sessions: 'Sessions',
        nav_tables: 'Tables',
        nav_analysis: 'Analysis & Charts',
        nav_proofs: 'Proofs',
        nav_study: 'Study',
        nav_system: 'System',
        nav_theme: 'Toggle Theme',
        nav_lang_toggle: 'Switch Language',
        nav_clear: 'Clear Chat',
        nav_about: 'About Project',
        badge_new: 'New',
        badge_ai: 'AI',
        lang_indicator: 'عربي',

        // Landing Page
        landing_subtitle: 'Advanced Cognitive Artificial Intelligence System',
        landing_badge: 'Participating Project in IBM Dev Day: AI Demystified',
        landing_btn: 'Start Experience',

        // Language Switcher Panel
        lang_title: 'Project Interface Language',
        lang_subtitle: 'Switch interface language between Arabic and English',
        lang_hint: 'Choose the language for the project interface:',
        lang_preview: 'Preview',
        lang_preview_text: 'All interface elements including menus, buttons, and titles will be converted to the selected language',
        lang_ar_name: 'العربية',
        lang_ar_desc: 'واجهة باللغة العربية',
        lang_en_name: 'English',
        lang_en_desc: 'Interface in English',

        // Chat
        input_placeholder: 'Type your message... in any language',
        status_online: 'System Online — Model Loaded',
        status_offline: 'Model Not Loaded',
        status_error: 'Connection Error',
        status_connecting: 'Connecting...',
        header_subtitle: 'Academic Research Platform',

        // Welcome Screen
        welcome_title: 'Human Insight AI',
        welcome_desc: "I don't just respond — I understand. I analyze your intent, detect your emotions, and provide insight-driven intelligence. Try me.",
        chip_ai: 'What is AI?',
        chip_career: 'Career guidance',
        chip_ethics: 'AI Ethics in Healthcare',
        chip_advice: 'I need advice',
        chip_ml: 'ML Comparison',
        chip_quantum: 'Quantum Computing',

        // Lab Panel
        lab_title: 'Experimental Lab',
        lab_subtitle: 'Test models and ideas in a safe environment',
        lab_text_analysis: 'Text Analysis',
        lab_text_analysis_desc: 'In-depth text analysis with entity and relationship extraction',
        lab_text_analysis_btn: 'Try',
        lab_intelligence: 'Intelligence Test',
        lab_intelligence_desc: 'Test model capabilities in reasoning and logical inference',
        lab_intelligence_btn: 'Try',
        lab_creative: 'Creative Generation',
        lab_creative_desc: 'Generate creative texts, poems, and artistic content',
        lab_creative_btn: 'Try',
        lab_ethical: 'Ethical Assessment',
        lab_ethical_desc: 'Examine texts from ethical and cultural perspectives',
        lab_ethical_btn: 'Try',

        // Sessions Panel
        sessions_title: 'Sessions',
        sessions_subtitle: 'Chat and research session history',
        sessions_empty: 'No previous sessions',
        sessions_empty_desc: 'Start a new conversation and sessions will appear here',
        sessions_new_btn: 'Start Chat',

        // Tables Panel
        tables_title: 'Tables',
        tables_subtitle: 'Organize data and information in interactive tables',
        th_feature: 'Feature',
        th_description: 'Description',
        th_status: 'Status',
        th_priority: 'Priority',
        td_intent: 'Intent Analysis',
        td_intent_desc: 'Automatic user intent classification',
        td_emotion: 'Emotion Detection',
        td_emotion_desc: 'Emotional state sensing',
        td_multilang: 'Multi-language Support',
        td_multilang_desc: 'Arabic, English, French',
        td_streaming: 'Instant Response',
        td_streaming_desc: 'Live response streaming (SSE)',
        td_memory: 'Conversation Memory',
        td_memory_desc: 'Context storage for better conversations',
        td_ethical: 'Ethical Assessment',
        td_ethical_desc: 'Cultural and ethical context awareness',
        tag_active: 'Active',
        tag_beta: 'Beta',
        tag_high: 'High',
        tag_medium: 'Medium',
        tag_low: 'Low',

        // Analysis Panel
        analysis_title: 'Analysis & Graphics',
        analysis_subtitle: 'Visual and graphical analysis of conversations and results',
        stat_total: 'Total Messages',
        stat_positive: 'Positive Emotions',
        stat_neutral: 'Neutral Emotions',
        stat_negative: 'Negative Emotions',
        chart_positive: 'Positive',
        chart_neutral: 'Neutral',
        chart_negative: 'Negative',

        // Proofs Panel
        proofs_title: 'Proofs',
        proofs_subtitle: 'Logical and scientific evidence and proofs',
        proof1_title: 'Semantic Analysis Proof',
        proof1_desc: 'The system uses an LLM model to analyze the semantic structure of texts, enabling it to understand deep meaning, not just individual words. This is built on NLP research.',
        proof2_title: 'Intent Classification Proof',
        proof2_desc: 'The system classifies user intent into 6 categories (informational, emotional, analytical, ethical, persuasive, ambiguous) using deep learning techniques with measurable confidence levels.',
        proof3_title: 'Emotion Detection Proof',
        proof3_desc: 'The system detects 11 different emotional states with polarity (positive/neutral/negative) and intensity (low/medium/high) determination in real-time.',

        // Study Panel
        study_title: 'Study',
        study_subtitle: 'Educational materials and AI learning resources',
        study_nn: 'Neural Networks',
        study_nn_desc: 'Understanding how artificial neural networks work',
        study_llm: 'Large Language Models',
        study_llm_desc: 'LLMs, Transformers, and how they understand language',
        study_nlp: 'Natural Language Processing',
        study_nlp_desc: 'NLP and its applications in text analysis',
        study_ethics: 'AI Ethics',
        study_ethics_desc: 'Ethical challenges and responsibility',
        study_sentiment: 'Sentiment Analysis',
        study_sentiment_desc: 'Sentiment Analysis techniques and methods',

        // About Panel
        about_title: 'About the Project',
        about_subtitle: 'Human Insight AI — Advanced Cognitive Intelligence System',
        about_tagline: 'An advanced cognitive AI system that understands human intent, emotions, and context',
        about_feat_intent: 'Intent Classification',
        about_feat_intent_desc: 'Automatic user intent identification with high accuracy',
        about_feat_emotion: 'Emotion Detection',
        about_feat_emotion_desc: '11 emotional states with polarity and intensity analysis',
        about_feat_multilang: 'Multilingual',
        about_feat_multilang_desc: 'Full support for Arabic, English, and French',
        about_feat_realtime: 'Instant Response',
        about_feat_realtime_desc: 'Live response streaming with no waiting',
        about_tech_title: 'Technologies Used',
        about_dev_title: 'Developer',
        about_dev_role: 'AI Engineer & Software Developer',
        about_cert_title: 'Certificates',
        about_cert_type: 'Certificate of Participation',
        about_footer: 'Designed & Developed with Passion by Abdessamad Bourkibate 💜 — 2026',

        // Floating button
        float_btn_label: 'عربي',

        // Export
        export_pdf: 'Export PDF',
        export_csv: 'Export Excel',
        export_chat: 'Export Chat',
    }
};

function initLanguage() {
    applyLanguage(currentLang);
}

function applyLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('ui_lang', lang);

    // Set document direction and language
    const isRTL = lang === 'ar';
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;

    // Update all elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang] && i18n[lang][key]) {
            el.textContent = i18n[lang][key];
        }
    });

    // Update special elements
    const headerSub = document.querySelector('.header-subtitle');
    if (headerSub) headerSub.textContent = i18n[lang].header_subtitle;

    if (messageInput) messageInput.placeholder = i18n[lang].input_placeholder;

    const statusTextEl = document.getElementById('statusText');
    if (statusTextEl && statusTextEl.textContent.includes('...')) {
        statusTextEl.textContent = i18n[lang].status_connecting;
    }

    // Update preview text
    const previewEl = document.getElementById('langPreviewText');
    if (previewEl) previewEl.textContent = i18n[lang].lang_preview_text;

    // Update language card active states
    document.querySelectorAll('.lang-card').forEach(card => {
        card.classList.toggle('active', card.dataset.lang === lang);
    });

    // Update sidebar language indicator
    const langLabel = document.getElementById('langIndicatorLabel');
    if (langLabel) langLabel.textContent = i18n[lang].lang_indicator;

    // Restore sidebar state from localStorage (language-independent)
    if (sidebarElement) {
        const savedState = localStorage.getItem('sidebar_collapsed');
        if (savedState === 'true') {
            sidebarElement.classList.add('collapsed');
        } else {
            sidebarElement.classList.remove('collapsed');
        }
    }

    lucide.createIcons();
}

function setupLanguageSwitcher() {
    // Panel-based lang cards
    document.querySelectorAll('.lang-card').forEach(card => {
        card.addEventListener('click', () => {
            const lang = card.dataset.lang;
            applyLanguage(lang);
        });
    });

    // Sidebar language toggle button
    const langToggleBtn = document.getElementById('langToggleBtn');
    if (langToggleBtn) {
        langToggleBtn.addEventListener('click', () => {
            const newLang = currentLang === 'ar' ? 'en' : 'ar';
            applyLanguage(newLang);
        });
    }
}
