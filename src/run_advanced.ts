import "dotenv/config";
import { app } from "./graph.js";
import { randomUUID } from "node:crypto";
import readline from "node:readline";

async function runInteractive() {
  const threadId = randomUUID();
  const config = { configurable: { thread_id: threadId } } as any;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  process.stdout.write(`开始会话: ${threadId}\n`);
  process.stdout.write(
    "请输入关于 LangChain 或 LangGraph 的问题 (输入 'quit' 退出)\n",
  );
  for (;;) {
    const user = await new Promise<string>((resolve) =>
      rl.question("\n用户: ", resolve),
    );
    if (["quit", "exit"].includes(user.trim().toLowerCase())) break;
    const inputs = { messages: [{ role: "user", content: user }] };
    process.stdout.write("处理中...\n");
    console.log(inputs);
    {
      const stream = await app.stream(inputs, { ...config });
      for await (const event of stream) {
        for (const key of Object.keys(event)) {
          process.stdout.write(`完成节点: ${key}\n`);
        }
      }
    }
    const snapshot = await app.getState(config);
    if ((snapshot as any).next && (snapshot as any).next.length > 0) {
      process.stdout.write("\n--- 暂停等待人工审核 ---\n");
      const msgs = (snapshot as any).values.messages;
      const last = msgs[msgs.length - 1];
      process.stdout.write(`AI 回答: ${last?.content}\n`);
      process.stdout.write(`分数: ${(snapshot as any).values.score}\n`);
      process.stdout.write(`评估: ${(snapshot as any).values.critique}\n`);
      const action = await new Promise<string>((resolve) =>
        rl.question("\n批准吗? (y/n/edit): ", resolve),
      );
      if (action.trim().toLowerCase() === "y") {
        process.stdout.write("批准并继续...\n");
        {
          const stream2 = await app.stream(null as any, { ...config });
          for await (const event of stream2) {
            process.stdout.write(`完成节点: ${Object.keys(event).join(",")}\n`);
          }
        }
        process.stdout.write("完成。\n");
      } else if (action.trim().toLowerCase() === "edit") {
        const newAnswer = await new Promise<string>((resolve) =>
          rl.question("请输入修正后的回答: ", resolve),
        );
        msgs[msgs.length - 1] = { role: "ai", content: newAnswer };
        await app.updateState(config, { messages: msgs });
        process.stdout.write("状态已更新。恢复中...\n");
        {
          const stream3 = await app.stream(null as any, { ...config });
          for await (const event of stream3) {
            process.stdout.write(`完成节点: ${Object.keys(event).join(",")}\n`);
          }
        }
        process.stdout.write("完成。\n");
      } else {
        process.stdout.write("用户取消操作。\n");
      }
    } else {
      process.stdout.write("工作流未中断即完成。\n");
    }
  }
  rl.close();
}

runInteractive().catch((e) => {
  process.stderr.write(`Error: ${e?.message ?? String(e)}\n`);
  process.exit(1);
});
