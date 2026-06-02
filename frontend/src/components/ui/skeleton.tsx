/**
 * @file skeleton
 * @brief 骨架屏组件
 * 
 * 基于 shadcn/ui 的骨架屏组件
 */

import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  )
}

export { Skeleton }
