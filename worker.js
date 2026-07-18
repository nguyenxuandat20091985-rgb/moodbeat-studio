/**
 * MoodBeat Studio v4.0 - Web Worker
 * Xử lý FFmpeg hoàn toàn bất đồng bộ, tách biệt khỏi Main Thread
 * 
 * @author Senior Frontend Developer
 * @version 4.0.0
 */

// Import FFmpeg từ CDN (sử dụng importScripts cho worker)
importScripts('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.7/dist/umd/ffmpeg.js');
importScripts('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/umd/index.js');

// Khai báo biến toàn cục
let ffmpeg = null;
let isProcessing = false;
let currentFiles = []; // Lưu trữ file hiện tại để cleanup

/**
 * Khởi tạo FFmpeg instance
 * Chỉ load một lần duy nhất khi worker start
 */
async function initFFmpeg() {
    try {
        const { FFmpeg } = FFmpegWasm;
        const { fetchFile } = FFmpegUtil;
        
        ffmpeg = new FFmpeg();
        
        // Cấu hình log để gửi progress về main thread
        ffmpeg.on('log', ({ message }) => {
            // Parse progress từ FFmpeg log
            const progress = parseFFmpegProgress(message);
            if (progress) {
                self.postMessage({
                    type: 'PROGRESS',
                    data: progress
                });
            }
        });
        
        await ffmpeg.load();
        
        self.postMessage({
            type: 'READY',
            message: 'FFmpeg đã sẵn sàng'
        });
        
    } catch (error) {
        self.postMessage({
            type: 'ERROR',            message: `Lỗi khởi tạo FFmpeg: ${error.message}`
        });
    }
}

/**
 * Parse progress từ FFmpeg log
 * @param {string} message - Log message từ FFmpeg
 * @returns {object|null} - Progress data hoặc null
 */
function parseFFmpegProgress(message) {
    // Pattern: frame= 1234 fps=30.0 q=28.0 size=    1234kB time=00:00:12.34 bitrate=1234.5kbits/s
    const timeMatch = message.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    const frameMatch = message.match(/frame=\s*(\d+)/);
    
    if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseInt(timeMatch[3]);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        
        return {
            time: totalSeconds,
            frame: frameMatch ? parseInt(frameMatch[1]) : 0,
            raw: message
        };
    }
    
    return null;
}

/**
 * Xử lý file từ main thread
 * @param {object} data - Dữ liệu nhận từ main thread
 */
async function processFile(data) {
    if (isProcessing) {
        self.postMessage({
            type: 'ERROR',
            message: 'Đang xử lý file khác, vui lòng đợi!'
        });
        return;
    }
    
    isProcessing = true;
    const { file, platform, config } = data;
    
    try {
        self.postMessage({
            type: 'STATUS',            message: 'Đang tải file vào bộ nhớ...'
        });
        
        // Convert file to Uint8Array
        const fileData = await readFileAsUint8Array(file);
        
        // Xác định loại file
        const fileType = file.type.split('/')[0]; // 'video', 'audio', 'image'
        const fileName = `input_${Date.now()}`;
        const inputPath = `${fileName}.${getFileExtension(file.type)}`;
        const outputPath = `output_${Date.now()}.mp4`;
        
        // Lưu file vào FFmpeg FS
        await ffmpeg.writeFile(inputPath, fileData);
        currentFiles.push(inputPath);
        
        self.postMessage({
            type: 'STATUS',
            message: `Đang xử lý ${fileType}...`
        });
        
        // Cấu hình FFmpeg command dựa trên platform
        let command = [];
        
        if (fileType === 'video') {
            command = buildVideoCommand(inputPath, outputPath, config);
        } else if (fileType === 'audio') {
            command = buildAudioCommand(inputPath, outputPath, config);
        } else if (fileType === 'image') {
            command = buildImageCommand(inputPath, outputPath, config);
        }
        
        self.postMessage({
            type: 'STATUS',
            message: 'Đang render video...'
        });
        
        // Execute FFmpeg command
        await ffmpeg.exec(command);
        
        self.postMessage({
            type: 'STATUS',
            message: 'Đang xuất file...'
        });
        
        // Đọc file output
        const outputData = await ffmpeg.readFile(outputPath);
        currentFiles.push(outputPath);
        
        // Tạo blob URL và gửi về main thread        const blob = new Blob([outputData.buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        
        self.postMessage({
            type: 'COMPLETE',
            data: {
                url: url,
                filename: `moodbeat_${platform}_${Date.now()}.mp4`,
                size: blob.size
            },
            message: 'Xử lý thành công!'
        });
        
        // Cleanup memory
        await cleanupFiles();
        
    } catch (error) {
        console.error('Processing error:', error);
        self.postMessage({
            type: 'ERROR',
            message: `Lỗi xử lý: ${error.message}`
        });
        
        // Cleanup khi có lỗi
        await cleanupFiles();
    } finally {
        isProcessing = false;
    }
}

