"""
简易 HTTP 服务器示例
用于接收数据采集系统发送的数据
"""

from aiohttp import web
import json
import logging
from datetime import datetime

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 存储最新数据的变量
latest_data = None
data_history = []

async def handle_receive_data(request):
    """处理接收到的数据"""
    global latest_data
    
    try:
        # 解析 JSON 数据
        data = await request.json()
        
        # 添加接收时间戳
        data['received_at'] = datetime.now().isoformat()
        
        # 保存最新数据
        latest_data = data
        
        # 添加到历史记录（保留最近 100 条）
        data_history.append(data)
        if len(data_history) > 100:
            data_history.pop(0)
        
        logger.info(f"成功接收数据：组名={data.get('group_name', 'unknown')}, "
                   f"缓冲区数={data.get('data_count', 0)}")
        
        # 返回成功响应
        return web.json_response({
            'status': 'success',
            'message': '数据已接收',
            'timestamp': data['received_at']
        })
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON 解析错误：{e}")
        return web.json_response({
            'status': 'error',
            'message': f'无效的 JSON 格式：{str(e)}'
        }, status=400)
    
    except Exception as e:
        logger.error(f"处理数据失败：{e}", exc_info=True)
        return web.json_response({
            'status': 'error',
            'message': f'处理失败：{str(e)}'
        }, status=500)

async def handle_get_latest_data(request):
    """获取最新数据（供前端轮询使用）"""
    if latest_data is None:
        return web.json_response({
            'status': 'no_data',
            'message': '暂无数据'
        })
    
    return web.json_response({
        'status': 'success',
        'data': latest_data
    })

async def handle_get_history(request):
    """获取历史数据"""
    limit = int(request.query.get('limit', 10))
    return web.json_response({
        'status': 'success',
        'count': len(data_history),
        'data': data_history[-limit:]
    })

async def handle_index(request):
    """首页 - 显示监控页面"""
    return web.FileResponse('./docs/line_http.html.js')

def create_app():
    """创建 Web 应用"""
    app = web.Application()
    
    # 配置路由
    app.router.add_post('/api/data', handle_receive_data)
    app.router.add_get('/api/latest-data', handle_get_latest_data)
    app.router.add_get('/api/history', handle_get_history)
    app.router.add_get('/', handle_index)
    
    return app

if __name__ == '__main__':
    # 创建并运行应用
    app = create_app()
    
    logger.info("启动 HTTP 服务器，监听 http://localhost:8080")
    logger.info("API 端点:")
    logger.info("  POST /api/data - 接收数据")
    logger.info("  GET  /api/latest-data - 获取最新数据")
    logger.info("  GET  /api/history - 获取历史数据")
    logger.info("  GET  / - 监控页面")
    
    web.run_app(app, host='0.0.0.0', port=8080)
