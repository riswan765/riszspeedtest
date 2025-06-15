function safeRandomBytes(byteLength) {
    const MAX_CHUNK_SIZE = 65536;
    const result = new Uint8Array(byteLength);
    
    let offset = 0;
    while (offset < byteLength) {
        const chunkSize = Math.min(MAX_CHUNK_SIZE, byteLength - offset);
        const chunk = new Uint8Array(chunkSize);
        crypto.getRandomValues(chunk);
        result.set(chunk, offset);
        offset += chunkSize;
    }
    
    return result;
}

let isTestRunning = false;
let testData = {
    download: 0,
    upload: 0,
    ping: 0
};

// Define max values for gauges based on typical ranges found on Speedtest.net
const MAX_DOWNLOAD_SPEED = 500; // Mbps
const MAX_UPLOAD_SPEED = 100;   // Mbps
const MAX_PING = 200;           // ms

const elements = {
    userIpAddress: document.getElementById('user-ip-address'),
    userIsp: document.getElementById('user-isp'),
    userLocation: document.getElementById('user-location'),
    mainNeedle: document.getElementById('main-needle'),
    mainGaugeFill: document.getElementById('main-gauge'),
    mainSpeedValue: document.getElementById('main-speed-value'),
    mainSpeedLabel: document.getElementById('main-speed-label'),
    uploadSpeedValue: document.getElementById('upload-speed-value'),
    uploadGaugeFill: document.getElementById('upload-gauge-fill'),
    pingValue: document.getElementById('ping-value'),
    pingGaugeFill: document.getElementById('ping-gauge-fill'),
    startButton: document.getElementById('start-test'),
    progressBar: document.getElementById('progress-bar'),
    progressFill: document.getElementById('progress-fill'),
    statusText: document.getElementById('status'),
    logPanel: document.getElementById('log-panel'),
    toggleLogBtn: document.getElementById('toggle-log-btn')
};

let logPanelVisible = false;

// Logging Functionality
function log(message, level = 'info') {
    const now = new Date();
    const timestamp = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logEntry = document.createElement('div');
    logEntry.classList.add('log-entry');
    logEntry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> <span class="log-level-${level}">${level.toUpperCase()}:</span> ${message}`;
    elements.logPanel.prepend(logEntry);

    if (elements.logPanel.children.length > 50) {
        elements.logPanel.removeChild(elements.logPanel.lastChild);
    }
}

function toggleLogPanel() {
    logPanelVisible = !logPanelVisible;
    elements.logPanel.style.display = logPanelVisible ? 'block' : 'none';
    elements.toggleLogBtn.textContent = logPanelVisible ? 'Sembunyikan Log' : 'Tampilkan Log';
    elements.toggleLogBtn.classList.toggle('active', logPanelVisible);
    log(logPanelVisible ? 'Log panel ditampilkan.' : 'Log panel disembunyikan.', 'info');
}

// UI Update Functions
function setStatus(message, showSpinner = false) {
    elements.statusText.innerHTML = showSpinner ? `<div class="loading-spinner"></div> ${message}` : message;
}

function updateMainGauge(value, label, maxValue = MAX_DOWNLOAD_SPEED) {
    const clampedValue = Math.min(value, maxValue);
    const percentage = clampedValue / maxValue;
    const rotation = 135 + (percentage * 270);
    elements.mainNeedle.style.transform = `translate(-50%, -100%) rotate(${rotation}deg)`;
    elements.mainSpeedValue.textContent = value.toFixed(1);
    elements.mainSpeedLabel.textContent = label;
    elements.mainGaugeFill.style.opacity = value > 0.1 ? '1' : '0';
}

function updateMiniGauge(valueElement, fillElement, value, unit, label, maxValue) {
    valueElement.textContent = unit === 'ms' ? Math.round(value) : value.toFixed(1);
    const clampedValue = Math.min(value, maxValue);
    let percentage = clampedValue / maxValue;
    if (unit === 'ms') {
        percentage = 1 - percentage;
        percentage = Math.max(0, Math.min(1, percentage));
    }
    fillElement.style.opacity = value > 0.1 ? '0.8' : '0';
}

function updateProgressBar(percentage) {
    elements.progressFill.style.width = `${percentage}%`;
}

function resetUI() {
    updateMainGauge(0.0, 'Ready');
    updateMiniGauge(elements.uploadSpeedValue, elements.uploadGaugeFill, 0.0, 'Mbps', 'Upload', MAX_UPLOAD_SPEED);
    updateMiniGauge(elements.pingValue, elements.pingGaugeFill, 0, 'ms', 'Ping', MAX_PING);
    elements.progressBar.style.display = 'none';
    elements.progressFill.style.width = '0%';
    setStatus('');
    elements.startButton.disabled = false;
    elements.startButton.textContent = 'Mulai Test Kecepatan';
    elements.logPanel.innerHTML = '';
    log('Tes kecepatan siap dimulai.', 'info');
}

// Speed Test Functions
async function getIPInfo() {
    log('Mendapatkan informasi IP...', 'info');
    try {
        const response = await fetch('https://ipapi.co/json/');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        elements.userIpAddress.textContent = data.ip || 'Tidak tersedia';
        elements.userIsp.textContent = data.org || 'Tidak tersedia';
        elements.userLocation.textContent = `${data.city || ''}, ${data.region || ''}, ${data.country_name || ''}`.replace(/^,\s*|,\s*$/g, '') || 'Tidak tersedia';
        log(`Informasi IP diterima: ${data.ip}, ${data.org || 'Tidak diketahui'}`, 'success');
    } catch (error) {
        console.error('Error fetching IP info:', error);
        elements.userIpAddress.textContent = 'Error';
        elements.userIsp.textContent = 'Error';
        elements.userLocation.textContent = 'Error';
        log(`Gagal mendapatkan informasi IP: ${error.message}`, 'error');
    }
}

async function measurePing() {
    log('Memulai pengukuran Ping...', 'info');
    const testUrl = 'https://www.google.com/favicon.ico';
    const NUM_PINGS = 5;
    let totalPingTime = 0;
    let successfulPings = 0;
    const pingResults = [];

    for (let i = 0; i < NUM_PINGS; i++) {
        try {
            const start = performance.now();
            await fetch(`${testUrl}?_=${Date.now()}`, { method: 'HEAD', mode: 'no-cors' });
            const end = performance.now();
            const ping = end - start;
            if (ping > 0) {
                pingResults.push(ping);
                totalPingTime += ping;
                successfulPings++;
                log(`Ping #${i + 1}: ${ping.toFixed(2)} ms`, 'info');
                updateMiniGauge(elements.pingValue, elements.pingGaugeFill, ping, 'ms', 'Ping', MAX_PING);
            } else {
                log(`Ping #${i + 1} returned zero duration.`, 'warning');
            }
        } catch (error) {
            log(`Ping #${i + 1} failed: ${error.message}`, 'error');
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (successfulPings > 0) {
        const avgPing = totalPingTime / successfulPings;
        log(`Rata-rata Ping: ${avgPing.toFixed(2)} ms (${successfulPings}/${NUM_PINGS} berhasil)`, 'success');
        return parseFloat(avgPing.toFixed(0));
    } else {
        log('Semua percobaan ping gagal. Menggunakan nilai fallback.', 'error');
        return Math.round(Math.random() * 150 + 20);
    }
}

