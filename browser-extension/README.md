# AI Job Agent Importer

本扩展用于读取“已经登录后的招聘网页”。它不会保存招聘平台账号密码，只会在你点击扩展图标时读取当前页面的岗位文字，并发送到本地 API。

## 安装

1. 打开 Chrome。
2. 进入 `chrome://extensions/`。
3. 打开右上角 “Developer mode / 开发者模式”。
4. 点击 “Load unpacked / 加载已解压的扩展程序”。
5. 选择本文件夹：

```text
browser-extension
```

## 使用

1. 先启动本地 Web UI：`start-webui.bat`。
2. 在 Chrome 登录 LinkedIn、Seek、Boss、猎聘或公司官网。
3. 打开一个具体岗位详情页。
4. 点击 Chrome 工具栏里的 “AI Job Agent Importer” 图标。
5. 扩展会打开本地 Web UI，并把岗位信息填到“岗位来源”区域。
