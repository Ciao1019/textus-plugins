# 链接卡片

把链接显示成卡片：网页的标题、简介和图片，以及网站名称，点一下就打开网页。YouTube 或 B 站的视频会直接在卡片里播放。

- 输入 `/卡片`（或选择**插入链接卡片…**）再粘贴链接；也可以选中一个链接后右键。
- 卡片是一个 `card` 块，存着网页当时的信息，所以没网也能显示，在任何 Markdown 软件里都能当文本读：

````markdown
```card
url: https://textus.catvinci.com
title: Textus
description: 和你一起写作的 Markdown 编辑器。
image: https://textus.catvinci.com/og.png
```
````

- 卡片下方的**重新获取**会拿到网页最新的标题和图片。

为了读取网页，插件需要访问任意网址的权限；它只会访问你做成卡片的那些链接。
