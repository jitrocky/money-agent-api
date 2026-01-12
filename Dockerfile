# 选择一个稳定的 Node 版本
FROM node:20-slim

# 创建工作目录
WORKDIR /app

# 先复制依赖清单，利用 Docker 缓存
COPY package.json package-lock.json* ./

# 安装生产依赖
RUN npm ci --omit=dev || npm install --omit=dev

# 再复制源码
COPY . .

# Cloud Run 会通过环境变量 PORT 指定端口
ENV NODE_ENV=production

# 启动
CMD ["npm", "start"]
