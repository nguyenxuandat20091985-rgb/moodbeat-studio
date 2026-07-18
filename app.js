/**
 * MoodBeat Studio v4.0 Pro - Fixed Version
 * Sử dụng FFmpeg.wasm 0.12.7 async trực tiếp (KHÔNG cần Worker riêng)
 * 
 * Lý do bỏ Worker:
 * - FFmpeg.wasm v0.12.7 đã async native (dùng Web Worker nội bộ)
 * - File object không serialize được qua postMessage
 * - ESM modules không load được trong classic worker
 * - UI vẫn 100% responsive vì mọi operation đều await
 * 
 * @author Senior Frontend Developer
 * @version 4.0.1-fixed
 */

// ==================== STATE ====================
const state = {
    ffmpeg: null,
    ffmpegLoaded: false,
    currentPlatform: 'tiktok',
    currentFile: null,
    isProcessing: false,
    config: {
        tiktok: { width: 1080, height: 1920, ratio: '9:16', bitrate: '3000k', name: 'TikTok/Reels' },
        youtube: { width: 1920, height: 1080, ratio: '16:9', bitrate: '5000k', name: 'YouTube/Facebook' }
    }
};

// ==================== DOM ====================
const $ = id => document.getElementById(id);
const els = {
    dropZone: $('dropZone'), fileInput: $('fileInput'),
    fileInfo: $('fileInfo'), fileName: $('fileName'),
    fileSize: $('fileSize'), fileDuration: $('fileDuration'),
    progressContainer: $('progressContainer'), progressFill: $('progressFill'),
    progressStatus: $('progressStatus'), progressPercent: $('progressPercent'),
    previewSection: $('previewSection'), previewContainer: $('previewContainer'),
    videoPreview: $('videoPreview'), previewOverlay: $('previewOverlay'),
    processBtn: $('processBtn'), resetBtn: $('resetBtn'),
    platformCards: document.querySelectorAll('.platform-card'),
    statusBadge: $('statusBadge'), toastContainer: $('toastContainer'),
    debugLogs: $('debugLogs')
};

