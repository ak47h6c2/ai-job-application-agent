# Changelog / 更新日志

## 2026-10-08 — 华电招聘系统现场测试（插件 v0.4.23 – v0.4.36）

- 华电简历使用 Semi Design 组件，本轮按它修复：
  - 查看模式下的禁用输入框不再填写；能找到带铅笔图标的「简历维护」按钮。
  - 下拉框的搜索框可以通过 aria-controls 找到；只列到市或县的地区列表会往上一级搜索。
  - 弹窗里重复的元素 id 按所在弹窗解析标签；名称里含其他字段名的标签不再被误判。
  - 选项显示较慢时不再误报「需检查」；按 Escape 不会撤销选择，也不会关掉弹窗。
- 教育经历弹窗：
  - 「是否最高全日制」按学历层次推算。
  - 「全日制」是 / 否题按学习方式回答；境外院校的学习形式选「海外留学生」。
  - 专业不在列表里时先用资料库里的国内对应专业，最后才选「其他」；成绩按分数段选择并提示核对。
- 新增按网站开关的「本站日期 +1 天」：网站把本地零点换算成北京时间、导致日期总是存早一天时（电脑在澳洲时区），勾选后自动多填一天，读回时再减回来。
- 下拉框关闭后马上重新打开时，先等它收起完成：之前重开会得到空列表，导致学位名称、国内对应专业的备选重试失败。
- 搜索框输入改为 Chrome 中文输入法的真实事件顺序，输入后先等 50 毫秒再读取结果：Semi 要在下一个事件循环才处理完输入结束，在这之前点选项会被忽略，之后整个下拉都不再响应点击。这是学校选不上的原因。
- 「社会实践经历」标签页和弹窗识别为校园经历，「实践单位」对应组织名称，不再填成工作单位。
- 栏目只由高亮的标签页标示时（华电的各个标签页），表格里已保存的条目也算已存在，不再重复添加。
- 读回页面时，包含资料库数值的分数段（如 2.75 对应「70-79分/2.0-2.9」）不再提议修改资料库。
- 测试：用测试页模拟 Semi 输入结束的延迟和收起中重开为空，修复前能复现线上症状；e2e 启动时等待插件自己的 service worker 就绪，避免负载下偶发失败。
- 现场在独立的无界面浏览器里填写并保存了华电简历的教育经历、学生干部经历、社会实践经历、科研成果、家庭情况（部分）、亲属在华电任职情况、奖惩情况；附件、照片和最终提交留给本人。详见 [华电现场测试记录](docs/qa/huadian-2026-10-08.md)。

## 2026-10-08 — 全面检查修复（插件 v0.4.22）

- 声明里的承诺 / 同意类勾选框和否定措辞的勾选框（如「本人承诺无违法违纪行为」）不再自动勾选；用户自己勾上或取消的状态，再次填写时保持不变。
- 资料库冲突合并改为按条目、按字段三方合并。网页端和插件同时修改同一栏目时，不再复制出重复经历；双方都改的同一条经历，保留用户改的字段和插件写入的其他字段。
- 区分最低和最高字数：「不少于300字」「300字以上」不再当作上限截断，并作为最低字数交给 AI 起草；「200-500字」两者都传。AI 草稿、富文本框和后台回答超出上限时都在句末截断。
- 添加经历后只在这段经历自己的编辑区里点「保存 / 确定」，不再点页面上的「完成 / 确认」，避免意外结束申请。
- 关闭资料库网页时：隐藏页面就立即保存，有未保存修改时浏览器会先询问；超过 64KB 的资料不再发出必然失败的 keepalive 请求，正在进行的保存也会补发。
- 插件不再在每个网站上反复扫描整页、给每个框架加载完整资料；启动按钮出现后停止观察，自动读取已填内容只用于招聘页面或用过面板的页面。
- 后台读资料出错（如资料文件损坏）时，在面板和弹窗显示原因，不再悄悄用旧缓存填表；表单校验错误显示成可读文字。弹窗出错时保持打开，可以看到原因。
- 岗位链接按网页声明的编码读取，GBK / GB2312 页面不再乱码；域名解析到内网或跳转到内网的链接会被拒绝。
- 简历识别支持 .docx（含表格）；旧版 .doc 提示另存为 .docx 或 PDF。
- 最近一段学历仍在读（结束时间为「至今」）时，毕业时间留空，不再取上一段学历的毕业时间。
- 本地后台拒绝来自其他网站的写入请求，防止任意网页偷偷上传附件或消耗 AI 额度。
- 面板刷新时保持滚动位置；「填入…」下拉框在打开时才生成选项。下拉框通过搜索或滚动选中的区间档位也会提示「请核对」。
- 详见 [全面检查记录](docs/qa/full-review-2026-10-08.md)。

## 2026-10-07 — 工行网申现场测试与第一轮检查修复（插件 v0.4.1 – v0.4.21）

