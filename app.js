// Global State
let chartInstance = null;
let historicalData = [];

// DOM Elements
const elTemp = document.getElementById('temp-val');
const elHum = document.getElementById('hum-val');
const elEspStatus = document.getElementById('esp-status');
const elTgStatus = document.getElementById('tg-status');
const elClock = document.getElementById('realtime-clock');
const logsContainer = document.getElementById('logs-container');

// Realtime Clock
setInterval(() => {
    const now = new Date();
    if (elClock) elClock.textContent = now.toLocaleTimeString('en-US', { hour12: false });
}, 1000);

// Toast Notification System
function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
}

// Chart.js Setup
function initChart() {
    const el = document.getElementById('dhtChart');
    if (!el) return;
    const ctx = el.getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Temperature (°C)',
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    data: [],
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2,
                    pointRadius: 0
                },
                {
                    label: 'Humidity (%)',
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    data: [],
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#94a3b8' }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    min: 0,
                    max: 100
                }
            },
            animation: {
                duration: 400
            }
        }
    });
}

function updateChart(history) {
    if (!chartInstance) return;
    const labels = history.map(item => new Date(item.time).toLocaleTimeString([], {minute: '2-digit', second:'2-digit'}));
    const tempData = history.map(item => item.temp);
    const humData = history.map(item => item.hum);

    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = tempData;
    chartInstance.data.datasets[1].data = humData;
    chartInstance.update();
}

// Update UI
function updateSensors(data) {
    if (elTemp) elTemp.textContent = data.temp;
    if (elHum) elHum.textContent = data.hum;
}

function renderLogs(logs) {
    logsContainer.innerHTML = '';
    logs.forEach(log => {
        const div = document.createElement('div');
        div.className = `log-item log-type-${log.type || 'info'}`;
        const timeStr = new Date(log.time).toLocaleTimeString();
        div.innerHTML = `<span class="log-time">${timeStr}</span> <span class="log-msg">${log.message}</span>`;
        logsContainer.appendChild(div);
    });
}

function updateStatusUI(status) {
    // ESP Status
    if (elEspStatus) {
        if (status.esp32_online) {
            elEspStatus.classList.add('online');
            elEspStatus.classList.remove('offline');
            elEspStatus.querySelector('.status-text').textContent = 'Online';
        } else {
            elEspStatus.classList.add('offline');
            elEspStatus.classList.remove('online');
            elEspStatus.querySelector('.status-text').textContent = 'Offline';
        }
    }

    // Telegram Status
    if (elTgStatus) {
        if (status.telegram_configured) {
            elTgStatus.classList.add('online');
            elTgStatus.classList.remove('offline');
            elTgStatus.querySelector('.status-text').textContent = 'Active';
        } else {
            elTgStatus.classList.add('offline');
            elTgStatus.classList.remove('online');
            elTgStatus.querySelector('.status-text').textContent = 'No Config';
        }
    }

    // Relays
    if (status.relays) {
        Object.entries(status.relays).forEach(([id, isOn]) => {
            const btn = document.getElementById(`btn-relay-${id}`);
            if (btn) {
                if (isOn) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        });
    }
}

// API Calls
let consecutiveErrors = 0;

async function fetchFullState() {
    const loader = document.getElementById('sensor-loading');
    if (elTemp && (!elTemp.textContent || elTemp.textContent === '--')) loader?.classList.add('active');
    try {
        const res = await fetch('/full-state');
        if (res.ok) {
            consecutiveErrors = 0; // Reset on success
            const data = await res.json();
            
            // Hydrate all parts of UI
            updateSensors(data.dht);
            updateStatusUI(data.status);
            renderLogs(data.logs);
            updateChart(data.history);
        } else {
            console.error("HTTP Error:", res.status);
        }
    } catch (err) {
        consecutiveErrors++;
        console.error("Failed to fetch full state:", err);
        // Only show toast if it's consistently failing, avoiding spam.
        if (consecutiveErrors === 1) {
            showToast("Connection to server lost. Retrying...");
        } else if (consecutiveErrors % 10 === 0) { // Remind them every 10th failure
            showToast("Still trying to reconnect...");
        }
    } finally {
        loader?.classList.remove('active');
    }
}

// Interactivity
window.toggleRelay = async function(id) {
    const btn = document.getElementById(`btn-relay-${id}`);
    const isCurrentlyOn = btn.classList.contains('active');
    const newState = isCurrentlyOn ? 'off' : 'on';
    
    // Optimistic UI update
    if (newState === 'on') btn.classList.add('active');
    else btn.classList.remove('active');

    try {
        const res = await fetch(`/relay/${id}/${newState}`);
        const data = await res.json();
        if (data.success) {
            showToast(`Relay ${id} turned ${newState.toUpperCase()}`);
            fetchFullState(); // Refresh immediately after interaction
        } else {
            throw new Error('Failed');
        }
    } catch (error) {
        showToast(`Error toggling Relay ${id}`);
        // Revert UI exactly
        if (isCurrentlyOn) btn.classList.add('active');
        else btn.classList.remove('active');
    }
}

// Init
window.addEventListener('DOMContentLoaded', () => {
    initChart();
    
    // Initial fetch
    fetchFullState();

    // Single polling loop (gentler on reverse proxies, ~5000ms is standard)
    setInterval(fetchFullState, 5000); 
});

// Voice Control
const btnVoice = document.getElementById('btn-voice');
const voiceStatus = document.getElementById('voice-status');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition && btnVoice) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let isListening = false;

    btnVoice.addEventListener('click', () => {
        if (isListening) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });

    recognition.onstart = () => {
        isListening = true;
        btnVoice.style.background = 'rgba(239, 68, 68, 0.4)';
        btnVoice.style.borderColor = '#ef4444';
        voiceStatus.style.display = 'block';
        voiceStatus.innerHTML = '🎙️ Mendengarkan... Coba: "nyalakan relay 1", "matikan semua", "nyala bergiliran"';
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        voiceStatus.innerHTML = `🗣️ Anda berkata: "<b>${transcript}</b>"`;
        
        handleVoiceCommand(transcript);
        
        setTimeout(() => {
            voiceStatus.style.display = 'none';
        }, 5000);
    };

    recognition.onspeechend = () => {
        recognition.stop();
    };

    recognition.onend = () => {
        isListening = false;
        btnVoice.style.background = 'rgba(255,255,255,0.1)';
        btnVoice.style.borderColor = 'rgba(255,255,255,0.2)';
    };

    recognition.onerror = (event) => {
        voiceStatus.innerHTML = `❌ Error: ${event.error}`;
        setTimeout(() => {
            voiceStatus.style.display = 'none';
        }, 3000);
    };
} else if (btnVoice) {
    btnVoice.style.display = 'none';
    console.warn("Speech Recognition API not supported in this browser.");
}

