import type { Metadata } from "next";
import "./globals.css";
import "./ai-assistant.css";

export const metadata: Metadata = {
  title: "contrlio企业内控管理系统",
  description: "本地优先的企业内部控制管理系统",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