/**
 * Đọc file thành Uint8Array
 * @param {File} file - File object
 * @returns {Promise<Uint8Array>}
 */
function readFileAsUint8Array(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Lấy extension từ MIME type
 * @param {string} mimeType 
 * @returns {string}
 */
function getFileExtension(mimeType) {    const map = {
        'video/mp4': 'mp4',
        'video/quicktime': 'mov',
        'video/webm': 'webm',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'image/jpeg': 'jpg',
        'image/png': 'png'
    };
    return map[mimeType] || 'bin';
}

/**
 * Build FFmpeg command cho video
 */
function buildVideoCommand(input, output, config) {
    return [
        '-i', input,
        '-vf', `scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease,pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2`,
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
}

/**
 * Build FFmpeg command cho audio (tạo video từ audio)
 */
function buildAudioCommand(input, output, config) {
    return [
        '-f', 'lavfi',
        '-i', `color=c=black:s=${config.width}x${config.height}:d=30`, // 30s black video
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
    ];}

/**
 * Build FFmpeg command cho image (tạo slideshow)
 */
function buildImageCommand(input, output, config) {
    return [
        '-loop', '1',
        '-i', input,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-b:v', config.bitrate,
        '-t', '10', // 10 seconds
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-y',
        output
    ];
}

/**
 * Dọn dẹp bộ nhớ - CỰC KỲ QUAN TRỌNG
 * Prevent memory leak và crash trình duyệt
 */
async function cleanupFiles() {
    try {
        for (const file of currentFiles) {
            try {
                await ffmpeg.deleteFile(file);
                console.log(`Deleted: ${file}`);
            } catch (e) {
                console.warn(`Cannot delete ${file}:`, e);
            }
        }
        currentFiles = [];
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

/**
 * Terminate FFmpeg instance
 * Gọi khi cần reset hoàn toàn
 */
async function terminateFFmpeg() {
    try {
        await cleanupFiles();
        if (ffmpeg) {
            await ffmpeg.terminate();
            ffmpeg = null;        }
        self.postMessage({
            type: 'TERMINATED',
            message: 'FFmpeg đã được terminate'
        });
    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            message: `Lỗi terminate: ${error.message}`
        });
    }
}

/**
 * Message handler - Lắng nghe lệnh từ main thread
 */
self.onmessage = async (e) => {
    const { type, data } = e.data;
    
    switch (type) {
        case 'INIT':
            await initFFmpeg();
            break;
            
        case 'PROCESS':
            await processFile(data);
            break;
            
        case 'TERMINATE':
            await terminateFFmpeg();
            break;
            
        case 'CLEANUP':
            await cleanupFiles();
            break;
            
        default:
            console.warn('Unknown message type:', type);
    }
};

// Handle worker termination
self.onclose = async () => {
    await cleanupFiles();
    if (ffmpeg) {
        await ffmpeg.terminate();
    }
};

// Log khi worker startconsole.log('🎬 MoodBeat Worker v4.0 started');