/**
 * MoodBeat Studio v4.0 - Main Thread Controller
 * Quản lý UI, giao tiếp với Worker, và xử lý sự kiện
 * 
 * @author Senior Frontend Developer
 * @version 4.0.0
 */

// ==================== STATE MANAGEMENT ====================
const state = {
    worker: null,
    currentPlatform: 'tiktok',
    currentFile: null,
    config: {
        tiktok: {
            width: 1080,
            height: 1920,
            ratio: '9:16',
            bitrate: '3000k',
            platform: 'TikTok/Reels'
        },
        youtube: {
            width: 1920,
            height: 1080,
            ratio: '16:9',
            bitrate: '5000k',
            platform: 'YouTube/Facebook'
        }
    },
    isProcessing: false
};

// ==================== DOM ELEMENTS ====================
const elements = {
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    fileInfo: document.getElementById('fileInfo'),
    fileName: document.getElementById('fileName'),
    fileSize: document.getElementById('fileSize'),
    fileDuration: document.getElementById('fileDuration'),
    progressContainer: document.getElementById('progressContainer'),
    progressFill: document.getElementById('progressFill'),
    progressStatus: document.getElementById('progressStatus'),
    progressPercent: document.getElementById('progressPercent'),
    previewSection: document.getElementById('previewSection'),
    previewContainer: document.getElementById('previewContainer'),
    videoPreview: document.getElementById('videoPreview'),
    previewOverlay: document.getElementById('previewOverlay'),
    processBtn: document.getElementById('processBtn'),
    resetBtn: document.getElementById('resetBtn'),    platformCards: document.querySelectorAll('.platform-card'),
    statusBadge: document.getElementById('statusBadge'),
    toastContainer: document.getElementById('toastContainer')
};

// ==================== INITIALIZATION ====================
/**
 * Khởi tạo ứng dụng
 */
async function init() {
    try {
        // Initialize Web Worker
        state.worker = new Worker('worker.js');
        
        // Setup event listeners cho worker
        setupWorkerListeners();
        
        // Gửi lệnh INIT cho worker
        state.worker.postMessage({ type: 'INIT' });
        
        // Setup UI event listeners
        setupEventListeners();
        
        showToast('info', ' Ứng dụng đã sẵn sàng!', 3000);
        
    } catch (error) {
        showToast('error', `Lỗi khởi tạo: ${error.message}`);
        console.error('Init error:', error);
    }
}

/**
 * Setup listeners cho Worker messages
 */
function setupWorkerListeners() {
    state.worker.onmessage = (e) => {
        const { type, data, message } = e.data;
        
        switch (type) {
            case 'READY':
                elements.statusBadge.classList.add('active');
                showToast('success', message, 2000);
                break;
                
            case 'STATUS':
                updateProgress(0, message);
                break;
                
            case 'PROGRESS':
                handleFFmpegProgress(data);                break;
                
            case 'COMPLETE':
                handleProcessingComplete(data);
                break;
                
            case 'ERROR':
                handleError(message);
                break;
                
            case 'TERMINATED':
                showToast('info', message, 2000);
                break;
        }
    };
    
    state.worker.onerror = (error) => {
        console.error('Worker error:', error);
        showToast('error', 'Lỗi worker: ' + error.message);
    };
}

/**
 * Setup UI event listeners
 */
function setupEventListeners() {
    // Drag & Drop events
    elements.dropZone.addEventListener('dragover', handleDragOver);
    elements.dropZone.addEventListener('dragleave', handleDragLeave);
    elements.dropZone.addEventListener('drop', handleDrop);
    elements.dropZone.addEventListener('click', () => elements.fileInput.click());
    
    // File input change
    elements.fileInput.addEventListener('change', handleFileSelect);
    
    // Platform selection
    elements.platformCards.forEach(card => {
        card.addEventListener('click', () => selectPlatform(card));
    });
    
    // Process button
    elements.processBtn.addEventListener('click', startProcessing);
    
    // Reset button
    elements.resetBtn.addEventListener('click', resetApp);
    
    // Preview play button
    elements.previewOverlay.addEventListener('click', togglePreview);
    
    // Handle window close (cleanup)    window.addEventListener('beforeunload', () => {
        if (state.worker) {
            state.worker.postMessage({ type: 'TERMINATE' });
            state.worker.terminate();
        }
    });
}

// ==================== DRAG & DROP HANDLERS ====================
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.dropZone.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.dropZone.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.dropZone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

// ==================== FILE HANDLING ====================
/**
 * Xử lý file được chọn
 * @param {File} file 
 */
function handleFile(file) {
    // Validate file type
    const validTypes = ['video/', 'audio/', 'image/'];
    const isValidType = validTypes.some(type => file.type.startsWith(type));
    
    if (!isValidType) {        showToast('error', '⚠️ File không hợp lệ! Chỉ chấp nhận video, audio, image.');
        return;
    }
    
    // Check file size (max 500MB)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
        showToast('error', '⚠️ File quá lớn! Tối đa 500MB.');
        return;
    }
    
    state.currentFile = file;
    
    // Update UI
    updateFileInfo(file);
    elements.processBtn.disabled = false;
    
    showToast('success', `✅ Đã tải: ${file.name}`, 2000);
}

/**
 * Cập nhật thông tin file lên UI
 * @param {File} file 
 */
