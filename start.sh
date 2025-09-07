#!/bin/bash

# 煎饼摊诗词接龙游戏启动脚本
# 用于宝塔面板启动Python项目

echo "正在启动煎饼摊诗词接龙游戏..."

# 检查Python环境
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到Python3环境，请先安装Python3"
    exit 1
fi

# 检查依赖
if [ ! -f "requirements.txt" ]; then
    echo "错误: 未找到requirements.txt文件"
    exit 1
fi

# 安装依赖
echo "正在安装依赖..."
pip3 install -r requirements.txt

# 检查Flask应用
if [ ! -f "app.py" ]; then
    echo "错误: 未找到app.py文件"
    exit 1
fi

# 启动应用
echo "启动Flask应用..."
echo "访问地址: http://localhost:5000"
echo "按 Ctrl+C 停止服务器"

# 使用生产环境配置启动
python3 bt_config.py







