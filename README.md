# 🧭 My Homepage - 一个功能强大的浏览器起始页

一个极简、美观且功能强大的浏览器起始页，采用仿 iOS 的毛玻璃与圆角设计风格。现已全面升级，支持用户系统、云端同步、多页面管理等高级功能。

纯静态 HTML/CSS/JS 实现，但通过集成 [Supabase](https://supabase.com/)，获得了强大的后端能力，同时保持了部署简单的优势。

![Project Preview](preview.png)

## ✨ 主要功能 (Features)

*   **☁️ 用户系统与云端同步**
    *   **多方式登录**：支持邮箱/密码注册登录，以及 Google、GitHub 第三方 OAuth 登录。
    *   **数据云端同步**：书签和配置与用户账户绑定，自动同步到云端，多设备无缝访问。
    *   **实时同步状态**：界面右下角会显示“正在同步...”、“云端已同步”或“同步失败”等状态，数据安全有保障。
    *   **账户偏好设置**：用户可以自定义显示名称和头像。头像支持从多种风格的图标库中选择，或自行上传。

*   **🎨 精美的 UI 与交互**
    *   **仿 iOS 设计**：精美的毛玻璃背景、圆角卡片、平滑的交互动画。
    *   **多页面管理**：支持创建、重命名、拖拽排序和删除多个书签页面，通过手势滑动或键盘左右箭头即可轻松翻页。
    *   **丰富的主题**：内置多种马卡龙纯色背景和动态背景图案（如极光、流光），一键切换并保存偏好。
    *   **国际化**：支持中/英文一键切换。

*   **✏️ 强大的可视化编辑**
    *   **拖拽排序**：长按用户头像进入编辑模式，支持在页面内或跨页面拖拽改变图标顺序。
    *   **自动获取图标**：输入网址，系统会自动从 Manifest, Brandfetch, Logo.dev 等多个源获取高清图标。
    *   **随机图标生成**：内置 DiceBear API，支持生成几何、像素、手绘等多种风格的随机头像。
    *   **实时预览**：修改过程中可实时看到图标和标题效果。

*   **💾 数据管理**
    *   支持从 `homepage_config.json` 或旧版 `bookmarks.json` 导入配置，方便迁移。
    *   支持将当前配置导出为 `homepage_config.json`，随时备份。

*   **📱 移动端适配**
    *   完美支持 PWA（添加到主屏幕）。
    *   添加到 iPhone/iPad 桌面后支持全屏沉浸式显示，拥有独立 App 图标。

## 🚀 快速开始 (Getting Started)

### 1. 部署

最简单的方式是直接使用托管在 GitHub Pages 上的版本：[https://yuliu.love/Homepage/](https://yuliu.love/Homepage/)

如果你想自行部署：

1.  **Fork** 本仓库到你的 GitHub 账号。
2.  进入仓库的 **Settings** -> **Pages**。
3.  在 **Build and deployment** 下，将 **Source** 设置为 `Deploy from a branch`，并将 **Branch** 设置为 `main` (或 `master`)，保存。
4.  等待几分钟，GitHub 会生成你的专属链接，例如：`https://你的用户名.github.io/Homepage/`。

### 2. （可选）配置你自己的 Supabase 后端

本项目默认连接到一个公共的 Supabase 实例，如果你想拥有自己的独立后端：

1.  访问 [Supabase.io](https://supabase.io/) 并创建一个新项目。
2.  在项目的 **SQL Editor** 中，运行以下 SQL 创建 `user_configs` 表：
    ```sql
    CREATE TABLE public.user_configs (
      user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      config_data JSONB,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    ALTER TABLE public.user_configs ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Allow individual access"
    ON public.user_configs
    FOR ALL
    USING (auth.uid() = user_id);
    ```
3.  进入项目的 **Settings** -> **API**，找到 `Project URL` 和 `anon` `public` key。
4.  在 `js/config.js` 文件中，替换 `SUPABASE_URL` 和 `SUPABASE_KEY` 为你自己的信息。

## 🛠️ 使用方法

1.  **注册/登录**：打开页面后，点击左上角的用户图标进行注册或登录。
2.  **编辑模式**：登录后，再次点击用户头像，在下拉菜单中选择“编辑书签”进入编辑模式。
3.  **添加/修改书签**：在编辑模式下，点击“添加书签”或直接点击已有书签进行修改。
4.  **管理页面**：在编辑模式下，点击“编辑页面”来添加、删除或重命名页面。
5.  **切换主题**：点击用户头像，在下拉菜单中选择“编辑主题”来更换背景颜色和图案。
6.  **数据导入/导出**：在编辑模式下，使用“导入配置”和“导出配置”按钮来管理你的数据。

---

感谢使用！如果你有任何建议或问题，欢迎提交 Issue 或 Pull Request。