async function handleVoiceCommand(command) {
    if (command.includes('bergiliran') || command.includes('beruntun')) {
        sequenceRelays(['1', '2', '3', '4'], 'on', 1000);
        return;
    }
    
    if (command.includes('matikan semua') || command.includes('mati semua')) {
        sequenceRelays(['1', '2', '3', '4'], 'off', 500);
        return;
    }

    if (command.includes('hidupkan semua') || command.includes('nyalakan semua')) {
        sequenceRelays(['1', '2', '3', '4'], 'on', 500);
        return;
    }

    const relayMatch = command.match(/relay\s*(\d)/);
    if (!relayMatch) {
         showToast("Perintah tidak dikenali");
         return;
    }
    
    const id = relayMatch[1];
    if (!['1', '2', '3', '4'].includes(id)) {
        showToast("Relay tidak ditemukan");
        return;
    }

    const isTurnOn = command.includes('nyala') || command.includes('hidup') || command.includes('on') || command.includes('aktifkan');
    const isTurnOff = command.includes('mati') || command.includes('off') || command.includes('nonaktifkan');

    if (isTurnOn) {
        window.toggleRelayVoice(id, 'on');
    } else if (isTurnOff) {
        window.toggleRelayVoice(id, 'off');
    } else {
        showToast("Sebutkan untuk menyalakan atau mematikan.");
    }
}

async function sequenceRelays(ids, state, delay) {
    showToast(`Relay akan ${state === 'on' ? 'menyala' : 'mati'} bergiliran...`);
    for (let i = 0; i < ids.length; i++) {
        setTimeout(async () => {
            await window.toggleRelayVoice(ids[i], state);
        }, i * delay);
    }
}

window.toggleRelayVoice = async function(id, newState) {
    const btn = document.getElementById(`btn-relay-${id}`);
    
    if (newState === 'on') btn.classList.add('active');
    else btn.classList.remove('active');

    try {
        const res = await fetch(`/relay/${id}/${newState}`);
        const data = await res.json();
        if (data.success) {
            showToast(`Relay ${id} -> ${newState.toUpperCase()}`);
            fetchFullState();
        }
    } catch (error) {
        console.error("Error toggling relay via voice", id, error);
        // revert
        const isCurrentlyActive = document.getElementById(`btn-relay-${id}`).classList.contains('active');
        if (!isCurrentlyActive && newState === 'on') btn.classList.remove('active');
        if (isCurrentlyActive && newState === 'off') btn.classList.add('active');
    }
}
