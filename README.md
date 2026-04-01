# EPFL Moodle Auto Login

一个给 Chrome / Edge 用的极简扩展，用来减少登录 `https://moodle.epfl.ch` 时的点击次数。

## 当前行为

- 在 `moodle.epfl.ch` 检测到未登录时，自动跳到登录页
- 在 Moodle 登录页自动点击 `EPFL - Entra ID`
- 用户主动点击 `logout` 后进入冷却期，避免刚登出就又被自动登回去
- 冷却期内如果你手动点 `Login`，可以立即绕过冷却并继续进入 `EPFL - Entra ID`
- 在 Microsoft Entra 登录页自动点击第一个带有 `@epfl.ch` 的已记住账号
- 如果没有已记住账号，则可以使用扩展设置里的备用邮箱自动填入
- 默认自动点击 Microsoft 的 `Stay signed in?`

## 安装

### Chrome

1. 打开 `chrome://extensions`
2. 开启右上角的 `Developer mode`
3. 点击 `Load unpacked`
4. 选择本目录：`/Users/bruce12138/Projects/autoLoginEPFL`

### Edge

1. 打开 `edge://extensions`
2. 开启 `Developer mode`
3. 点击 `Load unpacked`
4. 选择本目录：`/Users/bruce12138/Projects/autoLoginEPFL`

## 配置

1. 打开扩展详情页
2. 进入 `Extension options`
3. 可配置：
   - 是否启用 Moodle 自动登录
   - 点击 `logout` 后的冷却分钟数
   - 手动点 `Login` 时是否绕过冷却
   - 备用 EPFL 邮箱，例如 `name@epfl.ch`
   - 是否自动确认 `Stay signed in?`

## GitHub Release CI

仓库现在包含一个 GitHub Actions 工作流：`.github/workflows/release-extension.yml`。

- 每次 push 到 `main` 时，自动打包扩展
- 生成 `zip`、`crx` 和 `sha256`
- 更新同一个滚动的 GitHub Release：`latest`

### 需要配置的 Secret

在 GitHub 仓库里添加一个 repository secret：

- `CRX_PRIVATE_KEY_B64`

它的内容应该是同一个 CRX 签名私钥的 base64 文本。只要一直使用同一把私钥，浏览器就会把后续构建识别成同一个扩展 ID。

### 生成私钥

```bash
openssl genrsa -out extension.pem 2048
base64 < extension.pem | tr -d '\n'
```

把输出内容保存到 GitHub Secret `CRX_PRIVATE_KEY_B64` 里即可。

### 说明

- CI 只会在 `main` 分支 push 时更新 release
- Release 使用固定 tag：`latest`
- 如果你以后想要“每个版本一个 release”，把工作流改成只在 tag push 时触发会更合理

## 限制

- 扩展不能直接读取你操作系统里的邮箱账户列表
- “自动默认机器里的第一个 EPFL 邮箱” 这里实际实现为：
  - 优先点击 Microsoft 登录页上已经显示出来的第一个 `@epfl.ch` 账号
  - 如果页面没有显示账号，则退回到你在扩展设置里保存的备用邮箱
- 如果微软要求输入密码、MFA、验证码，扩展不会替你绕过这些步骤
