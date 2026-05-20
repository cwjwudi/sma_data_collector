# macOS — 环境准备与启动

---

## 一、需要安装什么

| 组件 | 版本建议 | 本机是否必装 |
|------|----------|----------------|
| **Python** | **3.10+**（推荐 3.12） | 是（勿长期依赖系统自带 3.9） |
| **Node.js** | **LTS**（20.x / 22.x） | 是 |
| **Homebrew** | 最新 | 强烈推荐（装 Python/Node 省事） |
| **数据库服务** | — | **否**（库在群晖 NAS 等远程机时） |
| **OPC UA** | — | 仅调试 OPC 时需要可达服务 |

> 本工具是 **Electron + Vue + FastAPI**，与 Android Studio 无关；请在 **终端** 中安装运行环境。

---

## 二、安装 Homebrew（推荐）

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Apple Silicon 安装后按提示加入 PATH，常见为：

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

不用 Homebrew 时：从 [python.org](https://www.python.org/downloads/)、[nodejs.org](https://nodejs.org/) 或 [nvm](https://github.com/nvm-sh/nvm) 安装亦可。

---

## 三、安装 Python 与 Node

```bash
brew install python@3.12 node
python3.12 --version
node --version
npm --version
```

---

## 四、克隆与后端 venv

```bash
cd ~/你的路径
git clone <Gitea 仓库地址> p000_sd_sma_scada
cd p000_sd_sma_scada/_Prj/SD_SMA_ReportEditor/backend

python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python --version   # 确认 ≥ 3.10
```

---

## 五、前端依赖

```bash
cd ../frontend
npm install
```

---

## 六、启动软件

### 方式 A：Electron 一键（推荐日常开发）

**双击**（Finder 中）或在终端执行：

```bash
./scripts/dev/mac/open-electron-dev-mac.command
```

脚本会：释放 **8000 / 5173** 占用 → 必要时 `npm install` → 运行 `npm run electron:dev:unix`。  
关闭 Electron 窗口后，相关进程会退出（Terminal 标签可能自动关闭）。

首次若提示自动化权限：在 **系统设置 → 隐私与安全性 → 自动化** 中允许「终端」控制「终端」。

### 方式 B：终端手动 Electron

```bash
cd _Prj/SD_SMA_ReportEditor/frontend
npm run electron:dev:unix
# 或与 Windows 相同名称（在 Mac 上也可用）：
# npm run electron:dev
```

Electron 会按顺序查找后端解释器：

1. `backend/venv/bin/python3`
2. `backend/venv/bin/python`
3. 系统 `python3`

**务必**先完成第四节 venv，否则可能用到系统旧版 Python。

### 方式 C：浏览器 Web 调试（双终端）

**终端 1 — 后端：**

```bash
cd backend
source venv/bin/activate
bash scripts/dev_uvicorn.sh
# 或：uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**终端 2 — 前端：**

```bash
cd frontend
npm run dev
```

浏览器打开：`http://127.0.0.1:5173`

> macOS **没有** `start_dev_web.bat`；Web 模式请用本方式。

---

## 七、数据库在群晖 NAS 上时

1. Mac 与 NAS 网络互通（同网段或 VPN）。
2. 在群晖启用 MariaDB/PostgreSQL，开放端口并允许远程账号。
3. 在本应用 **数据源** 页面填写 **NAS 局域网 IP**（不要用 `localhost`，除非库就在本机）。

---

## 八、自检

```bash
source backend/venv/bin/activate
python --version
curl -s http://127.0.0.1:8000/health | head

cd frontend && npm run dev
# 另开终端测 Electron
npm run electron:dev:unix
```

---

## 九、打包 macOS 安装包（现场交付）

非日常开发。入口：**[packaging/README.md](../packaging/README.md)**。

- 一键：`./packaging/mac/build.sh` 或双击 `packaging/mac/build.command` → `packaging/mac/output/*.dmg`
- 现场装/卸：[mac-installer.md](mac-installer.md)

---

## 十、更多说明

- 与本文重叠的 Mac 细节：[_Doc/004_Mac开发环境准备.md](../_Doc/004_Mac开发环境准备.md)
- Windows 同事请看 [windows.md](windows.md)、安装包 [windows-installer.md](windows-installer.md)
- 项目根向导：[../README.md](../README.md)

---

[← 返回入门总览](README.md)
