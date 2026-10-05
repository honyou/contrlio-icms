# 腾讯云部署

这是独立于本地开发环境的生产部署方式。生产版使用 Docker Compose 运行 API、Next.js、PostgreSQL、Redis 和 MinIO；宿主机 Nginx 终止 TLS。数据库、Redis、MinIO 不发布公网端口，Web/API 只绑定宿主机回环地址，公网只开放 80/443。`docker-compose.yml` 继续用于本地基础服务。

当前部署目标是 `https://contrlio.com`。域名根记录需要指向服务器公网 IPv4；腾讯云防火墙允许 TCP 80/443。`www.contrlio.com` 需要单独设置 DNS 和 Nginx/证书配置后才可使用。

首次在 Ubuntu 服务器上以 root 身份运行：

```sh
cd /opt/contrlio
sh scripts/init-production-env.sh
CERTBOT_EMAIL=your-email@example.com sh scripts/deploy-tencent.sh
```

初始化脚本在服务器生成随机数据库、MinIO、JWT、AI 加密密钥和管理员密码；`.env.production` 与 `/root/contrlio-admin-login.txt` 权限为 `600`。管理员初始账号保存在登录凭据文件中。不要将该文件提交、上传或粘贴到公共渠道。

部署脚本通过 HTTP-01 申请 Let's Encrypt 证书，`CERTBOT_EMAIL` 仅作为续期提醒邮箱传给证书服务，不会写入应用环境文件；只有证书签发成功后才把 Nginx 切换到 HTTPS 登录页面。证书签发失败时，HTTP 登录页面仍返回 503。系统会启用 Certbot 自动续期，并在续期后重载 Nginx。首次部署会初始化一套新的云端数据库和对象存储，不会复制本地 PostgreSQL、MinIO 数据或本机 `.env`。

常用检查：

```sh
cd /opt/contrlio
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs --tail=100 api web postgres redis minio
curl -fsS https://contrlio.com/health
certbot renew --dry-run
```

### 定时健康检查与自动恢复

生产部署会安装并启用 `contrlio-healthcheck.timer`：开机后检查一次，之后每 5 分钟检查 API/数据库/Redis/MinIO、前端和本机 Nginx HTTPS 反向代理。API 健康检查会验证证据 Bucket 是否可访问，避免只因数据库可连通就把上传故障误报为健康。

对于仍在运行但探测异常的容器，检查器最多每 30 分钟尝试重启一次，并在恢复后复查；Nginx 只有配置校验通过时才会重载。停止或缺失的容器、无效 Nginx 配置不会被自动启动或覆盖。检查器不会拉取镜像、构建代码、执行数据库迁移或改写业务数据；代码升级仍按人工发布流程进行。

将本补丁源码同步到既有服务器后，单独重建 API 并启用定时器即可：

```sh
cd /opt/contrlio
docker compose --env-file .env.production -f compose.production.yml up -d --build --no-deps api
sh scripts/install-health-monitor.sh
```

手动安装或查看状态：

```sh
cd /opt/contrlio
sh scripts/install-health-monitor.sh
systemctl status contrlio-healthcheck.timer --no-pager
systemctl start contrlio-healthcheck.service
journalctl -u contrlio-healthcheck.service --since today --no-pager
```

升级时先备份数据库与 MinIO 数据卷，再将新版本源码同步到 `/opt/contrlio`，最后运行：

```sh
docker compose --env-file .env.production -f compose.production.yml up -d --build
```
