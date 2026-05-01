# ImageFlow Linux 单机部署指南

本文档介绍如何在单台 Linux 服务器上部署 ImageFlow 图片管理系统，包括 Go 后端、Next.js 前端、Redis 和 Nginx 反向代理。

## 架构概览

```
浏览器 (HTTPS)
    │
    ▼
┌─────────────────────────────────────┐
│            Nginx (:80/:443)          │
│                                      │
│  /api/*      → 127.0.0.1:8686 (后端) │
│  /images/*   → 127.0.0.1:8686 (后端) │
│  /*          → 127.0.0.1:3000 (前端) │
└─────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│  Go 后端 :8686   │  │ Next.js :3000   │
│  (API + 图片)    │  │ (前端页面)       │
└────────┬────────┘  └─────────────────┘
         │
         ▼
┌─────────────────┐
│  Redis :6379    │
└─────────────────┘
```

- 浏览器只访问 Nginx，前端和后端同域，不存在跨域问题
- Nginx 直接代理 `/api/*` 和 `/images/*` 到后端，性能最优
- Next.js 内部也会通过 rewrites 代理 API 请求到后端（双重保障）

## 环境要求

| 组件 | 最低版本 | 说明 |
|------|---------|------|
| 操作系统 | Ubuntu 20.04+ / Debian 11+ / CentOS 8+ | 本文档以 Ubuntu 22.04 为例 |
| Go | 1.23+ | 后端编译运行 |
| Node.js | 22.x+ | 前端编译运行 |
| Redis | 6.0+ | 元数据存储 |
| Nginx | 1.18+ | 反向代理 |
| libvips | 8.10+ | 图片处理依赖（后端 CGO 需要） |

## 第一步：安装系统依赖

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装基础工具
sudo apt install -y git wget curl build-essential

# 安装 Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# 安装 Nginx
sudo apt install -y nginx
sudo systemctl enable nginx

# 安装 libvips（图片处理依赖）
sudo apt install -y libvips-dev libheif-dev

# 安装 Go 1.23+
wget https://go.dev/dl/go1.23.4.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.23.4.linux-amd64.tar.gz
rm go1.23.4.linux-amd64.tar.gz

# 配置 Go 环境变量
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
echo 'export GOPATH=$HOME/go' >> ~/.bashrc
echo 'export PATH=$PATH:$GOPATH/bin' >> ~/.bashrc
source ~/.bashrc

# 验证 Go 安装
go version

# 安装 Node.js 22.x（使用 NodeSource）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 验证 Node.js 安装
node --version   # 应显示 v22.x.x
npm --version
```

## 第二步：部署 Go 后端

### 2.1 创建目录和克隆项目

```bash
# 创建应用目录
sudo mkdir -p /opt/imageflow
sudo chown $USER:$USER /opt/imageflow
cd /opt/imageflow

# 克隆项目（或上传项目文件）
git clone <your-repo-url> .
```

### 2.2 创建后端环境变量

```bash
cd /opt/imageflow
cp .env.example .env
```

编辑 `.env` 文件：

```bash
nano .env
```

关键配置：

```ini
# API 密钥（修改为强密码）
API_KEY=your_strong_api_key_here

# 存储配置（本地存储）
STORAGE_TYPE=local
METADATA_STORE_TYPE=redis
LOCAL_STORAGE_PATH=static/images

# Redis 配置
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_TLS_ENABLED=false

# 上传和图片处理配置
MAX_UPLOAD_COUNT=20
IMAGE_QUALITY=75
WORKER_THREADS=4
SPEED=5
WORKER_POOL_SIZE=4

# 调试模式（生产环境设为 false）
DEBUG_MODE=false
```

### 2.3 编译后端

```bash
cd /opt/imageflow

# 下载 Go 依赖
go mod download

# 编译（需要 CGO 支持 libvips）
CGO_ENABLED=1 go build -o imageflow .

# 创建运行时目录
mkdir -p static/images/original/landscape
mkdir -p static/images/original/portrait
mkdir -p static/images/landscape/webp
mkdir -p static/images/landscape/avif
mkdir -p static/images/portrait/webp
mkdir -p static/images/portrait/avif
mkdir -p static/images/gif
```

### 2.4 创建后端 systemd 服务

```bash
sudo nano /etc/systemd/system/imageflow-backend.service
```

写入以下内容：

```ini
[Unit]
Description=ImageFlow Backend Service
After=network.target redis-server.service
Wants=redis-server.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/imageflow
EnvironmentFile=/opt/imageflow/.env
ExecStart=/opt/imageflow/imageflow
Restart=always
RestartSec=5

# 安全设置
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

启动后端服务：

```bash
# 设置目录权限
sudo chown -R www-data:www-data /opt/imageflow

# 启动服务
sudo systemctl daemon-reload
sudo systemctl enable imageflow-backend
sudo systemctl start imageflow-backend

# 检查状态
sudo systemctl status imageflow-backend

# 测试后端 API
curl http://127.0.0.1:8686/api/random
```

## 第三步：部署 Next.js 前端

### 3.1 创建前端环境变量

```bash
cd /opt/imageflow/frontend
cp .env.example .env
```

编辑 `.env` 文件：

```bash
nano .env
```

内容如下：

```ini
# 后端地址（Next.js 服务端 rewrites 代理用，不暴露给浏览器）
BACKEND_URL=http://127.0.0.1:8686

# Next.js Image 组件允许的远程图片域名（逗号分隔）
# 设置为你的公网域名，支持 https://
NEXT_PUBLIC_REMOTE_PATTERNS=https://your-domain.com
```

