import { AppShell } from "@/components/layout/app-shell";

export default function Home() {
  return (
    <AppShell
      aiPanel={
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-lg font-medium text-ink">
            AI 助手
          </h2>
          <p className="text-sm text-muted">在这里与 AI 对话，管理你的时间安排。</p>
        </div>
      }
      mainContent={
        <div className="flex flex-col gap-6">
          <h1 className="font-display text-2xl font-medium text-ink">
            时间盒
          </h1>
          <div className="flex flex-col items-center justify-center rounded-lg border border-hairline bg-surface-card p-12">
            <p className="text-sm text-muted">
              还没有时间盒，告诉 AI 你想做什么吧。
            </p>
          </div>
        </div>
      }
    />
  );
}