- 修复第一轮检查发现的 9 个问题：资料文件损坏时停止并提示（不再用空资料覆盖），读取资料按条目身份写回，AI 字段识别与插件使用同一套板块规则，资料库冲突自动合并等。
- 工行 Ant Design 3 组件：日期、月份、年份选择器可输入或点选；下拉同义选项（学术 / 专业硕士）无法区分时留给用户选择；同一段经历的其他资料可选出具体学位类型；薪资按区间选择并提示核对。
- 字数限制从 maxlength、「0/200」计数器或标题读取；超出时按句末截断，面板提供「AI 缩写」。
- 工作经历：同一标签重复出现才算新的一段，修复「单位类别 / 工作单位」被拆成多段；点击「添加」时点里面真正的按钮；工行页面声明英文时按页面实际文字判断语言。
- 后台标签页填写不再被浏览器限速拖慢；重新构建的未打包插件会自动重新加载，并替换已打开网页里的旧脚本；面板和弹窗显示插件版本号。
- 现场完成工行简历的个人基本信息、语言能力、资格认证、自我评价、家庭关系、工作（实习）经历并保存；最终提交由本人核对后操作。

## 2026-10-06 — 奖励与项目串填、板块边界修复

- 复现中国移动智联模板将“奖励/荣誉 · 名称”识别为项目名称、“类型”识别为实习类型的问题；补齐该模板的标题，并增加独立的奖励类型和获取时间映射。
- 同一类目的通用名称、类型、日期和描述只能从该类目取资料；不认识的标题保留为边界，停止沿用上一板块。明确区分全职和实习标题。
- AI 识别携带类目及标题，后台与填写端均拦截跨类目建议；自动建议不再保存为人工确认规则，等待期间的手填内容得到保留。
- 奖励、证书、论著缺失的事实保持空白，避免起草出未经确认的事实。测试和现场验证范围见 [奖励类目检查记录](docs/qa/section-boundaries-2026-10-06.md)。

## 2026-10-06 — 插件 AI 起草未填入修复

- 起草前后按题目及板块重新定位输入框，修复网页重建或清除定位标记后无法写入的问题；写入后读取实际值，不能确认时保留草稿并显示原因。
- 增加“识别栏位 / AI 起草”，直接读取栏位后起草，不需要先填写整页或上传附件。
- 修复起草只更新临时副本、面板仍显示“资料库里没填”的问题；成功后显示草稿内容及核对提示，失败和空回复明确报错。
- 等待期间的手动修改不被覆盖；同名栏位存在歧义时保留文字供核对。短技能栏使用简短的已确认技能，问答提示仅包含职业资料，不再附带整张网申页面文字。
- 拦截将雅思成绩映射到 CET/TEM 的 AI 建议，并忽略旧的错误记忆。21 项相关插件回归和 3 项后台测试通过，详见 [AI 起草检查记录](docs/qa/ai-draft-2026-10-06.md)。
- 用户重载后在独立智联测试页验证“AI 全部起草”成功填入计算机技能与其他技能，并显示正确核对提示；未保存、投递或上传，原编辑草稿保留。

## 2026-10-06 — 待保存资料的类目显示

- 将类目和具体字段放在首行，公司、学校等经历名称单独显示并允许换行，避免长名称挤掉“职位／公司”等字段。
- 待保存资料的说明和原值允许换行，兼容此前已读取的建议。窄面板视觉检查、构建、TypeScript 检查及四项资料读取／导入回归通过。

## 2026-10-06 — 资料存入断线提示

- 修复存入资料连接失败时只显示“Failed to fetch”、面板仍保持在线状态的问题；现在提示重新运行启动脚本，保留列表和勾选，重试成功后恢复在线状态。
- 本地后台已恢复，新增断线后原按钮重试保存成功的隔离测试。十一项相关回归通过，详见 [连接检查记录](docs/qa/capture-connection-2026-10-06.md)。

## 2026-10-06 — 阿尔派工作职责串填修复

- 修复已保存的“项目经理”职务被误当成项目板块标题，导致后续工作编辑框使用项目资料的问题；字段值不再参与板块标题识别。
- 工作编辑框按已有公司及任职日期选择整段经历；找不到唯一对应资料时留空提示，避免使用另一家公司的职责。保留公司城市和分支的区别。
- 新字段记忆按板块及标题隔离，忽略跨板块的旧字段映射；已填结果显示来源公司。读取工作资料时也按公司及日期匹配，歧义时阻止覆盖。
- 阿尔派按用户确认保留实习类型，独立现场验证职责与其资料库内容逐字一致，未保存或提交申请。插件回归 71/71 通过，详见 [工作职责检查记录](docs/qa/zhaopin-work-2026-10-05.md)。

## 2026-10-05 — 智联现场填写与语义修复

- 专业输入框按可输入的自动补全处理，等待其所属建议列表；允许自由输入时保留文字并提示核对，网站拒绝文字时明确报失败。
- 教育资料增加学位所属学科门类、该段经历是否有境外学习、第二学位/辅修类型；未填写的资料保持空白，不自动推断“无”。
- 修复“职位月薪（税前）”误识别成职位、“证明人关系”误识别成姓名；增加证明人关系、证明人单位及是否有证明人。
- 自我评价板块中的“内容”归入自我评价；校园、奖励及特定考试问题按原题匹配常用问答，整段描述不再误存为组织名称或单个奖项。
- 计算机技能和其他技能使用独立资料项，避免套用计算机等级证书或整段专业技能。
- 教育选项导致网页重建输入框时继续发现新控件，修复首次填写漏掉尾部日期和选项；更新面板定位并避免重复显示同一字段，不重复点击新增或保存。
- 插件 63/63、后端 42/42、资料库界面 8/8 回归通过。实际测试与剩余验证范围见 [现场测试记录](docs/qa/zhaopin-live-2026-10-05.md)。

