# 网申助手 · AI Job Application Autofill

**资料填一次，网申页面一键填写。** 面向同时投国内和澳洲岗位的应届生：把基本信息、教育、实习、项目、获奖、语言、家庭成员、常用问答和简历附件存进一个本地「求职资料库」，然后在国聘、应届生求职网、51job、各公司自建网申系统（北森、Moka、飞书招聘等）以及 Workday / Seek 等澳洲网申页面上，用浏览器插件一键填好。你只负责检查，然后自己点提交。

*Fill your profile once, then autofill job application forms on Chinese and Australian career sites with a browser extension. You review and submit.*

![资料库](docs/assets/ui/profile-desktop.png)

## 能做什么

| | |
| --- | --- |
| 🗂 **求职资料库** | 中英两套资料（国内网申用中文，澳洲用英文，插件按页面语言自动选）。上传简历 PDF 可自动识别成资料。 |
| ⚡ **一键填写** | 文本框、原生/自定义下拉框、可搜索下拉（含远程搜索学校）、多选下拉、多选框组、省市区级联或分开的省/市/区下拉、日期/月份/区间选择器（打不进去时自动点日历）、单选按钮组、数字框、简历/证件照/生活照上传。列表里没有你的学校时自动选「其他」。 |
| 🏦 **国企/银行网申** | 政治面貌、籍贯、户口、生源地、家庭住址（省市区 + 详细地址）、家庭成员、学术成果、资格认证、意向机构、亲属回避、违法违纪、重大疾病等常见栏位；身份证号能推出出生日期和性别。简历是只读展示页时，可一键点「编辑」再填写。 |
| ➕ **多段经历自动新增** | 页面只有一段教育/实习时，自动点「添加」补足；支持直接展开新表单和弹窗式「新增 → 填写 → 确定」两种做法；已经保存过的经历会跳过。 |
| 📥 **边投递边积累资料** | 在网申页面点「保存 / 下一步 / 提交」时，插件读取你手填的内容，把资料库里没有的（空着的栏位、新的经历、问答答案）列出来，确认后一键存入；和资料库不同的内容默认不勾选。填两三个网申，资料库就基本齐了。 |
| 🧠 **越用越省事** | 没识别的栏位在面板里选一次对应字段，这个网站下次自动识别；你手写的答案（如“从哪里得知招聘信息”）一键存进常用问答。 |
| ✍️ **开放题 AI 起草**（可选） | 「为什么选择我们」这类问题，结合页面 JD 和你的资料起草，按字数限制写，填进去由你修改；一页多个开放题可「AI 全部起草」。 |
| 📚 **常见问题库** | 24 个中英文常见网申问题（自我介绍、职业规划、优缺点、团队合作、期望薪资……）一键加入常用问答，AI 根据你的资料批量起草，改好后各网站自动复用。 |
| 📋 **投递记录** | 提交后点一下记录投递，在 Web UI 里跟踪状态（已投递 / 笔试 / 面试 / Offer）。 |

已在真实组件库上测试：**Element UI、Element Plus、Ant Design、Layui**、原生 HTML（表格布局、iframe 内嵌表单）和 Workday 风格英文网申（月/年分开填写、"I currently work here"、yes/no 工作权利问题）。这些是国内外网申系统最常用的组件；但还没有登录国聘、51job 等线上网站逐一实测，遇到填不好的页面见下方[适配新网站](#适配新网站)。

![插件面板](docs/assets/ui/extension-panel.png)

## 快速开始（Windows）

1. 安装 [Python 3.11+](https://www.python.org/) 和 [Node.js 20+](https://nodejs.org/)。
2. 双击项目根目录的 `start-webui.bat`（第一次运行或换电脑时用 PowerShell 执行 `.\start-webui.ps1 -Install`）。它会：
   - 启动本地服务 `http://127.0.0.1:8000`
   - 打开资料库网页 `http://127.0.0.1:5173`
   - 构建浏览器插件到 `extension\dist`
3. 安装插件：Chrome 打开 `chrome://extensions`（Edge 打开 `edge://extensions`）→ 打开「开发者模式」→「加载已解压的扩展程序」→ 选择 `extension\dist` 文件夹。
4. 在资料库里上传简历识别，补全资料，上传中文/英文简历附件。
5. 打开任意网申页面，点右下角的「填」按钮（或按 `Alt+Shift+F`）→「一键填写本页」。

详细说明见 [使用手册](docs/USER_MANUAL.zh-en.md)。

### 手动启动

```bash
python -m pip install -e .
python -m backend.app.api            # 本地服务 :8000

cd frontend && npm install && npm run dev      # 资料库网页 :5173
cd extension && npm install && npm run build   # 插件 -> extension/dist
```

## AI（可选）

不配置 AI 也能用：自动填表、简历规则识别（姓名/电话/邮箱/教育经历等）、问答库都在本地完成。配置后可以：简历 PDF 完整识别成资料、中文资料一键翻译成英文、开放题起草、识别剩余栏位。

在资料库「设置」页选择模型并填 API Key：DeepSeek、通义千问、Kimi、智谱 GLM、OpenAI（OpenAI 兼容接口），或 Claude。Key 只保存在本机 `data/private/settings.json`。

## 隐私与安全

- 所有资料、附件、投递记录只存在本机 `data/private/`（已被 Git 忽略）。
- 插件只和本机 `127.0.0.1` 通信；只有在你使用 AI 功能时，才会把必要内容发给你配置的模型服务（证件号码不会发送）。
- 证件号码默认不自动填写，需要在资料库里单独开启。
- 插件**从不点击提交**，也不会勾选隐私协议/承诺书这类勾选框。

## 项目结构

```text
shared/profile-schema.json   # 资料结构：字段、中英文标签、栏位同义词、下拉选项同义词（三端共用）
backend/app/                 # FastAPI 本地服务：资料库、附件、AI、投递记录
frontend/src/                # 资料库 Web UI（资料库 / 投递记录 / 设置）
extension/src/engine/        # 填表引擎：控件识别、标签提取、分区识别、字段匹配、各类控件填写
extension/src/content/       # 页面内面板、iframe 协调、答案学习、提交检测
extension/test/              # 用真实组件库搭的网申页面 + Playwright 测试
tests/                       # 后端测试
```

架构说明见 [docs/architecture.md](docs/architecture.md)，更新记录见 [CHANGELOG.md](CHANGELOG.md)。

## 测试

```bash
python -m pytest tests              # 后端
cd extension && npm install --prefix test && npm test   # 填表引擎（6 类网申页面）、读取已填内容 + 插件端到端测试
cd frontend && npm run build        # Web UI 类型检查与构建
```

插件测试需要 Chromium；设置 `CHROMIUM_PATH` 指向本机 Chrome/Chromium 可执行文件。

## 适配新网站

遇到填不好的网申系统：

1. 先在面板「没识别的栏位」里手动选一次对应字段，插件会为这个网站记住。
2. 如果是新的叫法（比如某系统把“毕业院校”写成“就读院校名称”），把它加到 `shared/profile-schema.json` 对应字段的 `match` 列表里，三端都会生效。
3. 如果是新的下拉/日期组件库，在 `extension/src/engine/discover.ts` 和 `dropdown.ts` 的选择器列表里加上它的类名，并在 `extension/test/fixtures/` 里加一个复现页面。
