# wx-miniprogram-ci-skill

这是一个用于微信小程序 CI 的 Skill 包，基于微信官方的 npm 命令 `miniprogram-ci` 提供项目配置、预览、上传、构建 npm、云函数上传、云存储上传等能力。

## 前置依赖

### Node.js 和 npm

请确保已安装 Node.js（包含 npm）。若未安装，请前往 [Node.js 官网](https://nodejs.org/) 下载安装。

验证安装：
```bash
node --version
npm --version
```

### skills CLI 工具

本 Skill 需要通过 `skills` CLI 安装。若未安装，请运行：

```bash
npm install -g skills
```

验证安装：
```bash
skills --version
```

## 安装

```bash
npx skills add super9du/wx-miniprogram-ci-skill --skill wx-miniprogram-ci
```

## 使用说明

详细用法请查看： `skills/wx-miniprogram-ci/SKILL.md`