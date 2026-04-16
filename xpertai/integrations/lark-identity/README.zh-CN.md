# 飞书身份插件接入说明

`@xpert-ai/plugin-lark-identity` 用来把飞书身份和 Xpert 账号绑定起来，并在登录页提供飞书 SSO 登录入口。

它包含两条能力：

- 已登录绑定：当前 Xpert 用户主动绑定自己的飞书身份
- 匿名登录：用户先走飞书 OAuth，再根据已存在的绑定关系直接登录；如果还没绑定，则进入首次绑定页

这个插件按 `system` 级插件设计，建议在宿主级别安装和配置，再由宿主登录页按可用 provider 展示飞书入口。

## 绑定主键为什么用 `union_id`

插件当前使用 `union_id` 作为主绑定键。

- `union_id` 在同一个飞书开发者主体下是稳定的跨应用身份标识
- `open_id` 仍会被采集，但只放在绑定 profile 里，不作为主绑定键

这和当前部署假设一致：一个 Xpert 租户对应一个固定的飞书开发者主体。

## 配置项说明

插件目前只有 3 个配置项。

### `appId`

飞书应用的 App ID。

- 该值来自飞书开发者后台的应用凭证区域
- 建议为这个身份插件单独准备一套应用凭证
- 不建议直接复用老消息集成插件的应用凭证

### `appSecret`

飞书应用的 App Secret。

它会被用于：

- 调用飞书 OAuth 接口换取 `user_access_token`
- 给插件内部的 OAuth `state` 做签名

### `publicBaseUrl`

浏览器真实访问 Xpert 的公开根地址。

这是最容易配错的字段，请特别注意：

- 它应该是用户浏览器实际访问你的 Xpert 的地址
- 它不应该是后端进程内部监听地址
- 它不应该是只在服务端网络里可见的内网地址

如果这个字段留空，插件会退回到当前请求推导出来的浏览器来源。

## 飞书后台该如何配置

飞书后台最关键的是“重定向 URL”配置。

插件最终会使用下面这条回调地址：

```text
<公开访问根地址>/api/lark-identity/callback
```

例如：

- 如果你的 `publicBaseUrl` 是 `https://xpert.example.com`
- 那么回调地址就是 `https://xpert.example.com/api/lark-identity/callback`

你需要把这条回调地址加入飞书开发者后台的重定向 URL 白名单。

注意：

- 飞书后台里配置的回调地址，必须和运行时实际使用的回调地址一致
- 如果你使用了前端开发代理、反向代理、网关或 CDN，仍然要以“浏览器最终看到的公开地址”为准

官方参考文档：

- 重定向 URL 配置：[Configure redirect URLs](https://open.feishu.cn/document/develop-web-apps/configure-redirect-urls)
- 获取 `user_access_token`：[Get user_access_token](https://open.feishu.cn/document/authentication-management/access-token/get-user-access-token)

## 运行链路

### 1. 已登录绑定

入口：

- `GET /api/lark-identity/bind/start`

流程：

1. 当前用户已经登录 Xpert
2. 前端跳到 `/api/lark-identity/bind/start`
3. 插件生成签名后的 `state` 并跳转飞书授权页
4. 飞书回调 `/api/lark-identity/callback`
5. 插件读取飞书资料，创建一张待确认绑定 ticket
6. 回调跳转到宿主确认页 `/auth/sso-confirm?ticket=...`，由当前登录用户确认绑定

### 2. 匿名 SSO 登录

入口：

- `GET /api/lark-identity/login/start`

流程：

1. 登录页发现当前租户可用的飞书 SSO provider
2. 用户点击飞书按钮，前端跳到 provider 的 `startUrl`
3. 插件生成 tenant scoped 的 `state` 并跳转飞书授权页
4. 飞书回调 `/api/lark-identity/callback`
5. 插件根据 `union_id` 查找已绑定的 Xpert 用户
6. 如果找到绑定用户，则直接签发 Xpert token 并登录成功
7. 如果没有找到绑定用户，则跳转到首次绑定页 `/auth/sso-bind`

## `returnTo` 规则

插件当前只接受两类 `returnTo`：

- 以 `/` 开头的站内相对路径
- 与 `publicBaseUrl` 同源的绝对地址

其他值会被拒绝，以避免开放重定向问题。

## 如何判断自己是不是配置对了

最直接的检查方式有三步：

1. 打开插件配置页，确认页面上动态生成的回调地址是否符合你的公开入口
2. 去飞书后台检查重定向 URL 白名单里是否存在同一条地址
3. 重新打开登录页，确认已经能发现 Feishu SSO 按钮

## 常见问题

### 1. 为什么飞书登录后停在 `/api/lark-identity/callback`

通常说明 OAuth 回调发生了错误，但错误没有被正确收口，或者当前仍在调试阶段。

优先检查：

- App ID / App Secret 是否正确
- 飞书后台重定向 URL 是否与运行时 callback 完全一致
- 授权码是否过期或被重复使用

### 2. 为什么配置完插件后没有立刻在登录页看到 SSO 按钮

先确认：

- 插件配置已经保存成功
- 当前组织下插件处于可用状态
- `appId`、`appSecret` 至少都已填写

如果配置已经写入，但页面仍未发现 provider，需要继续检查插件实例是否已经拿到最新配置。

### 3. 为什么 `publicBaseUrl` 填了以后仍然不对

通常是因为你填的是：

- 后端监听地址
- 容器内部地址
- 网关前的中间地址

而不是用户浏览器最终访问的地址。

判断标准只有一个：

- 让真实用户在浏览器地址栏里看到什么，就尽量让 `publicBaseUrl` 对应什么

## 当前范围

这个插件当前只负责飞书身份绑定和 SSO 登录入口。

- 它不会自动创建 Xpert 用户
- 它不会自动改动旧 `@xpert-ai/plugin-lark` 的入站身份解析逻辑