## 2026-10-05 — 总体回归与保存稳定性

- 教育编辑框按已经选择的学历、学校和日期选择整段资料，避免本科和硕士串填；资料库没有对应学历时留空。同校的不同经历按日期区分。
- “学历/学位”互相矛盾时阻止导入整段教育经历，并提示先纠正。下拉框中的学校文字不再被误当成已经保存的经历，修复第二段教育漏添加。
- 自动新增经历时不再把 Submit、Apply、提交当作弹窗保存按钮，保留表单供用户确认。
- 防止双击“存入资料库”重复新增条目；未实际写入时明确提示并保留待确认列表。再次填写前刷新资料，避免使用旧缓存。
- 资料、附件索引和投递记录的修改串行处理，JSON 使用独立临时文件原子替换，修复同时保存丢数据及临时文件冲突。
- 资料库保存带版本检查，旧页面不能覆盖插件或其他页面刚保存的数据；切回资料库时刷新未修改的资料，延迟刷新结果不会覆盖正在输入的内容。
- AI 翻译和问答起草返回时保留用户期间的编辑、排序和删除，避免旧结果覆盖新内容。
- 复现与回归范围见 [总体检查记录](docs/qa/overall-audit-2026-10-05.md)。

## 2026-10-05 — 启动与智联校园网申修复

- 地址和邮编按现居、通讯、家庭三种用途分别保存；未注明用途的网申地址默认使用通讯资料，可在资料库切换默认用途，缺通讯资料时留空。原地址/邮编保留为现居资料。
- 考试意向城市与期望工作城市分开；补齐“紧急联系人与本人关系”的匹配，避免存为泛用问答。
- 旧地址/城市识别建议及旧地址映射需要重新读取；服务端拒绝旧版本建议覆盖这些字段。更新后重新指定的映射和跳过选择继续生效。
- 修复附件读取得到空响应时生成零字节文件的问题：插件通过附件内容接口读取并核对字节数，空文件不再报告填写成功。
- 启动时检查完整后端依赖及实际应用导入，避免误选缺少 `httpx` 的 Python；安装失败时明确显示错误。
- 修复插件更新后旧页面点击“填”时面板消失的问题，改为显示刷新提示。
- 智联父母信息按“父亲/母亲”关系取值；银行任职的“是否”问题不再被当作工作单位，避免母亲条目漏填和串位。
- 修复教育表单中不相邻的“学历/学位”被拆成两段经历、学科门类和第二学位问题误认成学历的问题；同一条目的院系、专业、课程、学校和日期使用同一段资料，支持“受教育类型”，新增家庭成员年龄。
- 教育编辑框内与“取消”并列的“添加”不再被当成新增下一段的按钮；学制填写与资料比对支持“2年 / 二年制”等等价写法。
- 新增基于真实页面结构的 Element UI 回归测试；现场检查与验证边界见 [测试记录](docs/qa/zhaopin-2026-10-05.md)。

## 2026-10-05 — 0.4.0：边投递边积累资料

### 中文

- **把填好的内容存进资料库**：在网申页面点「保存 / 下一步 / 提交 / 确定」时，插件读取你填好的内容，和资料库对比，在面板里列出资料库里还没有的部分：空着的栏位、新的教育/实习/项目等经历（自动新建条目）、常用问答。勾选后点「存入资料库」。和资料库不一样的内容默认不勾，避免覆盖。翻到下一页后，待确认的列表也会保留。面板里也可以随时点「把本页填好的内容存入资料库」。手填两三个网申，资料库就基本齐了。插件弹窗里可以关闭这个功能。
- **栏位认错的全面排查**：用 300 多个国内外网申常见标签逐个检查，修复了「标签里包含别的栏位名称」导致的错填：
  - 「高考前户口所在地（生源地）」「入学前户籍所在地」填成现户口 → 现在填生源地；`吉林-白山` 这种短横线写法能拆成省、市；
  - 家庭成员里的「出生年月 / 民族 / 身份证号 / 户口所在地 / 学历」会填成你本人的 → 家庭成员不再使用本人信息，新增家庭成员的出生年月、学历、现居住地；
  - 教育经历「学校所在城市 / 院校性质 / 学历证书编号 / 专业类别」填成学校名称或学历 → 新增学校所在城市，院校性质归到院校类型，编号类栏位不再乱填；
  - 实习经历「单位性质 / 公司规模 / 所属行业 / 证明人职务」填成公司名称或证明人 → 新增单位性质、所属行业、证明人职务；「推荐人」不再当作证明人；
  - 「家庭电话 / 固定电话」填成家庭成员电话，「亲属姓名」填成本人姓名，「档案所在地 / 党组织关系所在地」填成现居住城市，「驾照类型」当成是否有驾照，「英语等级」填成获奖级别 → 均已修复；
  - 英文网申：「Phone Device Type / Phone Extension」填成手机号、「Address Line 2」重复填地址 → 已修复；References / Referees 板块不再填你本人或你的工作经历；
  - 新增资料项：曾用名、入党（团）时间、家庭电话、档案所在地、第一学历（自动从教育经历推出）、高考分数、英语水平（没填时用语言能力里的英语）、普通话水平、驾照类型、Suburb / State / Country of residence；项目经历增加所在单位，教育经历增加研究方向。

