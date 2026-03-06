import asyncio
import math
import random
from asyncua import Server, ua, Node

# 配置参数
UPDATE_INTERVAL = 1.0  # 更新间隔（秒）
NUM_POINTS = 10        # 数据点数量
BASE_PORT = 4840       # OPC UA 默认端口

async def main():
    # 1. 初始化服务器
    server = Server()
    await server.init()
    
    # 设置端点地址 (opc.tcp://<IP>:<Port>/freeopcua/server/)
    # 0.0.0.0 表示监听所有网卡，局域网内其他设备也可连接
    endpoint_url = f"opc.tcp://0.0.0.0:{BASE_PORT}/freeopcua/server/"
    server.set_endpoint(endpoint_url)
    
    # 配置安全策略（允许无加密连接，解决 "No encrypting policy available" 警告）
    server.set_security_policy(
        [
            ua.SecurityPolicyType.NoSecurity,
            # ua.SecurityPolicyType.Basic256Sha256_SignAndEncrypt,
            # ua.SecurityPolicyType.Basic256Sha256_Sign,
        ]
    )
    
    # 设置服务器名称（客户端连接时可见）
    server.set_server_name("Python Custom Simulation Server")
    
    # 添加一个自定义命名空间 (Namespace)，避免与标准节点冲突
    idx = await server.register_namespace("http://my-custom-simulation.com")
    
    # 2. 创建对象文件夹
    # 在 Objects 文件夹下创建一个名为 "MySensors" 的对象
    objects_node = server.nodes.objects
    my_sensors_obj = await objects_node.add_object(idx, "MySensors")
    
    print(f"🚀 服务器已启动：{endpoint_url}")
    print(f"📡 正在生成 {NUM_POINTS} 个数据点...")

    # 3. 动态创建 10 个变量节点
    sensor_nodes = []
    initial_time = asyncio.get_event_loop().time()

    for i in range(1, NUM_POINTS + 1):
        var_name = f"Sensor_{i:02d}"  # 格式化为 Sensor_01, Sensor_02...
        
        # 添加变量：初始值为 0.0，类型为 Float (明确指定数据类型)
        node = await my_sensors_obj.add_variable(idx, var_name, 0.0, varianttype=ua.VariantType.Double)
        
        # 设置为可写 (虽然我们是服务器端自己写，但设为可写符合常规习惯)
        await node.set_writable()
        
        sensor_nodes.append({
            "node": node,
            "id": i,
            "type": "sine" if i <= 5 else "random", # 前 5 个正弦，后 5 个随机
            "offset": random.uniform(20, 100)       # 每个传感器有一个基础偏移量
        })

    # 4. 启动服务器上下文
    async with server:
        while True:
            current_time = asyncio.get_event_loop().time()
            elapsed = current_time - initial_time
            
            # --- 核心逻辑：计算并更新 10 个点的值 ---
            for item in sensor_nodes:
                new_value = 0.0
                
                if item["type"] == "sine":
                    # 正弦波逻辑：幅度 10, 周期 5秒, 加上基础偏移量
                    # 公式: Offset + Amplitude * sin(2π * t / Period)
                    amplitude = 10.0
                    period = 5.0
                    new_value = item["offset"] + amplitude * math.sin(2 * math.pi * elapsed / period)
                
                elif item["type"] == "random":
                    # 随机游走逻辑：在上一秒的基础上微调 (-2 到 +2 之间)
                    # 获取当前值作为基准 (为了演示简单，这里直接用 offset 做基准波动)
                    # 实际生产中通常读取当前值再加减
                    current_val = await item["node"].get_value()
                    change = random.uniform(-2.0, 2.0)
                    new_value = current_val + change
                    
                    # 限制范围在 0 到 200 之间，防止无限漂移
                    new_value = max(0, min(200, new_value))
                # 写入新值到 OPC UA 节点（确保使用正确的数据类型）
                await item["node"].write_value(new_value, ua.VariantType.Double)
            
            # 打印日志 (可选，方便观察控制台输出)
            # 获取所有值用于打印
            values = [await item["node"].get_value() for item in sensor_nodes]
            print(f"[{elapsed:.1f}s] 更新完成：{values}")

            # 等待 1 秒
            await asyncio.sleep(UPDATE_INTERVAL)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 服务器已停止")