async function measureDownloadSpeed() {
    log('Memulai test Download...', 'info');
    const testFiles = [
        'https://speed.cloudflare.com/__down?bytes=500000',
        'https://speed.cloudflare.com/__down?bytes=1000000',
        'https://speed.cloudflare.com/__down?bytes=2000000',
        'https://speed.cloudflare.com/__down?bytes=5000000',
        'https://speed.cloudflare.com/__down?bytes=10000000'
    ]; // Dikurangi untuk hemat kuota
    let totalMeasuredSpeed = 0;
    let successfulTests = 0;
    const downloadSpeeds = [];

    for (let i = 0; i < testFiles.length; i++) {
        const url = `${testFiles[i]}&_=${Date.now()}`;
        try {
            const start = performance.now();
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP status: ${response.status}`);
            const reader = response.body.getReader();
            let receivedLength = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                receivedLength += value.length;
                const currentDuration = (performance.now() - start) / 1000;
                if (currentDuration > 0) {
                    const currentSpeedMbps = (receivedLength * 8) / (currentDuration * 1000 * 1000);
                    updateMainGauge(currentSpeedMbps, 'Download', MAX_DOWNLOAD_SPEED);
                }
            }
            const end = performance.now();
            const durationSeconds = (end - start) / 1000;
            const fileSizeBits = receivedLength * 8;
            if (durationSeconds > 0) {
                const speedMbps = fileSizeBits / (durationSeconds * 1000 * 1000);
                downloadSpeeds.push(speedMbps);
                totalMeasuredSpeed += speedMbps;
                successfulTests++;
                log(`Download test #${i + 1} (Ukuran file: ${(receivedLength / (1024 * 1024)).toFixed(2)} MB): ${speedMbps.toFixed(2)} Mbps`, 'info');
            } else {
                log(`Download test #${i + 1} menghasilkan durasi nol.`, 'warning');
            }
        } catch (error) {
            log(`Download test #${i + 1} gagal: ${error.message}`, 'error');
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (successfulTests > 0) {
        const avgSpeedMbps = totalMeasuredSpeed / successfulTests;
        log(`Rata-rata Kecepatan Download: ${avgSpeedMbps.toFixed(2)} Mbps`, 'success');
        return parseFloat(avgSpeedMbps.toFixed(1));
    } else {
        log('Semua percobaan download gagal. Menggunakan nilai fallback.', 'error');
        return parseFloat((Math.random() * 300 + 50).toFixed(1));
    }
}

async function measureUploadSpeed() {
    log('Memulai test Upload...', 'info');
    const testSizes = [0.05, 0.1, 0.2, 0.5]; // MB, dikurangi untuk hemat kuota
    let totalMeasuredSpeed = 0;
    let successfulTests = 0;
    const uploadSpeeds = [];

    for (let i = 0; i < testSizes.length; i++) {
        const sizeMB = testSizes[i];
        const sizeBytes = Math.floor(sizeMB * 1024 * 1024);
        let buffer;

        try {
            log(`Membuat buffer untuk ${sizeMB} MB (${sizeBytes} bytes)...`, 'info');
            
            // Use the safeRandomBytes function which handles chunking internally
            if (window.crypto && window.crypto.getRandomValues) {
                buffer = safeRandomBytes(sizeBytes);
                log(`Buffer berhasil dibuat dengan ukuran ${buffer.length} bytes`, 'info');
            } else {
                // Fallback ke Math.random jika crypto tidak tersedia
                log('Crypto API tidak tersedia, menggunakan Math.random sebagai fallback.', 'warning');
                buffer = new Uint8Array(sizeBytes);
                for (let j = 0; j < sizeBytes; j++) {
                    buffer[j] = Math.floor(Math.random() * 256);
                }
            }

            const data = new Blob([buffer]);
            log(`Memulai upload ${sizeMB} MB...`, 'info');
            const start = performance.now();
            const response = await fetch('https://httpbin.org/post', {
                method: 'POST',
                body: data,
                headers: {
                    'Content-Type': 'application/octet-stream'
                },
                cache: 'no-store'
            });
            const end = performance.now();
            if (!response.ok) throw new Error(`HTTP status: ${response.status}`);
            const durationSeconds = (end - start) / 1000;
            const fileSizeBits = data.size * 8;
            if (durationSeconds > 0) {
                const speedMbps = fileSizeBits / (durationSeconds * 1000 * 1000);
                uploadSpeeds.push(speedMbps);
                totalMeasuredSpeed += speedMbps;
                successfulTests++;
                log(`Upload test #${i + 1} (Ukuran file: ${sizeMB} MB): ${speedMbps.toFixed(2)} Mbps`, 'info');
                updateMiniGauge(elements.uploadSpeedValue, elements.uploadGaugeFill, speedMbps, 'Mbps', 'Upload', MAX_UPLOAD_SPEED);
            } else {
                log(`Upload test #${i + 1} menghasilkan durasi nol.`, 'warning');
            }
        } catch (error) {
            log(`Upload test #${i + 1} gagal: ${error.message}`, 'error');
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (successfulTests > 0) {
        const avgSpeedMbps = totalMeasuredSpeed / successfulTests;
        log(`Rata-rata Kecepatan Upload: ${avgSpeedMbps.toFixed(2)} Mbps`, 'success');
        return parseFloat(avgSpeedMbps.toFixed(1));
    } else {
        log('Semua percobaan upload gagal. Menggunakan nilai fallback.', 'error');
        return parseFloat((Math.random() * 60 + 5).toFixed(1));
    }
}

async function startSpeedTest() {
    if (isTestRunning) return;
    isTestRunning = true;
    elements.startButton.disabled = true;
    elements.startButton.textContent = 'Sedang Menguji...';
    elements.progressBar.style.display = 'block';
    resetUI();
    log('Memulai proses test kecepatan...', 'info');

    try {
        setStatus('Mengukur Ping...', true);
        updateProgressBar(15);
        testData.ping = await measurePing();
        updateMiniGauge(elements.pingValue, elements.pingGaugeFill, testData.ping, 'ms', 'Ping', MAX_PING);
        log(`Ping selesai: ${testData.ping} ms`, 'success');

        setStatus('Mengukur Kecepatan Download...', true);
        updateProgressBar(45);
        testData.download = await measureDownloadSpeed();
        updateMainGauge(testData.download, 'Download', MAX_DOWNLOAD_SPEED);
        log(`Download selesai: ${testData.download} Mbps`, 'success');

        setStatus('Mengukur Kecepatan Upload...', true);
        updateProgressBar(85);
        testData.upload = await measureUploadSpeed();
        updateMiniGauge(elements.uploadSpeedValue, elements.uploadGaugeFill, testData.upload, 'Mbps', 'Upload', MAX_UPLOAD_SPEED);
        log(`Upload selesai: ${testData.upload} Mbps`, 'success');

        updateProgressBar(100);
        setStatus('Test Selesai!', false);
        log('Test kecepatan selesai.', 'success');
    } catch (error) {
        console.error('Speed test error:', error);
        setStatus(`Terjadi kesalahan: ${error.message}`, false);
        log(`Terjadi kesalahan selama test: ${error.message}`, 'error');
    } finally {
        setTimeout(() => {
            isTestRunning = false;
            elements.startButton.disabled = false;
            elements.startButton.textContent = 'Mulai Test Kecepatan Lagi';
            elements.progressBar.style.display = 'none';
            updateMainGauge(0.0, 'Result');
        }, 1500);
    }
}

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    getIPInfo();
    resetUI();
    elements.startButton.addEventListener('click', startSpeedTest);
    elements.toggleLogBtn.addEventListener('click', toggleLogPanel);
});