### English

Capture: on 保存 / Next / Submit (or from the panel button) the extension reads what you typed, compares it with the profile and offers the new values, new entries and answers for one-click saving (conflicts are offered unticked). Fixes "高考前户口所在地（生源地）" being filled with the current hukou.

## 2026-10-02 — 0.3.0：更全的栏位和填表能力

### 中文

- **工行等国企/银行网申适配**：简历只读展示页可一键「编辑并填写」；生源地、籍贯、户口这类分开的省/市/区下拉逐级填写；家庭住址拆成「省/市/区」和「详细地址」；日期框不接受输入时自动点日历面板；兼容「工作（实习）经历」「荣誉或奖励」「资格认证」「家庭关系」「工作意向」等板块写法。
- **新增资料项**：学术成果（论文/专利）、意向机构/分行、是否接受异地、职业规划、宗教信仰、证件有效期、血型、视力、院校类型（985/211）、毕业生类型、亲属回避、违法违纪、重大疾病、驾照、计算机水平、外国国籍；教育经历增加导师、论文题目、辅修、学制；工作经历增加证明人、证明人电话、薪酬、下属人数；附件增加生活照。
- **填表引擎**：多选下拉和多选框组（`北京、深圳`）；没有匹配项时选「其他」；数字框自动换算（`15k` → `15000`）；超长文本在句末截断；身份证号推出出生日期和性别；手机号推出国际区号。
- **常见问题库**：24 个中英文常见网申问题一键加入常用问答，AI 根据资料批量起草；插件面板支持「AI 全部起草」，并按字数限制起草。
- **修复**：Windows + Node 24 在中文路径下构建插件崩溃；较新的 OpenAI 模型（GPT-5 系列）参数不兼容；构建插件只需要很少的依赖；启动脚本出错时明确提示。

### English

ICBC-style campus resume support (read-only pages, split province/city/district dropdowns, home address region, calendar-panel date picking), many new profile fields and a publications section, multi-select and checkbox-group filling, 其他/Other fallback, numeric inputs, sentence-aware truncation, ID-derived birth date and gender, a bilingual common-questions library with AI drafting, and "draft all" for open questions. Also fixes for Windows/Node 24 builds in non-ASCII paths and newer OpenAI models.

## 2026-10-02 — 0.2.0：投递自动填表助手

### 中文

项目从「求职邮件分析 + 草稿生成」改成「资料填一次，网申一键填写」。

- 新增**求职资料库**（`shared/profile-schema.json` 定义，三端共用）：基本信息、联系方式、国内网申常用（政治面貌、籍贯、户口、生源地…）、澳洲常用（work rights、签证、notice period）、求职意向、自我描述，以及教育、实习/工作、项目、校园经历、获奖、语言、证书、家庭成员多段经历；中英两套资料；常用问答；附件（中/英文简历、证件照、成绩单、求职信）。
- 新增**浏览器插件**（`extension/`）：一键填写文本框、原生和自定义下拉（含可搜索、远程搜索、虚拟滚动长列表）、省市区级联、日期/月份/区间选择器、单选按钮组、「至今」、文件上传；自动点「添加」补足多段经历（支持行内展开和弹窗新增）；iframe 内嵌表单；本站字段记忆；记住手写答案；提交后记录投递。支持 Element UI、Element Plus、Ant Design、Layui、原生 HTML 和 Workday 风格英文网申，均有自动化测试。
- **AI 改为可选**：支持 OpenAI 兼容接口（DeepSeek、通义千问、Kimi、智谱、OpenAI）和 Claude，用于简历识别、中译英、开放题起草、识别剩余栏位。不配置 AI 时用规则识别简历。
- **Web UI 重写**：从一个 4500 行的页面改成「资料库 / 投递记录 / 设置」三页，自动保存，文字更少，手机可用。
- 投递状态改为：待投递、已投递、笔试/测评、面试中、Offer、未通过（旧记录自动迁移）。
- **移除**：QQ 邮箱扫描、邮件复查队列、关键词打分、模板草稿、书签导入、Playwright 登录浏览器导入、命令行流程。代码保留在 Git 历史（`ba5ea1d` 及之前）。

### English

The project is now a fill-once, autofill-everywhere job application assistant: a shared profile schema, a local profile library with Chinese and English versions, a Manifest V3 browser extension with an autofill engine tested against Element UI, Element Plus, Ant Design, Layui, native HTML and Workday-style forms, optional AI (OpenAI-compatible or Claude), and a rewritten three-page Web UI. The mail-scanning and draft-generation pipeline was removed (see git history up to `ba5ea1d`).

## 2026-05-15

### English