// ==================== DEBUG LOGGER ====================
function debugLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${time}] ${msg}`;
    els.debugLogs.appendChild(entry);    els.debugLogs.parentElement.scrollTop = els.debugLogs.parentElement.scrollHeight;
    console.log(`[MoodBeat] ${msg}`);
}

// ==================== INIT ====================
async function init() {
    debugLog(' Khởi động ứng dụng...');
    
    // Check SharedArrayBuffer
    const hasSAB = typeof SharedArrayBuffer !== 'undefined';
    debugLog(`SharedArrayBuffer: ${hasSAB ? '✅ Có' : '❌ Không (cần COOP/COEP headers)'}`, hasSAB ? 'success' : 'error');
    
    if (!hasSAB) {
        showToast('warning', '⚠️ SharedArrayBuffer không khả dụng. Xem vercel.json bên dưới.', 8000);
    }
    
    // Check FFmpeg modules
    if (!window.FFmpeg) {
        debugLog(' FFmpeg modules chưa load', 'error');
        showToast('error', 'Lỗi load FFmpeg modules. Refresh trang.', 5000);
        return;
    }
    
    debugLog('✅ FFmpeg modules đã load');
    
    // Khởi tạo FFmpeg instance
    try {
        state.ffmpeg = new window.FFmpeg();
        debugLog('✅ FFmpeg instance created (v0.12.7)');
        
        // Log progress từ FFmpeg
        state.ffmpeg.on('log', ({ message }) => {
            // Parse time từ log: "time=00:00:05.23"
            const timeMatch = message.match(/time=(\d{2}):(\d{2}):(\d{2})/);
            if (timeMatch) {
                const secs = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
                updateProgress(Math.min(95, (secs / 30) * 100), `Render: ${formatDuration(secs)}`);
            }
        });
        
        state.ffmpeg.on('progress', ({ progress, time }) => {
            if (progress >= 0 && progress <= 1) {
                updateProgress(progress * 100, `Progress: ${Math.round(progress * 100)}%`);
            }
        });
        
        // Load FFmpeg core
        await loadFFmpegCore();
        
    } catch (error) {        debugLog(`❌ Lỗi init FFmpeg: ${error.message}`, 'error');
        showToast('error', `Lỗi: ${error.message}`);
    }
    
    setupEventListeners();
    debugLog('✅ UI event listeners attached');
}

/**
 * Load FFmpeg WASM core từ CDN
 * v0.12.7 cần load 3 file: core, core-mt, wasm
 */
async function loadFFmpegCore() {
    debugLog(' Đang tải FFmpeg core từ CDN...');
    updateProgress(10, 'Đang tải FFmpeg...');
    
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/umd';
    
    try {
        await state.ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
        });
        
        state.ffmpegLoaded = true;
        els.statusBadge.classList.add('active');
        updateProgress(100, 'FFmpeg sẵn sàng');
        debugLog('✅ FFmpeg core loaded thành công!', 'success');
        showToast('success', '✅ FFmpeg đã sẵn sàng!', 3000);
        
    } catch (error) {
        debugLog(` Lỗi load core: ${error.message}`, 'error');
        showToast('error', `Không tải được FFmpeg: ${error.message}. Kiểm tra internet.`);
    }
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Drag & Drop
    els.dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        els.dropZone.classList.add('dragover');
    });
    els.dropZone.addEventListener('dragleave', e => {
        e.preventDefault();
        els.dropZone.classList.remove('dragover');
    });
    els.dropZone.addEventListener('drop', e => {
        e.preventDefault();        els.dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });
    els.dropZone.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', e => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });
    
    // Platform
    els.platformCards.forEach(card => {
        card.addEventListener('click', () => {
            els.platformCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            state.currentPlatform = card.dataset.platform;
            const config = state.config[state.currentPlatform];
            els.previewContainer.classList.toggle('wide', config.ratio === '16:9');
            debugLog(`📐 Chọn platform: ${config.name}`);
            showToast('info', `📐 ${config.name}`, 2000);
        });
    });
    
    // Process
    els.processBtn.addEventListener('click', startProcessing);
    els.resetBtn.addEventListener('click', resetApp);
    
    // Preview
    els.previewOverlay.addEventListener('click', () => {
        if (els.videoPreview.paused) {
            els.videoPreview.play();
            els.previewOverlay.style.display = 'none';
        } else {
            els.videoPreview.pause();
            els.previewOverlay.style.display = 'flex';
        }
    });
    els.videoPreview.addEventListener('pause', () => {
        els.previewOverlay.style.display = 'flex';
    });
    
    // Cleanup khi đóng tab
    window.addEventListener('beforeunload', async () => {
        if (state.ffmpeg) {
            try { await state.ffmpeg.terminate(); } catch(e) {}
        }
    });
}

// ==================== FILE HANDLING ====================function handleFile(file) {
    debugLog(`📁 File selected: ${file.name} (${formatFileSize(file.size)})`);
    
    // Validate type
    const validTypes = ['video/', 'audio/', 'image/'];
    if (!validTypes.some(t => file.type.startsWith(t))) {
        showToast('error', '⚠️ File không hợp lệ!');
        debugLog('❌ Invalid file type: ' + file.type, 'error');
        return;
    }
    
    // Validate size (max 500MB)
    if (file.size > 500 * 1024 * 1024) {
        showToast('error', '⚠️ File quá lớn (max 500MB)');
        return;
    }
    
    state.currentFile = file;
    updateFileInfo(file);
    els.processBtn.disabled = false;
    showToast('success', `✅ Đã chọn: ${file.name}`, 2000);
}

function updateFileInfo(file) {
    els.fileName.textContent = file.name;
    els.fileSize.textContent = formatFileSize(file.size);
    els.fileDuration.textContent = 'Đang phân tích...';
    els.fileInfo.classList.add('active');
    
    if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        getMediaDuration(file).then(d => {
            els.fileDuration.textContent = formatDuration(d);
            debugLog(`⏱️ Duration: ${formatDuration(d)}`);
        }).catch(() => els.fileDuration.textContent = 'N/A');
    } else {
        els.fileDuration.textContent = 'Image';
    }
}

function getMediaDuration(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const media = document.createElement(file.type.startsWith('video') ? 'video' : 'audio');
        media.onloadedmetadata = () => { resolve(media.duration); URL.revokeObjectURL(url); };
        media.onerror = () => { reject(new Error('Cannot load')); URL.revokeObjectURL(url); };
        media.src = url;
    });
}

// ==================== PROCESSING ====================async function startProcessing() {
    if (!state.currentFile || state.isProcessing || !state.ffmpegLoaded) {
        if (!state.ffmpegLoaded) showToast('warning', '⚠️ FFmpeg chưa sẵn sàng!');
        return;
    }
    
    state.isProcessing = true;
    els.processBtn.disabled = true;
    els.dropZone.classList.add('processing');
    els.progressContainer.classList.add('active');
    updateProgress(0, 'Bắt đầu xử lý...');
    
    const config = state.config[state.currentPlatform];
    debugLog(`🎬 Bắt đầu xử lý cho ${config.name}`);
    showToast('info', ` Đang xử lý cho ${config.name}...`);
    
    try {
        // Step 1: Đọc file thành Uint8Array
        debugLog('📖 Đang đọc file...');
        updateProgress(5, 'Đang đọc file...');
        const fileData = await readFileAsUint8Array(state.currentFile);
        debugLog(`✅ File read: ${fileData.length} bytes`);
        
        // Step 2: Xác định extension
        const ext = getFileExtension(state.currentFile.type);
        const inputName = `input.${ext}`;
        const outputName = `output.mp4`;
        
        // Step 3: Cleanup FS cũ (quan trọng!)
        debugLog('🧹 Cleaning up old files...');
        try {
            await state.ffmpeg.deleteFile(inputName);
        } catch(e) { /* ignore */ }
        try {
            await state.ffmpeg.deleteFile(outputName);
        } catch(e) { /* ignore */ }
        
        // Step 4: Write file vào FFmpeg FS
        debugLog('💾 Writing file to FFmpeg FS...');
        updateProgress(10, 'Đang tải vào bộ nhớ...');
        await state.ffmpeg.writeFile(inputName, fileData);
        debugLog('✅ File written to FS');
        
        // Step 5: Build command
        const command = buildCommand(inputName, outputName, config, state.currentFile.type);
        debugLog(`️ Command: ffmpeg ${command.join(' ')}`);
        
        // Step 6: Execute
        debugLog('🎬 Executing FFmpeg...');
        updateProgress(20, 'Đang render...');        
        const startTime = performance.now();
        await state.ffmpeg.exec(command);
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        debugLog(`✅ FFmpeg exec completed in ${elapsed}s`, 'success');
        
        // Step 7: Read output
        debugLog('📤 Reading output file...');
        updateProgress(90, 'Đang xuất file...');
        const outputData = await state.ffmpeg.readFile(outputName);
        debugLog(`✅ Output size: ${outputData.length} bytes`);
        
        // Step 8: Create blob & download
        const blob = new Blob([outputData.buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const filename = `moodbeat_${state.currentPlatform}_${Date.now()}.mp4`;
        
        debugLog(' Creating download...', 'success');
        updateProgress(100, 'Hoàn thành!');
        
        // Show preview
        els.videoPreview.src = url;
        els.previewSection.classList.add('active');
        els.previewOverlay.style.display = 'flex';
        
        // Auto download
        setTimeout(() => {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            debugLog('⬇️ Auto download triggered', 'success');
        }, 500);
        
        showToast('success', `✅ Hoàn thành trong ${elapsed}s! (${formatFileSize(blob.size)})`, 4000);
        
        // Step 9: Cleanup FS
        debugLog('🧹 Cleaning up FS...');
        try {
            await state.ffmpeg.deleteFile(inputName);
            await state.ffmpeg.deleteFile(outputName);
            debugLog('✅ FS cleaned');
        } catch(e) {
            debugLog(`⚠️ Cleanup error: ${e.message}`, 'error');
        }
        
    } catch (error) {
        debugLog(`❌ Lỗi xử lý: ${error.message}`, 'error');        console.error('Processing error:', error);
        showToast('error', ` Lỗi: ${error.message}`);
        updateProgress(0, 'Lỗi!');
    } finally {
        state.isProcessing = false;
        els.processBtn.disabled = false;
        els.dropZone.classList.remove('processing');
        setTimeout(() => els.progressContainer.classList.remove('active'), 2000);
    }
}

/**
 * Build FFmpeg command dựa trên loại file và platform
 */
function buildCommand(input, output, config, mimeType) {
    const type = mimeType.split('/')[0];
    
    if (type === 'video') {
        // Video: resize + re-encode
        return [
            '-i', input,
            '-vf', `scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease,pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2:black`,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-b:v', config.bitrate,
            '-maxrate', config.bitrate,
            '-bufsize', '2000k',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-y',
            output
        ];
    } else if (type === 'audio') {
        // Audio: tạo video đen 30s + audio
        return [
            '-f', 'lavfi',
            '-i', `color=c=black:s=${config.width}x${config.height}:d=30`,
            '-i', input,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-b:v', config.bitrate,
            '-c:a', 'aac',
            '-b:a', '128k',
            '-shortest',
            '-movflags', '+faststart',
            '-y',
            output
        ];
    } else {        // Image: slideshow 10s
        return [
            '-loop', '1',
            '-i', input,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-b:v', config.bitrate,
            '-t', '10',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-y',
            output
        ];
    }
}

// ==================== UTILITIES ====================
function readFileAsUint8Array(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.onerror = () => reject(new Error('Cannot read file'));
        reader.readAsArrayBuffer(file);
    });
}

function getFileExtension(mimeType) {
    const map = {
        'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
        'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'
    };
    return map[mimeType] || 'bin';
}

function updateProgress(percent, status) {
    els.progressFill.style.width = `${percent}%`;
    els.progressStatus.textContent = status;
    els.progressPercent.textContent = `${Math.round(percent)}%`;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds) {    if (isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function resetApp() {
    state.currentFile = null;
    state.isProcessing = false;
    els.fileInfo.classList.remove('active');
    els.previewSection.classList.remove('active');
    els.progressContainer.classList.remove('active');
    els.processBtn.disabled = true;
    els.fileInput.value = '';
    els.videoPreview.src = '';
    els.progressFill.style.width = '0%';
    els.dropZone.classList.remove('processing');
    debugLog('🔄 App reset');
    showToast('info', '🔄 Đã reset', 2000);
}

function showToast(type, message, duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    els.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ==================== START ====================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

debugLog('📄 app.js loaded');