import asyncio
from asyncua import Client, ua

async def toggle_opc_value():
    # OPC UA服务器地址
    url = "opc.tcp://127.0.0.1:4840"
    
    # 创建OPC UA客户端
    client = Client(url)
    
    try:
        # 连接到OPC UA服务器
        await client.connect()
        print("Connected to OPC UA server")
        
        # 获取节点
        node = client.get_node("ns=6;s=::OpcCon:bSwitch")
        
        while True:
            # 读取当前值
            current_value = await node.read_value()
            print(f"Current value: {current_value}")
            
            # 取反操作
            new_value = not current_value
            
            # 写入新值
            await node.write_value(
                ua.DataValue(ua.Variant(new_value, ua.VariantType.Boolean))
            )
            print(f"New value set to: {new_value}")
            
            # 等待1秒
            await asyncio.sleep(1)
            
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        # 断开连接
        await client.disconnect()
        print("Disconnected from OPC UA server")

# 运行异步函数
if __name__ == "__main__":
    asyncio.run(toggle_opc_value())
