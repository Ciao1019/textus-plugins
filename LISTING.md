# Listing in the Textus market

**Settings › Extensions › Get more** in Textus lists three kinds of things, each from its own repository: plugins and skills from this one, themes from [textus-themes](https://github.com/CatVinci-Studio/textus-themes). This page says what gets listed and how.

[中文说明](#中文说明)

## What every listing must be

- **Useful to people who write.** Something a writer, a student, a researcher or a team would reach for - not a demo, not a duplicate of something already listed or built in.
- **Honest about what it does.** Its name and description say plainly what it does; it does nothing else.
- **Open.** An OSI-approved license (MIT unless you name another), and only what you have the right to share - fonts and libraries included.
- **Quiet.** Nothing in the background the user didn't ask for: no tracking, no analytics, no ads, no updates or downloads of its own.
- **Kind.** Nothing offensive, nothing that copies someone else's work without credit.

## Plugins

A plugin is a folder with a `textus-plugin.json` manifest ([Writing plugins](https://github.com/CatVinci-Studio/Textus/blob/main/docs/dev/writing-plugins.md)). CatVinci Studio's own are in [`plugins/`](plugins/) here; yours lives in a repository of your own, and a one-file listing in [`community/`](community/) points to it.

- **Permissions it needs, and no more.** Each permission in the manifest is asked for before the plugin runs; one that the plugin's purpose doesn't explain is a reason not to list it. `network:` names the hosts it talks to - `network:*` only for a plugin whose purpose is the open web (a web view) or a server the user types in (their own sync or storage), which it reaches over HTTPS and names in its README.
- **Works offline,** apart from what plainly needs the network (Zotero's local API, a web page), and says so when it can't reach something.
- **Says where it runs.** Every manifest names its `platforms`: `["desktop", "ios"]`, or `["desktop"]` for a plugin that can't work on iOS: one that needs a program on the computer (Zotero, a local server) or opens any web page. One that works in the background (`background` code, or `requires` Keep running in the background) is desktop-only by default and can't name `ios`. A plugin offered on iOS is tried in a phone-sized window first.
- **English and Chinese.** Its `l10n` has at least `en` and `zh`; Textus falls back to English for the other languages.
- **Tested.** Its flows run in Textus's e2e tests or yours, and `npm run check` passes.
- **Versioned.** A change ships as a new `version`; a published version never changes.
- **Its own source.** No build step between the repository and the zip: the zip holds exactly the files of the tag it was released from, so anyone can read what they install. Bundled libraries are named with their source and version.

## Skills

A skill is one Markdown file in [`skills/`](skills/), named after the skill (`press-release.md`), with front matter like the built-in skills' ([AGENTS.md › Skills](https://github.com/CatVinci-Studio/Textus/blob/main/AGENTS.md)): `name` (the file's name), `description` (what it does and when to use it - Textus AI reads it to decide), and `metadata` with `textus-version`, `textus-invocation`, `textus-category` and `textus-modes` - the panel modes it works in, one or more of `write`, `review` and `create` - and, for each UI language, `textus-label-<code>` and `textus-hint-<code>` (its name and one line on what it does) and `textus-aliases-<code>` (other words typed after `/`).

- **A procedure, not a one-off.** A kind of task people do again and again, with the steps that make it come out right.
- **Never invents.** A skill that writes from the user's material says what to do when the material is missing a detail (leave a placeholder, ask) - never to make it up.
- **No built-in twin.** Not a second translate, proofread or summarize - improve the built-in one instead (a pull request to Textus).

## Themes

Themes are shared in [textus-themes](https://github.com/CatVinci-Studio/textus-themes#share-a-theme) - one comment on its gallery issue, no pull request. Its rules (one self-contained stylesheet, no remote resources, no script hooks) apply as they stand.

## How to list yours

### A plugin

1. In Textus, open your plugin's page in **Settings › Extensions › Plugins** (or the card under the chat that made it) and choose **Export for Publishing…**. You get a folder ready to be a repository: your plugin under your name, a README, a LICENSE and a release workflow.
2. Make it a GitHub repository, then push a version tag (`git tag v0.1.0 && git push origin v0.1.0`). The workflow publishes `<id>-<version>.zip` as a release.
3. Open a pull request here adding `community/<id>.json` - your repository and the version ([format](community/README.md)).
4. The review runs on the pull request and posts what it found:
   - **the package** - its manifest, id and version, size, no programs or native libraries;
   - **its source** - every file in the zip is the tagged repository's, byte for byte;
   - **permissions** - each one listed; broad ones (`network:*`, `files.write`, `editor.write`, `background`) wait for a person, who approves them once: at the first listing, or in the version that adds them;
   - **the code** - no `eval`, no code loaded from the web, no keys written in, nothing minified that isn't a named library;
   - **what comes with it** - a `README.md` in the package, an open-source LICENSE, English and Chinese strings, no name that borrows "CatVinci" or "Official". The README is what **Get more** shows on your plugin's page, and its guide once installed: what it does and how to reach it. Add `README.zh.md`, `README.ja.md` and so on for other languages; Textus shows the one in the reader's language, English otherwise.
5. A maintainer tries it in Textus, adds the reviewed zip's `sha256` to the file and merges. The release workflow copies that zip here and **Get more** lists it.

After that, a new version needs no pull request from you: push its version tag (`v0.2.0`) and let your release workflow publish the zip. Once a day this repository looks for a release newer than the listed version, reviews it the same way and opens a pull request that changes `version` and pins its `sha256`. One that fails nothing, asks for no permission the listed version didn't and brings no warning it didn't have is merged on its own and listed within the day; one that adds a permission or a new warning, or fails a check, waits for a maintainer. Prereleases and drafts are left out.

Passing the review doesn't make a plugin safe on its own: Textus runs every plugin in a sandbox and asks before each permission. A plugin taken down goes in [`removed.json`](removed.json).

### A skill

1. Open a pull request here that adds your skill's file.
2. CI checks it (`npm run check`); a maintainer reviews it, usually within a week, trying it in Textus.
3. Once merged, the release workflow publishes it, and it is in **Get more** for everyone. Only what CatVinci Studio makes is marked **Official**.

A listing that stops meeting these rules - broken by a Textus update and not fixed, or found doing more than it says - is taken down, and its author told why.

---

## 中文说明

Textus 的 **设置 › 扩展 › 获取更多** 里有三类东西：插件和技能来自本仓库，主题来自 [textus-themes](https://github.com/CatVinci-Studio/textus-themes)。这里说明什么能上架、怎么上架。

### 所有上架内容都要

- **对写作的人有用**：写作者、学生、研究者或团队会用到的东西；不是演示，也不和已上架或内置的重复。
- **说清楚做什么**：名称和简介直白地说明用途，不做别的事。
- **开放**：OSI 认可的许可证（不写就是 MIT），只分享你有权分享的内容，包括字体和库。
- **安静**：不在后台做用户没要求的事——不跟踪、不统计、不放广告，也不自己更新或下载东西。
- **友善**：不冒犯人，不未经注明地照搬别人的作品。

### 插件

插件是一个带 `textus-plugin.json` 清单的文件夹（见 [Writing plugins](https://github.com/CatVinci-Studio/Textus/blob/main/docs/dev/writing-plugins.md)）。CatVinci Studio 自己的插件在本仓库的 [`plugins/`](plugins/) 里；你的插件放在你自己的仓库，在 [`community/`](community/) 里加一个文件指向它。

- **只要需要的权限**：清单里的每个权限都会在运行前问用户；用途解释不了的权限就是不上架的理由。`network:` 写明要访问的主机，只有以开放网页为用途的插件（网页视图），或连接用户自己填写的服务器（自己的同步或存储服务）的插件，才能用 `network:*`；后者只走 HTTPS，并在 README 里写明。
- **能离线用**：除了明显要联网的功能（Zotero 本地接口、网页），连不上时要告诉用户。
- **写明能在哪里用**：每个清单都要写 `platforms`：电脑和 iPhone/iPad 都能用写 `["desktop", "ios"]`，在 iOS 上用不了的写 `["desktop"]`，比如需要电脑上的程序（Zotero、本地服务）或能打开任意网页的。需要后台的插件（有 `background` 代码，或 `requires` 了「保持在后台运行」）默认只支持电脑，不能写 `ios`。支持 iOS 的插件要先在手机大小的窗口里试过。
- **中英文**：`l10n` 至少有 `en` 和 `zh`，其他语言 Textus 会用英文。
- **有测试**：流程在 Textus 的 e2e 测试或你自己的测试里跑过，`npm run check` 通过。
- **有版本**：改动发新的 `version`，已发布的版本不再改。
- **就是源码**：仓库到 zip 之间没有构建步骤，zip 里的文件和发布它的那个标签一模一样，谁都能看到自己装的是什么。打包进来的库要写明来源和版本。

### 技能

技能是 [`skills/`](skills/) 下的一个 Markdown 文件，以技能名命名（`press-release.md`），前置信息和内置技能一样：`name`（与文件名相同）、`description`（做什么、什么时候用——Textus AI 据此决定何时使用），`metadata` 里有 `textus-version`、`textus-invocation`、`textus-category` 和 `textus-modes`（适用的模式：`write`、`review`、`create` 中的一个或几个），以及每种界面语言的 `textus-label-<code>`、`textus-hint-<code>`（名字和一句说明）和 `textus-aliases-<code>`（`/` 后还能输入的别名）。

- **是一套做法，不是一次性要求**：大家反复会做的一类事，以及把它做好的步骤。
- **不编造**：根据用户材料写东西的技能，要说明材料缺细节时怎么办（留占位、去问），绝不让 AI 编。
- **不和内置技能重复**：不要再做一个翻译、校对或摘要——想改进就给 Textus 提 PR 改内置的。

### 主题

主题在 [textus-themes](https://github.com/CatVinci-Studio/textus-themes#中文说明) 分享：在画廊 issue 下发一条评论即可，不用 PR。那里的规则（一个独立样式表、不加载远程资源、不用脚本钩子）照常适用。

不再符合这些规则的内容——Textus 更新后坏了没修，或被发现做了说明以外的事——会被下架，并告诉作者原因。

### 怎么上架

**插件**

1. 在 Textus 的 **设置 › 扩展 › 插件** 打开你的插件页（或生成它的那段对话下的卡片），点 **导出以发布…**，会得到一个可以直接做成仓库的文件夹：改成你名字的插件、README、LICENSE 和发布流程。
2. 把它建成 GitHub 仓库，推送一个版本标签（`git tag v0.1.0 && git push origin v0.1.0`），发布流程会把 `<id>-<version>.zip` 发成一个 release。
3. 在本仓库提一个 PR，加上 `community/<id>.json`，写明你的仓库和版本（[格式](community/README.md)）。
4. PR 上会自动审查并贴出结果：
   - **包**：清单、id 和版本、大小，不能有可执行文件和原生库；
   - **源码一致**：zip 里每个文件都和仓库那个标签的文件逐字节相同；
   - **权限**：列出全部权限；范围大的（`network:*`、`files.write`、`editor.write`、`background`）要等人看，且只批一次：首次上架时，或在新增它的那个版本；
   - **代码**：不能用 `eval`、不能从网上加载代码、不能写死密钥，压缩过的代码只能是写明来源的库；
   - **附带内容**：包里的 `README.md`、开源许可证、中英文文字，名字不能借用「CatVinci」或「Official」。README 就是「获取更多」里插件页显示的介绍，也是安装后的使用说明：写清它做什么、从哪里用。其他语言可以加 `README.zh.md`、`README.ja.md` 等，Textus 按读者的语言显示，没有就显示英文。
5. 维护者在 Textus 里试用，把审查过的 zip 的 `sha256` 填进文件后合并。发布流程把这个 zip 复制到本仓库，**获取更多** 里就能看到。

之后发新版本不用你再提 PR：推送版本标签（`v0.2.0`），让发布流程发布 zip 即可。本仓库每天查找比已上架版本更新的 release，同样审查，然后开一个改 `version` 并固定 `sha256` 的 PR。没有检查失败、没有比已上架版本多出的权限、也没有它原来没有的警告的，会自动合并，当天上架；新增权限或新警告、或有检查失败的，等维护者处理。预发布和草稿不算。

审查通过不等于绝对安全：Textus 让每个插件在沙箱里运行，每个权限都要用户同意。被下架的插件写进 [`removed.json`](removed.json)。

**技能**：在本仓库提 PR 加上技能文件；CI 检查（`npm run check`），维护者一般一周内在 Textus 里试用后合并，之后所有人都能在 **获取更多** 里看到。只有 CatVinci Studio 做的会标「官方」。
