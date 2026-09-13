Gal Controller
==============

Gal Controller 是一个面向 Windows 的视觉小说（Galgame）游戏库管理器，
用于扫描、整理、查看和启动本地视觉小说收藏。

主要功能
--------

- 扫描指定目录，自动识别视觉小说安装目录和可执行文件。
- 自动寻找本地封面；没有封面时可提取游戏 EXE 图标。
- 通过 VNDB 搜索和下载视觉小说封面、描述、开发商和发售日期。
- 打开游戏详情页时，自动读取 VNDB 评分、星级和投票数。
- 支持收藏、最近游玩、搜索、排序、编辑详情、打开游戏目录和启动游戏。
- 支持中文和 English 界面。
- 默认使用浅粉色二次元主题，详情页使用当前游戏封面作为模糊背景。
- 支持深色、深暗色、粉色和二次元主题切换。

技术栈
------

- Electron
- React
- TypeScript
- Vite / electron-vite
- Tailwind CSS
- Zustand
- SQLite（better-sqlite3）
- VNDB API

开发运行
--------

安装依赖：

    npm install

启动开发环境：

    npm run dev

生成生产文件：

    npm run build

生成 Windows 未打包版本和安装包：

    npm run package

打包输出
--------

未打包程序：

    build/win-unpacked/GalController.exe

Windows 安装包：

    build/gal-controller-1.0.0-setup.exe

使用说明
--------

1. 启动 Gal Controller。
2. 点击侧边栏的“导入游戏”，选择包含视觉小说的目录。
3. 扫描完成后选择要加入游戏库的项目。
4. 点击游戏卡片查看详情，详情页会尝试读取 VNDB 评分。
5. 使用详情页中的“更换封面”可以浏览本地图片、提取 EXE 图标或搜索 VNDB。

VNDB 评分
---------

评分需要网络连接，并且需要在设置中启用 VNDB 搜索。
评分会根据游戏标题自动匹配 VNDB 作品；如果没有匹配结果、没有评分或网络不可用，
详情页会显示“暂无评分”，不会影响游戏库的其他功能。

本地数据
--------

Windows 用户数据默认保存在：

    %APPDATA%/gal-controller/

其中包括：

- data/library.db：游戏库和设置数据库
- covers/：本地封面
- thumbnails/：缩略图
- cache/：VNDB 等缓存数据

GitHub
------

https://github.com/wdxw/galgame_control

许可证
------

MIT License
