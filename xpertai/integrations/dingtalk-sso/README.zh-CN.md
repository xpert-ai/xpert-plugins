# 钉钉 SSO 插件接入说明

`@xpert-ai/plugin-dingtalk-sso` 为 Xpert 提供钉钉 OAuth2 登录和账号绑定能力。

源码：[xpert-ai/xpert-plugins](https://github.com/xpert-ai/xpert-plugins/tree/main/xpertai/integrations/dingtalk-sso)

它与 `@xpert-ai/plugin-dingtalk` 相互独立：

- `plugin-dingtalk-sso` 只处理用户登录与账号绑定
- `plugin-dingtalk` 处理机器人、消息和会话集成
- SSO 凭证配置在 Xpert 的租户级 System Integration 中，插件本身不再保存 `clientId/clientSecret`

## 登录行为

插件提供两条入口：

- 匿名登录：`GET /api/dingtalk-identity/login/start`
- 已登录用户绑定：`GET /api/dingtalk-identity/bind/start`

OAuth 回调地址固定为：

```text
<Xpert 公开访问地址>/api/dingtalk-identity/callback
```

插件使用钉钉 `unionId` 作为外部身份绑定主键，`openId` 只保存在绑定 profile 中。

匿名登录完成后：

1. 已绑定的 `unionId` 直接登录原 Xpert 账号
2. 未绑定的 `unionId` 跳转 `/auth/sso-bind?ticket=...`
3. 用户可以绑定已有账号，也可以注册并绑定

已登录绑定完成 OAuth 后会跳转 `/auth/sso-confirm?ticket=...`，由当前用户确认绑定。

## 系统集成配置

打开 Xpert **设置 → 系统集成**，创建：

1. `DingTalk OAuth Sign-in / 钉钉 OAuth 登录`（provider：`dingtalk-sso`）。不要选择已有的 `DingTalk / 钉钉` 消息机器人集成。
2. 填写 `clientId`（钉钉 AppKey）和 `clientSecret`（钉钉 AppSecret）。
3. 在 Xpert 服务端配置稳定且非默认的 `SECRETS_ENCRYPTION_KEY`，AppSecret 会在保存前加密。

登录页只有在当前租户存在且仅存在一条有效的租户级钉钉 SSO 集成时才显示钉钉按钮；组织级集成不会用于 SSO。

### 回调地址

系统集成页面显示的回调地址是最终值：

```text
https://<xpert-public-origin>/api/dingtalk-identity/callback
```

它由宿主的 `clientBaseUrl` 生成。若系统集成页只能显示回调路径，请在钉钉后台和反向代理中补上用户实际访问的公开协议、域名和端口。

## 钉钉开发者后台配置

1. 创建企业内部应用，并启用网页应用/网页登录能力。
2. 在应用凭证页面取得 Client ID（AppKey）和 Client Secret（AppSecret）。
3. 为应用开通“获取用户通讯录个人信息”接口所需权限，并发布应用版本。
4. 在登录与分享或安全设置中加入回调地址：

   ```text
   https://xpert.example.com/api/dingtalk-identity/callback
   ```

5. 回调地址必须与插件运行时生成的地址完全一致，包括协议、域名、端口和路径。

本地联调时，如果钉钉后台不接受或无法访问 localhost，请使用一个能转发到本地 Xpert 的 HTTPS 隧道地址，并将该地址作为 Xpert 的 `clientBaseUrl` 和钉钉回调地址的 origin。

官方文档：

- [实现网页方式登录应用](https://open.dingtalk.com/document/orgapp/tutorial-obtaining-user-personal-information)
- [获取用户 token](https://open.dingtalk.com/document/orgapp/obtain-user-token)
- [获取用户通讯录个人信息](https://open.dingtalk.com/document/orgapp/dingtalk-retrieve-user-information)

## OAuth 接口

插件使用钉钉新版 OAuth2 接口：

- 授权：`https://login.dingtalk.com/oauth2/auth`
- 用户 token：`https://api.dingtalk.com/v1.0/oauth2/userAccessToken`
- 当前用户：`https://api.dingtalk.com/v1.0/contact/users/me`

用户访问令牌仅用于读取当前用户资料，不会写入绑定 profile 或宿主数据库。

## 隐私与数据处理

插件会处理钉钉 `unionId`、`openId`、显示名称和头像地址，用于识别用户并维护 Xpert 账号绑定。其中 `unionId` 作为绑定主体，其余资料随绑定记录保存，用于展示和问题诊断。

钉钉用户 access token 仅用于读取当前用户资料，不会持久化。应用 AppSecret 加密保存在租户级系统集成中。身份数据保留在所配置的 Xpert 部署内，可通过删除账号绑定或系统集成移除。钉钉 OAuth 服务处理的数据同时受钉钉自身隐私条款约束。

## 安全边界

- OAuth state 使用 Client Secret 签名，有效期 10 分钟
- state 包含 tenant、organization、integration ID、returnTo 和发起时 callback URL
- callback 会重新校验实际 URL 与签名 state 中的 URL
- `returnTo` 只接受站内相对路径或与 Xpert 当前公开 origin 同源的绝对 URL
- 外部身份绑定与本地 token 签发仍由 Xpert 宿主完成

## 本地验证

```bash
cd xpertai
pnpm exec nx test @xpert-ai/plugin-dingtalk-sso --runInBand
pnpm exec nx build @xpert-ai/plugin-dingtalk-sso
```

安装插件并保存系统集成后，重新打开 `/auth/login`。登录页请求 `/api/auth/sso/providers` 后应显示 DingTalk 按钮。

如果刚创建或修改了系统集成，先刷新登录页；浏览器缓存 provider 请求时使用硬刷新。

建议至少验证：

1. 未绑定钉钉账号进入首次绑定页
2. 绑定完成后再次登录可以直接进入 Xpert
3. 已登录用户可以完成确认绑定
4. 篡改或过期 state 被拒绝
5. 异源 `returnTo` 被拒绝