function updateFileInfo(file) {
    elements.fileName.textContent = file.name;
    elements.fileSize.textContent = formatFileSize(file.size);
    elements.fileDuration.textContent = 'Đang phân tích...';
    elements.fileInfo.classList.add('active');
    
    // Get duration for video/audio
    if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        getMediaDuration(file).then(duration => {
            elements.fileDuration.textContent = formatDuration(duration);
        }).catch(() => {
            elements.fileDuration.textContent = 'N/A';
        });
    } else {
        elements.fileDuration.textContent = 'Image';
    }
}

/**
 * Lấy duration của media file
 * @param {File} file 
 * @returns {Promise<number>}
 */
function getMediaDuration(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);        const media = document.createElement(file.type.startsWith('video') ? 'video' : 'audio');
        
        media.onloadedmetadata = () => {
            resolve(media.duration);
            URL.revokeObjectURL(url);
        };
        
        media.onerror = () => {
            reject(new Error('Cannot load metadata'));
            URL.revokeObjectURL(url);
        };
        
        media.src = url;
    });
}

// ==================== PLATFORM SELECTION ====================
/**
 * Chọn platform
 * @param {HTMLElement} card 
 */
function selectPlatform(card) {
    // Update active state
    elements.platformCards.forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    
    // Update state
    state.currentPlatform = card.dataset.platform;
    
    // Update preview container ratio
    const ratio = card.dataset.ratio;
    if (ratio === '16:9') {
        elements.previewContainer.classList.add('wide');
    } else {
        elements.previewContainer.classList.remove('wide');
    }
    
    showToast('info', `📐 Đã chọn: ${card.querySelector('.name').textContent}`, 2000);
}

// ==================== PROCESSING ====================
/**
 * Bắt đầu xử lý video
 */
async function startProcessing() {
    if (!state.currentFile || state.isProcessing) return;
    
    state.isProcessing = true;
    elements.processBtn.disabled = true;
    elements.progressContainer.classList.add('active');    
    const config = state.config[state.currentPlatform];
    
    showToast('info', `🎬 Đang xử lý cho ${config.platform}...`);
    
    // Gửi file đến worker
    state.worker.postMessage({
        type: 'PROCESS',
        data: {
            file: state.currentFile,
            platform: state.currentPlatform,
            config: config
        }
    });
}

/**
 * Xử lý progress từ FFmpeg
 * @param {object} data 
 */
function handleFFmpegProgress(data) {
    // Estimate progress based on time
    // This is approximate since we don't know total duration upfront
    const estimatedProgress = Math.min(95, (data.time / 30) * 100); // Assume 30s video
    
    updateProgress(estimatedProgress, `Đang render: ${formatDuration(data.time)}`);
}

/**
 * Xử lý khi processing complete
 * @param {object} data 
 */
function handleProcessingComplete(data) {
    const { url, filename, size } = data;
    
    updateProgress(100, 'Hoàn thành!');
    
    // Show preview
    elements.videoPreview.src = url;
    elements.previewSection.classList.add('active');
    elements.previewOverlay.style.display = 'flex';
    
    // Auto download
    setTimeout(() => {
        downloadFile(url, filename);
        showToast('success', `✅ Video đã tải về! (${formatFileSize(size)})`, 3000);
    }, 500);
    
    // Reset state
    state.isProcessing = false;    elements.processBtn.disabled = false;
    
    // Hide progress after delay
    setTimeout(() => {
        elements.progressContainer.classList.remove('active');
    }, 2000);
}

/**
 * Xử lý lỗi
 * @param {string} message 
 */
function handleError(message) {
    showToast('error', message);
    state.isProcessing = false;
    elements.processBtn.disabled = false;
    elements.progressContainer.classList.remove('active');
}

// ==================== UTILITIES ====================
/**
 * Update progress bar
 * @param {number} percent 
 * @param {string} status 
 */
function updateProgress(percent, status) {
    elements.progressFill.style.width = `${percent}%`;
    elements.progressStatus.textContent = status;
    elements.progressPercent.textContent = `${Math.round(percent)}%`;
}

/**
 * Toggle preview play/pause
 */
function togglePreview() {
    if (elements.videoPreview.paused) {
        elements.videoPreview.play();
        elements.previewOverlay.style.display = 'none';
    } else {
        elements.videoPreview.pause();
        elements.previewOverlay.style.display = 'flex';
    }
}

/**
 * Download file
 * @param {string} url 
 * @param {string} filename 
 */
function downloadFile(url, filename) {    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Cleanup object URL after delay
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
}

/**
 * Reset application
 */
function resetApp() {
    // Cleanup worker
    if (state.worker) {
        state.worker.postMessage({ type: 'CLEANUP' });
    }
    
    // Reset state
    state.currentFile = null;
    state.isProcessing = false;
    
    // Reset UI
    elements.fileInfo.classList.remove('active');
    elements.previewSection.classList.remove('active');
    elements.progressContainer.classList.remove('active');
    elements.processBtn.disabled = true;
    elements.fileInput.value = '';
    elements.videoPreview.src = '';
    elements.progressFill.style.width = '0%';
    
    showToast('info', '🔄 Đã reset ứng dụng', 2000);
}

/**
 * Format file size
 * @param {number} bytes 
 * @returns {string}
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
/**
 * Format duration
 * @param {number} seconds 
 * @returns {string}
 */
function formatDuration(seconds) {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ==================== TOAST NOTIFICATIONS ====================
/**
 * Hiển thị toast message
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 * @param {string} message 
 * @param {number} duration - ms
 */
function showToast(type, message, duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span>${message}</span>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    // Auto remove
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, duration);
}

// ==================== START APP ====================
// Initialize when DOM ready
if (document.readyState === 'loading') {    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Log for debugging
console.log('🎬 MoodBeat Studio v4.0 Pro initialized');