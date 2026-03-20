<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>数据采集监控</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        h1 {
            color: #333;
            text-align: center;
        }
        .status {
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
            text-align: center;
            font-weight: bold;
        }
        .status.connected {
            background-color: #d4edda;
            color: #155724;
        }
        .status.disconnected {
            background-color: #f8d7da;
            color: #721c24;
        }
        .data-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .buffer-card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .buffer-card h3 {
            margin-top: 0;
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
        }
        .data-info {
            margin: 10px 0;
            padding: 8px;
            background-color: #ecf0f1;
            border-radius: 4px;
        }
        .data-value {
            font-family: 'Courier New', monospace;
            color: #e74c3c;
            font-weight: bold;
        }
        .timestamp {
            color: #7f8c8d;
            font-size: 0.9em;
        }
        .chart-container {
            margin-top: 15px;
            height: 200px;
            background-color: #fafafa;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        #log {
            margin-top: 20px;
            padding: 15px;
            background-color: #2c3e50;
            color: #ecf0f1;
            border-radius: 5px;
            max-height: 300px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.85em;
        }
        .log-entry {
            margin: 5px 0;
            padding: 3px;
        }
        .log-success {
            color: #2ecc71;
        }
        .log-error {
            color: #e74c3c;
        }
        .log-info {
            color: #3498db;
        }
    </style>
</head>
<body>
    <h1>📊 数据采集实时监控</h1>
    
    <div id="status" class="status disconnected">
        ⚠️ 等待连接...
    </div>

    <div class="data-container" id="dataContainer">
        <!-- 数据卡片将在这里动态生成 -->
    </div>

    <div id="log"></div>

    <script>
        // WebSocket 或 HTTP 轮询配置
        const POLL_INTERVAL = 2000; // 轮询间隔（毫秒）
        let lastDataTime = null;
        
        // 添加日志条目
        function addLog(message, type = 'info') {
            const logDiv = document.getElementById('log');
            const entry = document.createElement('div');
            entry.className = `log-entry log-${type}`;
            const timestamp = new Date().toLocaleTimeString();
            entry.textContent = `[${timestamp}] ${message}`;
            logDiv.appendChild(entry);
            logDiv.scrollTop = logDiv.scrollHeight;
            
            // 限制日志条数
            if (logDiv.children.length > 100) {
                logDiv.removeChild(logDiv.firstChild);
            }
        }

        // 更新状态显示
        function updateStatus(connected) {
            const statusDiv = document.getElementById('status');
            if (connected) {
                statusDiv.className = 'status connected';
                statusDiv.innerHTML = '✅ 已连接到数据采集系统';
            } else {
                statusDiv.className = 'status disconnected';
                statusDiv.innerHTML = '⚠️ 未连接到数据采集系统';
            }
        }

        // 创建缓冲区卡片
        function createBufferCard(bufferIndex, bufferData) {
            const card = document.createElement('div');
            card.className = 'buffer-card';
            card.id = `buffer-${bufferIndex}`;
            
            const title = document.createElement('h3');
            title.textContent = `缓冲区 #${bufferIndex + 1}`;
            card.appendChild(title);
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'data-info';
            infoDiv.innerHTML = `
                <div>数据点数量：<span class="data-value">${bufferData.total_count}</span></div>
                <div class="timestamp">最后更新：${new Date().toLocaleString()}</div>
            `;
            card.appendChild(infoDiv);
            
            // 创建图表容器
            const chartContainer = document.createElement('div');
            chartContainer.className = 'chart-container';
            chartContainer.id = `chart-${bufferIndex}`;
            card.appendChild(chartContainer);
            
            // 显示前 10 个值
            const valuesDiv = document.createElement('div');
            valuesDiv.style.marginTop = '10px';
            valuesDiv.style.fontSize = '0.85em';
            const sampleValues = bufferData.values.slice(0, 10).map(v => v.toFixed(2)).join(', ');
            valuesDiv.innerHTML = `<strong>前 10 个值:</strong> ${sampleValues}...`;
            card.appendChild(valuesDiv);
            
            return card;
        }

        // 更新缓冲区数据
        function updateBufferData(bufferIndex, bufferData) {
            let card = document.getElementById(`buffer-${bufferIndex}`);
            
            if (!card) {
                // 如果卡片不存在，创建新的
                card = createBufferCard(bufferIndex, bufferData);
                document.getElementById('dataContainer').appendChild(card);
                
                // 这里可以集成 Chart.js 等图表库
                addLog(`创建缓冲区 #${bufferIndex + 1}`, 'success');
            } else {
                // 更新现有卡片
                const infoDiv = card.querySelector('.data-info');
                infoDiv.innerHTML = `
                    <div>数据点数量：<span class="data-value">${bufferData.total_count}</span></div>
                    <div class="timestamp">最后更新：${new Date().toLocaleString()}</div>
                `;
                
                const valuesDiv = card.querySelector('div[style*="margin-top"]');
                const sampleValues = bufferData.values.slice(0, 10).map(v => v.toFixed(2)).join(', ');
                valuesDiv.innerHTML = `<strong>前 10 个值:</strong> ${sampleValues}...`;
                
                addLog(`更新缓冲区 #${bufferIndex + 1} (${bufferData.total_count} 个数据点)`, 'info');
            }
        }

        // 处理接收到的数据
        function handleDataReceived(data) {
            try {
                addLog(`收到数据：组名=${data.group_name}, 缓冲区数=${data.data_count}`, 'success');
                
                // 更新每个缓冲区
                if (data.buffers && data.buffers.length > 0) {
                    data.buffers.forEach((buffer, index) => {
                        updateBufferData(index, buffer);
                    });
                }
                
                lastDataTime = new Date();
                updateStatus(true);
                
            } catch (error) {
                addLog(`处理数据失败：${error.message}`, 'error');
                updateStatus(false);
            }
        }

        // 轮询数据（如果你的 HTTP 服务器支持 GET 请求获取最新数据）
        async function pollData() {
            try {
                // 从 HTTP 服务器获取最新数据
                const response = await fetch('http://localhost:8080/api/latest-data');
                if (response.ok) {
                    const result = await response.json();
                    if (result.status === 'success' && result.data) {
                        handleDataReceived(result.data);
                    }
                }
            } catch (error) {
                // 静默失败，下次轮询会重试
                // console.log('轮询失败:', error.message);
            }
        }

        // 页面加载完成后开始轮询
        window.addEventListener('load', () => {
            addLog('页面加载完成，开始监控', 'info');
            
            // 启用主动轮询，每 2 秒获取一次最新数据
            setInterval(pollData, POLL_INTERVAL);
            addLog(`开始轮询数据，间隔：${POLL_INTERVAL}ms`, 'info');
        });

        // 示例：模拟接收数据（用于测试）
        // 实际使用时应该删除这段代码
        /*
        setInterval(() => {
            const mockData = {
                timestamp: new Date().toISOString(),
                group_name: 'query_group_1',
                point_names: ['rEC', 'rF10', 'rF11'],
                data_count: 3,
                buffers: [
                    {
                        buffer_index: 0,
                        values: Array.from({length: 50}, () => Math.random() * 100),
                        times: Array.from({length: 50}, () => new Date().toISOString()),
                        total_count: 1000
                    }
                ]
            };
            handleDataReceived(mockData);
        }, 5000);
        */
    </script>
</body>
</html>
