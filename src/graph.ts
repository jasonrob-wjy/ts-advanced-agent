import {
  StateGraph,
  START,
  END,
  MemorySaver,
  GraphNode,
} from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentState } from "./state.js";
import { setupRetriever } from "./tools/retriever.js";

const retriever = setupRetriever(
  new URL("./knowledge_base.txt", import.meta.url).pathname,
);

async function llmCall(
  messages: Array<{ role: "user" | "ai" | "system"; content: string }>,
): Promise<string> {
  if (!process.env.ZHIPUAI_API_KEY) {
    return "请设置 OPENAI_API_KEY 以运行生成与评分。";
  }
  const api_key = process.env.ZHIPUAI_API_KEY;
  const base_url = "https://open.bigmodel.cn/api/paas/v4/";
  const llm = new ChatOpenAI({
    model: "glm-4",
    apiKey: api_key,
    configuration: { baseURL: base_url },
    temperature: 0.1,
  });
  const resp = await llm.invoke(messages as any);
  const content = Array.isArray(resp.content)
    ? resp.content.map((c: any) => c.text ?? "").join("\n")
    : String(resp.content);
  return content;
}

const retrieveNode: GraphNode<typeof AgentState> = async (state: any) => {
  const msgs = state.messages ?? [];
  console.log(msgs);
  const last = [...msgs]
    .reverse()
    .find((m: any) => m instanceof HumanMessage || m?.role === "user");
  const docs = await retriever.search((last as any).content);
  const context = docs.join("\n\n");
  return { context };
};

const generateNode: GraphNode<typeof AgentState> = async (state: any) => {
  const msgs = state.messages ?? [];
  const system = `你是一个乐于助人的助手。请使用以下上下文来回答用户的问题。如果答案不在上下文中，请说明你不知道。\n\n上下文:\n${state.context ?? ""}`;
  const prompt = [new SystemMessage(system), ...msgs];

  const answer = await llmCall(prompt as any);
  return { messages: [{ role: "ai", content: answer }] };
};

const reflectionNode: GraphNode<typeof AgentState> = async (state: any) => {
  const last = (state.messages ?? [])[state.messages!.length - 1];
  const evaluatorSystem =
    "你是一名严格的评分员。请根据上下文评估 AI 的回答。格式: 'Score: <0-10>\\nCritique: <text>'";
  const evalPrompt = [
    new SystemMessage(evaluatorSystem),
    new HumanMessage(
      `上下文: ${state.context ?? ""}\n\nAI 回答: ${last?.content ?? ""}`,
    ),
  ];
  const critique = await llmCall(evalPrompt as any);
  const m = /Score:\s*(\d+)/.exec(critique);
  const score = m ? parseInt(m[1], 10) : 0;
  const attempts = typeof state.attempts === "number" ? state.attempts + 1 : 1;
  return { critique, score, attempts };
};

const humanReviewNode: GraphNode<typeof AgentState> = async () => {
  return {};
};

function shouldContinue(state: any): "human_review" | "retrieve" {
  const s = typeof state.score === "number" ? state.score : 0;
  const a = typeof state.attempts === "number" ? state.attempts : 0;
  if (s >= 7) return "human_review";
  if (a >= 3) return "human_review";
  return "retrieve";
}

export const workflow = new StateGraph(AgentState)
  .addNode("retrieve", retrieveNode)
  .addNode("generate", generateNode)
  .addNode("reflect", reflectionNode)
  .addNode("human_review", humanReviewNode)
  .addEdge(START, "retrieve")
  .addEdge("retrieve", "generate")
  .addEdge("generate", "reflect")
  .addConditionalEdges("reflect", shouldContinue, {
    human_review: "human_review",
    retrieve: "retrieve",
  })
  .addEdge("human_review", END);

const memory = new MemorySaver();
export const app = workflow.compile({
  checkpointer: memory,
  interruptBefore: ["human_review"],
});