- Added bilingual user documentation with screenshots: a full user manual and a quick-start tutorial under `docs/`.
- Added manual browser-test screenshots for overview, setup, one-job mode, job results, draft review, and the application board.
- Added an actionable mail review queue: job-related messages that did not parse into structured leads can now be previewed from the Web UI and moved into the single-JD workflow.
- Added `/api/mail/preview` for local QQ Mail message previews, detected links, and re-parsing without sending or modifying mail.
- Improved job-page validation so LinkedIn/company job list and search-result pages are rejected instead of being treated as single JDs.
- Added resume/project improvement suggestions in the selected-job view, turning missing keywords into concrete portfolio upgrades such as agent/RAG, Docker, SQL tracking, and React polish.
- Upgraded mail coverage into a scan diagnosis view: each source now shows checked mail, job mail, parsed leads, parsing status, sample subjects, and a warning when job-related mail needs manual review.
- Added mail-scan coverage metadata to new reports, including checked message count, job-mail count, parsed lead count, source buckets, and targeted platform backfill sources.
- Added automatic job-page hydration during mailbox scans: the agent now extracts job links from emails, reads the top linked job pages when possible, and regenerates matching/drafts from the fuller JD text while marking blocked links for logged-in browser fallback.
- Reworked the Web UI into a cleaner product workbench: tighter shell layout, calmer visual hierarchy, clearer command header, and compact application rows that expand only when the user wants to edit them.
- Fixed the desktop app shell so the main work area scrolls independently while the left navigation stays in place.
- Added application-board search and sorting so users can quickly find records by company, role, status, notes, or links, then order them by latest update, follow-up date, company, or status.
- Added next follow-up date controls to the selected-job application tracker, including the same Today / 3 days / 7 days / Clear shortcuts used on the application board.
- Added application-board exports for Markdown and CSV, plus one-click copying of due follow-ups and quick follow-up date shortcuts on each record.
- Added structured follow-up dates to the application board, with a "Needs follow-up" filter and overdue/today/upcoming visual cues.
- Added two-step removal for application board records, so mistaken or duplicate local tracking items can be cleaned without touching drafts or mail data.
- Made the application board actionable: status summary chips now filter records, and each application card can update status and notes directly.
- Added an application board that summarizes locally tracked roles by status and shows the latest saved application records.
- Added browser-page mismatch protection: when reading a logged-in job page, the app now checks that the current page still matches the intended role and blocks unrelated tabs or different jobs.
- Added local application tracking: each selected role can now store a status and note, such as draft ready, applied, waiting, interview, or rejected.
- Simplified the selected-job workflow into one primary action that reads the full JD, checks quality, and creates or refreshes the application package, with clear login/manual fallback steps.
- Added JD confidence metadata from the backend and a visible JD check card in the Web UI, so generated drafts are gated on content that looks like a real job description rather than page shell text.
- Added a goal-mode workflow panel that shows the one main path: resume, job source, then draft review, with one next-step action instead of another button cluster.
- Improved resume upload feedback with an in-card status pill, selected filename, parsing summary, progress indicator, and clearer next-step guidance.
- Refreshed the Web UI visual system with a Figma-style workbench background, stronger panel hierarchy, more distinct selected states, and lightweight motion for metrics, buttons, chips, and navigation.
- Added JD-quality validation so public-link and logged-in browser reads reject navigation, search-result, login, and recommendation text instead of treating it as the job description.
- Improved the Web UI error copy when a page is readable but does not look like a complete JD.
- Clarified the mail-scan controls: the primary action now scans mail and creates a new report, while refresh only reloads saved reports.
- Added the current report's last-updated time and clearer guidance for when to scan again versus opening history.

### 中文

- 新增带截图的中英双语用户文档：在 `docs/` 下补充完整使用手册和快速上手教程。
- 新增手动浏览器测试截图，覆盖总览、开始、单个岗位、推荐职位、申请包和投递记录页面。
- 新增可操作的邮件复查队列：看起来和求职有关、但没有解析成结构化岗位的邮件，现在可以在 Web UI 里直接读取摘要，并带到“单个岗位”流程继续处理。
- 新增 `/api/mail/preview`：本地读取 QQ 邮件摘要、识别链接并重新解析岗位，不发送、不修改邮件。
- 优化岗位网页校验：LinkedIn / 公司官网的岗位列表页、搜索结果页会被拒绝，不再当成单个 JD 使用。
- 岗位详情页新增“简历与项目补强”：把缺失关键词转成可执行的项目建议，例如 agent/RAG、Docker、SQL 投递追踪和 React 展示优化。
- 邮箱覆盖情况升级为扫描诊断：每个来源会显示已检查邮件、求职邮件、解析出的岗位线索、解析状态和邮件示例；如果有求职邮件但没解析出岗位，会直接提示需要复查。
- 新增邮箱扫描覆盖信息：新生成的报告会记录本次检查了多少邮件、识别出多少求职邮件、解析出多少岗位线索，以及 LinkedIn、SEEK Grad、UNSW / CSA、公司招聘系统等来源分布。
- 邮箱扫描新增自动读取岗位网页：系统会从邮件中提取岗位链接，优先读取匹配度靠前的岗位页面，能读到完整 JD 就用网页内容重新匹配并生成草稿；被登录或反爬拦截的链接会标记为需要登录浏览器继续读取。
- 重构 Web UI 为更清爽的求职工作台：页面壳层更紧凑，视觉层级更明确，顶部主操作更突出，投递记录默认变成可扫读的紧凑行，点击后再展开编辑。
- 修复桌面端应用壳滚动问题：右侧主工作区现在独立滚动，左侧导航保持固定。
- 投递记录看板新增搜索和排序：可以按公司、岗位、状态、备注或链接快速查找，并按最近更新、跟进日期、公司或投递状态排序。

