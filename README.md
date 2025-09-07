#项目游玩地址
http://bigbing.v50tome.cn
# 🍳 煎饼摊诗词接龙游戏

一个基于Web的诗词接龙游戏，玩家可以在100×100的网格中通过相同汉字连接不同诗句，形成如同煎饼摊般错落有致的诗词网络。

## ✨ 功能特色

- **智能排版**: 自动检测诗句方向，实现横纵转换的接龙规则
- **可视化网格**: 100×100的大画布，支持缩放和滚动
- **颜色系统**: 多种预设颜色，让每句诗都有独特的视觉标识
- **实时保存**: 自动保存游戏进度，支持数据持久化
- **实时玩家列表**: 左侧面板显示玩家在线/离线状态与各自已填诗句数量，并在加句、进出房间、断线时实时更新
- **响应式设计**: 支持桌面和移动设备，提供良好的用户体验

## 🎮 游戏规则

1. **起始规则**: 第一句诗默认为横向排列
2. **接龙机制**: 后句必须使用前句中任意位置的一个汉字作为衔接点
3. **方向转换**: 若前句为横向，接龙句必须纵向；若前句为纵向，接龙句必须横向
4. **位置自由**: 接龙句可在矩阵任意位置，不要求首尾相连

## 🚀 快速开始

### 本地开发

1. **克隆项目**
   ```bash
   git clone <项目地址>
   cd jianbing-game
   ```

2. **安装依赖**
   ```bash
   pip install -r requirements.txt
   ```

3. **运行应用**
   ```bash
   python app.py
   ```

4. **访问游戏**
   打开浏览器访问 `http://localhost:5000`

### 宝塔部署

1. **上传项目文件**
   将项目文件上传到宝塔面板的网站目录

2. **安装Python环境**
   在宝塔面板中安装Python 3.8+环境

3. **安装依赖**
   ```bash
   cd /www/wwwroot/你的网站目录
   pip3 install -r requirements.txt
   ```

4. **配置网站**
   - 在宝塔面板中添加网站
   - 设置Python项目，选择项目目录
   - 配置启动文件为 `app.py`
   - 设置端口为5000

5. **启动服务**
   在宝塔面板中启动Python项目

## 🛠️ 技术架构

- **后端**: Python Flask + Flask-SocketIO（threading 模式）
- **前端**: HTML5 + CSS3 + JavaScript (ES6+)
- **数据存储**: JSON文件存储（`rooms_data.json` 按房间分片）
- **实时通信**: Socket.IO（房间内事件广播与统计推送）
- **部署**: 支持宝塔面板部署

## 📁 项目结构

```
jianbing-game/
├── app.py              # Flask主应用（REST + Socket.IO）
├── requirements.txt    # Python依赖
├── README.md          # 项目说明
├── templates/         # HTML模板
│   └── index.html    # 主页面
├── static/           # 静态资源
│   ├── style.css     # 样式文件
│   └── script.js     # JavaScript逻辑
└── game_data.json    # 游戏数据（自动生成，历史保留）

> 说明：房间数据持久化在 `rooms_data.json` 中，每个房间包含 `players`、`game_data.poems`、`game_data.grid` 等。
```

## 🎯 使用方法

### 开始新游戏

1. 在左侧控制面板输入第一句诗
2. 选择喜欢的颜色
3. 点击"输入新诗句"按钮

### 接龙游戏

1. 点击已存在诗句中的任意汉字
2. 在弹出的模态框中输入接龙诗句
3. 系统自动确定方向和位置
4. 点击"确认接龙"完成

### 游戏控制

- **清除选择**: 清除当前选中的字符
- **重置画布**: 清空所有诗句，重新开始
- **缩放控制**: 放大、缩小或重置画布视图
- **玩家列表**: 左侧“房间信息”中实时显示“在线玩家：在线数/总数”，以及每位玩家的“在线/离线”状态与“诗句”数量。

> 前端文件 `templates/index.html` 中玩家列表容器为：
> `ul#playersList`，其渲染逻辑位于 `static/script.js` 的 `updatePlayersList()`。

## 🔧 配置说明

### 修改网格大小

在 `app.py` 中修改以下常量：
```python
GRID_SIZE = 100  # 修改为所需的大小
```

### 修改单元格尺寸

在 `static/style.css` 中修改：
```css
.game-grid {
    grid-template-columns: repeat(100, 40px);  /* 修改40px为所需尺寸 */
    grid-template-rows: repeat(100, 40px);
}
```

### 添加新颜色

在 `templates/index.html` 中添加新的颜色选项：
```html
<label class="color-option">
    <input type="radio" name="color" value="#新颜色代码">
    <span class="color-swatch" style="background-color: #新颜色代码;"></span>
    <span>颜色名称</span>
</label>
```

## 🌟 扩展功能

- **用户系统**: 支持多用户登录和游戏记录
- **排行榜**: 显示接龙诗句数量排名
- **分享功能**: 支持导出图片或分享链接
- **AI助手**: 提供诗句建议和接龙提示

## 📝 更新日志

### v1.1.0 (2025-09-07)
- 支持导出图片
- 新增：实时玩家列表，显示在线状态与各自诗句数量
- 新增：REST 接口 `/api/room/<room_code>/stats` 返回房间内玩家统计
- 新增：Socket.IO 事件 `player_stats_update`，在添加诗句、进出房间、断线时广播最新统计
- 增强：后端维护在线用户索引 `online_users`，并在 `join_room`、`leave_room`、`disconnect` 中更新
- UI：`static/style.css` 新增玩家卡片样式、状态徽标；`static/script.js` 新增 `playerStats`、增强 `updatePlayersList()`

> 兼容性提示：为避免单机多开同一浏览器测试导致作者归属混淆，请在不同浏览器/隐私窗口分别登录不同玩家，或改用独立设备进行联测。Flask Session 基于浏览器 Cookie，同一浏览器会共享会话。   
## 📄 许可证

本项目采用MIT许可证，详见LICENSE文件。

## 📞 联系方式

如有问题或建议，请通过以下方式联系：
- 提交GitHub Issue
- 发送邮件至：d207128@qq.com

---

**享受诗词接龙的乐趣，创造属于你的煎饼摊诗词网络！** 🎉









