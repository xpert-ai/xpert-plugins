import { createRoot } from "react-dom/client";
import { RemoteI18nProvider } from "@xpert-ai/plugin-shadcn-ui/i18n";
import { installShadcnThemeVars } from "@xpert-ai/plugin-shadcn-ui/theme";
import "@xpert-ai/plugin-shadcn-ui/style.css";
import "./styles.css";
import { App } from "./App";
import { RemoteBridge } from "./bridge";
import { i18n } from "./i18n";
// 同一构建入口用于平台和预览；认证与持久化始终由宿主处理。
installShadcnThemeVars();
const root = document.getElementById("root");
if (!root) throw Error("Missing React root");
createRoot(root).render(
  <RemoteI18nProvider i18n={i18n}>
    <App bridge={new RemoteBridge(window)} />
  </RemoteI18nProvider>,
);