- 当前岗位的投递进度卡新增“下次跟进日期”，并支持和投递看板一致的今天、3 天后、7 天后、清空快捷按钮。
- 投递记录看板新增 Markdown / CSV 导出、到期跟进清单一键复制，以及每条记录的快捷跟进日期按钮。
- 投递记录看板新增结构化“下次跟进日期”，支持“需要跟进”筛选，并显示逾期、今天跟进和已安排跟进状态。
- 投递记录看板新增二次确认移除：错误记录或重复记录可以直接清理，不影响已生成草稿或邮箱数据。
- 投递记录看板支持直接操作：状态汇总可用于筛选，每张记录卡片都能直接修改状态和备注。
- 新增投递记录看板：按状态汇总本地记录的岗位，并显示最近保存的投递进度。
- 新增登录浏览器页面匹配保护：读取已登录岗位页时，会检查当前页面是否仍然匹配目标岗位；如果停在无关网站、首页或其他岗位，会直接拦截。
- 新增本地投递进度管理：每个选中岗位可以保存状态和备注，例如材料已生成、已投递、等回复、面试中或已拒绝。
- 简化选中岗位后的操作链路：主按钮统一为“读取完整 JD 并生成申请材料”，并显示完整 JD、申请材料状态；遇到登录或无法读取时给出明确补救步骤。
- 新增后端 JD 可信度元数据，并在 Web UI 中显示“JD 完整度检查”卡片；生成草稿前会判断内容是否像真实岗位描述，避免把页面壳或邮件摘要当作 JD。
- 新增“目标模式”流程面板：把页面主线收敛为简历、岗位来源、草稿检查三步，并提供一个明确的下一步按钮，减少按钮堆叠。
- 优化简历上传反馈：在简历卡片内直接显示状态标签、本次文件名、解析摘要、上传进度和下一步引导。
- 按 Figma 工作流重新打磨 Web UI：加入工作台式背景、更清晰的面板层级、更明显的选中状态，以及指标、按钮、标签和导航的轻量动效。
- 新增 JD 质量校验：公开链接读取和登录浏览器读取会拒绝导航、搜索结果、登录页、推荐职位等页面壳文本，不再把它们当作岗位描述。
- 优化“页面能读到但不像完整 JD”时的前端提示，引导用户打开真正岗位详情页或手动粘贴。
- 优化邮箱扫描区的按钮逻辑：主按钮明确表示“扫描邮件并生成草稿”，刷新按钮只负责重新加载已保存结果。
- 当前报告新增更新时间，并说明它可能是刚生成的结果，也可能是从历史中打开的结果，减少误解。

## 2026-05-14

### English

- Simplified the Web UI into one application workbench instead of separate setup and job-source panels.
- Moved resume status, mail range, match threshold, job-source modes, JD fields, and generation actions into a clearer two-column workflow.
- Reduced repeated buttons and long instructional blocks while keeping automatic link reading, logged-in import, manual paste, resume upload, and mail scanning behavior unchanged.
- Renamed the two confusing "generate materials" actions into separate "create draft from this JD" and "read job details" tasks.
- Added a three-path entry panel for scanning email jobs, creating a draft from one JD, and reviewing drafts.
- Added a current-result summary with next-step links so users land on the active report before browsing history.
- Moved run history below the active report so the main reading order stays focused on the current result.
- Added a dedicated selected-job detail anchor so the next-step links map to job list, job details, and draft review.
- Replaced internal run ids in the current result and history cards with readable Email scan / Manual JD labels.
- Compressed the top path picker into a shorter three-entry flow strip and moved resume upload into the resume card.
- Merged the separate workflow progress card into compact status chips inside the current-result summary.
- Reworked the draft review area into a numbered application package: resume edits, cover letter, recruiter message, and application notes.
- Clarified the shortlisted-job list with a click hint, selected-state badge, and per-card "View details" action.
- Improved narrow-screen job selection by scrolling from a selected job card to its detail panel.
- Reordered the sidebar navigation to follow the main workflow and clarified scan controls with helper text.
- Added dynamic sidebar highlighting, smoother anchor positioning, disabled-action helper text, and a direct job-detail link to the application package.
- Added expandable run history so older reports can be reopened without cluttering the default view.
- Persisted scan settings and job-input mode locally, added a pre-generation checklist for single JD drafts, and added one-click copy for the full application package.
- Added Markdown downloads for the current report and selected application package.
- Fixed a React duplicate-key warning when two job leads share the same company and title.

### 中文

