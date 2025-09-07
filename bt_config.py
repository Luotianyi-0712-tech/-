#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
宝塔部署配置文件
用于生产环境部署的配置
"""

import os
from app import app

if __name__ == '__main__':
    # 生产环境配置
    app.config['DEBUG'] = False
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-here')
    
    # 生产环境端口配置
    port = int(os.environ.get('PORT', 5001))
    
    # 生产环境主机配置
    host = os.environ.get('HOST', '0.0.0.0')
    
    print(f"启动煎饼摊诗词接龙游戏服务器...")
    print(f"访问地址: http://{host}:{port}")
    print(f"按 Ctrl+C 停止服务器")
    
    try:
        app.run(host=host, port=port, debug=False)
    except KeyboardInterrupt:
        print("\n服务器已停止")
    except Exception as e:
        print(f"服务器启动失败: {e}")