### 3.2 编译前端

```bash
cd /opt/imageflow/frontend

# 安装依赖
npm install

# 生产构建
npm run build
```

### 3.3 创建前端 systemd 服务

```bash
sudo nano /etc/systemd/system/imageflow-frontend.service
```

写入以下内容：

```ini
[Unit]
Description=ImageFlow Frontend Service
After=network.target imageflow-backend.service
Wants=imageflow-backend.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/imageflow/frontend
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

# 安全设置
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

> **注意**：如果 `npm` 路径不同，使用 `which npm` 查看实际路径。

启动前端服务：

```bash
sudo chown -R www-data:www-data /opt/imageflow/frontend

sudo systemctl daemon-reload
sudo systemctl enable imageflow-frontend
sudo systemctl start imageflow-frontend

# 检查状态
sudo systemctl status imageflow-frontend
```

## 第四步：配置 Nginx 反向代理

### 4.1 创建 Nginx 站点配置

```bash
sudo nano /etc/nginx/sites-available/imageflow
```

写入以下内容：

```nginx
# 上游服务器定义
upstream backend {
    server 127.0.0.1:8686;
    keepalive 32;
}

upstream frontend {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name your-domain.com;  # 修改为你的域名

    # 日志
    access_log /var/log/nginx/imageflow_access.log;
    error_log  /var/log/nginx/imageflow_error.log;

    # 上传文件大小限制
    client_max_body_size 100m;

    # API 请求代理到后端
    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # 图片请求代理到后端
    location /images/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 图片缓存
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 前端页面请求代理到 Next.js
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # 静态资源（favicon 等）
    location /static/ {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 4.2 启用站点并重启 Nginx

```bash
# 创建软链接
sudo ln -sf /etc/nginx/sites-available/imageflow /etc/nginx/sites-enabled/

# 删除默认站点（可选）
sudo rm -f /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

## 第五步：配置 HTTPS（推荐）

使用 Certbot 获取免费 SSL 证书：

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取证书并自动配置 Nginx
sudo certbot --nginx -d your-domain.com

# 验证自动续期
sudo certbot renew --dry-run
```

Certbot 会自动修改 Nginx 配置添加 SSL 设置，并在证书到期前自动续期。

## 第六步：验证部署

### 6.1 检查服务状态

```bash
# 检查所有服务
sudo systemctl status redis-server
sudo systemctl status imageflow-backend
sudo systemctl status imageflow-frontend
sudo systemctl status nginx

# 查看后端日志
sudo journalctl -u imageflow-backend -f

# 查看前端日志
sudo journalctl -u imageflow-frontend -f
```

### 6.2 功能测试

```bash
# 测试后端 API
curl http://127.0.0.1:8686/api/random

# 测试通过 Nginx 访问 API
curl http://your-domain.com/api/random

# 测试前端页面
curl -I http://your-domain.com/
```

在浏览器中访问 `https://your-domain.com`，应能正常看到 ImageFlow 页面。

### 6.3 API Key 验证

1. 打开 `https://your-domain.com`
2. 输入在 `.env` 中设置的 `API_KEY`
3. 验证通过后即可上传和管理图片

## 常用运维命令

```bash
# 重启所有服务
sudo systemctl restart redis-server imageflow-backend imageflow-frontend nginx

# 查看所有服务状态
sudo systemctl status redis-server imageflow-backend imageflow-frontend nginx --no-pager

# 查看磁盘使用
du -sh /opt/imageflow/static/images/

# 清理过期图片（可手动触发）
curl -X POST -H "Authorization: Bearer your_api_key" http://127.0.0.1:8686/api/trigger-cleanup
```

## 性能优化建议

1. **图片缓存**：Nginx 配置中已对 `/images/` 路径设置 30 天缓存
2. **调整 Worker 线程**：根据 CPU 核心数调整 `.env` 中的 `WORKER_THREADS` 和 `WORKER_POOL_SIZE`
3. **Redis 持久化**：如需持久化元数据，编辑 `/etc/redis/redis.conf` 启用 AOF 或 RDB
4. **防火墙**：只开放 80/443 端口，后端 8686 和前端 3000 端口无需对外开放

    ```bash
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw enable
    ```

## 故障排查

| 问题 | 排查方法 |
|------|---------|
| 后端启动失败 | `sudo journalctl -u imageflow-backend -n 50 --no-pager` |
| 前端 500 错误 | `sudo journalctl -u imageflow-frontend -n 50 --no-pager` |
| 图片无法加载 | 检查 `NEXT_PUBLIC_REMOTE_PATTERNS` 是否包含公网域名 |
| API 请求 404 | 检查 Nginx 配置中 `proxy_pass` 地址是否正确 |
| Redis 连接失败 | `redis-cli -h 127.0.0.1 ping` 测试连通性 |
| Nginx 配置错误 | `sudo nginx -t` 检查语法 |

## 升级步骤

```bash
# 1. 拉取最新代码
cd /opt/imageflow
git pull

# 2. 更新后端
CGO_ENABLED=1 go build -o imageflow .
sudo systemctl restart imageflow-backend

# 3. 更新前端
cd frontend
npm install
npm run build
sudo systemctl restart imageflow-frontend

# 4. 验证
sudo systemctl status imageflow-backend imageflow-frontend
```