- 将 Web UI 简化成一个求职申请工作台，不再把上传简历、扫描邮件、岗位来源和生成材料拆得太散。
- 把简历状态、邮件范围、匹配度阈值、岗位来源模式、JD 表单和生成按钮整合为左右两栏流程。
- 减少重复按钮和大段说明文字，但保留自动读取链接、登录后导入、手动粘贴、上传简历和读取邮件的原有功能。
- 将两个容易混淆的“生成申请材料”入口拆成“按当前 JD 生成草稿”和“读取岗位详情”两个任务。
- 增加“三条主路径”入口：扫描邮箱找岗位、单个 JD 生成草稿、查看申请草稿。
- 增加“当前结果”摘要和下一步入口，让用户先看本次报告，再按需打开历史记录。
- 将历史记录下移到当前报告之后，避免旧报告打断主流程。
- 增加独立的“当前岗位详情”锚点，让下一步入口分别对应推荐岗位、岗位详情和申请草稿。
- 将当前结果和历史记录里的内部编号改成“邮箱扫描 / 手动岗位”这类可读标签。
- 将顶部路径入口压缩成更短的三步流程条，并把上传简历按钮移到简历卡片里。
- 将单独的处理进度大卡片合并为当前结果摘要里的小状态标签，减少页面纵向冗余。
- 将申请草稿区改成编号式“申请包”：简历修改点、求职信、招聘方消息和投递提醒分开阅读。
- 优化推荐职位列表：增加点击提示、当前选中标记，以及每张岗位卡片的“查看详情”入口。
- 优化窄屏操作：点击推荐岗位后自动滚到对应的岗位详情区。
- 将侧边栏改成主流程顺序，并给草稿数量和匹配度门槛增加更直观的说明。
- 增加侧边栏动态高亮、锚点滚动边距、按钮不可用原因提示，以及从岗位详情直达申请包的入口。
- 历史结果支持展开全部和收起，默认保持简洁，同时旧报告也能重新打开。
- 本地保存扫描设置和岗位输入模式；单个 JD 增加生成前检查；申请包支持一键复制整套材料。
- 新增当前报告和选中申请包的 Markdown 下载。
- 修复当两个岗位线索公司和标题相同时可能出现的 React key 警告。

## 2026-05-10

### English

- Added a dedicated Playwright login browser with a persistent local profile, so blocked job links can be opened for manual login and then read from the current logged-in page without installing a browser extension.
- Fixed the dedicated login browser flow so restored personal tabs are closed, closed Playwright sessions recover cleanly, and login or verification pages are not imported as job descriptions.
- Improved the logged-in job import UX with visible timeouts, mutually exclusive open/read actions, a separate "email lead only" note, and LinkedIn JD cleanup so company pages, similar jobs, and footers are not mixed into the job description.
- Added a direct post-email workflow in the selected job panel: users can now click "Read link and generate" to fetch the job link from the email lead and generate materials; blocked links fall back to the manual JD input with a clear prompt.
- Reworked the logged-in browser import UI into a three-step card flow: drag the import button to the bookmarks bar, use it on a real job detail page, then return to the Web UI to load the imported role.
- Added Windows quick-start scripts: `start-webui.bat` for double-click launch and `start-webui.ps1` for PowerShell launch, including backend/frontend readiness checks and browser opening.
- Added a logged-in browser import mode for job descriptions: users log in on LinkedIn, Seek, Boss, Liepin, or a company career site, open a job page, and use a bookmarklet to send the current job text to the local agent.
- Added `POST /api/imported-jobs` and `POST /api/imported-jobs/form` for saving browser-imported job posts locally without storing platform credentials.
- Updated the Web UI job-source area from two modes to three modes: public-link auto read, logged-in browser import, and manual paste fallback.
- Upgraded the job-source workflow into two modes: automatic public-link reading and manual JD paste fallback.
- Added `POST /api/job-url-preview` to extract title, company, location, and description from public job pages using HTML metadata and JSON-LD JobPosting data.
- Fixed automatic job-link reading so login, captcha, or access-blocked pages are not mistaken for real job posts.
- Reworked the GitHub README into a portfolio-style project page with background, usage instructions, version highlights, architecture diagram, and safety boundaries.
- Added a manual job-post workflow in the Web UI for LinkedIn, Seek, company sites, and other non-email job sources.
- Added `POST /api/manual-jobs`, which matches a pasted job description against the uploaded resume index and generates application materials with the same human approval gate.
- Manual job drafts still detect the employer communication language, so Australia-facing roles generate English cover letters and recruiter messages even when the UI is Chinese.

### 中文

- 新增 Playwright 专用登录浏览器：自动读取失败时可以打开本地浏览器让用户登录，然后直接读取当前已登录岗位页，不需要安装扩展。
- 修复专用登录浏览器流程：自动关闭恢复出来的个人旧标签页，浏览器会话关闭后可自动恢复，并且不会再把登录页或验证页误导入成岗位 JD。
- 优化登录后导入体验：打开/读取增加明确超时提示并互斥，邮件摘要单独显示为“岗位线索”，LinkedIn 读取结果会清理公司简介、相似职位和页脚，避免混进 JD。
- 优化邮件扫描后的主流程：推荐职位详情区新增“读取链接并生成材料”，优先自动读取邮件里的岗位链接并生成材料；如果网站拦截，再引导用户打开原网页并粘贴 JD。
- 重构“登录后导入”界面：从说明文字改成三步操作卡片，明确告诉用户先拖按钮到书签栏，再去真实岗位页点击书签，最后回到 Web UI 读取岗位。
- 新增 Windows 一键启动脚本：可以双击 `start-webui.bat`，也可以在 PowerShell 执行 `.\start-webui.ps1`，脚本会检查后端/前端是否启动并自动打开浏览器。
- 新增“网页登录导入”模式：用户在 LinkedIn、Seek、Boss、猎聘或公司官网登录后，打开岗位页面，通过书签按钮把当前岗位文本发送到本地助手。
- 新增 `POST /api/imported-jobs` 和 `POST /api/imported-jobs/form`，用于保存浏览器导入的岗位信息，不保存招聘平台账号密码。
- Web UI 的岗位来源从“双模式”升级为“三模式”：公开链接自动读取、网页登录导入、手动粘贴兜底。
- 岗位来源升级为双模式：优先自动读取公开岗位链接，读不到时再手动粘贴 JD。
- 新增 `POST /api/job-url-preview`，可以从公开招聘页面的 HTML metadata 和 JSON-LD JobPosting 中提取岗位名称、公司、地点和岗位描述。
- 修复自动读取岗位链接时把登录页、验证码页或拦截页误当成真实岗位的问题。
- 重写 GitHub README，让首页更像作品展示页：包含项目背景、使用方法、版本摘要、架构图和安全边界。
- Web UI 新增“手动岗位”入口，可以把 LinkedIn、Seek、公司官网、Boss、猎聘等平台上的岗位 JD 粘贴进来生成申请材料。
- 新增 `POST /api/manual-jobs` 接口，会用已上传简历和粘贴的岗位描述做匹配，并生成简历修改建议、求职信和招聘方消息。
- 手动岗位同样会判断招聘方沟通语言：澳洲/英文岗位默认生成英文求职信和英文消息，中文岗位才生成中文消息。

