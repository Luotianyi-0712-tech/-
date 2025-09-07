from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit, join_room, leave_room, rooms
import json

import os
import uuid
import time
from datetime import datetime, timedelta
from threading import Lock

app = Flask(__name__)
app.config['SECRET_KEY'] = 'jianbing_game_secret_key_2024'
# 使用threading模式而不是eventlet，避免Python 3.12+兼容性问题
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# 数据存储文件
DATA_FILE = 'game_data.json'
ROOMS_FILE = 'rooms_data.json'

# 内存中的房间数据
rooms_data = {}
rooms_lock = Lock()

# 用户会话管理
user_sessions = {}

# 在线用户管理 - 存储socket_id到用户信息的映射
online_users = {}  # {socket_id: {'username': str, 'room_code': str, 'join_time': timestamp}}
online_users_lock = Lock()

def load_game_data():
    """加载游戏数据"""
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {
        'poems': [],
        'grid': [[None for _ in range(100)] for _ in range(100)],
        'last_updated': datetime.now().isoformat()
    }

def save_game_data(data):
    """保存游戏数据"""
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def load_rooms_data():
    """加载房间数据"""
    if os.path.exists(ROOMS_FILE):
        with open(ROOMS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_rooms_data():
    """保存房间数据"""
    with open(ROOMS_FILE, 'w', encoding='utf-8') as f:
        json.dump(rooms_data, f, ensure_ascii=False, indent=2)

def generate_room_code():
    """生成6位房间码"""
    import random
    return str(random.randint(100000, 999999))

def create_room(room_code, creator_name):
    """创建房间"""
    with rooms_lock:
        if room_code in rooms_data:
            return False
        
        rooms_data[room_code] = {
            'code': room_code,
            'creator': creator_name,
            'players': [creator_name],
            'game_data': {
                'poems': [],
                'grid': [[None for _ in range(100)] for _ in range(100)],
                'last_updated': datetime.now().isoformat()
            },
            'created_at': datetime.now().isoformat(),
            'last_activity': time.time(),
            'editing_users': {}  # 记录正在编辑的用户
        }
        save_rooms_data()
        return True

def is_admin_room(room_code):
    """检查是否为管理员房间"""
    return room_code == '207128'

def get_online_users_in_room(room_code):
    """获取房间内在线用户列表"""
    with online_users_lock:
        online_in_room = []
        for socket_id, user_info in online_users.items():
            if user_info['room_code'] == room_code:
                online_in_room.append(user_info['username'])
        return online_in_room

def get_player_stats(room_code):
    """获取房间内玩家统计信息"""
    with rooms_lock:
        if room_code not in rooms_data:
            return {}
        
        room_data = rooms_data[room_code]
        poems = room_data['game_data']['poems']
        
        # 统计每个玩家的诗词数量
        from collections import Counter
        poem_counts = Counter(poem['author'] for poem in poems)
        
        # 获取在线用户列表
        online_users_list = get_online_users_in_room(room_code)
        
        # 构建玩家统计信息
        player_stats = {}
        for player in room_data['players']:
            player_stats[player] = {
                'poem_count': poem_counts.get(player, 0),
                'is_online': player in online_users_list
            }
        
        return player_stats

def get_all_rooms_info():
    """获取所有房间信息（管理员专用）"""
    with rooms_lock:
        rooms_info = []
        for room_code, room_data in rooms_data.items():
            if not is_admin_room(room_code):  # 排除管理员房间本身
                rooms_info.append({
                    'code': room_code,
                    'creator': room_data['creator'],
                    'player_count': len(room_data['players']),
                    'players': room_data['players'],
                    'created_at': room_data['created_at'],
                    'last_activity': room_data['last_activity'],
                    'poem_count': len(room_data['game_data']['poems']),
                    'editing_count': len(room_data.get('editing_users', {}))
                })
        return sorted(rooms_info, key=lambda x: x['last_activity'], reverse=True)

def join_room_by_code(room_code, player_name):
    """通过房间码加入房间"""
    with rooms_lock:
        if room_code not in rooms_data:
            return False
        
        if player_name not in rooms_data[room_code]['players']:
            rooms_data[room_code]['players'].append(player_name)
            rooms_data[room_code]['last_activity'] = time.time()
            save_rooms_data()
        return True

def leave_room_by_code(room_code, player_name):
    """离开房间"""
    with rooms_lock:
        if room_code not in rooms_data:
            return
        
        if player_name in rooms_data[room_code]['players']:
            rooms_data[room_code]['players'].remove(player_name)
            rooms_data[room_code]['last_activity'] = time.time()
            
            # 如果房间没人了，删除房间
            if not rooms_data[room_code]['players']:
                del rooms_data[room_code]
            save_rooms_data()

def get_room_data(room_code):
    """获取房间数据"""
    with rooms_lock:
        return rooms_data.get(room_code)

def update_room_game_data(room_code, game_data):
    """更新房间游戏数据"""
    with rooms_lock:
        if room_code in rooms_data:
            rooms_data[room_code]['game_data'] = game_data
            rooms_data[room_code]['last_activity'] = time.time()
            save_rooms_data()

def cleanup_inactive_rooms():
    """清理不活跃的房间（超过12小时无活动）"""
    current_time = time.time()
    with rooms_lock:
        inactive_rooms = []
        for room_code, room_data in rooms_data.items():
            if current_time - room_data['last_activity'] > 3600 * 12:  # 12小时
                inactive_rooms.append(room_code)
        
        for room_code in inactive_rooms:
            del rooms_data[room_code]
        
        if inactive_rooms:
            save_rooms_data()

@app.route('/')
def index():
    """主页面"""
    return render_template('index.html')

@app.route('/api/register', methods=['POST'])
def register_user():
    """用户注册"""
    data = request.json
    username = data.get('username', '').strip()
    
    if not username:
        return jsonify({'success': False, 'message': '用户名不能为空'})
    
    if len(username) > 20:
        return jsonify({'success': False, 'message': '用户名不能超过20个字符'})
    
    # 生成用户ID
    user_id = str(uuid.uuid4())
    session['user_id'] = user_id
    session['username'] = username
    
    return jsonify({
        'success': True, 
        'user_id': user_id,
        'username': username,
        'message': '注册成功'
    })

@app.route('/api/create_room', methods=['POST'])
def create_room_api():
    """创建房间"""
    if 'username' not in session:
        return jsonify({'success': False, 'message': '请先注册'})
    
    username = session['username']
    room_code = generate_room_code()
    
    # 确保房间码唯一
    while room_code in rooms_data:
        room_code = generate_room_code()
    
    if create_room(room_code, username):
        return jsonify({
            'success': True,
            'room_code': room_code,
            'message': '房间创建成功'
        })
    else:
        return jsonify({'success': False, 'message': '房间创建失败'})

@app.route('/api/join_room', methods=['POST'])
def join_room_api():
    """加入房间"""
    if 'username' not in session:
        return jsonify({'success': False, 'message': '请先注册'})
    
    data = request.json
    room_code = data.get('room_code', '').strip()
    username = session['username']
    
    if not room_code:
        return jsonify({'success': False, 'message': '房间码不能为空'})
    
    if join_room_by_code(room_code, username):
        return jsonify({
            'success': True,
            'room_code': room_code,
            'message': '加入房间成功'
        })
    else:
        return jsonify({'success': False, 'message': '房间不存在'})

@app.route('/api/room/<room_code>')
def get_room_info(room_code):
    """获取房间信息"""
    room_data = get_room_data(room_code)
    if not room_data:
        return jsonify({'success': False, 'message': '房间不存在'})
    
    return jsonify({
        'success': True,
        'room': {
            'code': room_data['code'],
            'creator': room_data['creator'],
            'players': room_data['players'],
            'created_at': room_data['created_at']
        }
    })

@app.route('/api/room/<room_code>/stats')
def get_room_stats(room_code):
    """获取房间玩家统计信息"""
    if 'username' not in session:
        return jsonify({'success': False, 'message': '请先注册'})
    
    room_data = get_room_data(room_code)
    if not room_data:
        return jsonify({'success': False, 'message': '房间不存在'})
    
    username = session['username']
    if username not in room_data['players']:
        return jsonify({'success': False, 'message': '您不在该房间中'})
    
    player_stats = get_player_stats(room_code)
    
    return jsonify({
        'success': True,
        'player_stats': player_stats
    })

@app.route('/api/admin/rooms')
def get_admin_rooms_info():
    """获取所有房间信息（管理员专用）"""
    if 'username' not in session:
        return jsonify({'success': False, 'message': '请先登录'})
    
    username = session['username']
    if username != '管理员':
        return jsonify({'success': False, 'message': '权限不足'})
    
    rooms_info = get_all_rooms_info()
    return jsonify({
        'success': True,
        'rooms': rooms_info,
        'total_rooms': len(rooms_info),
        'total_players': sum(room['player_count'] for room in rooms_info)
    })

@app.route('/api/admin/join_admin_room', methods=['POST'])
def join_admin_room():
    """加入管理员房间"""
    if 'username' not in session:
        return jsonify({'success': False, 'message': '请先登录'})
    
    username = session['username']
    if username != '管理员':
        return jsonify({'success': False, 'message': '权限不足'})
    
    admin_room_code = '207128'
    
    # 如果管理员房间不存在，创建它
    if admin_room_code not in rooms_data:
        create_room(admin_room_code, username)
    else:
        # 如果存在，确保管理员在房间中
        if username not in rooms_data[admin_room_code]['players']:
            rooms_data[admin_room_code]['players'].append(username)
            rooms_data[admin_room_code]['last_activity'] = time.time()
            save_rooms_data()
    
    return jsonify({
        'success': True,
        'room_code': admin_room_code,
        'message': '进入管理员房间成功'
    })

@app.route('/api/admin/delete_room', methods=['POST'])
def delete_room():
    """删除房间（管理员专用）"""
    if 'username' not in session:
        return jsonify({'success': False, 'message': '请先登录'})
    
    username = session['username']
    if username != '管理员':
        return jsonify({'success': False, 'message': '权限不足'})
    
    data = request.json
    room_code = data.get('room_code')
    
    if not room_code:
        return jsonify({'success': False, 'message': '房间码不能为空'})
    
    # 不能删除管理员房间
    if is_admin_room(room_code):
        return jsonify({'success': False, 'message': '不能删除管理员房间'})
    
    with rooms_lock:
        if room_code not in rooms_data:
            return jsonify({'success': False, 'message': '房间不存在'})
        
        room_data = rooms_data[room_code]
        players = room_data['players'].copy()  # 复制玩家列表
        
        # 删除房间
        del rooms_data[room_code]
        save_rooms_data()
        
        # 通知房间内所有玩家房间已被删除
        socketio.emit('room_deleted', {
            'room_code': room_code,
            'message': f'房间 {room_code} 已被管理员删除',
            'deleted_by': username
        }, room=room_code)
        
        return jsonify({
            'success': True,
            'message': f'房间 {room_code} 删除成功',
            'affected_players': players
        })

@app.route('/api/poems/<room_code>', methods=['GET'])
def get_poems(room_code):
    """获取房间诗句"""
    room_data = get_room_data(room_code)
    if not room_data:
        return jsonify({'success': False, 'message': '房间不存在'})
    
    return jsonify(room_data['game_data']['poems'])

@app.route('/api/poems/<room_code>', methods=['POST'])
def add_poem(room_code):
    """添加新诗句到房间"""
    if 'username' not in session:
        return jsonify({'success': False, 'message': '请先注册'})
    
    room_data = get_room_data(room_code)
    if not room_data:
        return jsonify({'success': False, 'message': '房间不存在'})
    
    username = session['username']
    if username not in room_data['players']:
        return jsonify({'success': False, 'message': '您不在该房间中'})
    
    poem_data = request.json
    
    # 生成唯一ID
    poem_id = f"poem_{len(room_data['game_data']['poems']) + 1:03d}_{int(time.time())}"
    
    # 创建新诗句对象
    new_poem = {
        'id': poem_id,
        'text': poem_data['text'],
        'direction': poem_data['direction'],
        'startPosition': poem_data['startPosition'],
        'color': poem_data['color'],
        'connectedTo': poem_data.get('connectedTo', []),
        'author': username,
        'created_at': datetime.now().isoformat()
    }
    
    # 添加到诗句列表
    room_data['game_data']['poems'].append(new_poem)
    
    # 更新网格
    update_grid(room_data['game_data'], new_poem)
    
    # 保存房间数据
    update_room_game_data(room_code, room_data['game_data'])
    
    # 广播给房间内所有用户
    socketio.emit('poem_added', {
        'poem': new_poem,
        'author': username
    }, room=room_code)
    
    # 广播更新的玩家统计
    player_stats = get_player_stats(room_code)
    socketio.emit('player_stats_update', {
        'player_stats': player_stats
    }, room=room_code)
    
    return jsonify({'success': True, 'poem': new_poem})

@app.route('/api/grid/<room_code>', methods=['GET'])
def get_grid(room_code):
    """获取房间网格状态"""
    room_data = get_room_data(room_code)
    if not room_data:
        return jsonify({'success': False, 'message': '房间不存在'})
    
    return jsonify(room_data['game_data']['grid'])

@app.route('/api/reset/<room_code>', methods=['POST'])
def reset_game(room_code):
    """重置房间游戏"""
    if 'username' not in session:
        return jsonify({'success': False, 'message': '请先注册'})
    
    room_data = get_room_data(room_code)
    if not room_data:
        return jsonify({'success': False, 'message': '房间不存在'})
    
    username = session['username']
    if username not in room_data['players']:
        return jsonify({'success': False, 'message': '您不在该房间中'})
    
    # 重置游戏数据
    room_data['game_data'] = {
        'poems': [],
        'grid': [[None for _ in range(100)] for _ in range(100)],
        'last_updated': datetime.now().isoformat()
    }
    
    # 保存房间数据
    update_room_game_data(room_code, room_data['game_data'])
    
    # 广播给房间内所有用户
    socketio.emit('game_reset', {
        'reset_by': username
    }, room=room_code)
    
    return jsonify({'success': True})

def update_grid(data, poem):
    """更新网格数据"""
    x, y = poem['startPosition']['x'], poem['startPosition']['y']
    text = poem['text']
    
    if poem['direction'] == 'horizontal':
        # 横向排列
        for i, char in enumerate(text):
            if 0 <= x + i < 100 and 0 <= y < 100:
                data['grid'][y][x + i] = {
                    'char': char,
                    'poem_id': poem['id'],
                    'color': poem['color']
                }
    else:
        # 纵向排列
        for i, char in enumerate(text):
            if 0 <= x < 100 and 0 <= y + i < 100:
                data['grid'][y + i][x] = {
                    'char': char,
                    'poem_id': poem['id'],
                    'color': poem['color']
                }

# WebSocket事件处理
@socketio.on('connect')
def handle_connect():
    """用户连接"""
    print(f'用户连接: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    """用户断开连接"""
    print(f'用户断开连接: {request.sid}')
    # 清理用户编辑状态
    for room_code, room_data in rooms_data.items():
        if request.sid in room_data.get('editing_users', {}):
            del room_data['editing_users'][request.sid]
            # 广播编辑状态更新
            socketio.emit('editing_status_update', {
                'editing_users': room_data['editing_users']
            }, room=room_code)

@socketio.on('join_room')
def handle_join_room(data):
    """加入房间"""
    room_code = data.get('room_code')
    username = data.get('username')
    
    if not room_code or not username:
        emit('error', {'message': '房间码和用户名不能为空'})
        return
    
    # 验证用户是否在房间中
    room_data = get_room_data(room_code)
    if not room_data or username not in room_data['players']:
        emit('error', {'message': '您不在该房间中'})
        return
    
    # 加入Socket.IO房间
    join_room(room_code)
    
    # 记录在线用户
    with online_users_lock:
        online_users[request.sid] = {
            'username': username,
            'room_code': room_code,
            'join_time': time.time()
        }
    
    # 更新房间活动时间
    room_data['last_activity'] = time.time()
    
    # 如果是管理员房间，发送所有房间信息
    if is_admin_room(room_code) and username == '管理员':
        rooms_info = get_all_rooms_info()
        emit('admin_rooms_info', {
            'rooms': rooms_info,
            'total_rooms': len(rooms_info),
            'total_players': sum(room['player_count'] for room in rooms_info)
        })
    else:
        # 通知房间内其他用户
        emit('user_joined', {
            'username': username,
            'message': f'{username} 加入了房间'
        }, room=room_code, include_self=False)
        
        # 发送当前房间状态和玩家统计
        player_stats = get_player_stats(room_code)
        emit('room_status', {
            'players': room_data['players'],
            'editing_users': room_data.get('editing_users', {}),
            'player_stats': player_stats
        })
        
        # 广播更新的玩家统计给房间内所有用户
        socketio.emit('player_stats_update', {
            'player_stats': player_stats
        }, room=room_code)

@socketio.on('leave_room')
def handle_leave_room(data):
    """离开房间"""
    room_code = data.get('room_code')
    username = data.get('username')
    
    if room_code:
        # 离开Socket.IO房间
        leave_room(room_code)
        
        # 清理在线用户记录
        with online_users_lock:
            if request.sid in online_users:
                del online_users[request.sid]
        
        # 清理编辑状态
        room_data = get_room_data(room_code)
        if room_data and request.sid in room_data.get('editing_users', {}):
            del room_data['editing_users'][request.sid]
            # 广播编辑状态更新
            socketio.emit('editing_status_update', {
                'editing_users': room_data['editing_users']
            }, room=room_code)
        
        # 通知房间内其他用户并更新玩家统计
        if username:
            emit('user_left', {
                'username': username,
                'message': f'{username} 离开了房间'
            }, room=room_code, include_self=False)
            
            # 广播更新的玩家统计
            if room_data:
                player_stats = get_player_stats(room_code)
                socketio.emit('player_stats_update', {
                    'player_stats': player_stats
                }, room=room_code)

@socketio.on('start_editing')
def handle_start_editing(data):
    """开始编辑"""
    room_code = data.get('room_code')
    username = data.get('username')
    position = data.get('position')  # {x, y}
    
    if not room_code or not username or not position:
        return
    
    room_data = get_room_data(room_code)
    if not room_data or username not in room_data['players']:
        return
    
    # 记录编辑状态
    if 'editing_users' not in room_data:
        room_data['editing_users'] = {}
    
    room_data['editing_users'][request.sid] = {
        'username': username,
        'position': position,
        'start_time': time.time()
    }
    
    # 广播编辑状态更新
    socketio.emit('editing_status_update', {
        'editing_users': room_data['editing_users']
    }, room=room_code)

@socketio.on('stop_editing')
def handle_stop_editing(data):
    """停止编辑"""
    room_code = data.get('room_code')
    
    if not room_code:
        return
    
    room_data = get_room_data(room_code)
    if not room_data:
        return
    
    # 清理编辑状态
    if request.sid in room_data.get('editing_users', {}):
        del room_data['editing_users'][request.sid]
        
        # 广播编辑状态更新
        socketio.emit('editing_status_update', {
            'editing_users': room_data['editing_users']
        }, room=room_code)

@socketio.on('update_editing_position')
def handle_update_editing_position(data):
    """更新编辑位置"""
    room_code = data.get('room_code')
    position = data.get('position')
    
    if not room_code or not position:
        return
    
    room_data = get_room_data(room_code)
    if not room_data or request.sid not in room_data.get('editing_users', {}):
        return
    
    # 更新编辑位置
    room_data['editing_users'][request.sid]['position'] = position
    
    # 广播编辑状态更新
    socketio.emit('editing_status_update', {
        'editing_users': room_data['editing_users']
    }, room=room_code)

@socketio.on('request_admin_rooms_info')
def handle_request_admin_rooms_info(data):
    """请求管理员房间信息"""
    room_code = data.get('room_code')
    username = data.get('username')
    
    if not is_admin_room(room_code) or username != '管理员':
        return
    
    rooms_info = get_all_rooms_info()
    emit('admin_rooms_info', {
        'rooms': rooms_info,
        'total_rooms': len(rooms_info),
        'total_players': sum(room['player_count'] for room in rooms_info)
    })

@socketio.on('disconnect')
def handle_disconnect():
    """用户断开连接"""
    print(f'用户断开连接: {request.sid}')
    
    # 获取断开连接用户的房间信息
    user_room_code = None
    with online_users_lock:
        if request.sid in online_users:
            user_room_code = online_users[request.sid]['room_code']
            del online_users[request.sid]
    
    # 清理用户编辑状态
    for room_code, room_data in rooms_data.items():
        if request.sid in room_data.get('editing_users', {}):
            del room_data['editing_users'][request.sid]
            # 广播编辑状态更新
            socketio.emit('editing_status_update', {
                'editing_users': room_data['editing_users']
            }, room=room_code)
    
    # 如果用户在某个房间中，广播更新的玩家统计
    if user_room_code and user_room_code in rooms_data:
        player_stats = get_player_stats(user_room_code)
        socketio.emit('player_stats_update', {
            'player_stats': player_stats
        }, room=user_room_code)

# 定期清理不活跃房间
def cleanup_rooms_periodically():
    """定期清理不活跃房间"""
    while True:
        time.sleep(300)  # 每5分钟检查一次
        cleanup_inactive_rooms()

# 启动清理线程
import threading
cleanup_thread = threading.Thread(target=cleanup_rooms_periodically, daemon=True)
cleanup_thread.start()

if __name__ == '__main__':
    # 加载房间数据
    rooms_data.update(load_rooms_data())
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)

