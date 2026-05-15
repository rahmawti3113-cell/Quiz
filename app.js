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
    if (logs.length === 0) return;
    
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
async function fetchSensorData() {
    const loader = document.getElementById('sensor-loading');
    if (elTemp && (!elTemp.textContent || elTemp.textContent === '--')) loader?.classList.add('active');
    try {
        const res = await fetch('/dht');
        if (res.ok) {
            const data = await res.json();
            updateSensors(data);
        }
    } catch (err) {
        console.error("Failed to fetch sensor data:", err);
        showToast("Fetch Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
        loader?.classList.remove('active');
    }
}

async function fetchStatusAndLogs() {
    try {
        const [statusRes, logsRes, histRes] = await Promise.all([
            fetch('/status').then(r => r.json()),
            fetch('/logs').then(r => r.json()),
            fetch('/dht/history').then(r => r.json())
        ]);
        
        updateStatusUI(statusRes);
        renderLogs(logsRes);
        updateChart(histRes);
    } catch (err) {
        console.error("Failed to sync backend state:", err);
        showToast("Sync Error: " + (err instanceof Error ? err.message : String(err)));
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
            fetchStatusAndLogs(); // Refresh logs immediately
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
    fetchSensorData();
    fetchStatusAndLogs();

    // Polling loops
    setInterval(fetchSensorData, 2000); // Poll temp fast
    setInterval(fetchStatusAndLogs, 5000); // Poll logs and history slightly slower
});