## 2026-05-09

### English

- Hardened resume upload state handling with a timeout, cancel action, clearer parsing status, and unique backend temp files for repeated uploads.
- Cover letters and recruiter messages now use the detected job communication language, so Australia-facing roles get English drafts even when the UI and resume are Chinese.
- Added visible draft-language chips in the Web UI.
- Refreshed the Web UI visual system with a darker navigation rail, guided hero area, tinted panels, hover motion, and clearer active states.
- Chinese mode now generates Chinese resume advice, cover letters, recruiter messages, run steps, and Markdown headings.
- Resume upload feedback now shows detected resume sections and keywords, so users can see what the PDF parser understood.
- Added cross-language matching so English job titles can match Chinese resume evidence such as software development, testing, databases, and projects.
- Added clear empty states when no jobs meet the selected match threshold.
- Renamed score controls and job badges from generic “score” wording to clearer resume-job “match” wording.
- Reworked Chinese UI copy to use natural job-search language instead of literal translations.
- Added Chinese resume section support for local resume indexing, including skills, education, internship, and project sections.
- Added a clear upload error when a PDF has no readable text, such as a scanned image resume.
- Redesigned the Web UI around a shorter three-step flow: upload resume, choose mail range, start scan.
- Added browser-based resume PDF upload and local resume index generation.
- Added a browser-based mail scan workbench for starting safe Agent runs from the Web UI.
- Added quick scan ranges: today, yesterday, last 3 days, last 7 days, and custom start date.
- Added recent run history so previous Agent reports can be opened from the dashboard.
- Added copy actions for cover letter and recruiter message drafts.
- Improved loading states, responsive layout, bilingual labels, and dashboard visual hierarchy.
- Added a local `POST /api/runs` API endpoint for creating new private Agent run reports.

Safety note: the Agent still stops at the human approval gate. It does not send emails or submit applications automatically.

### 中文

- 优化简历上传状态：新增超时处理、取消按钮、解析中提示，并让后端连续上传时使用独立临时文件，避免卡在“上传中”。
- 求职信和招聘方消息现在会按岗位沟通语言生成：澳洲/英文岗位默认英文，中国岗位才默认中文。
- Web UI 新增“草稿语言”标识，避免用户误以为中文界面一定生成中文求职信。
- 重新调整 Web UI 视觉系统：深色导航、强化顶部引导、半透明信息面板、悬停动效和更明确的选中状态。
- 中文模式现在会用中文生成简历修改建议、求职信、招聘方消息、流程说明和 Markdown 标题。
- 上传简历后会直接显示已识别的简历模块和关键词，让用户知道 PDF 到底有没有被读懂。
- 新增中英文关键词匹配，英文岗位也能匹配中文简历里的软件开发、测试、数据库、项目经历等证据。
- 当没有职位达到最低匹配度时，页面会明确提示如何调整，而不是留空。
- 把“最低分”等容易误解的说法改成“最低匹配度”，职位卡片也显示为“匹配度”。
- 重写中文界面文案，尽量使用求职场景里的自然说法，减少翻译腔。
- 简历索引支持中文标题，例如“专业技能”“教育经历”“实习经历”“项目经历”。
- 如果 PDF 简历读不到文字，会在页面上给出明确提示，避免上传后像是没有反应。
- 重新设计 Web UI，改成更短的三步流程：上传简历、选择邮件范围、开始扫描。
- 新增浏览器上传 PDF 简历，并在本地生成简历证据索引。
- 新增网页端邮件扫描工作台，可以直接从 Web UI 启动安全 Agent 工作流。
- 新增快捷扫描范围：今天、昨天起、近 3 天、近 7 天、自定义开始日期。
- 新增最近运行记录，可以从控制台打开历史 Agent 报告。
- 新增求职信和招聘方消息的一键复制功能。
- 优化加载状态、响应式布局、中英双语标签和整体视觉层级。
- 新增本地 `POST /api/runs` API，用于生成新的私有 Agent 运行报告。

安全说明：Agent 仍然会停在人工确认关卡，不会自动发送邮件，也不会自动提交求职申请。
